"""
auth_api 模块序列化器（当前只做登录）。
"""

from __future__ import annotations

from rest_framework import serializers

from utils.drf import merge_field_errors_to_detail


class CustomerLoginSerializer(serializers.Serializer):
    """
    登录入参：
    - username：邮箱
    - password：明文密码
    """

    username = serializers.EmailField(
        max_length=150,
        error_messages={
            "required": "用户名不能为空",
            "blank": "用户名不能为空",
            "invalid": "用户名必须是合法邮箱地址",
        },
    )
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        error_messages={
            "required": "密码不能为空",
            "blank": "密码不能为空",
            "min_length": "密码长度至少 8 位",
        },
    )

    def to_internal_value(self, data):
        """
        DRF 会在这里做字段级校验（required/blank/email/min_length 等）。
        我们捕获字段错误并合并成一个 `detail`，方便前端直接 toast 展示。
        """

        try:
            return super().to_internal_value(data)
        except serializers.ValidationError as e:
            raise merge_field_errors_to_detail(e, field_order=("username", "password")) from e


class RefreshTokenSerializer(serializers.Serializer):
    refresh_token = serializers.CharField(
        error_messages={
            "required": "refresh_token 不能为空",
            "blank": "refresh_token 不能为空",
        }
    )

    def to_internal_value(self, data):
        try:
            return super().to_internal_value(data)
        except serializers.ValidationError as e:
            raise merge_field_errors_to_detail(e, field_order=("refresh_token",)) from e


class LogoutSerializer(serializers.Serializer):
    refresh_token = serializers.CharField(
        required=False,
        allow_blank=True,
        error_messages={
            "blank": "refresh_token 不能为空",
        }
    )

    def to_internal_value(self, data):
        try:
            return super().to_internal_value(data)
        except serializers.ValidationError as e:
            raise merge_field_errors_to_detail(e, field_order=("refresh_token",)) from e

