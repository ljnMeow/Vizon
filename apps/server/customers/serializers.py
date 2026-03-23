"""
Customer 模块的序列化器。

你可以把它理解成：
- 定义接口的输入/输出字段
- 校验规则（必填/长度/格式）
"""

from django.contrib.auth.hashers import make_password
from django.core.validators import EmailValidator
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import Customer, CustomerPublicId
from utils.datetime import format_datetime


class CustomerReadSerializer(serializers.ModelSerializer):
    """
    用于“读取客户数据”的序列化器。

    注意：
    - 不返回 password（安全考虑）
    """

    # 从关联表 customer_accounts_public_id 读取 UUID
    account_id = serializers.UUIDField(source="public.public_id", read_only=True, allow_null=True)
    # 时间格式化：YYYY-MM-DD HH:mm:ss（用方法字段避免类型桩不兼容）
    create_time = serializers.SerializerMethodField()
    update_time = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "account_id",
            "username",
            "nickname",
            "is_active",
            "create_time",
            "update_time",
        ]

    def get_create_time(self, obj: Customer) -> str:
        # 统一格式化工具：所有 serializer 都复用它
        return format_datetime(obj.create_time)

    def get_update_time(self, obj: Customer) -> str:
        return format_datetime(obj.update_time)


class CustomerCreateSerializer(serializers.ModelSerializer):
    """
    创建客户（注册）时使用的序列化器。
    """

    username = serializers.EmailField(
        max_length=150,
        validators=[
            EmailValidator(message="用户名必须是合法邮箱地址"),
            UniqueValidator(
                queryset=Customer.objects.all(),
                message="用户名已存在",
            ),
        ],
    )
    password = serializers.CharField(write_only=True, min_length=8)

    # 注册成功后只返回对外 account_id（即 public_id），不暴露内部自增 id
    account_id = serializers.UUIDField(source="public.public_id", read_only=True, allow_null=True)

    class Meta:
        model = Customer
        fields = [
            "account_id",
            "username",
            "password",
            "nickname",
        ]

    # 统一控制昵称长度提示
    nickname = serializers.CharField(
        max_length=10,
        required=False,
        allow_blank=True,
        error_messages={
            "max_length": "昵称长度为 10 个字符串以内",
        },
    )

    def create(self, validated_data):
        raw_password = validated_data.pop("password")
        customer = Customer(**validated_data)
        # 使用 Django 的密码哈希工具，而不是明文
        customer.password = make_password(raw_password)
        customer.save()

        # 同步创建对外 UUID
        CustomerPublicId.objects.get_or_create(customer=customer)
        return customer


class CustomerUpdateSerializer(serializers.ModelSerializer):
    """
    更新客户资料时使用。
    """
    account_id = serializers.UUIDField(source="public.public_id", read_only=True, allow_null=True)
    update_time = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "account_id",
            "nickname",
            "is_active",
            "update_time",
        ]

    nickname = serializers.CharField(
        max_length=10,
        required=False,
        allow_blank=True,
        error_messages={
            "max_length": "昵称长度为 10 个字符串以内",
        },
    )
        
    def get_update_time(self, obj: Customer) -> str:
        return format_datetime(obj.update_time)
