"""
models3d 应用的路由。

API 路径（挂载在全局 /api/ 下）：
- /api/models3d/                       （模型列表、创建）
- /api/models3d/{model_id}/            （模型详情、更新、删除）
- /api/models3d/{model_id}/file/       （下载模型文件）
- /api/models3d/categories/            （分类列表、创建）
- /api/models3d/categories/{id}/       （分类更新、删除）
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ModelAssetViewSet, ModelCategoryViewSet

router = DefaultRouter()
router.register(r"models3d/categories", ModelCategoryViewSet, basename="models3d-categories")
router.register(r"models3d", ModelAssetViewSet, basename="models3d")

urlpatterns = [
    path("", include(router.urls)),
]
