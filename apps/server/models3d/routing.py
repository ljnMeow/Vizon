"""WebSocket URL 路由。"""

from typing import Any, cast

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/models3d/(?P<model_id>[0-9a-f-]+)/compression/$",
        cast(Any, consumers.CompressionProgressConsumer.as_asgi()),
    ),
]
