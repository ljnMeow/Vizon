"""
公共序列化字段。

抽出在多个序列化器中重复出现的字段模式：
- AbsoluteFileUrlField：FileField/ImageField → 绝对 URL 或 None
- FormattedDateTimeField：datetime → 'YYYY-MM-DD HH:MM:SS'
"""

from __future__ import annotations

from rest_framework import serializers

from utils.datetime import format_datetime


class AbsoluteFileUrlField(serializers.Field):
    """
    读取模型上的 FileField/ImageField，返回带域名的绝对 URL；字段为空时返回 None。

    用法：
        thumbnail_url = AbsoluteFileUrlField(source="thumbnail")
    """

    def __init__(self, **kwargs):
        kwargs.setdefault("read_only", True)
        super().__init__(**kwargs)

    def to_representation(self, value) -> str | None:
        field = value  # source 解析后就是字段值本身（FieldFile）
        if not field or not getattr(field, "name", None):
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(field.url)
        return field.url


class FormattedDateTimeField(serializers.Field):
    """
    把 datetime 格式化为 'YYYY-MM-DD HH:MM:SS'（本地时区）；值为 None 时返回 None。

    用法：
        created_at = FormattedDateTimeField()
    不需要传 source，字段名就是 source。
    """

    def __init__(self, **kwargs):
        kwargs.setdefault("read_only", True)
        super().__init__(**kwargs)

    def to_representation(self, value) -> str | None:
        if value is None:
            return None
        return format_datetime(value)
