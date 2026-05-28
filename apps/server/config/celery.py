"""
Celery 应用初始化。

使用项目已有的 REDIS_URL 作为 broker 和 result backend，
支持异步任务（模型压缩等）和任务进度上报（PROGRESS state）。
"""

from celery import Celery

app = Celery("vizon")

app.config_from_object("django.conf:settings", namespace="CELERY")

# 自动发现各 app 下的 tasks.py
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    """验证 Celery 连接是否正常。"""
    print(f"Request: {self.request!r}")
