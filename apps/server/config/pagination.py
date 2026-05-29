"""DRF 分页：与统一 JSON envelope 兼容。"""

from __future__ import annotations

from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    """标准分页；经 UnifiedJSONRenderer 后 data 为 {count, next, previous, results}。"""

    page_size_query_param = "page_size"
    max_page_size = 200
