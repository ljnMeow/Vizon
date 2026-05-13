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

/**
 * 拖拽操作的 DataTransfer MIME type 标识。
 * 用于在 drag & drop 事件中区分拖拽来源的资源类型，避免与系统/第三方 MIME 冲突。
 */
export const DATA_TRANSFER_KEYS = {
  /** 模型资源拖拽标识 */
  MODEL_MIME: 'application/x-vizon-model-key',
  /** 相机资源拖拽标识 */
  CAMERA_MIME: 'application/x-vizon-camera-key',
  /** 灯光资源拖拽标识 */
  LIGHT_MIME: 'application/x-vizon-light-key',
  /** 场景节点 UUID 拖拽标识（用于场景树排序/移动） */
  SCENE_NODE_UUID_MIME: 'application/x-vizon-scene-node-uuid'
} as const;

export type DataTransferKeyName = keyof typeof DATA_TRANSFER_KEYS;

/** 复用 core 的 key 定义，避免 web 重复声明。 */
export { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS, VIZON_HISTORY_KEYS };

/** 仅 web 侧使用、且被编辑器 UI 与项目包链路共享的材质 userData key。 */
export const WEB_USER_DATA_KEYS = {
  MATERIAL: {
    /** 标记某个贴图槽位已经配置，但当前效果被临时关闭。 */
    TEXTURE_EFFECT_DISABLED: '__vizonTextureEffectDisabled',
    /** 保存禁用态槽位的运行时贴图，便于后续恢复。 */
    TEXTURE_EFFECT_CACHE: '__vizonTextureEffectCache',
    /** 保存槽位到资产 id 的绑定关系，供导出和禁用态恢复使用。 */
    TEXTURE_BINDINGS: '__vizonTextureBindings'
  }
} as const;
