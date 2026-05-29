"""
场景模块的序列化器。

负责定义场景相关接口的输入/输出字段与校验规则：
- SceneSerializer：读取场景元数据（列表/详情），含缩略图 URL
- SceneCreateSerializer：新建场景（接收 bundle ZIP + 可选 thumbnail PNG）
- SceneUpdateSerializer：覆盖更新场景（bundle 和 thumbnail 均可选）
"""

from rest_framework import serializers

from utils.file_validation import get_scene_bundle_validators, get_thumbnail_validators
from utils.serializer_fields import AbsoluteFileUrlField, FormattedDateTimeField

from .models import Scene


class SceneSerializer(serializers.ModelSerializer):
    """
    场景元数据读取序列化器（用于列表和详情响应）。
    """

    scene_id = serializers.UUIDField(source="public_id", read_only=True)
    thumbnail_url = AbsoluteFileUrlField(source="thumbnail")
    created_at = FormattedDateTimeField()
    updated_at = FormattedDateTimeField()

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
    bundle = serializers.FileField(required=True, validators=get_scene_bundle_validators())
    # 截图缩略图（可选）
    thumbnail = serializers.ImageField(required=False, allow_null=True, validators=get_thumbnail_validators())


class SceneUpdateSerializer(serializers.Serializer):
    """
    覆盖更新场景的请求序列化器（multipart/form-data）。

    所有字段均可选：
    - 仅传 name：重命名场景，不动 bundle/thumbnail
    - 传 bundle：覆盖更新文件
    - 传 thumbnail：覆盖更新缩略图
    """

    name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    bundle = serializers.FileField(required=False, validators=get_scene_bundle_validators())
    thumbnail = serializers.ImageField(required=False, allow_null=True, validators=get_thumbnail_validators())
