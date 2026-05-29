"""健康检查：探测 Postgres / Redis。"""

from __future__ import annotations

import redis
from django.conf import settings
from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """
    GET /api/health/

    不鉴权，供网关/运维探测；生产建议仅内网暴露。
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        status_map: dict[str, str] = {}
        ok = True

        try:
            connection.ensure_connection()
            status_map["postgres"] = "ok"
        except Exception as e:
            status_map["postgres"] = f"error: {type(e).__name__}"
            ok = False

        try:
            client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
            client.ping()
            status_map["redis"] = "ok"
        except Exception as e:
            status_map["redis"] = f"error: {type(e).__name__}"
            ok = False

        body = {"status": "ok" if ok else "degraded", "services": status_map}
        return Response(body, status=200 if ok else 503)
