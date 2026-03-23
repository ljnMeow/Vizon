"""
auth_api 模块视图：
- login
- refresh token
- token 校验（me）
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, cast

from django.contrib.auth.hashers import check_password
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from customers.models import Customer, CustomerPublicId
from customers.serializers import CustomerReadSerializer

from .jwt import decode_customer_refresh_token_no_session_check, decode_customer_token, issue_customer_access_token, issue_customer_refresh_token
from .redis_store import delete_refresh_session, set_refresh_session
from .serializers import CustomerLoginSerializer, LogoutSerializer, RefreshTokenSerializer
from .authentication import CustomerJWTAuthentication


class CustomerLoginView(APIView):
    """
    客户登录接口：
    POST /api/auth/login/
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=CustomerLoginSerializer,
        responses={
            200: OpenApiResponse(description="登录成功，返回 access_token/refresh_token 与用户信息"),
            400: OpenApiResponse(description="参数错误/账号或密码错误"),
        },
        tags=["auth"],
    )
    def post(self, request):
        serializer = CustomerLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = cast(Dict[str, Any], serializer.validated_data)
        username = data["username"]
        password = data["password"]

        customer = Customer.objects.select_related("public").filter(username=username).first()
        if customer is None:
            return Response({"detail": "用户名或密码错误"}, status=status.HTTP_400_BAD_REQUEST)

        if not customer.is_active:
            return Response({"detail": "账号已冻结"}, status=status.HTTP_400_BAD_REQUEST)

        if not check_password(password, customer.password):
            return Response({"detail": "用户名或密码错误"}, status=status.HTTP_400_BAD_REQUEST)

        pub, _ = CustomerPublicId.objects.get_or_create(customer=customer)
        access_token = issue_customer_access_token(account_id=str(pub.public_id))
        refresh_token, refresh_jti, refresh_exp_ts = issue_customer_refresh_token(account_id=str(pub.public_id))

        # 写入 refresh 会话（Redis）
        ttl = int(refresh_exp_ts - datetime.now(tz=timezone.utc).timestamp())
        set_refresh_session(jti=refresh_jti, account_id=str(pub.public_id), ttl_seconds=ttl)

        return Response(
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "account_id": str(pub.public_id),
                "user": CustomerReadSerializer(customer).data,
            },
            status=status.HTTP_200_OK,
        )

class RefreshTokenView(APIView):
    """
    刷新 token：
    POST /api/auth/refresh/

    入参：
    - refresh_token
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=RefreshTokenSerializer,
        responses={
            200: OpenApiResponse(description="刷新成功，返回新的 access_token/refresh_token"),
            400: OpenApiResponse(description="参数错误或 refresh_token 无效"),
            401: OpenApiResponse(description="refresh_token 过期/无效"),
        },
        tags=["auth"],
    )
    def post(self, request):
        serializer = RefreshTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = cast(Dict[str, Any], serializer.validated_data)
        refresh_token = data["refresh_token"]

        payload = decode_customer_token(refresh_token, expected_typ="refresh")
        account_id = payload["sub"]
        old_jti = payload.get("jti")

        # refresh rotation：
        # - 旧 refresh 只能用一次（避免 token 泄漏后可被无限续期）
        if old_jti:
            delete_refresh_session(jti=str(old_jti))

        # 下发新的 access/refresh，并写入 Redis 会话
        access_token = issue_customer_access_token(account_id=account_id)
        new_refresh_token, new_jti, new_exp_ts = issue_customer_refresh_token(account_id=account_id)
        ttl = int(new_exp_ts - datetime.now(tz=timezone.utc).timestamp())
        set_refresh_session(jti=new_jti, account_id=account_id, ttl_seconds=ttl)
        return Response(
            {
                "access_token": access_token,
                "refresh_token": new_refresh_token,
                "account_id": account_id,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    退出登录（服务端注销 refresh token）：
    POST /api/auth/logout/

    入参：
    - refresh_token
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=LogoutSerializer,
        responses={
            200: OpenApiResponse(description="退出成功"),
        },
        tags=["auth"],
    )
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = cast(Dict[str, Any], serializer.validated_data)
        refresh_token = (data.get("refresh_token") or "").strip()

        # 退出登录应当“永远成功”（幂等）。
        # - refresh_token 不传：视为客户端本地清 token（等价于退出）
        # - refresh_token 过期/无效：也等价于退出（因为已经无法再 refresh）
        if not refresh_token:
            return Response({"logged_out": True}, status=status.HTTP_200_OK)

        try:
            payload = decode_customer_refresh_token_no_session_check(refresh_token)
        except Exception:
            return Response({"logged_out": True}, status=status.HTTP_200_OK)

        jti = payload.get("jti")
        if not jti:
            return Response({"logged_out": True}, status=status.HTTP_200_OK)

        # 删除 refresh 会话（Redis），幂等
        delete_refresh_session(jti=str(jti))

        return Response({"logged_out": True}, status=status.HTTP_200_OK)


class IsLoginView(APIView):
    """
    判断当前是否已登录：
    GET /api/auth/is-login/

    设计目标：
    - 登录页直接打开时也能调用（所以不强制鉴权）
    - 如果带了 Authorization: Bearer <access_token> 且有效 -> is_login=true
    - 如果没带/过期/无效 -> is_login=false（仍返回 200，便于前端少写分支）
    """

    permission_classes = [AllowAny]

    @extend_schema(
        responses={
            200: OpenApiResponse(description="返回 is_login 以及可选 user 信息"),
        },
        tags=["auth"],
    )
    def get(self, request):
        auth = CustomerJWTAuthentication()
        try:
            result = auth.authenticate(request)
        except Exception:
            return Response({"is_login": False}, status=status.HTTP_200_OK)

        if result is None:
            return Response({"is_login": False}, status=status.HTTP_200_OK)

        principal, _token = result
        return Response(
            {"is_login": True, "account_id": principal.account_id, "user": CustomerReadSerializer(principal.customer).data},
            status=status.HTTP_200_OK,
        )
