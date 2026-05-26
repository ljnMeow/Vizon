"""放宽模型文件路径字段长度，支持 ZIP 解压后的深层相对路径。"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("models3d", "0004_swap_category_field"),
    ]

    operations = [
        migrations.AlterField(
            model_name="modelasset",
            name="file",
            field=models.FileField(max_length=512, upload_to="models3d/files/"),
        ),
        migrations.AlterField(
            model_name="modelasset",
            name="thumbnail",
            field=models.ImageField(
                blank=True,
                max_length=512,
                null=True,
                upload_to="models3d/thumbnails/",
            ),
        ),
    ]
