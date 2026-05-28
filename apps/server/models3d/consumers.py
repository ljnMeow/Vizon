"""WebSocket 消费者：实时推送模型压缩进度。"""

from __future__ import annotations

import json
from typing import Any

from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer


class CompressionProgressConsumer(WebsocketConsumer):
    """模型压缩进度实时推送。

    前端连接 ws://host/ws/models3d/{model_id}/compression/
    后，自动加入 group compression_{model_id}。
    Celery 任务通过 channel_layer.group_send 推送进度，
    消费者转发给客户端。
    """

    def connect(self):
        url_route = self.scope.get("url_route")
        kwargs: dict[str, Any] | None = None
        if isinstance(url_route, dict):
            route_kwargs = url_route.get("kwargs")
            if isinstance(route_kwargs, dict):
                kwargs = route_kwargs

        model_id = kwargs.get("model_id") if kwargs else None
        if not model_id:
            self.close()
            return

        self.model_id = str(model_id)
        self.group_name = f"compression_{self.model_id}"
        channel_layer = self.channel_layer

        if channel_layer is None:
            self.close()
            return

        self.accept()
        async_to_sync(channel_layer.group_add)(
            self.group_name, self.channel_name,
        )

    def disconnect(self, code):
        if self.channel_layer is None:
            return

        async_to_sync(self.channel_layer.group_discard)(self.group_name, self.channel_name)

    def compression_progress(self, event):
        """Celery 任务通过 group_send 推送的进度消息。"""
        self.send(text_data=json.dumps(event["data"]))

    def compression_complete(self, event):
        """压缩完成，发送最终状态并关闭连接。"""
        self.send(text_data=json.dumps(event["data"]))
        self.close()
