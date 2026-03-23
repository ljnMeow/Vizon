"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/

给新手的说明：

- **WSGI 是什么**：一种 Python Web 服务的“标准调用接口”（同步模型居多）。
- **什么时候会用到**：你把 Django 部署到生产环境时，经常会用 Gunicorn/uWSGI 这类
  WSGI server 来启动项目；它们会导入这里的 `application` 变量作为入口。
- **本地开发 runserver 用不用它**：开发服务器主要走 `manage.py runserver`，
  不需要你手动改这里。
"""

import os

from django.core.wsgi import get_wsgi_application

# 指定 Django 启动时读取哪一份 settings（这里是 `config/settings.py`）
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# WSGI 入口：WSGI server 会调用它来处理 HTTP 请求
application = get_wsgi_application()
