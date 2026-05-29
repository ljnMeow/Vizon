"""健康检查端点测试。"""

from django.test import TestCase
from rest_framework.test import APIClient


class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_returns_services_status(self):
        response = self.client.get("/api/health/")
        self.assertIn(response.status_code, (200, 503))
        body = response.json()
        payload = body.get("data", body)
        self.assertIn("services", payload)
        self.assertIn("postgres", payload["services"])
        self.assertIn("redis", payload["services"])
