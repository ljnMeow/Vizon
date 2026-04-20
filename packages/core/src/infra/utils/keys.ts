/**
 * core 全局 key 对照表（集中管理，避免魔法字符串散落）。
 */

/**
 * 持久化/配置类 key（通常用于 userData 的配置对象或跨模块约定）。
 */
export const VIZON_STORAGE_KEYS = {
  EFFECTS: '__vizonEffects',
} as const;

/**
 * Object3D.userData 上的业务 key（按语义分类）。
 */
export const VIZON_USER_DATA_KEYS = {
  /** 通用交互/可见性标记 */
  COMMON: {
    NON_SELECTABLE: '__vizonNonSelectable',
    NON_PICKABLE: '__vizonNonPickable',
    DYNAMIC: '__vizonDynamic',
    PICK_TARGET: '__vizonPickTarget',
    HIDE_IN_EDITOR: 'hideInEditor',
  },

  /** 默认资源（模型/灯光/相机）元信息 */
  DEFAULTS: {
    DEFAULT_MODEL: '__vizonDefaultModel',
    DEFAULT_MODEL_KEY: '__vizonDefaultModelKey',
    DEFAULT_LIGHT: '__vizonDefaultLight',
    DEFAULT_LIGHT_KEY: '__vizonDefaultLightKey',
    DEFAULT_CAMERA: '__vizonDefaultCamera',
    DEFAULT_CAMERA_KEY: '__vizonDefaultCameraKey',
  },

  /** 运行时 helper 引用 */
  HELPERS: {
    CAMERA_HELPER: '__vizonCameraHelper',
    LIGHT_HELPER: '__vizonLightHelper',
    BORDER_LINE_HELPER: '__vizonBorderLineHelper',
  },

  /** 导线（conduit）编辑态数据 */
  CONDUIT: {
    POINTS_LOCAL: '__vizonConduitPointsLocal',
    POINTS_LOCAL_VERSION: '__vizonConduitPointsLocalVersion',
    EDIT_ENABLED: '__vizonConduitEditEnabled',
    NODE_META: '__vizonConduitNode',
  },
} as const;

