"""
贴图模块的 API 视图。

当前接口：
- GET    /api/textures/                  列出当前用户所有贴图（支持 ?category= 筛选）
- POST   /api/textures/                  新建贴图（multipart: name, file, thumbnail, category, texture_slot）
- GET    /api/textures/{texture_id}/     获取单个贴图元数据
- PUT    /api/textures/{texture_id}/     更新贴图（仅重命名）
- DELETE /api/textures/{texture_id}/     删除贴图（同时删除磁盘文件）
- GET    /api/textures/{texture_id}/file/  下载贴图文件

所有端点通过 CustomerJWTAuthentication + IsAuthenticated 保护。
视图内部始终用 request.customer 过滤，只返回当前用户自己的贴图。
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.request import Request
from rest_framework.response import Response

from customers.models import Customer

from .models import Texture
from .serializers import (
    TextureCreateSerializer,
    TextureSerializer,
    TextureUpdateSerializer,
)

logger = logging.getLogger("vizon.api")

# HDR/EXR 文件扩展名
_HDR_EXTENSIONS = {".hdr", ".exr"}

# 缩略图最大尺寸
_THUMBNAIL_MAX_SIZE = 256


class TextureNotFoundError(APIException):
    """贴图不存在异常。"""

    status_code = 404
    default_detail = "贴图不存在"
    default_code = "not_found"


def _get_customer(request: Request) -> Customer:
    """从请求中取出当前登录用户对应的 Customer 实例。"""
    return request.customer  # type: ignore[attr-defined]


def _delete_file_field(field) -> None:
    """安全删除 FileField / ImageField 关联的磁盘文件。"""
    if not field or not field.name:
        return
    try:
        field.delete(save=False)
    except Exception:
        pass


def _is_hdr_file(filename: str) -> bool:
    """判断文件名是否为 HDR/EXR 格式。"""
    ext = Path(filename).suffix.lower()
    return ext in _HDR_EXTENSIONS


def _generate_hdr_thumbnail(file, max_size: int = _THUMBNAIL_MAX_SIZE):
    """
    为 HDR/EXR 文件生成缩略图 PNG（Django File 对象）。

    使用 imageio 读取 HDR/EXR 浮点像素，Reinhard 色调映射 + gamma 校正后
    缩放为 max_size 以内的 PNG，返回 ContentFile 可直接存入 ImageField。
    若 imageio 不可用或读取失败，返回 None。
    """
    try:
        import imageio.v3 as iio
        import numpy as np
    except ImportError:
        logger.warning(
            "[textures] imageio not installed, skipping HDR thumbnail generation"
        )
        return None

    try:
        file.seek(0)
        img_array = iio.imread(file, index=0)
        file.seek(0)

        # 确保为 float 类型
        if img_array.dtype != np.float32 and img_array.dtype != np.float64:
            img_array = img_array.astype(np.float64)

        # Reinhard 色调映射 + gamma 校正
        img_array = img_array / (1.0 + img_array)
        img_array = np.power(np.clip(img_array, 0, 1), 1.0 / 2.2)
        img_array = (img_array * 255).clip(0, 255).astype(np.uint8)

        # 如果是灰度图，转为 RGB
        if img_array.ndim == 2:
            img_array = np.stack([img_array] * 3, axis=-1)
        # RGBA → RGB
        if img_array.shape[2] == 4:
            img_array = img_array[:, :, :3]

        h, w = img_array.shape[:2]

        # 缩放
        ratio = min(max_size / w, max_size / h, 1.0)
        if ratio < 1.0:
            new_w = max(1, int(w * ratio))
            new_h = max(1, int(h * ratio))
            from PIL import Image

            pil_img = Image.fromarray(img_array)
            pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        else:
            from PIL import Image

            pil_img = Image.fromarray(img_array)

        # 编码为 PNG
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        buf.seek(0)

        from django.core.files.base import ContentFile

        return ContentFile(buf.read(), name="thumbnail.png")
    except Exception:
        logger.warning("[textures] Failed to generate HDR thumbnail", exc_info=True)
        return None


class TextureViewSet(viewsets.ViewSet):
    """
    贴图 CRUD + 文件下载视图集。

    使用 ViewSet（而非 ModelViewSet）以便对每个 action 有更精细的控制，
    特别是"删除贴图时同步删除磁盘文件"和"下载文件"等自定义逻辑。
    """

    def list(self, request: Request) -> Response:
        """
        GET /api/textures/
        返回当前用户的所有贴图元数据列表，按最近修改时间倒序。
        支持 ?category= 查询参数按分类筛选。
        """
        customer = _get_customer(request)
        textures = Texture.objects.filter(customer=customer)

        category = request.query_params.get("category")
        if category:
            textures = textures.filter(category=category)

        serializer = TextureSerializer(
            textures, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def create(self, request: Request) -> Response:
        """
        POST /api/textures/
        新建贴图：接收 multipart 表单（name + file + 可选 thumbnail + category + texture_slot）。
        自动计算 file_size 并存储，返回贴图元数据。
        对于 HDR/EXR 文件，若未提供 thumbnail，服务端自动生成缩略图。
        """
        serializer = TextureCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = _get_customer(request)
        file = serializer.validated_data.get("file")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        thumbnail_file = serializer.validated_data.get("thumbnail")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        name = serializer.validated_data.get("name", "") or file.name  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        category = serializer.validated_data.get("category")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        texture_slot = serializer.validated_data.get("texture_slot", "")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]

        file_size = file.size if hasattr(file, "size") else 0  # pyright: ignore[reportOptionalMemberAccess]

        texture = Texture(
            customer=customer,
            name=name,
            category=category,
            texture_slot=texture_slot,
            file_size=file_size,
            mime_type=getattr(file, "content_type", "") or "",
        )
        texture.file.save(file.name, file, save=False)  # pyright: ignore[reportOptionalMemberAccess, reportArgumentType]

        if thumbnail_file:
            texture.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)  # pyright: ignore[reportOptionalMemberAccess]
        elif _is_hdr_file(file.name):  # pyright: ignore[reportOptionalMemberAccess]
            # HDR/EXR 文件未提供缩略图时，服务端自动生成
            generated = _generate_hdr_thumbnail(file)
            if generated:
                texture.thumbnail.save("thumbnail.png", generated, save=False)

        texture.save()

        out = TextureSerializer(texture, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        """
        GET /api/textures/{texture_id}/
        获取单个贴图元数据；贴图不属于当前用户时返回 404。
        """
        texture = self._get_texture(request, pk)
        serializer = TextureSerializer(texture, context={"request": request})
        return Response(serializer.data)

    def update(self, request: Request, pk: str | None = None) -> Response:
        """
        PUT /api/textures/{texture_id}/
        更新贴图（仅支持重命名）。
        """
        texture = self._get_texture(request, pk)
        serializer = TextureUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        texture.name = serializer.validated_data["name"]  # pyright: ignore[reportIndexIssue, reportOptionalSubscript]
        texture.save(update_fields=["name", "updated_at"])

        out = TextureSerializer(texture, context={"request": request})
        return Response(out.data)

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        """
        DELETE /api/textures/{texture_id}/
        删除贴图记录并同步删除磁盘上的文件和缩略图。
        """
        texture = self._get_texture(request, pk)

        file_field = texture.file
        thumbnail_field = texture.thumbnail

        texture.delete()

        _delete_file_field(file_field)
        _delete_file_field(thumbnail_field)

        return Response({"deleted": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request: Request, pk: str | None = None):
        """
        GET /api/textures/{texture_id}/file/
        流式下载贴图文件。
        """
        from django.http import FileResponse

        texture = self._get_texture(request, pk)

        if not texture.file or not texture.file.name:
            raise TextureNotFoundError("贴图文件不存在")

        filename = texture.name or texture.file.name
        return FileResponse(
            texture.file.open("rb"),
            content_type="application/octet-stream",
            as_attachment=True,
            filename=filename,
        )

    def _get_texture(self, request: Request, pk: str | None) -> Texture:
        """
        按 public_id 查询当前用户的贴图。
        不存在或不属于当前用户时统一抛 404，避免信息泄漏。
        """
        customer = _get_customer(request)
        texture = Texture.objects.filter(public_id=pk, customer=customer).first()
        if texture is None:
            raise TextureNotFoundError()
        return texture
