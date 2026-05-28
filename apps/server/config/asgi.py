"""ASGI 配置：HTTP + WebSocket（Django Channels）。"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application
from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# 先初始化 Django，再导入 routing（依赖 Django app registry）
django_asgi_app = get_asgi_application()

from models3d.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": (
        AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns),
        )
        if settings.DEBUG
        else AllowedHostsOriginValidator(
            AuthMiddlewareStack(
                URLRouter(websocket_urlpatterns),
            ),
        )
    ),
})
