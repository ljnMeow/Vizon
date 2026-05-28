"""
模型压缩 Celery 任务。

上传模型后异步执行：格式转换 → Draco 压缩。
进度通过 WebSocket 实时推送 + update_state 存储到 Redis（轮询兜底）。
"""

from __future__ import annotations

import logging
import os
import shutil
import re

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.conf import settings

from .models import ModelAsset, CompressionStatus
from utils.model_compress import process_model_file

logger = logging.getLogger(__name__)

# ZIP 解压目录匹配模式
_UUID_DIR_RE = re.compile(r"models3d/files/[0-9a-f-]{32,}/")


def _send_progress(public_id: str, data: dict) -> None:
    """通过 WebSocket 推送压缩进度到前端。"""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        group_name = f"compression_{public_id}"
        event_type = (
            "compression_complete"
            if data.get("status") in ("completed", "failed")
            else "compression_progress"
        )
        async_to_sync(channel_layer.group_send)(
            group_name, {"type": event_type, "data": data},
        )
    except Exception:
        logger.debug("WebSocket 进度推送失败，忽略", exc_info=True)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def compress_model_task(self, model_asset_id: int):
    """
    压缩模型资产：转换格式 + Draco。

    进度同时通过两个渠道上报：
    1. update_state → Redis result backend（HTTP 轮询兜底）
    2. channel_layer.group_send → WebSocket 实时推送
    """
    try:
        asset = ModelAsset.objects.get(pk=model_asset_id)
    except ModelAsset.DoesNotExist:
        logger.error("ModelAsset pk=%d 不存在，跳过压缩", model_asset_id)
        return

    public_id = str(asset.public_id)

    def _update_state_ws(state: str, meta: dict) -> None:
        """包装 update_state，同时推 WebSocket。"""
        self.update_state(state=state, meta=meta)
        _send_progress(public_id, {"status": "processing", **meta})

    try:
        asset.compression_status = CompressionStatus.PROCESSING
        asset.save(update_fields=["compression_status", "updated_at"])

        original_path = asset.file.path
        output_dir = os.path.join(
            settings.MEDIA_ROOT, "models3d", "compressed", str(asset.public_id)
        )

        # 执行完整压缩流水线（内部上报进度 + WebSocket 推送）
        compressed_path, compressed_size = process_model_file(
            original_path,
            output_dir,
            update_state=_update_state_ws,
        )

        # 保存阶段：压缩完成，写入数据库
        _update_state_ws(state="PROGRESS", meta={
            "stage": "saving", "percent": 100,
            "message": "正在保存压缩结果...",
        })

        # 保存压缩文件路径到 compressed_file 字段
        rel_path = os.path.relpath(compressed_path, settings.MEDIA_ROOT)
        asset.compressed_file.name = rel_path
        asset.compressed_file_size = compressed_size
        asset.compression_status = CompressionStatus.COMPLETED

        original_file_size = asset.file_size

        # 清理 ZIP 解压目录（如果是 ZIP 上传的，需要在 file 字段清空前获取路径）
        _cleanup_zip_extract(asset)

        # 删除原文件磁盘文件，节省空间
        if os.path.exists(original_path):
            os.remove(original_path)
        asset.file = None
        asset.file_size = 0

        asset.save(update_fields=[
            "compressed_file", "compressed_file_size",
            "compression_status", "file", "file_size",
            "updated_at",
        ])

        # WebSocket 推送完成状态
        _send_progress(public_id, {
            "status": "completed",
            "original_size": original_file_size,
            "compressed_size": compressed_size,
        })

        logger.info(
            "模型压缩完成 pk=%d：%.1f MB → %.1f MB (%.1f%%)",
            model_asset_id,
            original_file_size / (1024 * 1024),
            compressed_size / (1024 * 1024),
            (compressed_size / original_file_size * 100) if original_file_size > 0 else 0,
        )

    except Exception as exc:
        logger.exception("模型压缩失败 pk=%d", model_asset_id)
        try:
            asset.compression_status = CompressionStatus.FAILED
            asset.save(update_fields=["compression_status", "updated_at"])
        except Exception:
            pass

        _send_progress(public_id, {"status": "failed"})

        # 重试（最多 max_retries 次）
        raise self.retry(exc=exc)


def _cleanup_zip_extract(asset: ModelAsset) -> None:
    """压缩完成后，清理 ZIP 解压的多文件目录。"""
    file_name = asset.file.name if asset.file and asset.file.name else ""
    if not _UUID_DIR_RE.search(file_name):
        return

    # 提取 UUID 子目录路径
    parts = file_name.split("/")
    # parts: ['models3d', 'files', '<uuid>', '...', 'entry.gltf']
    if len(parts) < 3:
        return

    uuid_dir = os.path.join(settings.MEDIA_ROOT, parts[0], parts[1], parts[2])
    if os.path.isdir(uuid_dir):
        shutil.rmtree(uuid_dir, ignore_errors=True)
        logger.info("已清理 ZIP 解压目录：%s", uuid_dir)
