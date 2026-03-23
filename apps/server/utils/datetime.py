"""
时间/日期相关工具函数（全局复用）。

为什么要放在 utils？
- `config/` 更偏“配置与框架接入”
- `utils/` 更偏“可复用的纯函数/工具”
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from django.utils import timezone


def format_datetime(dt: Optional[datetime], fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    将 datetime 格式化为字符串。

    - dt 为 None 时返回空字符串（所以返回类型是 str，不是 Optional[str]）
    - 默认格式为 YYYY-MM-DD HH:mm:ss
    """

    if dt is None:
        return ""

    # 如果是带时区的 datetime（USE_TZ=True 时通常如此），先转成本地时区再格式化，
    # 避免出现“接口时间比电脑时间少 8 小时”这类问题。
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)

    return dt.strftime(fmt) or ""

