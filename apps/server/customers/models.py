"""
Customer 模块的数据模型。

注意：这里的 Customer 是“业务里的客户用户”，
不是 Django 自带的 `auth_user`（系统账号/管理员）。
"""

import uuid

from django.contrib.auth.hashers import make_password
from django.db import models


class Customer(models.Model):
    """
    客户用户表。

    字段说明（按你的需求）：
    - username:    登录名/账号（唯一）
    - password:    密码（我们存 hash，而不是明文）
    - nickname:    昵称（展示用）
    - is_active:   是否激活，默认 True
    - create_time: 创建时间
    - update_time: 更新时间
    """

    # 登录名，一般为邮箱。这里保持 CharField，邮箱格式校验放在 serializer 里做。
    username = models.CharField(max_length=150, unique=True, db_index=True)
    # 存储加密后的密码哈希；不存明文
    password = models.CharField(max_length=128)
    nickname = models.CharField(max_length=10, blank=True)
    is_active = models.BooleanField(default=True)
    create_time = models.DateTimeField(auto_now_add=True)
    update_time = models.DateTimeField(auto_now=True)

    class Meta:
        # 你希望数据库表名更清晰：用 `customer_accounts` 表示“客户账号表”。
        db_table = "customer_accounts"

    def set_password(self, raw_password: str) -> None:
        """
        设置密码时自动做 hash。

        调用方式：
        - customer.set_password("12345678")
        - customer.save()
        """

        self.password = make_password(raw_password)


class CustomerPublicId(models.Model):
    """
    Customer 的对外公开 ID（UUID）。

    你希望把“内部自增 id”与“对外不可枚举 id”拆成两张表：
    - customer_accounts：内部主键 id（自增）
    - customer_accounts_public_id：对外 public_id（UUID） ↔ customer_accounts.id（1-1）
    """

    customer = models.OneToOneField(
        Customer,
        on_delete=models.CASCADE,
        related_name="public",
        db_index=True,
    )
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "customer_accounts_public_id"

