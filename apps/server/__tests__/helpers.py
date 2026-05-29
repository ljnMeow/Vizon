"""测试辅助：创建客户并签发 access token。"""

from __future__ import annotations

import uuid

from customers.models import Customer, CustomerPublicId
from auth_api.jwt import issue_customer_access_token


def create_customer(*, username: str, password: str = "TestPass123!") -> Customer:
    customer = Customer(username=username)
    customer.set_password(password)
    customer.save()
    CustomerPublicId.objects.get_or_create(
        customer=customer,
        defaults={"public_id": uuid.uuid4()},
    )
    return customer


def customer_bearer_token(customer: Customer) -> str:
    """返回 Bearer token 字符串，供 APIClient 的 HTTP_AUTHORIZATION 使用。"""
    public_row = CustomerPublicId.objects.filter(customer=customer).first()
    if public_row is None:
        public_row, _ = CustomerPublicId.objects.get_or_create(
            customer=customer,
            defaults={"public_id": uuid.uuid4()},
        )
    token = issue_customer_access_token(account_id=str(public_row.public_id))
    return f"Bearer {token}"
