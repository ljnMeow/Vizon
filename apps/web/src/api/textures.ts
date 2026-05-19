/**
 * 贴图资源管理 API 客户端。
 *
 * 封装与服务端 /api/textures/ 系列端点的通信，
 * 包括新建、列表、更新、删除。
 */

import { getApiBaseUrl } from '@/config/env';
import { getAccessToken } from '../utils/authStorage';
import { ApiError, api } from './request';
import type { ApiEnvelope } from './request';

/** 贴图分类（与后端 Texture.CATEGORY_CHOICES 对齐）。 */
export type TextureCategory =
  | 'color_map'
  | 'environment_map'
  | 'opacity_map'
  | 'lighting_map'
  | 'normal_map'
  | 'pbr_map'
  | 'physical_map'
  | 'scene_environment';

/** 贴图元数据（与后端 TextureSerializer 字段对齐）。 */
export type TextureMeta = {
  /** 对外唯一标识（UUID 字符串） */
  texture_id: string;
  /** 贴图名称 */
  name: string;
  /** 贴图分类 */
  category: TextureCategory;
  /** 原始贴图槽位（如 'map', 'normalMap', 'hdri'） */
  texture_slot: string;
  /** 贴图文件绝对 URL；无文件时为 null */
  file_url: string | null;
  /** 缩略图绝对 URL；无缩略图时为 null */
  thumbnail_url: string | null;
  /** 文件字节数 */
  file_size: number;
  /** 文件 MIME 类型 */
  mime_type: string;
  /** 图片宽度（像素），HDR 文件为 0 */
  width: number;
  /** 图片高度（像素），HDR 文件为 0 */
  height: number;
  /** 创建时间（格式化字符串） */
  created_at: string;
  /** 最后修改时间（格式化字符串） */
  updated_at: string;
};

/** 新建贴图的参数。 */
export type CreateTextureParams = {
  /** 贴图名称（可选，默认取文件名） */
  name?: string;
  /** 贴图文件 */
  file: Blob;
  /** 缩略图 PNG（可选，客户端生成） */
  thumbnail?: Blob;
  /** 贴图分类（必填） */
  category: TextureCategory;
  /** 原始贴图槽位（可选） */
  textureSlot?: string;
};

/** 列出当前用户的所有贴图元数据（按最近修改时间倒序），支持按分类筛选。 */
export function listTextures(category?: TextureCategory): Promise<TextureMeta[]> {
  const path = category ? `/api/textures/?category=${encodeURIComponent(category)}` : '/api/textures/';
  return api.get<TextureMeta[]>(path);
}

/**
 * 新建贴图，上传文件与可选的缩略图。
 * 使用 multipart/form-data，让浏览器自动处理 boundary。
 */
export function createTexture(params: CreateTextureParams): Promise<TextureMeta> {
  const form = buildFormData(params);
  return api.post<TextureMeta>('/api/textures/', form);
}

/**
 * 新建贴图（带上传进度）。
 *
 * 使用 XHR 替代 fetch，以获取 xhr.upload.progress 事件。
 * 响应解析逻辑与 request.ts 一致（envelope 格式兼容）。
 */
export function uploadTextureWithProgress(
  params: CreateTextureParams,
  onProgress?: (percent: number) => void
): Promise<TextureMeta> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const baseUrl = getApiBaseUrl();
    xhr.open('POST', baseUrl ? `${baseUrl}/api/textures/` : '/api/textures/');

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
          resolve(parsed.data as TextureMeta);
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
        resolve(parsed as TextureMeta);
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

function buildFormData(params: CreateTextureParams): FormData {
  const form = new FormData();
  if (params.name) form.append('name', params.name);
  form.append('file', params.file, params.file instanceof File ? params.file.name : 'texture');
  if (params.thumbnail) form.append('thumbnail', params.thumbnail, 'thumbnail.png');
  form.append('category', params.category);
  if (params.textureSlot) form.append('texture_slot', params.textureSlot);
  return form;
}

function isEnvelope(v: unknown): v is ApiEnvelope<TextureMeta> {
  return typeof v === 'object' && v !== null && 'code' in v && 'message' in v;
}

function extractMsg(v: unknown): string | undefined {
  if (typeof v === 'object' && v !== null && 'message' in v) return String((v as any).message);
  if (typeof v === 'string') return v;
  return undefined;
}

/** 重命名贴图。 */
export function updateTexture(textureId: string, params: { name: string }): Promise<TextureMeta> {
  return api.put<TextureMeta>(`/api/textures/${textureId}/`, params);
}

/** 删除贴图（同时删除服务端的文件和缩略图）。 */
export function deleteTexture(textureId: string): Promise<void> {
  return api.delete<void>(`/api/textures/${textureId}/`);
}
