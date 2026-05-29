/**
 * 模型资源管理 API 客户端。
 *
 * 封装与服务端 /api/models3d/ 系列端点的通信，
 * 包括模型和分类的 CRUD。
 */

import { getApiBaseUrl } from '@/config/env';
import { getAccessToken } from '../utils/authStorage';
import { api, uploadWithProgress } from './request';
import {
  DEFAULT_LIST_PAGE_SIZE,
  type ListPageResult,
  fetchListPage,
} from './listPagination';

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

/** 分页拉取模型分类。 */
export function fetchModel3dCategoriesPage(
  page: number,
  pageSize: number = DEFAULT_LIST_PAGE_SIZE
): Promise<ListPageResult<Model3dCategory>> {
  return fetchListPage<Model3dCategory>('/api/models3d/categories/', page, undefined, pageSize);
}

/** 拉取第一页分类（兼容旧调用）。 */
export async function listModel3dCategories(): Promise<Model3dCategory[]> {
  const page = await fetchModel3dCategoriesPage(1);
  return page.results;
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

/** 分页拉取模型列表；支持按分类和名称搜索筛选。 */
export function fetchModel3dsPage(
  page: number,
  categoryId?: string,
  pageSize: number = DEFAULT_LIST_PAGE_SIZE,
  search?: string,
): Promise<ListPageResult<Model3dMeta>> {
  const params: Record<string, string | undefined> = {};
  if (categoryId) params.category = categoryId;
  if (search) params.search = search;
  return fetchListPage<Model3dMeta>(
    '/api/models3d/',
    page,
    Object.keys(params).length > 0 ? params : undefined,
    pageSize
  );
}

/** 拉取某分类下的全部模型（专用接口，响应 data 为数组，非 { count, results }）。 */
export async function listModel3dsByCategory(categoryId: string): Promise<Model3dMeta[]> {
  const data = await api.get<Model3dMeta[]>(
    `/api/models3d/categories/${encodeURIComponent(categoryId)}/models/`
  );
  return Array.isArray(data) ? data : [];
}

/** 拉取模型列表（指定分类时拉全量，否则仅第一页）。 */
export async function listModel3ds(categoryId?: string): Promise<Model3dMeta[]> {
  if (categoryId) {
    return listModel3dsByCategory(categoryId);
  }
  const page = await fetchModel3dsPage(1);
  return page.results;
}

/** 新建模型（带上传进度，自动处理 401 token 刷新重放）。 */
export function uploadModel3dWithProgress(
  params: CreateModel3dParams,
  onProgress?: (percent: number) => void
): Promise<Model3dMeta> {
  return uploadWithProgress<Model3dMeta>('/api/models3d/', buildFormData(params), onProgress);
}

function buildFormData(params: CreateModel3dParams): FormData {
  const form = new FormData();
  if (params.name) form.append('name', params.name);
  form.append('file', params.file, params.file instanceof File ? params.file.name : 'model');
  if (params.thumbnail) form.append('thumbnail', params.thumbnail, 'thumbnail.png');
  if (params.category) form.append('category', params.category);
  return form;
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
    const token = getAccessToken();
    const tokenQs = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${wsProtocol}//${wsHost}/ws/models3d/${modelId}/compression/${tokenQs}`;

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
