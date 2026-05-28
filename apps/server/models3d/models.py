"""
模型资源数据层。

ModelCategory 表存储用户自定义的模型分类，默认分类不可删除。
ModelAsset 表存储用户上传的 3D 模型文件，每条记录对应一个可复用的模型资源。
- file：模型文件（支持 glTF/GLB/OBJ/STL 等），存放在文件系统
- thumbnail：缩略图（客户端生成或上传，用于列表快速预览）
- category：模型所属分类（ForeignKey → ModelCategory）
- public_id：对外暴露的唯一标识，不暴露自增 PK
- compression_status：压缩状态（pending/processing/completed/failed/skipped）
- compressed_file：压缩后的 GLB 文件（Draco + KTX2）
- celery_task_id：关联的 Celery 任务 ID，用于前端轮询压缩进度
"""

from uuid import uuid4

from django.db import models

from customers.models import Customer


class CompressionStatus(models.TextChoices):
    PENDING = "pending", "待压缩"
    PROCESSING = "processing", "压缩中"
    COMPLETED = "completed", "已完成"
    FAILED = "failed", "压缩失败"
    SKIPPED = "skipped", "跳过"


class ModelCategory(models.Model):
    """用户自定义模型分类。"""

    public_id = models.UUIDField(default=uuid4, unique=True, db_index=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="model3d_categories",
    )
    name = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "models3d_categories"
        ordering = ["-is_default", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "name"],
                name="uq_model3d_category_customer_name",
            ),
        ]

    def __str__(self) -> str:
        return f"ModelCategory({self.public_id}, name={self.name!r}, is_default={self.is_default})"


class ModelAsset(models.Model):
    """用户模型资源记录。"""

    public_id = models.UUIDField(default=uuid4, unique=True, db_index=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="models3d",
    )
    name = models.CharField(max_length=255, blank=True, default="")
    # ZIP 解压后入口路径含 uuid 与子目录，需大于默认 100
    file = models.FileField(upload_to="models3d/files/", max_length=512)
    thumbnail = models.ImageField(
        upload_to="models3d/thumbnails/", null=True, blank=True, max_length=512
    )
    category = models.ForeignKey(
        ModelCategory,
        on_delete=models.PROTECT,
        related_name="models",
        db_index=True,
    )
    file_size = models.BigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True, default="")
    # 压缩相关字段
    compression_status = models.CharField(
        max_length=20,
        choices=CompressionStatus.choices,
        default=CompressionStatus.PENDING,
        db_index=True,
    )
    compressed_file = models.FileField(
        upload_to="models3d/compressed/",
        null=True,
        blank=True,
        max_length=512,
    )
    compressed_file_size = models.BigIntegerField(default=0)
    celery_task_id = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "models3d_items"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return (
            f"ModelAsset({self.public_id}, name={self.name!r})"
        )
