# Server (Django)

## 本地启动

在项目根目录执行：

```bash
python3 -m venv apps/server/.venv
apps/server/.venv/bin/python -m pip install -r apps/server/requirements.txt
cp apps/server/.env.example apps/server/.env
# 编辑 apps/server/.env：PostgreSQL、SECRET_KEY、DEBUG、REDIS_URL 等（缺任一项会启动失败）
apps/server/.venv/bin/python apps/server/manage.py migrate
pnpm dev:server
```

默认经 Daphne 启动 ASGI（HTTP + WebSocket）。

## 生产部署检查清单

| 变量 | 建议 |
|------|------|
| `SECRET_KEY` | 长随机串，仅放密钥管理/环境变量 |
| `DEBUG` | `0` |
| `ALLOWED_HOSTS` | 逗号分隔的真实域名 |
| `OPEN_API_AUTH` | `0` |
| `POSTGRES_CONN_MAX_AGE` | `60`（按连接池策略调整） |
| `REDIS_URL` | 带密码的完整 URL |

资源接口（场景/贴图/模型）始终要求 `Authorization: Bearer <access_token>`。压缩进度 WebSocket 需在连接 URL 附带 `?token=<access_token>`。

## 测试

```bash
pnpm test:server
```

需要本机 PostgreSQL 与 Redis 与 `.env` 配置一致。
