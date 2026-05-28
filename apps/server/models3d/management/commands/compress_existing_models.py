"""
批量压缩存量未压缩模型的管理命令。

用法：
  python manage.py compress_existing_models           # 压缩所有待处理模型
  python manage.py compress_existing_models --limit 10  # 限制数量
"""

from django.core.management.base import BaseCommand

from models3d.models import ModelAsset, CompressionStatus
from models3d.tasks import compress_model_task


class Command(BaseCommand):
    help = "批量压缩存量未压缩的模型（compression_status=pending）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="限制处理的模型数量（0 表示不限制）",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        pending = ModelAsset.objects.filter(
            compression_status=CompressionStatus.PENDING
        )

        count = pending.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS("没有待压缩的模型"))
            return

        if limit > 0:
            pending = pending[:limit]

        dispatched = 0
        for asset in pending:
            task = compress_model_task.delay(asset.pk)  # pyright: ignore[reportCallIssue]
            asset.celery_task_id = task.id
            asset.save(update_fields=["celery_task_id"])
            dispatched += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"已派发 {dispatched}/{count} 个压缩任务"
                + (f"（限制 {limit}）" if limit > 0 else "")
            )
        )
