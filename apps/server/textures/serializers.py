"""
贴图模块的序列化器。

负责定义贴图相关接口的输入/输出字段与校验规则：
- TextureSerializer：读取贴图元数据（列表/详情），含缩略图/文件 URL
- TextureCreateSerializer：新建贴图（接收 file + 可选 thumbnail + category）
- TextureUpdateSerializer：更新贴图（仅支持重命名）
"""

from rest_framework import serializers

from utils.file_validation import get_texture_file_validators, get_thumbnail_validators
from utils.serializer_fields import AbsoluteFileUrlField, FormattedDateTimeField

from .models import Texture


class TextureSerializer(serializers.ModelSerializer):
    """贴图元数据读取序列化器（用于列表和详情响应）。"""

    texture_id = serializers.UUIDField(source="public_id", read_only=True)
    thumbnail_url = AbsoluteFileUrlField(source="thumbnail")
    file_url = AbsoluteFileUrlField(source="file")
    created_at = FormattedDateTimeField()
    updated_at = FormattedDateTimeField()

    class Meta:
        model = Texture
        fields = [
            "texture_id",
            "name",
            "category",
            "texture_slot",
            "file_url",
            "thumbnail_url",
            "file_size",
            "mime_type",
            "width",
            "height",
            "created_at",
            "updated_at",
        ]


class TextureCreateSerializer(serializers.Serializer):
    """
    新建贴图的请求序列化器（multipart/form-data）。

    前端上传：
    - name：贴图名称（可为空，默认取文件名）
    - file：贴图文件（必填，支持 PNG/JPEG/WebP/HDR/EXR）
    - thumbnail：缩略图 PNG（可选，客户端生成）
    - category：贴图分类（必填，8 种固定值）
    - texture_slot：原始贴图槽位（可选，如 'map', 'normalMap', 'hdri'）
    """

    name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    file = serializers.FileField(required=True, validators=get_texture_file_validators())
    thumbnail = serializers.ImageField(required=False, allow_null=True, validators=get_thumbnail_validators())
    category = serializers.ChoiceField(choices=Texture.CATEGORY_CHOICES, required=True)
    texture_slot = serializers.CharField(
        max_length=50, required=False, allow_blank=True, default=""
    )


class TextureUpdateSerializer(serializers.Serializer):
    """
    更新贴图的请求序列化器（仅支持重命名）。

    文件替换需删除后重新上传。
    """

    name = serializers.CharField(max_length=255, required=True)
