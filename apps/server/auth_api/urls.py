"""
auth_api 路由。
"""

from django.urls import path

from .views import CustomerLoginView, IsLoginView, LogoutView, RefreshTokenView

urlpatterns = [
    path("auth/login/", CustomerLoginView.as_view(), name="customer-login"),
    path("auth/refresh/", RefreshTokenView.as_view(), name="customer-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="customer-logout"),
    path("auth/is-login/", IsLoginView.as_view(), name="customer-is-login"),
]

