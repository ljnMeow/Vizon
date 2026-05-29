"""DRF 权限类。"""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsCustomerAuthenticated(BasePermission):
    """
    要求已通过 CustomerJWTAuthentication 绑定 request.customer。

    比全局 IsAuthenticated 更严格：避免 Session/Basic 无 customer 时访问资源 API。
    """

    message = "未登录或 token 无效"

    def has_permission(self, request, view) -> bool:  # pyright: ignore[reportIncompatibleMethodOverride]
        return getattr(request, "customer", None) is not None
