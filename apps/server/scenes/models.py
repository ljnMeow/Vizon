"""
场景数据层。

Scene 表存储用户在编辑器中保存的三维场景，每条记录对应一个可加载的项目包。
- bundle：ZIP 文件（含 scene.json + 贴图/HDRI 资产），存储在文件系统
- thumbnail：截图缩略图 PNG，用于列表预览
- public_id：对外暴露的唯一标识，不暴露自增 PK

存储策略：使用 FileSystemStorage（FileField），文件写入 MEDIA_ROOT。
后续迁移到对象存储（S3 等）只需改 DEFAULT_FILE_STORAGE，无需改模型。
"""

from uuid import uuid4

from django.db import models

from customers.models import Customer


class Scene(models.Model):
    """
    用户场景记录。

    字段说明：
    - public_id：对外暴露的 UUID，API URL 使用此字段，隐藏内部自增 id
    - customer：所属用户，删除用户时级联删除所有场景
    - name：场景名称，从前端 sceneSettings.basic.sceneName 取值，允许空字符串
    - bundle：ZIP 项目包文件，内含 scene.json 与所有贴图/HDRI 资产
    - thumbnail：截图 PNG，可为空（上传时由前端一并传入）
    - bundle_size：ZIP 文件字节数，冗余存储便于列表展示文件大小
    - created_at / updated_at：时间戳，由 Django 自动维护
    """

    public_id = models.UUIDField(default=uuid4, unique=True, db_index=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='scenes',
    )
    # 场景名称，允许空字符串（前端未填时为空）
    name = models.CharField(max_length=255, blank=True, default='')
    # ZIP 项目包，存放在 MEDIA_ROOT/scenes/bundles/ 目录
    bundle = models.FileField(upload_to='scenes/bundles/')
    # 预览缩略图，存放在 MEDIA_ROOT/scenes/thumbnails/ 目录，首次保存时由前端上传
    thumbnail = models.ImageField(upload_to='scenes/thumbnails/', null=True, blank=True)
    # ZIP 文件字节数，冗余存储避免每次列表请求都读取文件大小
    bundle_size = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'scene_items'
        # 列表默认按最近修改时间倒序，便于前端展示最新场景
        ordering = ['-updated_at']

    def __str__(self) -> str:
        return f'Scene({self.public_id}, name={self.name!r})'
