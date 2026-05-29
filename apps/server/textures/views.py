"""
贴图模块的 API 视图。

所有端点要求 Customer JWT；视图内按 request.customer 隔离数据。
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from utils.permissions import IsCustomerAuthenticated
from utils.viewsets import (
    CustomerScopedMixin,
    FileDownloadMixin,
    delete_file_field,
    make_not_found_error,
    paginate_serialized_list,
)

from .models import Texture
from .serializers import (
    TextureCreateSerializer,
    TextureSerializer,
    TextureUpdateSerializer,
)

logger = logging.getLogger("vizon.api")

_HDR_EXTENSIONS = {".hdr", ".exr"}
_THUMBNAIL_MAX_SIZE = 256

TextureNotFoundError = make_not_found_error(detail="贴图不存在")


def _is_hdr_file(filename: str) -> bool:
    ext = Path(filename).suffix.lower()
    return ext in _HDR_EXTENSIONS


def _generate_hdr_thumbnail(file, max_size: int = _THUMBNAIL_MAX_SIZE):
    """为 HDR/EXR 生成 PNG 缩略图；失败返回 None。"""
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

        if img_array.dtype != np.float32 and img_array.dtype != np.float64:
            img_array = img_array.astype(np.float64)

        img_array = img_array / (1.0 + img_array)
        img_array = np.power(np.clip(img_array, 0, 1), 1.0 / 2.2)
        img_array = (img_array * 255).clip(0, 255).astype(np.uint8)

        if img_array.ndim == 2:
            img_array = np.stack([img_array] * 3, axis=-1)
        if img_array.shape[2] == 4:
            img_array = img_array[:, :, :3]

        h, w = img_array.shape[:2]
        ratio = min(max_size / w, max_size / h, 1.0)
        from PIL import Image

        pil_img = Image.fromarray(img_array)
        if ratio < 1.0:
            new_w = max(1, int(w * ratio))
            new_h = max(1, int(h * ratio))
            pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        buf.seek(0)

        from django.core.files.base import ContentFile

        return ContentFile(buf.read(), name="thumbnail.png")
    except Exception:
        logger.warning("[textures] Failed to generate HDR thumbnail", exc_info=True)
        return None


class TextureViewSet(CustomerScopedMixin, FileDownloadMixin, viewsets.ViewSet):
    """贴图 CRUD + 文件下载。"""

    permission_classes = [IsCustomerAuthenticated]
    lookup_model = Texture
    not_found_error = TextureNotFoundError

    def list(self, request: Request) -> Response:
        customer = self.get_customer(request)
        textures = Texture.objects.filter(customer=customer).order_by("-updated_at")
        category = request.query_params.get("category")
        if category:
            textures = textures.filter(category=category)
        return paginate_serialized_list(
            request, textures, TextureSerializer, view=self
        )

    def create(self, request: Request) -> Response:
        serializer = TextureCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = self.get_customer(request)
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
            generated = _generate_hdr_thumbnail(file)
            if generated:
                texture.thumbnail.save("thumbnail.png", generated, save=False)

        texture.save()

        out = TextureSerializer(texture, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        texture = self._get_object(request, pk)  # pyright: ignore[reportAssignmentType]
        serializer = TextureSerializer(texture, context={"request": request})
        return Response(serializer.data)

    def update(self, request: Request, pk: str | None = None) -> Response:
        texture = self._get_object(request, pk)  # pyright: ignore[reportAssignmentType]
        serializer = TextureUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        texture.name = serializer.validated_data["name"]  # pyright: ignore[reportIndexIssue, reportOptionalSubscript, reportAttributeAccessIssue]
        texture.save(update_fields=["name", "updated_at"])

        out = TextureSerializer(texture, context={"request": request})
        return Response(out.data)

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        texture = self._get_object(request, pk)  # pyright: ignore[reportAssignmentType]
        file_field = texture.file  # pyright: ignore[reportAttributeAccessIssue]
        thumbnail_field = texture.thumbnail  # pyright: ignore[reportAttributeAccessIssue]
        texture.delete()
        delete_file_field(file_field)
        delete_file_field(thumbnail_field)
        return Response({"deleted": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request: Request, pk: str | None = None):
        texture = self._get_object(request, pk)  # pyright: ignore[reportAssignmentType]
        filename = texture.name or texture.file.name or "texture"  # pyright: ignore[reportAttributeAccessIssue]
        return self.serve_attachment(
            texture.file,  # pyright: ignore[reportAttributeAccessIssue]
            filename=filename,
            missing_message="贴图文件不存在",
            not_found_error=TextureNotFoundError,
        )

    @action(detail=True, methods=["get"], url_path="thumbnail")
    def thumbnail(self, request: Request, pk: str | None = None):
        texture = self._get_object(request, pk)  # pyright: ignore[reportAssignmentType]
        return self.serve_thumbnail_inline(
            texture.thumbnail,  # pyright: ignore[reportAttributeAccessIssue]
            missing_message="缩略图不存在",
            not_found_error=TextureNotFoundError,
        )
