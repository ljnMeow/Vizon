"""
资源 ViewSet 公共 mixin（客户隔离、文件下载）。
"""

from __future__ import annotations

from typing import Any, Type

from django.db.models import Model, QuerySet
from django.http import FileResponse
from rest_framework.exceptions import APIException, NotAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from customers.models import Customer
from utils.file_validation import CACHE_PRIVATE_HOUR, CACHE_PUBLIC_DAY, set_cache_control


def make_not_found_error(
    *,
    detail: str,
    code: str = "not_found",
) -> Type[APIException]:
    """生成 404 APIException 子类（各 app 文案不同）。"""

    class _NotFound(APIException):
        status_code = 404
        default_detail = detail
        default_code = code

    return _NotFound


class CustomerScopedMixin:
    """从 request.customer 读取当前客户并按 customer 过滤资源。"""

    # 子类可声明以下类属性，以便使用通用 _get_object 方法
    lookup_model: type[Model] | None = None
    not_found_error: Type[APIException] | None = None

    def _get_object(self, request: Request, pk: str | None) -> Model:
        """按 public_id 查询当前用户的资源（通用实现，子类声明 lookup_model + not_found_error 即可）。"""
        if self.lookup_model is None or self.not_found_error is None:
            raise NotImplementedError("子类需声明 lookup_model 和 not_found_error")
        return self.get_customer_scoped(request, self.lookup_model, pk, not_found_error=self.not_found_error)

    def get_customer(self, request: Request) -> Customer:
        customer = getattr(request, "customer", None)
        if customer is None:
            raise NotAuthenticated("未登录")
        return customer

    def get_customer_scoped(
        self,
        request: Request,
        model: type[Model],
        pk: str | None,
        *,
        not_found_error: Type[APIException],
        extra_filters: dict[str, Any] | None = None,
    ) -> Model:
        customer = self.get_customer(request)
        qs: QuerySet = model.objects.filter(customer=customer)
        if extra_filters:
            qs = qs.filter(**extra_filters)
        obj = qs.filter(public_id=pk).first()
        if obj is None:
            raise not_found_error()
        return obj


def serialize_queryset_list(
    request: Request,
    queryset: QuerySet,
    serializer_class: type,
    *,
    context: dict[str, Any] | None = None,
) -> Response:
    """不分页，直接返回序列化后的列表（经 envelope 后 data 为数组）。"""
    ctx = context if context is not None else {"request": request}
    data = serializer_class(queryset, many=True, context=ctx).data
    return Response(data)


def paginate_serialized_list(
    request: Request,
    queryset: QuerySet,
    serializer_class: type,
    *,
    view: Any = None,
    context: dict[str, Any] | None = None,
) -> Response:
    """对 queryset 分页并序列化；与 StandardResultsPagination 配合。"""
    from config.pagination import StandardResultsPagination

    ctx = context if context is not None else {"request": request}
    paginator = StandardResultsPagination()
    page = paginator.paginate_queryset(queryset, request, view=view)
    if page is not None:
        data = serializer_class(page, many=True, context=ctx).data
        return paginator.get_paginated_response(data)
    data = serializer_class(queryset, many=True, context=ctx).data
    return Response(data)


def delete_file_field(field) -> None:
    """安全删除 FileField / ImageField 关联的磁盘文件。"""
    if not field or not field.name:
        return
    try:
        field.delete(save=False)
    except Exception:
        pass


class FileDownloadMixin:
    """file / thumbnail 下载 action 的公共逻辑。"""

    def serve_attachment(
        self,
        field,
        *,
        filename: str,
        content_type: str = "application/octet-stream",
        missing_message: str = "文件不存在",
        not_found_error: Type[APIException],
    ) -> FileResponse:
        if not field or not field.name:
            raise not_found_error(missing_message)
        response = FileResponse(
            field.open("rb"),
            content_type=content_type,
            as_attachment=True,
            filename=filename,
        )
        return set_cache_control(response, CACHE_PRIVATE_HOUR)

    def serve_thumbnail_inline(
        self,
        field,
        *,
        missing_message: str = "缩略图不存在",
        not_found_error: Type[APIException],
        content_type: str = "image/png",
    ) -> FileResponse:
        if not field or not field.name:
            raise not_found_error(missing_message)
        return set_cache_control(
            FileResponse(
                field.open("rb"),
                content_type=content_type,
                as_attachment=False,
            ),
            CACHE_PUBLIC_DAY,
        )
