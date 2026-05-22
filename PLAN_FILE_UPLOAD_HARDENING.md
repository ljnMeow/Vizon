# Plan: 文件上传安全加固（大小限制 + 扩展名白名单 + 缓存头）

## Context

当前服务端文件上传零校验：任意文件类型、任意大小均可上传；文件下载无 `Cache-Control` 头。需要实现三项加固，防止恶意上传、超限文件打挂服务、以及减少重复带宽浪费。

## 改动文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/server/utils/file_validation.py` | **新建** | 校验器、常量、Cache-Control 辅助函数 |
| `apps/server/config/settings.py` | 修改 | 添加文件大小限制常量（可被环境变量覆盖） |
| `apps/server/textures/serializers.py` | 修改 | file/thumbnail 字段添加 validators |
| `apps/server/models3d/serializers.py` | 修改 | file/thumbnail 字段添加 validators |
| `apps/server/scenes/serializers.py` | 修改 | bundle/thumbnail 字段添加 validators（Create + Update） |
| `apps/server/textures/views.py` | 修改 | file 下载加 Cache-Control；新增 thumbnail 下载 action |
| `apps/server/models3d/views.py` | 修改 | file 下载加 Cache-Control；新增 thumbnail 下载 action |
| `apps/server/scenes/views.py` | 修改 | bundle 下载加 Cache-Control；新增 thumbnail 下载 action |

## 实现步骤

### Step 1: 新建 `utils/file_validation.py`

共享校验工具模块，遵循 `utils/drf.py` 和 `utils/datetime.py` 的纯函数风格。

**A. 扩展名和大小常量**

```python
TEXTURE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".hdr", ".exr"}
MODEL_EXTENSIONS = {".gltf", ".glb", ".fbx", ".obj", ".stl", ".ply", ".dae", ".3ds", ".wrl", ".pcd"}
SCENE_BUNDLE_EXTENSIONS = {".zip"}
THUMBNAIL_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

DEFAULT_MAX_TEXTURE_SIZE = 50 * 1024 * 1024    # 50 MB
DEFAULT_MAX_MODEL_SIZE = 200 * 1024 * 1024     # 200 MB
DEFAULT_MAX_SCENE_SIZE = 200 * 1024 * 1024     # 200 MB
DEFAULT_MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024   # 5 MB
```

**B. `FileExtensionValidator` 类** — DRF validator 协议，检查 `value.name` 后缀

**C. `FileSizeValidator` 类** — DRF validator 协议，检查 `value.size`

**D. 工厂函数** — `get_texture_file_validators()` / `get_model_file_validators()` / `get_scene_bundle_validators()` / `get_thumbnail_validators()`，每个返回 `[FileExtensionValidator, FileSizeValidator]` 列表。大小上限优先从 `django.conf.settings` 读取，回退到 DEFAULT 常量。

**E. Cache-Control 辅助**

```python
CACHE_PUBLIC_DAY = "public, max-age=86400"    # 缩略图
CACHE_PRIVATE_HOUR = "private, max-age=3600"  # 文件下载

def set_cache_control(response, policy: str):
    response["Cache-Control"] = policy
    return response
```

### Step 2: 修改 `config/settings.py`

在 token 过期常量后添加：

```python
FILE_UPLOAD_MAX_SIZE_TEXTURE = int(os.getenv("FILE_UPLOAD_MAX_SIZE_TEXTURE", 50 * 1024 * 1024))
FILE_UPLOAD_MAX_SIZE_MODEL = int(os.getenv("FILE_UPLOAD_MAX_SIZE_MODEL", 200 * 1024 * 1024))
FILE_UPLOAD_MAX_SIZE_SCENE = int(os.getenv("FILE_UPLOAD_MAX_SIZE_SCENE", 200 * 1024 * 1024))
FILE_UPLOAD_MAX_SIZE_THUMBNAIL = int(os.getenv("FILE_UPLOAD_MAX_SIZE_THUMBNAIL", 5 * 1024 * 1024))
```

### Step 3: 修改三个模块的 serializers.py

在每个 Create/Update Serializer 的 `file`/`bundle`/`thumbnail` 字段上添加 `validators=...`：

- `textures/serializers.py` → `TextureCreateSerializer.file` + `.thumbnail`
- `models3d/serializers.py` → `ModelAssetCreateSerializer.file` + `.thumbnail`
- `scenes/serializers.py` → `SceneCreateSerializer.bundle` + `.thumbnail`，`SceneUpdateSerializer.bundle` + `.thumbnail`

示例：
```python
from utils.file_validation import get_texture_file_validators, get_thumbnail_validators

file = serializers.FileField(required=True, validators=get_texture_file_validators())
thumbnail = serializers.ImageField(required=False, allow_null=True, validators=get_thumbnail_validators())
```

### Step 4: 修改三个模块的 views.py — Cache-Control + thumbnail action

**A. 现有文件下载 action 加 Cache-Control**

`textures/views.py` 的 `file` action、`models3d/views.py` 的 `file` action、`scenes/views.py` 的 `bundle` action：在 `FileResponse` 上调用 `set_cache_control(response, CACHE_PRIVATE_HOUR)`。

**B. 新增 thumbnail 下载 action**

三个 ViewSet 各添加 `@action(detail=True, methods=["get"], url_path="thumbnail")`，返回缩略图 FileResponse，带 `Cache-Control: public, max-age=86400`，`as_attachment=False`（内联显示，不强制下载）。

## 验证方式

1. **大小限制**：上传超过 50MB 的贴图文件 → 应返回 400 + 错误信息
2. **扩展名白名单**：上传 `.exe` 文件到贴图/模型/场景接口 → 应返回 400 + 错误信息
3. **Cache-Control**：`curl -I /api/textures/{id}/file/` → 响应头包含 `Cache-Control: private, max-age=3600`；`curl -I /api/textures/{id}/thumbnail/` → 包含 `Cache-Control: public, max-age=86400`
4. **pyright**：`pnpm pyright` 通过
5. **正常流程**：上传合规贴图/模型/场景 → 仍然成功

## 不在本次范围

- 文件内容/magic byte 校验（仅校验扩展名）
- ZIP 包完整性校验
- 中间件层面的全局限制
- Model 迁移
- Nginx `client_max_body_size` 配置（部署层面）
