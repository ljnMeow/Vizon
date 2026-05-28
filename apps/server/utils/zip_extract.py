"""
ZIP 压缩包解压工具。

用于多文件模型上传场景，服务端解压到 per-model 子目录：
- GLTF：.gltf + .bin + textures/
"""

import os
import zipfile

from rest_framework import serializers

# ── 安全限制 ──

_MAX_FILE_COUNT = 256
_MAX_TOTAL_EXTRACTED_SIZE = 500 * 1024 * 1024  # 500 MB
_MAX_SINGLE_FILE_SIZE = 200 * 1024 * 1024       # 200 MB

# 合法的模型入口扩展名（优先级从高到低）
_ENTRY_EXTENSIONS = (".gltf", ".glb")


class ZipExtractionError(serializers.ValidationError):
    """ZIP 解压过程中的业务校验错误。"""


def extract_model_zip(zip_file, target_dir: str) -> str:
    """
    解压模型 ZIP 到 target_dir，返回入口文件的相对路径（相对于 MEDIA_ROOT）。

    :param zip_file: Django UploadedFile 或已打开的文件对象
    :param target_dir: 解压目标目录的绝对路径
    :returns: 入口文件相对于 target_dir 的相对路径，如 "model.gltf"
    :raises ZipExtractionError: 校验失败时抛出
    """
    os.makedirs(target_dir, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_file, "r") as zf:
            infos = zf.infolist()
            _validate_zip_contents(infos)

            # 收集有效条目（排除目录和隐藏文件）
            valid_entries = []
            prefix = _detect_common_prefix(infos)
            for info in infos:
                if info.is_dir():
                    continue
                name = info.filename
                if name.startswith(".") or "/." in name:
                    continue
                # 去除公共前缀
                rel_name = name[len(prefix):] if prefix else name
                if not rel_name:
                    continue
                valid_entries.append((info, rel_name))

            if not valid_entries:
                raise ZipExtractionError("ZIP 压缩包内没有有效文件")

            # 解压并校验路径安全
            total_size = 0
            extracted_paths: list[str] = []

            for info, rel_name in valid_entries:
                if info.file_size > _MAX_SINGLE_FILE_SIZE:
                    raise ZipExtractionError(
                        f"压缩包内文件 {rel_name} 超过单文件大小限制"
                    )
                total_size += info.file_size

                dest = os.path.join(target_dir, rel_name)
                _ensure_path_safe(dest, target_dir)

                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with zf.open(info) as src, open(dest, "wb") as dst:
                    dst.write(src.read())

                extracted_paths.append(rel_name)

            if total_size > _MAX_TOTAL_EXTRACTED_SIZE:
                # 回滚：删除已解压的文件
                for rel_name in extracted_paths:
                    p = os.path.join(target_dir, rel_name)
                    if os.path.exists(p):
                        os.remove(p)
                raise ZipExtractionError("压缩包解压后总大小超限")

            # 寻找入口文件
            entry = _find_entry_point(extracted_paths)
            if entry is None:
                raise ZipExtractionError(
                    "ZIP 压缩包内未找到 .gltf 或 .glb 入口文件"
                )

            return entry

    except zipfile.BadZipFile:
        raise ZipExtractionError("无效的 ZIP 压缩包")


def _validate_zip_contents(infos: list[zipfile.ZipInfo]) -> None:
    """校验 ZIP 文件数量和总大小。"""
    file_count = sum(1 for i in infos if not i.is_dir())
    if file_count == 0:
        raise ZipExtractionError("ZIP 压缩包内没有文件")
    if file_count > _MAX_FILE_COUNT:
        raise ZipExtractionError(
            f"压缩包内文件数量 ({file_count}) 超过限制 ({_MAX_FILE_COUNT})"
        )


def _detect_common_prefix(infos: list[zipfile.ZipInfo]) -> str:
    """
    检测是否所有条目共享同一个顶层目录前缀。
    如果是，返回该前缀（含尾部 /）；否则返回空字符串。

    例如：所有文件都在 "factory_door/" 下 → 返回 "factory_door/"
    """
    dirs = set()
    for info in infos:
        if info.is_dir():
            continue
        name = info.filename
        slash = name.find("/")
        if slash >= 0:
            dirs.add(name[: slash + 1])
        else:
            # 有文件直接在根目录 → 无公共前缀
            return ""
    if len(dirs) == 1:
        return dirs.pop()
    return ""


def _ensure_path_safe(dest: str, target_dir: str) -> None:
    """确保解压路径不会逃逸到目标目录之外（防路径遍历攻击）。"""
    real_dest = os.path.realpath(dest)
    real_target = os.path.realpath(target_dir)
    if not real_dest.startswith(real_target + os.sep) and real_dest != real_target:
        raise ZipExtractionError("压缩包内包含非法路径")


def _find_entry_point(extracted_paths: list[str]) -> str | None:
    """
    在已解压文件中寻找入口文件。
    优先找 .gltf，其次 .glb，取目录层级最浅的那个。
    """
    for ext in _ENTRY_EXTENSIONS:
        candidates = [
            p for p in extracted_paths if p.lower().endswith(ext)
        ]
        if candidates:
            # 选择层级最浅的（目录分隔符最少的）
            candidates.sort(key=lambda p: p.count("/"))
            return candidates[0]
    return None
