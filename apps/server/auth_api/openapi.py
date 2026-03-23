"""
drf-spectacular OpenAPI 扩展：为 CustomerJWTAuthentication 注册认证方案
"""

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.plumbing import build_bearer_security_scheme_object

from .authentication import CustomerJWTAuthentication


class CustomerJWTAuthenticationExtension(OpenApiAuthenticationExtension):
    target_class = CustomerJWTAuthentication
    name = "bearerAuth"

    def get_security_definition(self, auto_schema):
        return build_bearer_security_scheme_object(
            header_name="Authorization",
            token_prefix="Bearer",
            bearer_format="JWT"
        )
