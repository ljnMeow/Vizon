"""
`customers` 应用的路由。

API 前缀（在全局 urls 里挂载到 /api/customers/）：
- /api/customers/        （列表、创建）
- /api/customers/{id}/   （详情、更新、删除）
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customers")

urlpatterns = [
    path("", include(router.urls)),
]

