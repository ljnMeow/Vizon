"""
文件上传校验工具模块。

提供扩展名白名单校验、文件大小限制校验、Cache-Control 辅助函数。
遵循 utils/ 目录的纯函数风格。
"""

from pathlib import Path

from django.conf import settings
from rest_framework import serializers

# ── 扩展名白名单 ──

TEXTURE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".hdr", ".exr"}
MODEL_EXTENSIONS = {
    ".gltf", ".glb", ".fbx", ".obj", ".stl", ".zip",
}
SCENE_BUNDLE_EXTENSIONS = {".zip"}
THUMBNAIL_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# ── 默认大小上限 ──

DEFAULT_MAX_TEXTURE_SIZE = 50 * 1024 * 1024      # 50 MB
DEFAULT_MAX_MODEL_SIZE = 200 * 1024 * 1024       # 200 MB
DEFAULT_MAX_SCENE_SIZE = 200 * 1024 * 1024       # 200 MB
DEFAULT_MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024     # 5 MB

# ── Cache-Control 策略 ──

CACHE_PUBLIC_DAY = "public, max-age=86400"      # 缩略图
CACHE_PRIVATE_HOUR = "private, max-age=3600"    # 文件下载


def set_cache_control(response, policy: str):
    response["Cache-Control"] = policy
    return response


# ── DRF Validator ──


class FileExtensionValidator:
    """DRF validator：检查上传文件的扩展名是否在白名单内。"""

    def __init__(self, allowed_extensions: set[str]):
        self.allowed = {e.lower() for e in allowed_extensions}

    def __call__(self, value):
        name = getattr(value, "name", "")
        ext = Path(name).suffix.lower()
        if ext not in self.allowed:
            allowed_str = ", ".join(sorted(self.allowed))
            raise serializers.ValidationError(
                f"不支持的文件类型：{ext}，允许的扩展名：{allowed_str}"
            )


class FileSizeValidator:
    """DRF validator：检查上传文件大小是否超限。"""

    def __init__(self, max_bytes: int):
        self.max_bytes = max_bytes

    def __call__(self, value):
        size = getattr(value, "size", None)
        if size is not None and size > self.max_bytes:
            max_mb = self.max_bytes / (1024 * 1024)
            raise serializers.ValidationError(
                f"文件大小超限：{size / (1024 * 1024):.1f} MB，上限：{max_mb:.0f} MB"
            )


# ── 工厂函数 ──


def _get_setting(name: str, default: int) -> int:
    return getattr(settings, name, default)


def get_texture_file_validators() -> list:
    return [
        FileExtensionValidator(TEXTURE_EXTENSIONS),
        FileSizeValidator(
            _get_setting("FILE_UPLOAD_MAX_SIZE_TEXTURE", DEFAULT_MAX_TEXTURE_SIZE)
        ),
    ]


def get_model_file_validators() -> list:
    return [
        FileExtensionValidator(MODEL_EXTENSIONS),
        FileSizeValidator(
            _get_setting("FILE_UPLOAD_MAX_SIZE_MODEL", DEFAULT_MAX_MODEL_SIZE)
        ),
    ]


def get_scene_bundle_validators() -> list:
    return [
        FileExtensionValidator(SCENE_BUNDLE_EXTENSIONS),
        FileSizeValidator(
            _get_setting("FILE_UPLOAD_MAX_SIZE_SCENE", DEFAULT_MAX_SCENE_SIZE)
        ),
    ]


def get_thumbnail_validators() -> list:
    return [
        FileExtensionValidator(THUMBNAIL_EXTENSIONS),
        FileSizeValidator(
            _get_setting("FILE_UPLOAD_MAX_SIZE_THUMBNAIL", DEFAULT_MAX_THUMBNAIL_SIZE)
        ),
    ]
