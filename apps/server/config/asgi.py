"""
ASGI config for config project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/

给新手的说明：

- **ASGI 是什么**：Python Web 的异步标准接口（支持 WebSocket/长连接/异步任务等场景）。
- **什么时候会用到**：如果你未来要接入 WebSocket（比如实时协作、通知推送），
  或者用 Daphne/Uvicorn/Hypercorn 这类 ASGI server 部署，就会用到这里的 `application`。
- **现在用不到也没关系**：即使你当前只做普通 REST API，这个文件保持默认也完全 OK。
"""

import os

from django.core.asgi import get_asgi_application

# 指定 Django 启动时读取哪一份 settings（这里是 `config/settings.py`）
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# ASGI 入口：ASGI server 会调用它来处理请求/连接
application = get_asgi_application()
