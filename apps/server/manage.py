#!/usr/bin/env python
"""
Django 的命令行入口（`manage.py`）。

你几乎所有常用的 Django 命令都会通过它来执行，例如：
- `python manage.py runserver`：启动开发服务器
- `python manage.py migrate`：执行数据库迁移
- `python manage.py createsuperuser`：创建管理员账号

为什么需要它？
- Django 需要先知道“使用哪一份 settings 配置”（通过 `DJANGO_SETTINGS_MODULE`）
- 然后再把命令行参数交给 Django 的管理命令系统去分发执行
"""
import os
import sys


def main():
    """
    入口函数。

    - 设置默认的 `DJANGO_SETTINGS_MODULE`
    - 把命令行参数透传给 Django 的命令执行器
    """
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
