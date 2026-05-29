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
- GET    /api/models3d/categories/                    列出当前用户所有分类（含模型计数，分页）
- GET    /api/models3d/categories/{id}/models/        该分类下全部模型（不分页，data 为数组）
- POST   /api/models3d/categories/                    新建分类
- PUT    /api/models3d/categories/{id}/               重命名分类
- DELETE /api/models3d/categories/{id}/               删除分类
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.db.models import Count

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
    serialize_queryset_list,
)
from utils.zip_extract import extract_model_zip, ZipExtractionError

from customers.models import Customer

from .file_paths import cleanup_compressed_dir, cleanup_zip_extract_dir, is_zip_extract_path
from .models import ModelAsset, ModelCategory, CompressionStatus
from .serializers import (
    ModelAssetCreateSerializer,
    ModelAssetSerializer,
    ModelAssetUpdateSerializer,
    ModelCategoryCreateSerializer,
    ModelCategorySerializer,
    ModelCategoryUpdateSerializer,
)


ModelAssetNotFoundError = make_not_found_error(detail="模型不存在")
ModelCategoryNotFoundError = make_not_found_error(detail="分类不存在")


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


class ModelCategoryViewSet(CustomerScopedMixin, viewsets.ViewSet):
    """模型分类 CRUD 视图集。"""

    permission_classes = [IsCustomerAuthenticated]
    lookup_model = ModelCategory
    not_found_error = ModelCategoryNotFoundError

    def list(self, request: Request) -> Response:
        """GET /api/models3d/categories/"""
        customer = self.get_customer(request)
        categories = (
            ModelCategory.objects.filter(customer=customer)
            .annotate(model_count=Count("models"))
            .order_by("-is_default", "created_at")
        )
        return paginate_serialized_list(
            request, categories, ModelCategorySerializer, view=self
        )

    def create(self, request: Request) -> Response:
        """POST /api/models3d/categories/"""
        serializer = ModelCategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vdata: dict = serializer.validated_data  # type: ignore[assignment]
        customer = self.get_customer(request)
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

        customer = self.get_customer(request)
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
        return self._get_object(request, pk)  # pyright: ignore[reportReturnType]

    @action(detail=True, methods=["get"], url_path="models")
    def list_models(self, request: Request, pk: str | None = None) -> Response:
        """
        GET /api/models3d/categories/{category_id}/models/
        返回该分类下全部模型；经 envelope 后 data 为 Model3dMeta[]，不是分页结构。
        """
        cat = self._get_category(request, pk)
        customer = self.get_customer(request)
        assets = (
            ModelAsset.objects.filter(customer=customer, category=cat)
            .select_related("category")
            .order_by("-updated_at")
        )
        return serialize_queryset_list(request, assets, ModelAssetSerializer)


# ---------------------------------------------------------------------------
# 模型资源 ViewSet
# ---------------------------------------------------------------------------


class ModelAssetViewSet(CustomerScopedMixin, FileDownloadMixin, viewsets.ViewSet):
    """模型 CRUD + 文件下载视图集。"""

    permission_classes = [IsCustomerAuthenticated]
    lookup_model = ModelAsset
    not_found_error = ModelAssetNotFoundError

    def list(self, request: Request) -> Response:
        """
        GET /api/models3d/
        返回当前用户的模型元数据分页列表，按最近修改时间倒序。
        - ?category=<category_id>：按分类筛选（分页）
        - ?search=<keyword>：按名称模糊搜索（分页）
        """
        customer = self.get_customer(request)
        assets = (
            ModelAsset.objects.filter(customer=customer)
            .select_related("category")
            .order_by("-updated_at")
        )

        category_id = (request.query_params.get("category") or "").strip()
        if category_id:
            assets = assets.filter(category__public_id=category_id)

        search = (request.query_params.get("search") or "").strip()
        if search:
            assets = assets.filter(name__icontains=search)

        return paginate_serialized_list(
            request, assets, ModelAssetSerializer, view=self
        )

    def create(self, request: Request) -> Response:
        """
        POST /api/models3d/
        新建模型：接收 multipart 表单（name + file + 可选 thumbnail + 可选 category UUID）。
        若未传 category，则归入默认分类。
        支持 ZIP 压缩包（含多文件 GLTF）自动解压。
        """
        serializer = ModelAssetCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = self.get_customer(request)
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

        customer = self.get_customer(request)
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
        compressed_name = compressed_field.name if compressed_field and compressed_field.name else ""

        asset.delete()

        if is_zip_extract_path(file_name):
            cleanup_zip_extract_dir(file_name)
        else:
            delete_file_field(file_field)

        delete_file_field(thumbnail_field)
        cleanup_compressed_dir(compressed_name)

        return Response({"deleted": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request: Request, pk: str | None = None):
        """GET /api/models3d/{model_id}/file/ — 优先返回压缩 GLB。"""
        asset = self._get_asset(request, pk)

        if (
            asset.compression_status == CompressionStatus.COMPLETED
            and asset.compressed_file
            and asset.compressed_file.name
        ):
            filename = asset.name or asset.compressed_file.name
            if not filename.lower().endswith(".glb"):
                filename = Path(filename).stem + ".glb"
            return self.serve_attachment(
                asset.compressed_file,
                filename=filename,
                content_type="model/gltf-binary",
                missing_message="模型文件不存在",
                not_found_error=ModelAssetNotFoundError,
            )

        filename = asset.name or (asset.file.name if asset.file else "") or "model"
        return self.serve_attachment(
            asset.file,
            filename=filename,
            missing_message="模型文件不存在",
            not_found_error=ModelAssetNotFoundError,
        )

    @action(detail=True, methods=["get"], url_path="thumbnail")
    def thumbnail(self, request: Request, pk: str | None = None):
        """GET /api/models3d/{model_id}/thumbnail/"""
        asset = self._get_asset(request, pk)
        return self.serve_thumbnail_inline(
            asset.thumbnail,
            missing_message="缩略图不存在",
            not_found_error=ModelAssetNotFoundError,
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
        return self._get_object(request, pk)  # pyright: ignore[reportReturnType]
