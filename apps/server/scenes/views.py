"""
场景模块的 API 视图。

当前接口：
- GET    /api/scenes/                 列出当前用户所有场景（元数据 + thumbnail URL）
- POST   /api/scenes/                 新建场景（multipart: name, bundle ZIP, thumbnail PNG）
- GET    /api/scenes/{scene_id}/      获取单个场景元数据
- PUT    /api/scenes/{scene_id}/      覆盖更新（重新上传 bundle + thumbnail）
- DELETE /api/scenes/{scene_id}/      删除场景（同时删除磁盘文件）
- GET    /api/scenes/{scene_id}/bundle/  下载 bundle ZIP 文件

所有端点通过 CustomerJWTAuthentication + IsAuthenticated 保护。
视图内部始终用 request.customer 过滤，只返回当前用户自己的场景。
"""

from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.request import Request
from rest_framework.response import Response

from customers.models import Customer

from .models import Scene
from .serializers import SceneCreateSerializer, SceneSerializer, SceneUpdateSerializer


class SceneNotFoundError(APIException):
    """
    场景不存在异常。

    在查询/修改/删除时，目标场景不存在（或不属于当前用户）时抛出。
    统一返回 HTTP 404，配合全局异常处理器输出统一错误结构。
    """

    status_code = 404
    default_detail = "场景不存在"
    default_code = "not_found"


def _get_customer(request: Request) -> Customer:
    """从请求中取出当前登录用户对应的 Customer 实例。"""
    # CustomerJWTAuthentication 在 authenticate() 中已将 Customer 绑定到 request.customer
    return request.customer  # type: ignore[attr-defined]


def _delete_file_field(field) -> None:
    """安全删除 FileField / ImageField 关联的磁盘文件。"""
    if not field or not field.name:
        return
    try:
        field.delete(save=False)
    except Exception:
        # 文件已不存在或无权删除时不中断主流程
        pass


class SceneViewSet(viewsets.ViewSet):
    """
    场景 CRUD + bundle 下载视图集。

    使用 ViewSet（而非 ModelViewSet）以便对每个 action 有更精细的控制，
    特别是"删除场景时同步删除磁盘文件"和"下载 bundle"等自定义逻辑。
    """

    def list(self, request: Request) -> Response:
        """
        GET /api/scenes/
        返回当前用户的所有场景元数据列表，按最近修改时间倒序。
        不含 bundle 内容，仅包含 thumbnail URL 和基础信息。
        """
        customer = _get_customer(request)
        scenes = Scene.objects.filter(customer=customer)
        serializer = SceneSerializer(scenes, many=True, context={"request": request})
        return Response(serializer.data)

    def create(self, request: Request) -> Response:
        """
        POST /api/scenes/
        新建场景：接收 multipart 表单（name + bundle ZIP + 可选 thumbnail）。
        自动计算 bundle_size 并存储，返回场景元数据。
        """
        serializer = SceneCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = _get_customer(request)
        bundle_file = serializer.validated_data["bundle"]  # pyright: ignore[reportIndexIssue, reportOptionalSubscript]
        thumbnail_file = serializer.validated_data.get("thumbnail")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        name = serializer.validated_data.get("name", "")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]

        # 从上传文件对象直接读取字节数，避免二次读取文件
        bundle_size = bundle_file.size if hasattr(bundle_file, "size") else 0  # pyright: ignore[reportOptionalMemberAccess]

        scene = Scene(
            customer=customer,
            name=name,
            bundle_size=bundle_size,
        )
        scene.bundle.save(bundle_file.name, bundle_file, save=False)  # pyright: ignore[reportOptionalMemberAccess, reportArgumentType]
        if thumbnail_file:
            scene.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)
        scene.save()

        out = SceneSerializer(scene, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        """
        GET /api/scenes/{scene_id}/
        获取单个场景元数据；场景不属于当前用户时返回 404。
        """
        scene = self._get_scene(request, pk)
        serializer = SceneSerializer(scene, context={"request": request})
        return Response(serializer.data)

    def update(self, request: Request, pk: str | None = None) -> Response:
        """
        PUT /api/scenes/{scene_id}/
        覆盖更新：替换 bundle 文件（+ 可选 thumbnail），旧文件同步删除。
        """
        scene = self._get_scene(request, pk)
        serializer = SceneUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        bundle_file = serializer.validated_data["bundle"]  # pyright: ignore[reportIndexIssue, reportOptionalSubscript]
        thumbnail_file = serializer.validated_data.get("thumbnail")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]
        name = serializer.validated_data.get("name", "")  # pyright: ignore[reportAttributeAccessIssue, reportOptionalMemberAccess]

        # 先删除旧文件，再保存新文件，避免磁盘空间累积
        old_bundle = scene.bundle
        old_thumbnail = scene.thumbnail

        scene.name = name
        scene.bundle_size = bundle_file.size if hasattr(bundle_file, "size") else 0  # pyright: ignore[reportOptionalMemberAccess]

        # 保存新文件（save=False 延迟到 scene.save()）
        scene.bundle.save(bundle_file.name, bundle_file, save=False)  # pyright: ignore[reportOptionalMemberAccess, reportArgumentType]
        if thumbnail_file:
            scene.thumbnail.save(thumbnail_file.name, thumbnail_file, save=False)

        scene.save()

        # 主记录保存成功后再删除旧文件，确保事务一致
        _delete_file_field(old_bundle)
        if thumbnail_file:
            _delete_file_field(old_thumbnail)

        out = SceneSerializer(scene, context={"request": request})
        return Response(out.data)

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        """
        DELETE /api/scenes/{scene_id}/
        删除场景记录并同步删除磁盘上的 bundle 和 thumbnail 文件。
        """
        scene = self._get_scene(request, pk)

        # 先缓存文件字段引用，数据库删除后 FileField 仍可访问 .name
        bundle_field = scene.bundle
        thumbnail_field = scene.thumbnail

        scene.delete()

        # 数据库记录删除后清理文件，顺序不影响一致性（文件孤儿比数据孤儿更易处理）
        _delete_file_field(bundle_field)
        _delete_file_field(thumbnail_field)

        return Response({"deleted": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="bundle")
    def bundle(self, request: Request, pk: str | None = None):
        """
        GET /api/scenes/{scene_id}/bundle/
        流式下载场景的 bundle ZIP 文件。

        直接返回 FileResponse（application/zip），前端通过 API 代理请求，
        避免跨域访问 /media/ 静态文件的 CORS 问题。
        """
        from django.http import FileResponse

        scene = self._get_scene(request, pk)

        if not scene.bundle or not scene.bundle.name:
            raise SceneNotFoundError("bundle 文件不存在")

        # 以二进制模式打开文件，Django 会自动分块流式传输，避免内存峰值
        filename = f"{scene.name or 'bundle'}.zip"
        return FileResponse(
            scene.bundle.open("rb"),
            content_type="application/zip",
            as_attachment=True,
            filename=filename,
        )

    def _get_scene(self, request: Request, pk: str | None) -> Scene:
        """
        按 public_id 查询当前用户的场景。
        不存在或不属于当前用户时统一抛 404，避免信息泄漏。
        """
        customer = _get_customer(request)
        scene = Scene.objects.filter(public_id=pk, customer=customer).first()
        if scene is None:
            raise SceneNotFoundError()
        return scene
