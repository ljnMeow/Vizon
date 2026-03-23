"""
数据库配置模块（强制 PostgreSQL）。

你提到后续数据都要走 PostgreSQL，所以我们把 DB 的拼装逻辑独立出来：
- `settings.py` 里只需要调用 `build_databases(BASE_DIR)`
- 你以后要切换到云数据库、加连接池参数、读写分离等，也只改这里更集中

注意：
- 这里的“读取环境变量”只负责拼配置，不负责加载 .env 文件
- .env 加载在 `settings.py` 里做（更符合“settings 统一入口”的习惯）
"""

from __future__ import annotations

import os
from pathlib import Path


def build_databases(base_dir: Path) -> dict:
    """
    生成 Django 的 `DATABASES` 配置。

    规则（企业级/可观测）：
    - **强制使用 PostgreSQL**：缺少环境变量/连不上数据库时，直接报错
    - 这样可以避免“本地/CI 不小心回落到 sqlite”导致的数据不一致与排障困难
    """

    postgres_db = os.getenv('POSTGRES_DB', '').strip()
    postgres_user = os.getenv('POSTGRES_USER', '').strip()
    postgres_password = os.getenv('POSTGRES_PASSWORD', '').strip()
    postgres_host = os.getenv('POSTGRES_HOST', '').strip() or '127.0.0.1'
    postgres_port = os.getenv('POSTGRES_PORT', '').strip() or '5432'

    missing = []
    if not postgres_db:
        missing.append('POSTGRES_DB')
    if not postgres_user:
        missing.append('POSTGRES_USER')
    if not postgres_password:
        missing.append('POSTGRES_PASSWORD')

    # HOST/PORT 我们给了默认值；DB/USER/PASSWORD 缺失会导致“连错库/连不上/连到默认库”
    # 这些问题在企业项目里非常难排查，所以这里直接 fail fast。
    if missing:
        raise RuntimeError(
            "PostgreSQL 配置缺失，已拒绝启动（不会回落 sqlite）。\n"
            f"缺少：{', '.join(missing)}\n"
            "请在 `apps/server/.env` 或系统环境变量里配置 POSTGRES_*，"
            "参考 `apps/server/.env.example`。"
        )

    # Django 内置支持 PostgreSQL，只需要正确的 ENGINE + 驱动（我们已安装 psycopg）
    return {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': postgres_db,
            'USER': postgres_user,
            'PASSWORD': postgres_password,
            'HOST': postgres_host,
            'PORT': postgres_port,
            # 可选：如果你后续遇到“连接偶发断开”，可以在这里加 CONN_MAX_AGE 等参数
        }
    }

