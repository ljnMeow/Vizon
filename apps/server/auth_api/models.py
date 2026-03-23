"""
auth_api 的数据模型。

说明：
- refresh token 的会话状态已迁到 Redis（不再落库）。
"""

from __future__ import annotations

from django.db import models  # noqa: F401
