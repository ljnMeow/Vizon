/**
 * 客户端认证信息与用户信息的本地存储封装。
 *
 * 设计思路：
 * - 统一管理 access_token / refresh_token / userInfo 的 localStorage key 与读写逻辑
 * - 让调用方只关心“读/写 token 或用户信息”，而不关心具体存储实现
 * - 后续如果需要从 localStorage 迁移到 cookie / IndexedDB，只需改动本模块
 */
import { STORAGE_KEYS } from './storageKeys';

const ACCESS_TOKEN_KEY = STORAGE_KEYS.ACCESS_TOKEN;
const REFRESH_TOKEN_KEY = STORAGE_KEYS.REFRESH_TOKEN;
const USER_INFO_KEY = STORAGE_KEYS.USER_INFO;

/**
 * 写入 access / refresh token。
 * - refreshToken 为可选：部分场景（仅下发 access_token）可以不传
 */
export function setAuthTokens(tokens: { accessToken: string; refreshToken?: string }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

/**
 * 清空本地 token：
 * - 用于退出登录 / 401 强制下线等场景
 */
export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * 获取 access token：
 * - 主要用于给请求封装自动拼接 Authorization 头
 */
export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * 获取 refresh token：
 * - 用于调用刷新 token / 注销接口等
 */
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * 写入用户信息：
 * - userInfo 结构由上层决定（通常为后端返回的 user 字段）
 * - 使用 JSON 序列化存储
 */
export function setUserInfo(userInfo: unknown) {
  try {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo ?? null));
  } catch {
    // 忽略写入失败（例如存储空间满 / 隐私模式），不影响主流程
  }
}

/**
 * 读取用户信息：
 * - 反序列化为调用方期望的泛型类型 T
 * - 若不存在或解析失败，则返回 null
 */
export function getUserInfo<T = unknown>(): T | null {
  const raw = localStorage.getItem(USER_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 清空用户信息：
 * - 通常与清理 token 一起调用
 */
export function clearUserInfo() {
  localStorage.removeItem(USER_INFO_KEY);
}

