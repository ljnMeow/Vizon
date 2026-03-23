"""
JWT 签发/校验相关。

说明：
- 我们的客户账号不是 Django 内置 auth.User，所以这里用 PyJWT 自签名。
- payload 中用 `sub` 存 customer 的 account_id（public_id / UUID）。
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal

import jwt
from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed

import uuid

from .redis_store import get_refresh_session_account_id


def issue_customer_access_token(*, account_id: str, expires_in_seconds: int | None = None) -> str:
    """
    签发 access token（JWT）。
    """

    if expires_in_seconds is None:
        expires_in_seconds = int(getattr(settings, "ACCESS_TOKEN_EXPIRES_SECONDS", 120))

    now = datetime.now(tz=timezone.utc)
    payload: Dict[str, Any] = {
        "sub": account_id,
        "typ": "access",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def issue_customer_refresh_token(
    *, account_id: str, expires_in_seconds: int | None = None
) -> tuple[str, str, int]:
    """
    签发 refresh token（JWT）。
    """

    if expires_in_seconds is None:
        expires_in_seconds = int(getattr(settings, "REFRESH_TOKEN_EXPIRES_SECONDS", 300))

    now = datetime.now(tz=timezone.utc)
    jti = str(uuid.uuid4())
    exp_ts = int((now + timedelta(seconds=expires_in_seconds)).timestamp())
    payload: Dict[str, Any] = {
        "sub": account_id,
        "typ": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": exp_ts,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return token, jti, exp_ts


def decode_customer_token(token: str, *, expected_typ: Literal["access", "refresh"]) -> Dict[str, Any]:
    """
    校验并解析 JWT。

    - token 过期/签名错误/类型不匹配 -> AuthenticationFailed
    - 返回 payload（dict）
    """

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise AuthenticationFailed("token 已过期") from e
    except jwt.InvalidTokenError as e:
        raise AuthenticationFailed("token 无效") from e

    typ = payload.get("typ")
    if typ != expected_typ:
        raise AuthenticationFailed("token 类型错误")

    sub = payload.get("sub")
    if not sub:
        raise AuthenticationFailed("token 缺少 sub")

    # refresh token：必须命中 Redis 会话，才能 refresh（否则视为已退出/被踢下线）
    if expected_typ == "refresh":
        jti = payload.get("jti")
        if not jti:
            raise AuthenticationFailed("token 缺少 jti")
        if not get_refresh_session_account_id(jti=jti):
            raise AuthenticationFailed("refresh_token 已注销")

    return payload


def decode_customer_refresh_token_no_session_check(token: str) -> Dict[str, Any]:
    """
    解析 refresh token（只校验签名/exp/typ，不校验 Redis 会话）。

    用途：
    - logout：即使会话已不存在/refresh 已过期，也希望接口幂等返回 200
    """

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise AuthenticationFailed("token 已过期") from e
    except jwt.InvalidTokenError as e:
        raise AuthenticationFailed("token 无效") from e

    typ = payload.get("typ")
    if typ != "refresh":
        raise AuthenticationFailed("token 类型错误")

    sub = payload.get("sub")
    if not sub:
        raise AuthenticationFailed("token 缺少 sub")

    jti = payload.get("jti")
    if not jti:
        raise AuthenticationFailed("token 缺少 jti")

    exp = payload.get("exp")
    if not exp:
        raise AuthenticationFailed("token 缺少 exp")

    return payload

