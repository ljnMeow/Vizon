"""
URL 路由入口（全局 URLConf）。

你可以把它理解成"HTTP 路径 -> 视图函数/类"的映射表：
- 浏览器请求 `/admin/` 时，Django 会在这里找到对应处理逻辑
- 未来你写 API（比如 `/api/designs/`）也会在这里挂载

常见组织方式：
- 小项目：直接在这里 path("xxx/", views.xxx) 逐条写
- 中大型项目：把每个 Django app 自己的 urls.py 用 include() 挂进来，
  让路由按模块拆分，维护更清晰

参考文档：https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # Django 自带的后台管理站点（后续可创建超级管理员账号登录）
    path("admin/", admin.site.urls),
    # OpenAPI schema + Swagger UI
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    # 认证相关（当前只有登录）
    path("api/", include("auth_api.urls")),
    # 对前端提供的接口都建议挂在 /api/ 下，避免和页面路由冲突
    path("api/", include("customers.urls")),
    # 场景管理接口
    path("api/", include("scenes.urls")),
    # 贴图资源管理接口
    path("api/", include("textures.urls")),
    # 模型资源管理接口
    path("api/", include("models3d.urls")),
]

# 开发环境下由 Django 直接伺服媒体文件（上传的 bundle/thumbnail）；
# 生产环境应由 Nginx/对象存储处理，不依赖 Django 提供静态文件。
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
