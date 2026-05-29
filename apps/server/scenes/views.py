"""
场景模块的 API 视图。

所有端点要求 Customer JWT；视图内按 request.customer 隔离数据。
"""

from __future__ import annotations

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

from .models import Scene
from .serializers import SceneCreateSerializer, SceneSerializer, SceneUpdateSerializer

SceneNotFoundError = make_not_found_error(detail="场景不存在")


class SceneViewSet(CustomerScopedMixin, FileDownloadMixin, viewsets.ViewSet):
    """场景 CRUD + bundle / thumbnail 下载。"""

    permission_classes = [IsCustomerAuthenticated]
    lookup_model = Scene
    not_found_error = SceneNotFoundError

    def list(self, request: Request) -> Response:
        customer = self.get_customer(request)
        scenes = Scene.objects.filter(customer=customer).order_by("-updated_at")
        return paginate_serialized_list(
            request, scenes, SceneSerializer, view=self
        )

    def create(self, request: Request) -> Response:
        serializer = SceneCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = self.get_customer(request)
        bundle_file = serializer.validated_data["bundle"]  # pyright: ignore[reportIndexIssue, reportOptionalSubscript]
        thumbnail_file = serializer.validated_data.get("thumbnail")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        name = serializer.validated_data.get("name", "")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]

        bundle_size = bundle_file.size if hasattr(bundle_file, "size") else 0  # pyright: ignore[reportOptionalMemberAccess]

        scene = Scene(customer=customer, name=name, bundle_size=bundle_size)
        scene.bundle.save(bundle_file.name, bundle_file, save=False)  # pyright: ignore[reportOptionalMemberAccess, reportArgumentType]
        if thumbnail_file:
            scene.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)
        scene.save()

        out = SceneSerializer(scene, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        scene = self._get_scene(request, pk)
        serializer = SceneSerializer(scene, context={"request": request})
        return Response(serializer.data)

    def update(self, request: Request, pk: str | None = None) -> Response:
        scene = self._get_scene(request, pk)
        serializer = SceneUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated: dict = serializer.validated_data  # pyright: ignore[reportAssignmentType]
        bundle_file = validated.get("bundle")
        thumbnail_file = validated.get("thumbnail")
        # name 字段 default="" 总会存在；仅在显式传入时更新，避免改名误清空
        name_provided = "name" in request.data  # pyright: ignore[reportOperatorIssue]
        new_name = validated.get("name", "")

        old_bundle = scene.bundle if bundle_file else None
        old_thumbnail = scene.thumbnail if thumbnail_file else None

        if name_provided:
            scene.name = new_name
        if bundle_file:
            scene.bundle_size = bundle_file.size if hasattr(bundle_file, "size") else 0
            scene.bundle.save(bundle_file.name, bundle_file, save=False)
        if thumbnail_file:
            scene.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)
        scene.save()

        if old_bundle:
            delete_file_field(old_bundle)
        if old_thumbnail:
            delete_file_field(old_thumbnail)

        out = SceneSerializer(scene, context={"request": request})
        return Response(out.data)

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        scene = self._get_scene(request, pk)
        bundle_field = scene.bundle
        thumbnail_field = scene.thumbnail
        scene.delete()
        delete_file_field(bundle_field)
        delete_file_field(thumbnail_field)
        return Response({"deleted": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="bundle")
    def bundle(self, request: Request, pk: str | None = None):
        scene = self._get_scene(request, pk)
        filename = f"{scene.name or 'bundle'}.zip"
        return self.serve_attachment(
            scene.bundle,
            filename=filename,
            content_type="application/zip",
            missing_message="bundle 文件不存在",
            not_found_error=SceneNotFoundError,
        )

    @action(detail=True, methods=["get"], url_path="thumbnail")
    def thumbnail(self, request: Request, pk: str | None = None):
        scene = self._get_scene(request, pk)
        return self.serve_thumbnail_inline(
            scene.thumbnail,
            missing_message="缩略图不存在",
            not_found_error=SceneNotFoundError,
        )

    def _get_scene(self, request: Request, pk: str | None) -> Scene:
        return self._get_object(request, pk)  # pyright: ignore[reportReturnType]
