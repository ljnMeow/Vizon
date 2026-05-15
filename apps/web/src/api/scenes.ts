/**
 * 场景管理 API 客户端。
 *
 * 封装与服务端 /api/scenes/ 系列端点的通信，
 * 包括新建、列表、更新、删除和下载 bundle ZIP。
 *
 * 注意：request.ts 已支持 FormData（body instanceof FormData 时不设 Content-Type，
 * 让浏览器自动附加 multipart boundary），无需额外修改。
 */

import { getApiBaseUrl } from '@/config/env';
import { getAccessToken } from '../utils/authStorage';
import { api } from './request';

/** 场景元数据（与后端 SceneSerializer 字段对齐）。 */
export type SceneMeta = {
  /** 对外唯一标识（UUID 字符串） */
  scene_id: string;
  /** 场景名称 */
  name: string;
  /** 缩略图绝对 URL；无缩略图时为 null */
  thumbnail_url: string | null;
  /** bundle ZIP 字节数 */
  bundle_size: number;
  /** 创建时间（格式化字符串） */
  created_at: string;
  /** 最后修改时间（格式化字符串） */
  updated_at: string;
};

/**
 * 通过 API 端点流式下载场景 bundle ZIP，返回 Blob。
 *
 * 使用 /api/scenes/{id}/bundle/ 路径（经 Vite 代理），避免直接 fetch /media/ 产生的跨域问题。
 * 手动附加 Authorization 头，因为 request.ts 只处理 JSON，不适合二进制响应。
 *
 * @param onProgress 下载进度回调，参数为 0-100 的整数；服务端未返回 Content-Length 时不调用。
 */
export async function downloadSceneBundle(
  sceneId: string,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const baseUrl = getApiBaseUrl();
  const path = `/api/scenes/${sceneId}/bundle/`;
  const url = baseUrl ? `${baseUrl}${path}` : path;
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // 有 Content-Length 时用 ReadableStream 追踪实际下载字节数
  const contentLength = res.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!total || !res.body || !onProgress) {
    // 无法追踪进度时直接返回 blob（onProgress 不会被调用）
    return res.blob();
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(99, Math.round((received / total) * 100)));
  }

  // 组装完整 Blob
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([buffer], { type: 'application/zip' });
}

/** 新建场景的参数。 */
export type CreateSceneParams = {
  /** 场景名称（取自 sceneSettings.basic.sceneName） */
  name: string;
  /** 项目包 ZIP Blob */
  bundle: Blob;
  /** 截图缩略图 PNG Blob（可选） */
  thumbnail?: Blob;
};

/** 覆盖更新场景的参数。 */
export type UpdateSceneParams = {
  /** 更新后的场景名称 */
  name?: string;
  /** 新的项目包 ZIP Blob */
  bundle: Blob;
  /** 新的缩略图 PNG Blob（可选） */
  thumbnail?: Blob;
};

/** 列出当前用户的所有场景元数据（按最近修改时间倒序）。 */
export function listScenes(): Promise<SceneMeta[]> {
  return api.get<SceneMeta[]>('/api/scenes/');
}

/**
 * 新建场景，上传 bundle ZIP 与可选的截图缩略图。
 * 使用 multipart/form-data，让浏览器自动处理 boundary。
 */
export function createScene(params: CreateSceneParams): Promise<SceneMeta> {
  const form = new FormData();
  form.append('name', params.name);
  // 为 Blob 指定文件名，后端 FileField 需要有 name 属性
  form.append('bundle', params.bundle, 'bundle.zip');
  if (params.thumbnail) {
    form.append('thumbnail', params.thumbnail, 'thumbnail.png');
  }
  return api.post<SceneMeta>('/api/scenes/', form);
}

/**
 * 覆盖更新已有场景（重新上传 bundle + 可选 thumbnail）。
 * sceneId 为后端 public_id（UUID 字符串）。
 */
export function updateScene(sceneId: string, params: UpdateSceneParams): Promise<SceneMeta> {
  const form = new FormData();
  form.append('name', params.name ?? '');
  form.append('bundle', params.bundle, 'bundle.zip');
  if (params.thumbnail) {
    form.append('thumbnail', params.thumbnail, 'thumbnail.png');
  }
  return api.put<SceneMeta>(`/api/scenes/${sceneId}/`, form);
}

/**
 * 删除场景（同时删除服务端的 bundle 和 thumbnail 文件）。
 * sceneId 为后端 public_id。
 */
export function deleteScene(sceneId: string): Promise<void> {
  return api.delete<void>(`/api/scenes/${sceneId}/`);
}

