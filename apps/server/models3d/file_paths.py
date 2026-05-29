"""
模型资源的文件路径常量和清理工具。

集中维护：
- ZIP 解压目录的相对路径模板 (models3d/files/{uuid}/...)
- 压缩输出目录的相对路径模板 (models3d/compressed/{uuid}/...)
- 上述目录的整体清理函数

views.py 与 tasks.py 共用，避免路径硬编码和清理逻辑重复。
"""

from __future__ import annotations

import logging
import os
import re
import shutil

from django.conf import settings

logger = logging.getLogger(__name__)

# ZIP 解压目录相对路径模式：models3d/files/<uuid>/...
_FILES_UUID_DIR_RE = re.compile(r"models3d/files/[0-9a-f-]{32,}/")


def is_zip_extract_path(file_name: str) -> bool:
    """判断 file_name 是否位于 ZIP 解压目录下。"""
    return bool(_FILES_UUID_DIR_RE.search(file_name or ""))


def _uuid_subdir(file_name: str) -> str | None:
    """从 'models3d/files/<uuid>/...' 中提取 UUID 子目录的绝对路径。"""
    if not file_name:
        return None
    parts = file_name.split("/")
    # parts: ['models3d', 'files', '<uuid>', ...]
    if len(parts) < 3:
        return None
    return os.path.join(settings.MEDIA_ROOT, parts[0], parts[1], parts[2])


def cleanup_zip_extract_dir(file_name: str) -> None:
    """删除整个 ZIP 解压目录（models3d/files/<uuid>/）。"""
    if not is_zip_extract_path(file_name):
        return
    uuid_dir = _uuid_subdir(file_name)
    if uuid_dir and os.path.isdir(uuid_dir):
        shutil.rmtree(uuid_dir, ignore_errors=True)
        logger.info("已清理 ZIP 解压目录：%s", uuid_dir)


def cleanup_compressed_dir(compressed_name: str) -> None:
    """删除压缩输出目录（models3d/compressed/<uuid>/）。"""
    if not compressed_name:
        return
    parts = compressed_name.split("/")
    # parts: ['models3d', 'compressed', '<uuid>', 'compressed.glb']
    if len(parts) < 3:
        return
    uuid_dir = os.path.join(settings.MEDIA_ROOT, parts[0], parts[1], parts[2])
    if os.path.isdir(uuid_dir):
        shutil.rmtree(uuid_dir, ignore_errors=True)
