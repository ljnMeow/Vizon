import { VIZON_HISTORY_KEYS, VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from 'vizon-3d-core';

/**
 * Web 侧 key 集中管理文件。
 *
 * 规则：
 * - 新增 key 前，优先在本文件登记；
 * - 业务代码中避免直接写 key 字符串；
 * - core 侧已有 key（userData/storage/history）优先复用 core 导出。
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

export const DATA_TRANSFER_KEYS = {
  MODEL_MIME: 'application/x-vizon-model-key',
  CAMERA_MIME: 'application/x-vizon-camera-key',
  LIGHT_MIME: 'application/x-vizon-light-key',
  SCENE_NODE_UUID_MIME: 'application/x-vizon-scene-node-uuid'
} as const;

export type DataTransferKeyName = keyof typeof DATA_TRANSFER_KEYS;

/** 复用 core 的 key 定义，避免 web 重复声明。 */
export { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS, VIZON_HISTORY_KEYS };

/** 仅 web 本地使用的 userData key。 */
export const WEB_USER_DATA_KEYS = {
  MATERIAL: {
    TEXTURE_EFFECT_DISABLED: '__vizonTextureEffectDisabled'
  }
} as const;
