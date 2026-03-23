import { api } from './request';
import { getRefreshToken, setAuthTokens, setUserInfo } from '../utils/authStorage';

/**
 * 认证相关 API。
 *
 * 注意：
 * - 本项目后端登录接口返回的是统一 envelope 包裹后的 `data`，
 *   `api.post<LoginResponse>` 会直接返回 data（即下面的结构）。
 * - 字段命名（access_token/refresh_token）沿用后端返回的 snake_case，
 *   避免在这里做隐式映射，降低调试成本。
 */
export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  account_id: string;
  user: unknown;
};

/**
 * 登录：
 * - 关闭自动鉴权头（auth: false）
 * - 登录成功后写入本地 token，后续请求会自动带 Bearer token
 */
export async function login(params: { username: string; password: string }) {
  const data = await api.post<LoginResponse>('/api/auth/login/', params, { auth: false });
  setAuthTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
  setUserInfo(data.user);
  return data;
}

export type IsLoginResponse = {
  is_login: boolean;
  account_id?: string;
  user?: unknown;
};

/**
 * 判断当前登录状态：
 * - 若本地有 access token，会自动带上 Authorization
 * - 后端无论是否登录都返回 200（is_login true/false）
 */
export async function isLogin(opts?: { signal?: AbortSignal }) {
  return api.get<IsLoginResponse>('/api/auth/is-login/', opts);
}

export type LogoutResponse = { logged_out: boolean };

export async function logout() {
  const refreshToken = getRefreshToken();
  // 后端 logout 设计为幂等：不传 refresh_token 也会 200
  return api.post<LogoutResponse>('/api/auth/logout/', refreshToken ? { refresh_token: refreshToken } : {});
}

export type RefreshTokenResponse = {
  access_token: string;
  refresh_token: string;
  account_id: string;
};

/**
 * 手动刷新 token（通常不需要手动调用，`request.ts` 已在 401 时自动 refresh 并重放请求）。
 */
export async function refreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('缺少 refresh_token');
  const data = await api.post<RefreshTokenResponse>(
    '/api/auth/refresh/',
    { refresh_token: refreshToken },
    { auth: false }
  );
  setAuthTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
  return data;
}

