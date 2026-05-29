"""
认证与场景 API 测试：统一 envelope、鉴权、租户隔离。
"""

from __future__ import annotations

import io
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from .helpers import create_customer, customer_bearer_token


def _minimal_zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("project.json", "{}")
    return buf.getvalue()


@override_settings(OPEN_API_AUTH=False)
class AuthAndSceneApiTests(APITestCase):
    def test_scenes_list_requires_auth(self):
        response = self.client.get("/api/scenes/")
        self.assertEqual(response.status_code, 401)

    def test_login_returns_envelope_and_tokens(self):
        create_customer(username="login_user@example.com")
        response = self.client.post(
            "/api/auth/login/",
            {"username": "login_user@example.com", "password": "TestPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["code"], 0)
        self.assertIn("access_token", body["data"])

    def test_tenant_cannot_read_other_users_scene(self):
        owner = create_customer(username="owner@example.com")
        other = create_customer(username="other@example.com")

        create_resp = self.client.post(
            "/api/scenes/",
            {
                "name": "私有场景",
                "bundle": SimpleUploadedFile(
                    "bundle.zip",
                    _minimal_zip_bytes(),
                    content_type="application/zip",
                ),
            },
            format="multipart",
            HTTP_AUTHORIZATION=customer_bearer_token(owner),
        )
        self.assertEqual(create_resp.status_code, 201)
        scene_id = create_resp.json()["data"]["scene_id"]

        detail_resp = self.client.get(
            f"/api/scenes/{scene_id}/",
            HTTP_AUTHORIZATION=customer_bearer_token(other),
        )
        self.assertEqual(detail_resp.status_code, 404)
