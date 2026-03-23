# Server (Django)

## 本地启动

在项目根目录执行：

```bash
python3 -m venv apps/server/.venv
apps/server/.venv/bin/python -m pip install -r apps/server/requirements.txt
cp apps/server/.env.example apps/server/.env
# 编辑 apps/server/.env，填上你的 PostgreSQL 连接信息（本项目强制 Postgres，未配置会报错）
apps/server/.venv/bin/python apps/server/manage.py runserver
```

默认访问 `http://127.0.0.1:8000/`。

