from django.apps import AppConfig


class AuthApiConfig(AppConfig):
    name = 'auth_api'

    def ready(self):
        # 注册 drf-spectacular OpenAPI 扩展
        from . import openapi  # noqa: F401
