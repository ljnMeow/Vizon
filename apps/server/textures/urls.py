"""
textures 应用的路由。

API 路径（挂载在全局 /api/ 下）：
- /api/textures/                   （列表、创建）
- /api/textures/{texture_id}/      （详情、更新、删除）
- /api/textures/{texture_id}/file/ （下载贴图文件）
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TextureViewSet

router = DefaultRouter()
router.register(r"textures", TextureViewSet, basename="textures")

urlpatterns = [
    path("", include(router.urls)),
]
