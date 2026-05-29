"""WebSocket 消费者：实时推送模型压缩进度（需 JWT）。"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs

from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer
from rest_framework.exceptions import AuthenticationFailed

from auth_api.jwt import decode_customer_token
from customers.models import Customer

from .models import ModelAsset


class CompressionProgressConsumer(WebsocketConsumer):
    """
    模型压缩进度推送。

    连接：ws://host/ws/models3d/{model_id}/compression/?token=<access_token>
    仅允许订阅属于当前登录客户的模型。
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
        customer = self._authenticate_customer()
        if customer is None:
            self.close()
            return

        if not ModelAsset.objects.filter(
            public_id=self.model_id, customer=customer
        ).exists():
            self.close()
            return

        self.group_name = f"compression_{self.model_id}"
        channel_layer = self.channel_layer
        if channel_layer is None:
            self.close()
            return

        self.accept()
        async_to_sync(channel_layer.group_add)(
            self.group_name,
            self.channel_name,
        )

    def _authenticate_customer(self) -> Customer | None:
        query = self.scope.get("query_string", b"")
        if isinstance(query, bytes):
            query = query.decode()
        token_list = parse_qs(query).get("token", [])
        token = token_list[0] if token_list else None
        if not token:
            return None
        try:
            payload = decode_customer_token(token, expected_typ="access")
        except AuthenticationFailed:
            return None
        account_id = payload["sub"]
        customer = (
            Customer.objects.select_related("public")
            .filter(public__public_id=account_id, is_active=True)
            .first()
        )
        return customer

    def disconnect(self, code):
        if getattr(self, "group_name", None) and self.channel_layer is not None:
            async_to_sync(self.channel_layer.group_discard)(
                self.group_name,
                self.channel_name,
            )

    def compression_progress(self, event):
        """Celery 任务通过 group_send 推送的进度消息。"""
        self.send(text_data=json.dumps(event["data"]))

    def compression_complete(self, event):
        """压缩完成，发送最终状态并关闭连接。"""
        self.send(text_data=json.dumps(event["data"]))
        self.close()
