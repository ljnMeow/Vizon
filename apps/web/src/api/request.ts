/**
 * Web 端统一请求工具（fetch 封装）。
 *
 * 设计目标：
 * - 与后端 DRF 的统一返回格式对齐（见 server: `config/api.py` 的 Renderer）
 * - 让业务代码只处理“成功数据”或捕获 `ApiError`，而不是到处写 status/code 分支
 * - 统一鉴权头（Bearer Token）与错误结构，便于 toast/日志/埋点
 */

import { getApiBaseUrl } from '@/config/env';
import { clearAuthTokens, clearUserInfo, getAccessToken, getRefreshToken, setAuthTokens } from '../utils/authStorage';
import { STORAGE_KEYS } from '../utils/keys';
import type { Locale } from '../hooks/useLocale';
import { appMessages } from '../i18n/messages';

export type ApiEnvelope<T> = {
  /**
   * 业务码：
   * - 0 表示成功
   * - 非 0 表示失败（当前后端实现通常用 HTTP status 作为 code）
   */
  code: number;
  /** 给人看的简短说明（可直接 toast） */
  message: string;
  /** 成功时的业务数据 */
  data?: T;
  /** 失败时的错误详情（字段错误/调试信息等） */
  errors?: unknown;
};

export class ApiError extends Error {
  /** HTTP 状态码（如 400/401/403/500） */
  readonly httpStatus?: number;
  /** 后端 envelope 里的业务码（成功为 0） */
  readonly code?: number;
  /** 后端 envelope 的 errors（或非 envelope 情况下的原始响应体） */
  readonly errors?: unknown;

  constructor(message: string, opts?: { httpStatus?: number; code?: number; errors?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.httpStatus = opts?.httpStatus;
    this.code = opts?.code;
    this.errors = opts?.errors;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  /**
   * 请求体：
   * - 普通对象会被 JSON.stringify，并自动加 `Content-Type: application/json`
   * - FormData 会原样透传（用于上传文件等）
   */
  body?: unknown;
  /**
   * 是否自动携带鉴权头：
   * - 默认 true（会从 localStorage 取 token 并设置 `Authorization: Bearer ...`）
   * - 登录/刷新 token 等接口可传 `{ auth: false }`
   */
  auth?: boolean;
};

type InternalRequestOptions = RequestOptions & {
  /** 内部标记：避免重试/刷新递归 */
  _skipRefresh?: boolean;
  /** 内部标记：避免无限重试 */
  _retriedAfterRefresh?: boolean;
};

function resolveBaseUrl() {
  /**
   * API Base URL：
   * - 通过 Vite 环境变量 `VITE_API_BASE_URL` 配置
   * - 未配置时返回空字符串，意味着使用同域相对路径（例如 `/api/...`）
   */
  return getApiBaseUrl();
}

function joinUrl(base: string, path: string) {
  if (!base) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function isEnvelope(x: unknown): x is ApiEnvelope<unknown> {
  return !!x && typeof x === 'object' && 'code' in (x as any) && 'message' in (x as any);
}

/**
 * 从“非 envelope”的错误响应里尽量提取一条可读 message。
 * 主要兼容 DRF 的常见形态：
 * - {"detail": "..."}
 * - {"field": ["..."]} / {"field": "..."}
 * - ["..."]
 */
function extractMessage(payload: unknown): string {
  if (!payload) return 'error';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const m = extractMessage(item);
      if (m) return m;
    }
    return 'error';
  }
  if (typeof payload === 'object') {
    const anyPayload = payload as any;
    if (anyPayload.detail) return String(anyPayload.detail);
    for (const v of Object.values(anyPayload)) {
      const m = extractMessage(v);
      if (m) return m;
    }
  }
  return 'error';
}

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
  account_id: string;
};

function isTokenExpiredLike(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  const httpStatus = err.httpStatus ?? err.code;
  if (httpStatus !== 401) return false;
  const msg = (err.message || '').toLowerCase();
  // 后端 jwt.py：ExpiredSignatureError -> "token 已过期"
  // 保险起见也覆盖“无效”等同类鉴权错误
  return (
    msg.includes('token') &&
    (msg.includes('过期') || msg.includes('expired') || msg.includes('无效') || msg.includes('invalid'))
  );
}

let refreshingPromise: Promise<void> | null = null;

async function refreshTokens(baseUrl: string) {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError('缺少 refresh_token', { httpStatus: 401, code: 401 });

  // 直接用 fetch 调 refresh，避免与 auth.ts 形成循环依赖
  const url = joinUrl(baseUrl, '/api/auth/refresh/');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const rawText = await res.text();
  const parsed = rawText
    ? isJson
      ? (() => {
          try {
            return JSON.parse(rawText) as unknown;
          } catch {
            return rawText;
          }
        })()
      : rawText
    : null;

  if (isEnvelope(parsed)) {
    if (parsed.code === 0) {
      const data = parsed.data as RefreshResponse | undefined;
      if (!data?.access_token || !data?.refresh_token) {
        throw new ApiError('refresh 响应缺少 token', { httpStatus: res.status, code: parsed.code, errors: parsed.errors });
      }
      setAuthTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
      return;
    }
    throw new ApiError(parsed.message || 'refresh failed', { httpStatus: res.status, code: parsed.code, errors: parsed.errors });
  }

  if (res.ok) {
    const data = parsed as any;
    if (!data?.access_token || !data?.refresh_token) {
      throw new ApiError('refresh 响应缺少 token', { httpStatus: res.status, errors: parsed });
    }
    setAuthTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
    return;
  }

  throw new ApiError(extractMessage(parsed) || res.statusText || 'refresh failed', { httpStatus: res.status, errors: parsed });
}

async function ensureRefreshed(baseUrl: string) {
  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      try {
        await refreshTokens(baseUrl);
      } finally {
        refreshingPromise = null;
      }
    })();
  }
  return refreshingPromise;
}

/**
 * 通用的"401 → 刷新 token → 重放一次"包装器。
 *
 * 适用于二进制下载、XHR 上传等无法走 request() 的特殊请求路径。
 * 调用方传入 doRequest（带当前 token 执行一次请求）和 classifier
 * （判断错误是否属于"token 过期"，需要刷新后重放）。
 *
 * 刷新失败时统一走 logoutToLoginAfterNotice 跳转登录。
 */
export async function withAuthRetry<T>(
  doRequest: () => Promise<T>,
  classifier: (err: unknown) => boolean = isTokenExpiredLike
): Promise<T> {
  const baseUrl = resolveBaseUrl();
  try {
    return await doRequest();
  } catch (err) {
    if (!classifier(err)) throw err;
    try {
      await ensureRefreshed(baseUrl);
    } catch {
      await logoutToLoginAfterNotice();
      return await new Promise<T>(() => undefined);
    }
    // 刷新成功 → 重放一次
    return doRequest();
  }
}

/**
 * 把 XHR/fetch 响应文本解析为 envelope 或原始值。
 * 与 requestOnce 内部逻辑保持一致，供 XHR 上传等场景复用。
 */
function parseResponseBody(rawText: string, contentType: string): unknown {
  const isJson = contentType.includes('application/json');
  if (!rawText) return null;
  if (!isJson) return rawText;
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

/**
 * 通用的 XHR 上传（带进度），自动处理 envelope 和 401 token 刷新。
 *
 * 与 api.post(formData) 行为对齐，但额外暴露 onProgress 回调。
 * 复用 withAuthRetry 处理 token 过期。
 */
export function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  method: 'POST' | 'PUT' = 'POST'
): Promise<T> {
  const doOnce = (): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const baseUrl = resolveBaseUrl();
      const url = joinUrl(baseUrl, path);
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);

      const token = getAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.onload = () => {
        const rawText = xhr.responseText;
        const contentType = xhr.getResponseHeader('content-type') ?? '';
        const parsed = parseResponseBody(rawText, contentType);

        if (isEnvelope(parsed)) {
          if (parsed.code === 0) {
            resolve(parsed.data as T);
          } else {
            reject(new ApiError(parsed.message || 'error', {
              httpStatus: xhr.status,
              code: parsed.code,
              errors: parsed.errors,
            }));
          }
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as T);
        } else {
          reject(new ApiError(extractMessage(parsed) || xhr.statusText || 'error', {
            httpStatus: xhr.status,
            errors: parsed,
          }));
        }
      };

      xhr.onerror = () => reject(new ApiError('Network error', { httpStatus: 0 }));
      xhr.send(formData);
    });

  return withAuthRetry(doOnce);
}

function resolveAuthInvalidNoticeText() {
  const fallback: Locale = 'zh-CN';
  if (typeof window === 'undefined') return appMessages[fallback].auth.sessionInvalidToast;
  const raw = (window.localStorage.getItem(STORAGE_KEYS.LOCALE) || '').trim();
  const locale: Locale = raw === 'en-US' || raw === 'zh-CN' ? raw : fallback;
  return appMessages[locale].auth.sessionInvalidToast;
}

async function logoutToLoginAfterNotice() {
  try {
    // 先清理本地登录态，避免后续请求继续带旧 token
    clearAuthTokens();
    clearUserInfo();

    // 只在“refresh 失败”时提示；正常的 401/过期会先静默 refresh
    try {
      const mod = await import('../components/GlobalMessage');
      await mod.message.error(resolveAuthInvalidNoticeText(), { durationMs: 1200 });
    } catch {
      // 如果全局 message 尚未初始化（例如 Provider 未挂载），用一个短暂停顿兜底
      await new Promise((r) => setTimeout(r, 800));
    }
  } finally {
    if (typeof window !== 'undefined') window.location.replace('/login');
  }
}

/**
 * 发起请求并返回“业务数据”（T）。
 *
 * 返回值约定：
 * - 若后端返回 envelope 且 `code===0`：返回 `data`
 * - 若后端返回 envelope 且 `code!==0`：抛出 `ApiError`（含 code/errors/httpStatus）
 * - 若后端未返回 envelope：
 *   - res.ok：返回解析后的 body
 *   - res !ok：抛出 `ApiError`（errors 为原始 body）
 */
async function requestOnce<T>(path: string, opts: InternalRequestOptions = {}): Promise<T> {
  const baseUrl = resolveBaseUrl();
  const url = joinUrl(baseUrl, path);

  const headers = new Headers(opts.headers);
  headers.set('Accept', 'application/json');

  // 默认携带 token；登录/刷新等接口应显式关闭
  const authEnabled = opts.auth !== false;
  if (authEnabled) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { ...opts, headers, body });

  // 始终先读成 text，再按 content-type/JSON 解析；这样能兼容空 body 或非 JSON 返回
  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const rawText = await res.text();

  const parsed = rawText
    ? isJson
      ? (() => {
          try {
            return JSON.parse(rawText) as unknown;
          } catch {
            return rawText;
          }
        })()
      : rawText
    : null;

  // 兼容后端统一包裹格式 {code,message,data/errors}
  if (isEnvelope(parsed)) {
    if (parsed.code === 0) return parsed.data as T;
    throw new ApiError(parsed.message || 'error', {
      httpStatus: res.status,
      code: parsed.code,
      errors: parsed.errors
    });
  }

  // 兼容未包裹（例如某些中间件/网关返回）
  if (res.ok) return parsed as T;

  throw new ApiError(extractMessage(parsed) || res.statusText || 'error', {
    httpStatus: res.status,
    errors: parsed
  });
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const internal: InternalRequestOptions = opts as InternalRequestOptions;
  const authEnabled = internal.auth !== false;
  const baseUrl = resolveBaseUrl();

  try {
    return await requestOnce<T>(path, internal);
  } catch (err) {
    const shouldTryRefresh =
      authEnabled &&
      !internal._skipRefresh &&
      !internal._retriedAfterRefresh &&
      path !== '/api/auth/refresh/' &&
      isTokenExpiredLike(err);

    if (!shouldTryRefresh) throw err;

    try {
      await ensureRefreshed(baseUrl);
    } catch (_e) {
      // refresh 失败：提示后跳转登录（等待提示消失）
      await logoutToLoginAfterNotice();
      // 上面会 replace 跳转；这里返回一个永不 resolve 的 Promise，避免调用方继续弹错误 toast
      return await new Promise<T>(() => undefined);
    }

    // refresh 成功：重放原请求（仅一次）
    return requestOnce<T>(path, { ...internal, _retriedAfterRefresh: true });
  }
}

/**
 * 常用 HTTP 方法快捷封装。
 *
 * 使用示例：
 * - const me = await api.get<User>('/api/me/')
 * - const created = await api.post<Item>('/api/items/', { name: 'x' })
 */
export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' })
};

