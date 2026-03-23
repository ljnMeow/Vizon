"""
auth_api 的 Redis 存储层（refresh token 会话管理）。

约定：
- 我们只“有状态”管理 refresh token：
  - 登录/refresh 时写入会话（带 TTL）
  - refresh 时必须命中会话，否则拒绝
  - logout 时删除会话（幂等）
- access token 仍然无状态（不进 Redis）。
"""

from __future__ import annotations

from typing import Optional

import redis
from django.conf import settings


def _client() -> redis.Redis:
    # decode_responses=True -> 直接拿到 str（不需要手动 decode bytes）
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _refresh_session_key(jti: str) -> str:
    return f"auth:refresh_session:{jti}"


def set_refresh_session(*, jti: str, account_id: str, ttl_seconds: int) -> None:
    """
    写入 refresh 会话（带 TTL）。
    """

    if ttl_seconds <= 0:
        # 已过期则不写入
        return
    _client().set(_refresh_session_key(jti), account_id, ex=ttl_seconds)


def get_refresh_session_account_id(*, jti: str) -> Optional[str]:
    """
    查询 refresh 会话是否存在。
    - 存在返回 account_id
    - 不存在返回 None
    """

    v = _client().get(_refresh_session_key(jti))
    return v if v else None


def delete_refresh_session(*, jti: str) -> None:
    """
    删除 refresh 会话（幂等）。
    """

    _client().delete(_refresh_session_key(jti))

