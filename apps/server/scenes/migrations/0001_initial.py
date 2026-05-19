# 由 Django 迁移框架管理，手动创建以避免依赖本地数据库连接。

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """scenes.Scene 表的初始建表迁移。"""

    initial = True

    dependencies = [
        ("customers", "0003_customerpublicid"),
    ]

    operations = [
        migrations.CreateModel(
            name="Scene",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                # 对外唯一标识，不暴露自增主键
                (
                    "public_id",
                    models.UUIDField(default=uuid.uuid4, unique=True, db_index=True),
                ),
                # 场景名称，允许空字符串
                ("name", models.CharField(blank=True, default="", max_length=255)),
                # ZIP 项目包，存放在 scenes/bundles/ 子目录
                ("bundle", models.FileField(upload_to="scenes/bundles/")),
                # 截图缩略图，可为空
                (
                    "thumbnail",
                    models.ImageField(
                        blank=True,
                        null=True,
                        upload_to="scenes/thumbnails/",
                    ),
                ),
                # 文件字节数，冗余存储
                ("bundle_size", models.BigIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                # 所属用户，级联删除
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="scenes",
                        to="customers.customer",
                    ),
                ),
            ],
            options={
                "db_table": "scene_items",
                "ordering": ["-updated_at"],
            },
        ),
    ]
