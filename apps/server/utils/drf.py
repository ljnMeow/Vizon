"""
DRF 相关通用工具函数（可复用、与业务解耦）。
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from rest_framework import serializers


def merge_field_errors_to_detail(
    err: serializers.ValidationError,
    *,
    field_order: Optional[Iterable[str]] = None,
    delimiter: str = "，",
) -> serializers.ValidationError:
    """
    将 DRF 默认的字段级错误：

    {
      "username": ["用户名不能为空"],
      "password": ["密码不能为空"]
    }

    合并成：

    {"detail": "用户名不能为空，密码不能为空"}
    """

    detail = err.detail
    if not isinstance(detail, dict):
        return err

    def _extract_messages(v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        if isinstance(v, list):
            return [str(item) for item in v if item is not None]
        return [str(v)]

    # 展示顺序可配置：field_order 优先，其余字段按原顺序补齐
    ordered_keys: list[str] = []
    if field_order is not None:
        for k in field_order:
            if k in detail and k not in ordered_keys:
                ordered_keys.append(k)
    for k in detail.keys():
        if k not in ordered_keys:
            ordered_keys.append(k)

    msgs: list[str] = []
    for k in ordered_keys:
        msgs.extend(_extract_messages(detail.get(k)))

    # 去重（保持原顺序），避免同一错误提示重复出现
    seen: set[str] = set()
    uniq: list[str] = []
    for m in msgs:
        if not m:
            continue
        if m in seen:
            continue
        seen.add(m)
        uniq.append(m)

    merged = delimiter.join(uniq)
    if not merged:
        return err
    return serializers.ValidationError({"detail": merged})

