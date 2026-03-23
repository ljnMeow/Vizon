"""
统一 API 返回格式（全局）。

目标：
- 让前端永远拿到同一种 JSON 结构，减少判断分支
- 让错误信息/错误码集中管理，排查问题更快

统一格式（建议）：

成功：
{
  "code": 0,
  "message": "ok",
  "data": <任意类型>
}

失败（校验失败/权限失败/404/500 等）：
{
  "code": <非 0>,
  "message": <给人看的简短说明>,
  "errors": <可选，详细错误结构，便于前端展示/调试>
}

说明：
- 我们仍然保留 HTTP 状态码语义（例如 400/401/403/404/500），便于网关/监控/日志。
  `code` 是你们业务层的“稳定错误码”，更适合前端做逻辑分支。
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
logger = logging.getLogger("vizon.api")


def ok(data: Any = None, message: str = "ok") -> Response:
    """
    主动返回成功响应的工具函数（可选用）。

    大多数情况下你不需要手写它，因为我们有全局 Renderer，会自动包装。
    但如果某些接口返回的不是标准 serializer.data（例如返回纯字符串/自定义结构），
    用这个函数会更直观。
    """

    return Response({"code": 0, "message": message, "data": data}, status=status.HTTP_200_OK)


class UnifiedJSONRenderer(JSONRenderer):
    """
    全局 JSON Renderer：把所有 DRF Response 统一包装成约定格式。

    行为约定：
    - 如果已经是我们约定的结构（含 code/message），则不重复包装
    - 成功响应：包装为 {code, message, data}
    - 失败响应：包装为 {code, message, errors}
    """

    def render(self, data: Any, accepted_media_type: Optional[str] = None, renderer_context: Optional[dict] = None):
        renderer_context = renderer_context or {}
        response = renderer_context.get("response")

        # 某些情况（比如返回文件/Streaming）不走这里；这里只处理 JSON。
        if response is None:
            return super().render(data, accepted_media_type, renderer_context)

        # 已经是统一格式就直接返回（避免二次包装）
        if isinstance(data, dict) and "code" in data and "message" in data:
            return super().render(data, accepted_media_type, renderer_context)

        http_status = getattr(response, "status_code", 200)
        is_success = 200 <= http_status < 400

        if is_success:
            payload = {"code": 0, "message": "ok", "data": data}
        else:
            # 失败时 message 尽量给一个“人能读懂”的简短说明
            msg = _extract_error_message(data) or "error"
            payload = {"code": http_status, "message": msg, "errors": data}

        return super().render(payload, accepted_media_type, renderer_context)


def _extract_error_message(data: Any) -> Optional[str]:
    if data is None:
        return None
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        for item in data:
            msg = _extract_error_message(item)
            if msg:
                return msg
        return None
    if isinstance(data, dict):
        if "detail" in data and data.get("detail") is not None:
            return str(data.get("detail"))
        for v in data.values():
            msg = _extract_error_message(v)
            if msg:
                return msg
        return None
    return str(data)


def unified_exception_handler(exc: Exception, context: dict):
    """
    全局异常处理器：

    - 让 DRF 把各种异常（ValidationError/NotAuthenticated/PermissionDenied/NotFound 等）
      先转换成 Response（含合适的 HTTP status）
    - 再交给 Renderer 做统一包装
    """

    # 注意：这里不要在模块顶层导入 `rest_framework.views`，否则可能与
    # DEFAULT_RENDERER_CLASSES 指向本模块时形成循环导入。
    from rest_framework.views import exception_handler as drf_exception_handler

    response = drf_exception_handler(exc, context)
    if response is not None:
        # 对于 DRF 已知会转成 Response 的异常（400/401/403/404 等），不打 traceback，
        # 否则日志会被刷屏。仅对 5xx 记录堆栈，便于排查。
        if getattr(response, "status_code", 500) >= 500:
            request = context.get("request")
            if request is not None:
                logger.exception(
                    "Server error in API: %s %s",
                    getattr(request, "method", "-"),
                    getattr(request, "path", "-"),
                )
            else:
                logger.exception("Server error in API (no request in context)")
        return response

    # 未被 DRF 捕获的异常（一般是 500）
    request = context.get("request")
    if request is not None:
        logger.exception("Unhandled exception in API: %s %s", getattr(request, "method", "-"), getattr(request, "path", "-"))
    else:
        logger.exception("Unhandled exception in API (no request in context)")
    return Response({"detail": "internal_server_error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

