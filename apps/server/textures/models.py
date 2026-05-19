"""
贴图资源数据层。

Texture 表存储用户上传的贴图文件，每条记录对应一个可复用的贴图资源。
- file：贴图文件（支持 PNG/JPEG/WebP/HDR/EXR 等），存放在文件系统
- thumbnail：缩略图（客户端生成，用于列表快速预览）
- category：贴图分类，根据上传时的 slot 自动推断
- texture_slot：原始贴图槽位（TextureFieldKey 或 'hdri'），保留原始上下文
- public_id：对外暴露的唯一标识，不暴露自增 PK
"""

from uuid import uuid4

from django.db import models

from customers.models import Customer


class Texture(models.Model):
    """
    用户贴图资源记录。

    字段说明：
    - public_id：对外暴露的 UUID，API URL 使用此字段，隐藏内部自增 id
    - customer：所属用户，删除用户时级联删除所有贴图
    - name：贴图名称，默认取文件名，用户可修改
    - file：贴图文件（FileField 而非 ImageField，因为 HDR/EXR 不通过 Pillow 验证）
    - thumbnail：缩略图 PNG，客户端生成后上传，可为空
    - category：贴图分类，8 种固定值
    - texture_slot：原始贴图槽位名称（如 'map', 'normalMap', 'hdri'）
    - file_size：文件字节数，冗余存储便于列表展示
    - mime_type：文件 MIME 类型
    - width / height：图片尺寸（像素），HDR 文件为 0
    - created_at / updated_at：时间戳，由 Django 自动维护
    """

    CATEGORY_COLOR_MAP = "color_map"
    CATEGORY_ENVIRONMENT_MAP = "environment_map"
    CATEGORY_OPACITY_MAP = "opacity_map"
    CATEGORY_LIGHTING_MAP = "lighting_map"
    CATEGORY_NORMAL_MAP = "normal_map"
    CATEGORY_PBR_MAP = "pbr_map"
    CATEGORY_PHYSICAL_MAP = "physical_map"
    CATEGORY_SCENE_ENVIRONMENT = "scene_environment"

    CATEGORY_CHOICES = [
        (CATEGORY_COLOR_MAP, "颜色贴图"),
        (CATEGORY_ENVIRONMENT_MAP, "环境贴图"),
        (CATEGORY_OPACITY_MAP, "透明度贴图"),
        (CATEGORY_LIGHTING_MAP, "光照贴图"),
        (CATEGORY_NORMAL_MAP, "法线贴图"),
        (CATEGORY_PBR_MAP, "PBR 贴图"),
        (CATEGORY_PHYSICAL_MAP, "物理贴图"),
        (CATEGORY_SCENE_ENVIRONMENT, "场景环境贴图"),
    ]

    public_id = models.UUIDField(default=uuid4, unique=True, db_index=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="textures",
    )
    name = models.CharField(max_length=255, blank=True, default="")
    # FileField 而非 ImageField：HDR/EXR 不通过 Pillow 验证
    file = models.FileField(upload_to="textures/files/")
    thumbnail = models.ImageField(
        upload_to="textures/thumbnails/", null=True, blank=True
    )
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    texture_slot = models.CharField(max_length=50, blank=True, default="")
    file_size = models.BigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True, default="")
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "texture_items"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return (
            f"Texture({self.public_id}, name={self.name!r}, category={self.category})"
        )
