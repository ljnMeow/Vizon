/**
 * 全局统一维护的本地存储 key 对照表。
 *
 * 设计目的：
 * - 避免在各处散落硬编码字符串，降低拼写错误风险
 * - 统一命名规范，便于全局搜索与重构
 * - 新增存储项时，先在这里登记，再在对应模块中使用
 */
export const STORAGE_KEYS = {
  /** 认证：access token */
  ACCESS_TOKEN: 'vizon_access_token',
  /** 认证：refresh token */
  REFRESH_TOKEN: 'vizon_refresh_token',
  /** 认证：当前登录用户信息 */
  USER_INFO: 'userInfo',

  /** 登录页：记住账号名 */
  REMEMBER_ACCOUNT: 'vizon_remember_account',

  /** 全局：语言偏好 */
  LOCALE: 'app-locale',
  /** 全局：主题偏好（light/dark） */
  THEME: 'app-theme'
} as const;

export type StorageKeyName = keyof typeof STORAGE_KEYS;

/**
 * 非 localStorage 的“本地键/常量”对照表：
 * - 例如：拖拽/复用交互的 `dataTransfer` key
 * - 统一集中管理，避免硬编码字符串散落在各处
 */
export const DATA_TRANSFER_KEYS = {
  MODEL_MIME: 'application/x-vizon-model-key',
  CAMERA_MIME: 'application/x-vizon-camera-key',
  LIGHT_MIME: 'application/x-vizon-light-key'
} as const;

export type DataTransferKeyName = keyof typeof DATA_TRANSFER_KEYS;

