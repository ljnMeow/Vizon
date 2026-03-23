"""
DRF 认证类：Customer JWT Authentication

支持：
- Authorization: Bearer <access_token>

行为：
- 校验 JWT（typ=access）
- 从 token 的 sub(account_id) 找到 Customer
- 返回一个“已认证 user”对象，供 IsAuthenticated 等权限类使用
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple, cast

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from customers.models import Customer

from .jwt import decode_customer_token


@dataclass(frozen=True)
class CustomerPrincipal:
    """
    DRF 需要的最小 user 对象：
    - is_authenticated: True
    """

    account_id: str
    customer: Customer

    @property
    def is_authenticated(self) -> bool:  # DRF permissions 用
        return True


class CustomerJWTAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request) -> Optional[Tuple[CustomerPrincipal, str]]:
        header = request.headers.get("Authorization") or ""
        if not header:
            return None

        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None

        token = parts[1].strip()
        if not token:
            return None

        payload = decode_customer_token(token, expected_typ="access")
        account_id = payload["sub"]

        customer = Customer.objects.select_related("public").filter(public__public_id=account_id).first()
        if customer is None:
            raise AuthenticationFailed("账号不存在")

        if not customer.is_active:
            raise AuthenticationFailed("账号已冻结")

        # 让业务代码更容易拿到 customer
        request.customer = customer  # type: ignore[attr-defined]

        return CustomerPrincipal(account_id=account_id, customer=customer), token

    def authenticate_header(self, request) -> None:
        """
        告诉 DRF 本接口期望的认证方案（用于 WWW-Authenticate 响应头）。

        关键点：
        - DRF 在处理 AuthenticationFailed/NotAuthenticated 时，如果拿不到该头，
          会把 401 “降级”为 403（见 rest_framework.views.APIView.handle_exception）。
        - 返回 Bearer 后，token 过期/无效将稳定返回 401，更符合语义，也便于前端做 refresh。
        """

        # 兼容当前使用的 DRF 类型存根：其声明返回 None。
        # 但运行时 DRF 需要一个非空值来生成 WWW-Authenticate，从而保持 401 不被降级为 403。
        return cast(None, self.keyword)

