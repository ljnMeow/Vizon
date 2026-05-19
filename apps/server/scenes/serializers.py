"""
场景模块的序列化器。

负责定义场景相关接口的输入/输出字段与校验规则：
- SceneSerializer：读取场景元数据（列表/详情），含缩略图 URL
- SceneCreateSerializer：新建场景（接收 bundle ZIP + 可选 thumbnail PNG）
- SceneUpdateSerializer：覆盖更新场景（重新上传 bundle + thumbnail）
"""

from rest_framework import serializers

from utils.datetime import format_datetime

from .models import Scene


class SceneSerializer(serializers.ModelSerializer):
    """
    场景元数据读取序列化器（用于列表和详情响应）。

    - public_id 作为对外 ID，不暴露自增主键
    - thumbnail_url 通过请求上下文构建绝对 URL（方便前端直接拼图片 src）
    - 不包含 bundle 内容，前端需要下载时走专用的 /bundle/ 端点
    """

    # 对外暴露场景唯一标识（UUID 字符串）
    scene_id = serializers.UUIDField(source="public_id", read_only=True)
    # 缩略图绝对 URL，thumbnail 为空时返回 None
    thumbnail_url = serializers.SerializerMethodField()
    # 创建/更新时间，格式化为 YYYY-MM-DD HH:mm:ss
    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = Scene
        fields = [
            "scene_id",
            "name",
            "thumbnail_url",
            "bundle_size",
            "created_at",
            "updated_at",
        ]

    def get_thumbnail_url(self, obj: Scene) -> str | None:
        """返回缩略图的绝对 URL；无缩略图时返回 None。"""
        if not obj.thumbnail:
            return None
        # 借助 request context 构建带域名的绝对 URL
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.thumbnail.url)
        return obj.thumbnail.url

    def get_created_at(self, obj: Scene) -> str:
        return format_datetime(obj.created_at)

    def get_updated_at(self, obj: Scene) -> str:
        return format_datetime(obj.updated_at)


class SceneCreateSerializer(serializers.Serializer):
    """
    新建场景的请求序列化器（multipart/form-data）。

    前端上传：
    - name：场景名称（可为空）
    - bundle：ZIP 项目包（必填）
    - thumbnail：截图 PNG（可选）
    """

    # 场景名，允许空字符串
    name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    # ZIP 项目包文件（必填）
    bundle = serializers.FileField(required=True)
    # 截图缩略图（可选）
    thumbnail = serializers.ImageField(required=False, allow_null=True)


class SceneUpdateSerializer(serializers.Serializer):
    """
    覆盖更新场景的请求序列化器（multipart/form-data）。

    与 Create 相同字段，但 bundle 也可不传（仅更新名称）。
    实际上我们要求 bundle 必传（覆盖更新语义），thumbnail 可选。
    """

    name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    bundle = serializers.FileField(required=True)
    thumbnail = serializers.ImageField(required=False, allow_null=True)
