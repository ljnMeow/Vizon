"""
Customer 模块的 API 视图。

当前接口设计：
- POST   /api/customers/           创建客户
- GET    /api/customers/           客户列表
- GET    /api/customers/{id}/      客户详情
- PUT    /api/customers/{id}/      更新客户（nickname / is_active）
- DELETE /api/customers/{id}/      删除客户（物理删除）

后续如果你需要“修改客户密码”，建议做一个单独的接口：
- POST /api/customers/{id}/password/
"""

from rest_framework import status, viewsets
from rest_framework.exceptions import APIException
from rest_framework.response import Response

from .models import Customer, CustomerPublicId
from .serializers import (
    CustomerCreateSerializer,
    CustomerReadSerializer,
    CustomerUpdateSerializer,
)


class CustomerNotFoundError(APIException):
    """
    统一的“客户不存在”异常。

    用在查询/修改/删除时目标不存在的场景：
    - 返回 HTTP 404，更符合语义
    - 通过全局异常处理器输出统一错误结构
    """

    status_code = 404
    default_detail = "该条数据不存在"
    default_code = "not_found"


class CustomerViewSet(viewsets.ModelViewSet):
    """
    客户的 CRUD 视图。
    """

    # 不暴露 PATCH（保留 PUT：你希望有标准的“更新”接口）
    http_method_names = ["get", "post", "put", "delete", "head", "options"]

    # 对外用 public_id（UUID）定位资源，避免暴露自增 id
    lookup_field = "public_id"
    lookup_value_regex = r"[0-9a-fA-F-]{32,36}"

    queryset = Customer.objects.select_related("public").all().order_by("-id")

    def get_object(self):
        """
        让 /api/customers/{public_id}/ 使用 UUID 查询 Customer。

        public_id 在 `CustomerPublicId` 表里，所以这里用 join 查询：
        - public__public_id = URL 参数里的 UUID

        约定：
        - 如果找不到数据，抛出 CustomerNotFoundError（最终会返回 500 + 统一错误信息）
        """

        public_id = self.kwargs.get(self.lookup_field)
        customer = (
            self.get_queryset()
            .select_related("public")
            .filter(public__public_id=public_id)
            .first()
        )
        if customer is None:
            raise CustomerNotFoundError()

        self.check_object_permissions(self.request, customer)
        return customer

    def get_serializer_class(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        """
        不同动作对应不同序列化器：
        - create：CustomerCreateSerializer（包含 password）
        - update：CustomerUpdateSerializer
        - list/retrieve：CustomerReadSerializer
        """

        if self.action == "create":
            return CustomerCreateSerializer
        if self.action in ("update",):
            return CustomerUpdateSerializer
        return CustomerReadSerializer

    def perform_create(self, serializer):
        customer = serializer.save()
        CustomerPublicId.objects.get_or_create(customer=customer)

    def update(self, request, *args, **kwargs):
        """
        PUT /api/customers/{account_id}/
        """

        customer = self.get_object()
        serializer = CustomerUpdateSerializer(customer, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        """
        DELETE /api/customers/{account_id}
        """

        customer = self.get_object()
        public = getattr(customer, "public", None)
        account_id = str(public.public_id) if public is not None else None
        customer.delete()
        return Response({"account_id": account_id, "deleted": True}, status=status.HTTP_200_OK)


