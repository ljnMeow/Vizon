/**
 * 模型资源管理 API 客户端。
 *
 * 封装与服务端 /api/models3d/ 系列端点的通信，
 * 包括模型和分类的 CRUD。
 */

import { getApiBaseUrl } from '@/config/env';
import { getAccessToken, getRefreshToken, setAuthTokens } from '../utils/authStorage';
import { ApiError, api } from './request';
import type { ApiEnvelope } from './request';

/** 模型分类。 */
export type Model3dCategory = {
  category_id: string;
  name: string;
  is_default: boolean;
  model_count: number;
  created_at: string;
  updated_at: string;
};

/** 模型元数据（与后端 ModelAssetSerializer 字段对齐）。 */
export type Model3dMeta = {
  model_id: string;
  name: string;
  category_id: string;
  category_name: string;
  file_url: string | null;
  thumbnail_url: string | null;
  compressed_file_url: string | null;
  file_size: number;
  compressed_file_size: number;
  mime_type: string;
  compression_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  celery_task_id: string;
  created_at: string;
  updated_at: string;
};

/** 新建模型的参数。 */
export type CreateModel3dParams = {
  name?: string;
  file: Blob;
  thumbnail?: Blob;
  category?: string;
};

// ---------------------------------------------------------------------------
// 分类 API
// ---------------------------------------------------------------------------

/** 列出当前用户的所有模型分类。 */
export function listModel3dCategories(): Promise<Model3dCategory[]> {
  return api.get<Model3dCategory[]>('/api/models3d/categories/');
}

/** 创建模型分类。 */
export function createModel3dCategory(name: string): Promise<Model3dCategory> {
  return api.post<Model3dCategory>('/api/models3d/categories/', { name });
}

/** 重命名模型分类。 */
export function updateModel3dCategory(
  categoryId: string,
  params: { name: string }
): Promise<Model3dCategory> {
  return api.put<Model3dCategory>(`/api/models3d/categories/${categoryId}/`, params);
}

/** 删除模型分类。 */
export function deleteModel3dCategory(categoryId: string): Promise<void> {
  return api.delete<void>(`/api/models3d/categories/${categoryId}/`);
}

// ---------------------------------------------------------------------------
// 模型 API
// ---------------------------------------------------------------------------

/** 列出当前用户的所有模型元数据，支持按分类 ID 筛选。 */
export function listModel3ds(categoryId?: string): Promise<Model3dMeta[]> {
  const path = categoryId
    ? `/api/models3d/?category=${encodeURIComponent(categoryId)}`
    : '/api/models3d/';
  return api.get<Model3dMeta[]>(path);
}

/** 新建模型（带上传进度，支持 token 过期自动刷新重试）。 */
export function uploadModel3dWithProgress(
  params: CreateModel3dParams,
  onProgress?: (percent: number) => void
): Promise<Model3dMeta> {
  return _doUploadWithProgress(params, onProgress, false);
}

async function _doUploadWithProgress(
  params: CreateModel3dParams,
  onProgress: ((percent: number) => void) | undefined,
  isRetry: boolean,
): Promise<Model3dMeta> {
  const result = await new Promise<{ data: Model3dMeta } | { error: ApiError }>((resolve) => {
    const xhr = new XMLHttpRequest();
    const baseUrl = getApiBaseUrl();
    xhr.open('POST', baseUrl ? `${baseUrl}/api/models3d/` : '/api/models3d/');

    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      const rawText = xhr.responseText;
      const contentType = xhr.getResponseHeader('content-type') ?? '';
      const isJson = contentType.includes('application/json');

      let parsed: unknown;
      try {
        parsed = rawText ? (isJson ? JSON.parse(rawText) : rawText) : null;
      } catch {
        parsed = rawText;
      }

      // 401 且包含 token 过期信息 → 交由外层重试
      if (xhr.status === 401 && !isRetry) {
        const msg = extractMsg(parsed) || '';
        if (msg.includes('token') && (msg.includes('过期') || msg.includes('expired') || msg.includes('无效') || msg.includes('invalid'))) {
          resolve({ error: new ApiError(msg, { httpStatus: 401, errors: parsed }) });
          return;
        }
      }

      if (isEnvelope(parsed)) {
        if (parsed.code === 0) {
          resolve({ data: parsed.data as Model3dMeta });
        } else {
          resolve({ error: new ApiError(parsed.message || 'error', {
            httpStatus: xhr.status,
            code: parsed.code,
            errors: parsed.errors
          }) });
        }
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ data: parsed as Model3dMeta });
      } else {
        resolve({ error: new ApiError(extractMsg(parsed) || xhr.statusText || 'error', {
          httpStatus: xhr.status,
          errors: parsed
        }) });
      }
    };

    xhr.onerror = () => resolve({ error: new ApiError('Network error', { httpStatus: 0 }) });
    xhr.send(buildFormData(params));
  });

  if ('data' in result) return result.data;

  const err = result.error;
  // 401 token 过期 → 刷新后重试一次
  if (!isRetry && err.httpStatus === 401) {
    try {
      await _refreshTokens();
      return _doUploadWithProgress(params, onProgress, true);
    } catch {
      throw err;
    }
  }

  throw err;
}

async function _refreshTokens() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError('缺少 refresh_token', { httpStatus: 401 });

  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}/api/auth/refresh/` : '/api/auth/refresh/';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) throw new ApiError('refresh 失败', { httpStatus: res.status });

  const data = await res.json();
  const envelope = data?.data ?? data;
  if (!envelope?.access_token || !envelope?.refresh_token) {
    throw new ApiError('refresh 响应缺少 token', { httpStatus: res.status });
  }
  setAuthTokens({ accessToken: envelope.access_token, refreshToken: envelope.refresh_token });
}

function buildFormData(params: CreateModel3dParams): FormData {
  const form = new FormData();
  if (params.name) form.append('name', params.name);
  form.append('file', params.file, params.file instanceof File ? params.file.name : 'model');
  if (params.thumbnail) form.append('thumbnail', params.thumbnail, 'thumbnail.png');
  if (params.category) form.append('category', params.category);
  return form;
}

function isEnvelope(v: unknown): v is ApiEnvelope<Model3dMeta> {
  return typeof v === 'object' && v !== null && 'code' in v && 'message' in v;
}

function extractMsg(v: unknown): string | undefined {
  if (typeof v === 'object' && v !== null && 'message' in v) return String((v as any).message);
  if (typeof v === 'string') return v;
  return undefined;
}

/** 更新模型（重命名 + 移动分类）。 */
export function updateModel3d(
  modelId: string,
  params: { name?: string; category?: string }
): Promise<Model3dMeta> {
  return api.put<Model3dMeta>(`/api/models3d/${modelId}/`, params);
}

/** 更新模型缩略图。 */
export function updateModel3dThumbnail(
  modelId: string,
  thumbnail: Blob
): Promise<Model3dMeta> {
  const form = new FormData();
  form.append('thumbnail', thumbnail, 'thumbnail.png');
  return api.put<Model3dMeta>(`/api/models3d/${modelId}/`, form);
}

/** 删除模型。 */
export function deleteModel3d(modelId: string): Promise<void> {
  return api.delete<void>(`/api/models3d/${modelId}/`);
}

/** 压缩进度信息。 */
export type CompressionProgress = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage?: string;
  percent?: number;
  message?: string;
  original_size?: number;
  compressed_size?: number;
};

/** 查询模型压缩状态（前端轮询用）。 */
export function getModelCompressionStatus(modelId: string): Promise<CompressionProgress> {
  return api.get<CompressionProgress>(`/api/models3d/${modelId}/compression-status/`);
}

/** 轮询压缩状态直到完成或失败。 */
export function pollCompressionStatus(
  modelId: string,
  onUpdate: (progress: CompressionProgress) => void,
  intervalMs = 2000,
): Promise<CompressionProgress> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const progress = await getModelCompressionStatus(modelId);
        onUpdate(progress);

        if (progress.status === 'completed' || progress.status === 'failed') {
          if (timer) clearInterval(timer);
          resolve(progress);
        }
      } catch {
        // 网络错误，继续轮询
      }
    };

    // 首次立即查询
    void poll();
    timer = setInterval(() => void poll(), intervalMs);
  });
}

/** 通过 WebSocket 实时追踪压缩进度，失败时回退到轮询。 */
export function watchCompressionProgress(
  modelId: string,
  onUpdate: (progress: CompressionProgress) => void,
): Promise<CompressionProgress> {
  return new Promise((resolve) => {
    const baseUrl = getApiBaseUrl();
    const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = baseUrl ? baseUrl.replace(/^https?:\/\//, '') : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/models3d/${modelId}/compression/`;

    let settled = false;
    let fallbackStarted = false;

    const finish = (result: CompressionProgress) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const fallbackToPolling = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      void pollCompressionStatus(modelId, onUpdate).then(finish);
    };

    try {
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data: CompressionProgress = JSON.parse(event.data);
          onUpdate(data);

          if (data.status === 'completed' || data.status === 'failed') {
            ws.close();
            finish(data);
          }
        } catch {
          // 忽略解析错误
        }
      };

      ws.onerror = () => {
        // onerror 后会触发 onclose，在那里回退到轮询
      };

      ws.onclose = () => {
        if (!settled) fallbackToPolling();
      };
    } catch {
      // WebSocket 构造失败，回退到轮询
      fallbackToPolling();
    }
  });
}
