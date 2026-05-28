"""
模型资源模块的 API 视图。

当前接口：
- GET    /api/models3d/                  列出当前用户所有模型（支持 ?category= 筛选）
- POST   /api/models3d/                  新建模型（multipart: name, file, thumbnail, category）
- GET    /api/models3d/{model_id}/       获取单个模型元数据
- PUT    /api/models3d/{model_id}/       更新模型（重命名 + 移动分类）
- DELETE /api/models3d/{model_id}/       删除模型（同时删除磁盘文件）
- GET    /api/models3d/{model_id}/file/  下载模型文件

分类接口：
- GET    /api/models3d/categories/           列出当前用户所有分类（含模型计数）
- POST   /api/models3d/categories/           新建分类
- PUT    /api/models3d/categories/{id}/      重命名分类
- DELETE /api/models3d/categories/{id}/      删除分类
"""

from __future__ import annotations

import os
import shutil
import re
from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.db.models import Count

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.request import Request
from rest_framework.response import Response

from customers.models import Customer
from utils.file_validation import CACHE_PRIVATE_HOUR, CACHE_PUBLIC_DAY, set_cache_control
from utils.zip_extract import extract_model_zip, ZipExtractionError

from .models import ModelAsset, ModelCategory, CompressionStatus
from .serializers import (
    ModelAssetCreateSerializer,
    ModelAssetSerializer,
    ModelAssetUpdateSerializer,
    ModelCategoryCreateSerializer,
    ModelCategorySerializer,
    ModelCategoryUpdateSerializer,
)


class ModelAssetNotFoundError(APIException):
    """模型不存在异常。"""

    status_code = 404
    default_detail = "模型不存在"
    default_code = "not_found"


class ModelCategoryNotFoundError(APIException):
    """分类不存在异常。"""

    status_code = 404
    default_detail = "分类不存在"
    default_code = "not_found"


def _get_customer(request: Request) -> Customer:
    return request.customer  # type: ignore[attr-defined]


def _delete_file_field(field) -> None:
    if not field or not field.name:
        return
    try:
        field.delete(save=False)
    except Exception:
        pass


def _get_or_create_default_category(customer: Customer) -> ModelCategory:
    """获取或创建当前用户的默认分类。"""
    cat = ModelCategory.objects.filter(customer=customer, is_default=True).first()
    if cat is not None:
        return cat
    cat = ModelCategory.objects.filter(customer=customer, name="默认模型").first()
    if cat is not None:
        return cat
    return ModelCategory.objects.create(customer=customer, name="默认模型", is_default=True)


# ---------------------------------------------------------------------------
# 模型分类 ViewSet
# ---------------------------------------------------------------------------


class ModelCategoryViewSet(viewsets.ViewSet):
    """模型分类 CRUD 视图集。"""

    def list(self, request: Request) -> Response:
        """GET /api/models3d/categories/"""
        customer = _get_customer(request)
        categories = (
            ModelCategory.objects.filter(customer=customer)
            .annotate(model_count=Count("models"))
            .order_by("-is_default", "created_at")
        )
        serializer = ModelCategorySerializer(categories, many=True)
        return Response(serializer.data)

    def create(self, request: Request) -> Response:
        """POST /api/models3d/categories/"""
        serializer = ModelCategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vdata: dict = serializer.validated_data  # type: ignore[assignment]
        customer = _get_customer(request)
        name = vdata["name"]

        if ModelCategory.objects.filter(customer=customer, name=name).exists():
            return Response({"detail": "分类名称已存在"}, status=409)

        cat = ModelCategory.objects.create(customer=customer, name=name)
        out = ModelCategorySerializer(cat)
        return Response(out.data, status=status.HTTP_201_CREATED)

    def update(self, request: Request, pk: str | None = None) -> Response:
        """PUT /api/models3d/categories/{category_id}/"""
        cat = self._get_category(request, pk)
        serializer = ModelCategoryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vdata: dict = serializer.validated_data  # type: ignore[assignment]
        new_name = vdata["name"]

        customer = _get_customer(request)
        if ModelCategory.objects.filter(customer=customer, name=new_name).exclude(pk=cat.pk).exists():
            return Response({"detail": "分类名称已存在"}, status=409)

        cat.name = new_name
        cat.save(update_fields=["name", "updated_at"])
        out = ModelCategorySerializer(cat)
        return Response(out.data)

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        """DELETE /api/models3d/categories/{category_id}/"""
        cat = self._get_category(request, pk)

        model_count = cat.models.count()  # type: ignore[attr-defined]
        if model_count > 0:
            return Response(
                {"detail": f"该分类下有 {model_count} 个模型，请先移动模型后再删除"},
                status=409,
            )

        cat.delete()
        return Response({"deleted": True}, status=status.HTTP_200_OK)

    def _get_category(self, request: Request, pk: str | None) -> ModelCategory:
        customer = _get_customer(request)
        cat = ModelCategory.objects.filter(public_id=pk, customer=customer).first()
        if cat is None:
            raise ModelCategoryNotFoundError()
        return cat


# ---------------------------------------------------------------------------
# 模型资源 ViewSet
# ---------------------------------------------------------------------------


class ModelAssetViewSet(viewsets.ViewSet):
    """模型 CRUD + 文件下载视图集。"""

    def list(self, request: Request) -> Response:
        """
        GET /api/models3d/
        返回当前用户的所有模型元数据列表，按最近修改时间倒序。
        支持 ?category=<category_id> 查询参数按分类筛选。
        """
        customer = _get_customer(request)
        assets = ModelAsset.objects.filter(customer=customer)

        category_id = request.query_params.get("category")
        if category_id:
            assets = assets.filter(category__public_id=category_id)

        serializer = ModelAssetSerializer(
            assets, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def create(self, request: Request) -> Response:
        """
        POST /api/models3d/
        新建模型：接收 multipart 表单（name + file + 可选 thumbnail + 可选 category UUID）。
        若未传 category，则归入默认分类。
        支持 ZIP 压缩包（含多文件 GLTF）自动解压。
        """
        serializer = ModelAssetCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = _get_customer(request)
        file = serializer.validated_data.get("file")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        thumbnail_file = serializer.validated_data.get("thumbnail")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        name = serializer.validated_data.get("name", "") or file.name  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        category_uuid = serializer.validated_data.get("category")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]

        if category_uuid:
            category = ModelCategory.objects.filter(
                public_id=category_uuid, customer=customer
            ).first()
            if category is None:
                return Response({"detail": "分类不存在"}, status=400)
        else:
            category = _get_or_create_default_category(customer)

        file_size = file.size if hasattr(file, "size") else 0  # pyright: ignore[reportOptionalMemberAccess]

        is_zip = Path(name).suffix.lower() == ".zip"

        if is_zip:
            public_id = uuid4()
            target_dir = os.path.join(
                settings.MEDIA_ROOT, "models3d", "files", str(public_id)
            )

            try:
                entry_rel = extract_model_zip(file, target_dir)
            except ZipExtractionError as exc:
                shutil.rmtree(target_dir, ignore_errors=True)
                return Response({"detail": str(exc.detail)}, status=400)

            # 入口文件相对于 MEDIA_ROOT 的路径
            entry_full_rel = f"models3d/files/{public_id}/{entry_rel}"

            asset = ModelAsset(
                public_id=public_id,
                customer=customer,
                name=name,
                category=category,
                file_size=file_size,
                mime_type="application/zip",
            )
            asset.file.name = entry_full_rel

            if thumbnail_file:
                asset.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)  # pyright: ignore[reportOptionalMemberAccess]

            asset.save()

            # 派发异步压缩任务
            from .tasks import compress_model_task
            task = compress_model_task.delay(asset.pk)  # pyright: ignore[reportCallIssue]
            asset.celery_task_id = task.id
            asset.save(update_fields=["celery_task_id"])

        else:
            asset = ModelAsset(
                customer=customer,
                name=name,
                category=category,
                file_size=file_size,
                mime_type=getattr(file, "content_type", "") or "",  # pyright: ignore[reportOptionalMemberAccess]
            )
            asset.file.save(file.name, file, save=False)  # pyright: ignore[reportOptionalMemberAccess, reportArgumentType]

            if thumbnail_file:
                asset.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)  # pyright: ignore[reportOptionalMemberAccess]

            asset.save()

            # 派发异步压缩任务
            from .tasks import compress_model_task
            task = compress_model_task.delay(asset.pk)  # pyright: ignore[reportCallIssue]
            asset.celery_task_id = task.id
            asset.save(update_fields=["celery_task_id"])

        out = ModelAssetSerializer(asset, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        """
        GET /api/models3d/{model_id}/
        获取单个模型元数据。
        """
        asset = self._get_asset(request, pk)
        serializer = ModelAssetSerializer(asset, context={"request": request})
        return Response(serializer.data)

    def update(self, request: Request, pk: str | None = None) -> Response:
        """
        PUT /api/models3d/{model_id}/
        更新模型（重命名 + 移动分类 + 更新缩略图）。
        """
        asset = self._get_asset(request, pk)
        serializer = ModelAssetUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = _get_customer(request)
        update_fields = ["updated_at"]

        vdata: dict = serializer.validated_data  # type: ignore[assignment]
        if "name" in vdata:
            asset.name = vdata["name"]
            update_fields.append("name")

        if "category" in vdata:
            category_uuid = vdata["category"]
            category = ModelCategory.objects.filter(
                public_id=category_uuid, customer=customer
            ).first()
            if category is None:
                return Response({"detail": "分类不存在"}, status=400)
            asset.category = category
            update_fields.append("category_id")

        if "thumbnail" in vdata:
            thumbnail_file = vdata["thumbnail"]
            if thumbnail_file:
                asset.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)  # pyright: ignore[reportOptionalMemberAccess]
            else:
                asset.thumbnail = None
            update_fields.append("thumbnail")

        asset.save(update_fields=update_fields)

        out = ModelAssetSerializer(asset, context={"request": request})
        return Response(out.data)

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        """
        DELETE /api/models3d/{model_id}/
        删除模型记录并同步删除磁盘上的文件和缩略图。
        若模型来自 ZIP 解压，删除整个解压目录。
        """
        asset = self._get_asset(request, pk)

        file_field = asset.file
        thumbnail_field = asset.thumbnail
        compressed_field = asset.compressed_file
        file_name = file_field.name if file_field and file_field.name else ""

        asset.delete()

        # 检测是否为 ZIP 解压目录（路径含 UUID 子目录）
        _UUID_RE = re.compile(r"models3d/files/[0-9a-f-]{32,}/")
        if _UUID_RE.search(file_name):
            # 删除整个解压目录
            dir_path = os.path.join(settings.MEDIA_ROOT, file_name.split("/")[-2], "")  # noqa
            # 从完整路径中提取 UUID 子目录
            parts = file_name.split("/")
            # parts: ['models3d', 'files', '<uuid>', '...', 'entry.gltf']
            if len(parts) >= 3:
                uuid_dir = os.path.join(settings.MEDIA_ROOT, parts[0], parts[1], parts[2])
                if os.path.isdir(uuid_dir):
                    shutil.rmtree(uuid_dir, ignore_errors=True)
        else:
            _delete_file_field(file_field)

        _delete_file_field(thumbnail_field)

        # 清理压缩文件目录：models3d/compressed/{uuid}/
        compressed_name = compressed_field.name if compressed_field and compressed_field.name else ""
        if compressed_name:
            parts = compressed_name.split("/")
            # parts: ['models3d', 'compressed', '<uuid>', 'compressed.glb']
            if len(parts) >= 3:
                uuid_dir = os.path.join(settings.MEDIA_ROOT, parts[0], parts[1], parts[2])
                if os.path.isdir(uuid_dir):
                    shutil.rmtree(uuid_dir, ignore_errors=True)

        return Response({"deleted": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request: Request, pk: str | None = None):
        """
        GET /api/models3d/{model_id}/file/
        流式下载模型文件。优先返回压缩版本。
        """
        from django.http import FileResponse

        asset = self._get_asset(request, pk)

        # 优先返回压缩文件
        if (
            asset.compression_status == CompressionStatus.COMPLETED
            and asset.compressed_file
            and asset.compressed_file.name
        ):
            filename = asset.name or asset.compressed_file.name
            if not filename.lower().endswith(".glb"):
                filename = Path(filename).stem + ".glb"
            response = FileResponse(
                asset.compressed_file.open("rb"),
                content_type="model/gltf-binary",
                as_attachment=True,
                filename=filename,
            )
            return set_cache_control(response, CACHE_PRIVATE_HOUR)

        # 回退到原始文件
        if not asset.file or not asset.file.name:
            raise ModelAssetNotFoundError("模型文件不存在")

        filename = asset.name or asset.file.name
        response = FileResponse(
            asset.file.open("rb"),
            content_type="application/octet-stream",
            as_attachment=True,
            filename=filename,
        )
        return set_cache_control(response, CACHE_PRIVATE_HOUR)

    @action(detail=True, methods=["get"], url_path="thumbnail")
    def thumbnail(self, request: Request, pk: str | None = None):
        """
        GET /api/models3d/{model_id}/thumbnail/
        内联显示缩略图（Cache-Control: public, max-age=86400）。
        """
        from django.http import FileResponse

        asset = self._get_asset(request, pk)

        if not asset.thumbnail or not asset.thumbnail.name:
            raise ModelAssetNotFoundError("缩略图不存在")

        return set_cache_control(
            FileResponse(
                asset.thumbnail.open("rb"),
                content_type="image/png",
                as_attachment=False,
            ),
            CACHE_PUBLIC_DAY,
        )

    @action(detail=True, methods=["get"], url_path="compression-status")
    def compression_status(self, request: Request, pk: str | None = None):
        """
        GET /api/models3d/{model_id}/compression-status/
        查询模型压缩状态和进度，供前端轮询。
        """
        asset = self._get_asset(request, pk)

        if asset.compression_status == CompressionStatus.COMPLETED:
            return Response({
                "status": "completed",
                "original_size": asset.file_size,
                "compressed_size": asset.compressed_file_size,
            })

        if asset.compression_status == CompressionStatus.FAILED:
            return Response({"status": "failed"})

        # 从 Celery result backend 读取任务进度
        if asset.celery_task_id:
            from celery.result import AsyncResult
            result = AsyncResult(asset.celery_task_id)
            if result.state == "PROGRESS":
                info = result.info or {}
                return Response({
                    "status": "processing",
                    "stage": info.get("stage", ""),
                    "percent": info.get("percent", 0),
                    "message": info.get("message", ""),
                })
            elif result.state == "PENDING":
                return Response({"status": "pending"})
            elif result.state in ("RETRY", "FAILURE"):
                return Response({"status": "failed"})

        return Response({"status": asset.compression_status})

    def _get_asset(self, request: Request, pk: str | None) -> ModelAsset:
        """按 public_id 查询当前用户的模型。"""
        customer = _get_customer(request)
        asset = ModelAsset.objects.filter(public_id=pk, customer=customer).first()
        if asset is None:
            raise ModelAssetNotFoundError()
        return asset
