"""
模型资源模块的序列化器。

负责定义模型及分类相关接口的输入/输出字段与校验规则：
- ModelCategorySerializer：读取分类元数据（含模型计数）
- ModelCategoryCreateSerializer：新建分类
- ModelCategoryUpdateSerializer：重命名分类
- ModelAssetSerializer：读取模型元数据（列表/详情），含分类信息
- ModelAssetCreateSerializer：新建模型（multipart: name, file, thumbnail, category）
- ModelAssetUpdateSerializer：更新模型（重命名 + 移动分类）
"""

from rest_framework import serializers

from utils.datetime import format_datetime
from utils.file_validation import get_model_file_validators, get_thumbnail_validators, THUMBNAIL_EXTENSIONS

from .models import ModelAsset, ModelCategory


def _thumbnail_validators():
    from utils.file_validation import FileExtensionValidator, FileSizeValidator, DEFAULT_MAX_THUMBNAIL_SIZE
    return [
        FileExtensionValidator(THUMBNAIL_EXTENSIONS),
        FileSizeValidator(DEFAULT_MAX_THUMBNAIL_SIZE),
    ]


class ModelCategorySerializer(serializers.ModelSerializer):
    """分类元数据读取序列化器。"""

    category_id = serializers.UUIDField(source="public_id", read_only=True)
    model_count = serializers.IntegerField(read_only=True, default=0)
    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = ModelCategory
        fields = [
            "category_id",
            "name",
            "is_default",
            "model_count",
            "created_at",
            "updated_at",
        ]

    def get_created_at(self, obj: ModelCategory) -> str:
        return format_datetime(obj.created_at)

    def get_updated_at(self, obj: ModelCategory) -> str:
        return format_datetime(obj.updated_at)


class ModelCategoryCreateSerializer(serializers.Serializer):
    """新建分类的请求序列化器。"""

    name = serializers.CharField(max_length=10, required=True)


class ModelCategoryUpdateSerializer(serializers.Serializer):
    """重命名分类的请求序列化器。"""

    name = serializers.CharField(max_length=10, required=True)


class ModelAssetSerializer(serializers.ModelSerializer):
    """模型元数据读取序列化器（用于列表和详情响应）。"""

    model_id = serializers.UUIDField(source="public_id", read_only=True)
    category_id = serializers.UUIDField(source="category.public_id", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    thumbnail_url = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = ModelAsset
        fields = [
            "model_id",
            "name",
            "category_id",
            "category_name",
            "file_url",
            "thumbnail_url",
            "file_size",
            "mime_type",
            "created_at",
            "updated_at",
        ]

    def get_thumbnail_url(self, obj: ModelAsset) -> str | None:
        if not obj.thumbnail:
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.thumbnail.url)
        return obj.thumbnail.url

    def get_file_url(self, obj: ModelAsset) -> str | None:
        if not obj.file:
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url

    def get_created_at(self, obj: ModelAsset) -> str:
        return format_datetime(obj.created_at)

    def get_updated_at(self, obj: ModelAsset) -> str:
        return format_datetime(obj.updated_at)


class ModelAssetCreateSerializer(serializers.Serializer):
    """新建模型的请求序列化器（multipart/form-data）。"""

    name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    file = serializers.FileField(required=True, validators=get_model_file_validators())
    thumbnail = serializers.ImageField(
        required=False, allow_null=True, validators=get_thumbnail_validators()
    )
    category = serializers.UUIDField(required=False, allow_null=True)


class ModelAssetUpdateSerializer(serializers.Serializer):
    """更新模型的请求序列化器（重命名 + 移动分类 + 更新缩略图）。"""

    name = serializers.CharField(max_length=255, required=False)
    category = serializers.UUIDField(required=False)
    thumbnail = serializers.ImageField(
        required=False, allow_null=True,
        validators=_thumbnail_validators(),
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("至少需要提供一个字段。")
        return attrs
