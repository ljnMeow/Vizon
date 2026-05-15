"""
scenes 应用的路由。

API 路径（挂载在全局 /api/ 下）：
- /api/scenes/              （列表、创建）
- /api/scenes/{scene_id}/   （详情、更新、删除）
- /api/scenes/{scene_id}/bundle/  （下载 bundle ZIP）
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SceneViewSet

router = DefaultRouter()
# lookup_value_regex 宽松匹配 UUID（含连字符）
router.register(r'scenes', SceneViewSet, basename='scenes')

urlpatterns = [
    path('', include(router.urls)),
]
