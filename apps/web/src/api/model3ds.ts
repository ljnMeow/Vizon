/**
 * 模型资源管理 API 客户端。
 *
 * 封装与服务端 /api/models3d/ 系列端点的通信，
 * 包括模型和分类的 CRUD。
 */

import { getApiBaseUrl } from '@/config/env';
import { getAccessToken } from '../utils/authStorage';
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
  file_size: number;
  mime_type: string;
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

/** 新建模型（带上传进度）。 */
export function uploadModel3dWithProgress(
  params: CreateModel3dParams,
  onProgress?: (percent: number) => void
): Promise<Model3dMeta> {
  return new Promise((resolve, reject) => {
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

      if (isEnvelope(parsed)) {
        if (parsed.code === 0) {
          resolve(parsed.data as Model3dMeta);
        } else {
          reject(new ApiError(parsed.message || 'error', {
            httpStatus: xhr.status,
            code: parsed.code,
            errors: parsed.errors
          }));
        }
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as Model3dMeta);
      } else {
        reject(new ApiError(extractMsg(parsed) || xhr.statusText || 'error', {
          httpStatus: xhr.status,
          errors: parsed
        }));
      }
    };

    xhr.onerror = () => reject(new ApiError('Network error', { httpStatus: 0 }));
    xhr.send(buildFormData(params));
  });
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

/** 删除模型。 */
export function deleteModel3d(modelId: string): Promise<void> {
  return api.delete<void>(`/api/models3d/${modelId}/`);
}
