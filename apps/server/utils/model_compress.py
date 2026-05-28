"""
模型压缩工具模块。

提供格式转换（OBJ/STL → GLB）和 Draco 几何压缩功能。
GLB/glTF 直接压缩；OBJ/STL 用 trimesh 加载后导出为 GLB，再压缩。
"""

from __future__ import annotations

import logging
import math
import os
import time
import shutil
import subprocess
import tempfile
from pathlib import Path

import trimesh

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_GLTF_TRANSFORM = str(_PROJECT_ROOT / "node_modules" / ".bin" / "gltf-transform")

# OBJ/STL：用 trimesh 转 GLB
_CONVERTIBLE_EXTENSIONS = {".obj", ".stl"}
# GLB/glTF：直接压缩
_GLTF_EXTENSIONS = {".gltf", ".glb"}

# Draco 量化参数：高于默认值以保证压缩后视觉质量
_DRACO_QUANTIZE = [
    "--quantize-position", "14",
    "--quantize-normal", "12",
    "--quantize-color", "10",
    "--quantize-texcoord", "12",
]


def _run_cmd(cmd: list[str], description: str, timeout: int = 600) -> str:
    logger.info("[%s] 执行命令: %s", description, " ".join(cmd))
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{description} 超时（{timeout}s）")
    except FileNotFoundError:
        raise RuntimeError(f"{description}：命令不存在 — {cmd[0]}")

    if result.returncode != 0:
        stderr = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"{description} 失败（exit {result.returncode}）：{stderr[:500]}")

    return result.stdout


def _run_cmd_with_progress(
    cmd: list[str],
    description: str,
    update_state,
    stage: str,
    timeout: int = 600,
) -> str:
    """运行子进程并通过主线程轮询估算进度上报。

    进度估算使用指数曲线：pct = 95 * (1 - e^(-0.1 * elapsed))，
    上限 95%，子进程完成后跳到 100%。
    用 communicate(timeout=1) 循环轮询，确保 update_state
    在主线程调用（Celery 的 request.id 存在线程本地存储中，
    子线程无法访问）。
    """
    logger.info("[%s] 执行命令: %s", description, " ".join(cmd))

    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        raise RuntimeError(f"{description}：命令不存在 — {cmd[0]}")

    start_time = time.monotonic()
    stdout = b""
    stderr = b""

    while True:
        try:
            stdout, stderr = process.communicate(timeout=1.0)
            break
        except subprocess.TimeoutExpired:
            elapsed = time.monotonic() - start_time
            pct = min(95, 95 * (1 - math.exp(-0.1 * elapsed)))
            update_state(state="PROGRESS", meta={
                "stage": stage, "percent": int(pct),
                "message": f"正在{description}...{int(pct)}%",
            })
            if elapsed > timeout:
                process.kill()
                process.communicate()
                raise RuntimeError(f"{description} 超时（{timeout}s）")

    if process.returncode != 0:
        err = (stderr or stdout).decode(errors="replace").strip()
        raise RuntimeError(f"{description} 失败（exit {process.returncode}）：{err[:500]}")

    update_state(state="PROGRESS", meta={
        "stage": stage, "percent": 100,
        "message": f"{description}完成",
    })
    return stdout.decode(errors="replace")


def convert_to_glb(input_path: str, output_path: str) -> str:
    """
    将 OBJ/STL 转换为 GLB（trimesh 加载 → 导出 GLB）。

    如果输入已经是 glTF/GLB，直接返回原路径。
    """
    ext = Path(input_path).suffix.lower()

    if ext in _GLTF_EXTENSIONS:
        return input_path

    if ext not in _CONVERTIBLE_EXTENSIONS:
        raise RuntimeError(f"不支持的模型格式：{ext}")

    mesh = trimesh.load(input_path, force="mesh")
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump(concatenate=True)

    mesh.export(output_path, file_type="glb")  # pyright: ignore[reportAttributeAccessIssue]
    logger.info("trimesh %s→GLB 完成：%s", ext, output_path)
    return output_path


def compress_draco(input_path: str, output_path: str, *, update_state=None) -> dict:
    original_size = os.path.getsize(input_path)
    cmd = [_GLTF_TRANSFORM, "draco", input_path, output_path] + _DRACO_QUANTIZE

    if update_state:
        _run_cmd_with_progress(cmd, "Draco 几何压缩", update_state, "draco")
    else:
        _run_cmd(cmd, description="Draco 几何压缩")

    compressed_size = os.path.getsize(output_path)
    return {
        "original_size": original_size,
        "compressed_size": compressed_size,
        "ratio": compressed_size / original_size if original_size > 0 else 0,
    }


def process_model_file(
    input_path: str,
    output_dir: str,
    *,
    update_state=None,
) -> tuple[str, int]:
    """
    完整压缩流水线：格式转换（如需）→ Draco。

    - GLB/glTF：直接 Draco 压缩
    - OBJ/STL：trimesh 加载 → 导出 GLB → Draco

    每个阶段独立上报 0-100% 进度。Draco 通过子进程轮询估算进度；
    格式转换通常很快，直接报 0%→100%。

    :returns: (compressed_file_path, compressed_file_size)
    """
    ext = Path(input_path).suffix.lower()
    os.makedirs(output_dir, exist_ok=True)

    tmp_dir = tempfile.mkdtemp(prefix="vizon_compress_")
    try:
        # 阶段 1：格式转换（OBJ/STL → GLB）
        glb_path: str
        if ext in _CONVERTIBLE_EXTENSIONS:
            if update_state:
                update_state(state="PROGRESS", meta={
                    "stage": "converting", "percent": 0,
                    "message": "正在转换为 GLB...0%",
                })
            glb_path = os.path.join(tmp_dir, "converted.glb")
            convert_to_glb(input_path, glb_path)
            if update_state:
                update_state(state="PROGRESS", meta={
                    "stage": "converting", "percent": 100,
                    "message": "转换格式完成",
                })
        else:
            glb_path = input_path

        # 阶段 2：Draco 几何压缩
        final_path = os.path.join(output_dir, "compressed.glb")
        compress_draco(glb_path, final_path, update_state=update_state)

        compressed_size = os.path.getsize(final_path)
        return final_path, compressed_size

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
