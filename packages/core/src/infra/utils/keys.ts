/**
 * core 全局 key 对照表（集中管理，避免魔法字符串散落）。
 * 规则：
 * - 新增 key 前，优先在本文件登记；
 * - 业务代码中避免直接写魔法字符串。
 */

/**
 * 持久化/配置类 key（通常用于 userData 的配置对象或跨模块约定）。
 */
export const VIZON_STORAGE_KEYS = {
  EFFECTS: '__vizonEffects',
} as const;

/**
 * 历史记录相关 key/prefix。
 */
export const VIZON_HISTORY_KEYS = {
  I18N_PREFIX: '__VIZON_HISTORY_I18N__:',
  OP_PREFIX: '__VIZON_HISTORY_OP__:'
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
    /**
     * RectAreaLight 没有内置 target 对象（不像 Directional/Spot）。
     * 为了让编辑器在“看向点（lookAt）”语义下可编辑/可撤销，这里把目标点持久化到 userData。
     *
     * 值：{ x:number; y:number; z:number }
     */
    RECT_AREA_LIGHT_TARGET: '__vizonRectAreaLightTarget',
    LIGHT_TARGET_HANDLE: '__vizonLightTargetHandle',
    LIGHT_TARGET_LIGHT_UUID: '__vizonLightTargetLightUuid',
    LIGHT_TARGET_LIGHT_TYPE: '__vizonLightTargetLightType',
  },

  /** 运行时 helper 引用 */
  HELPERS: {
    CAMERA_HELPER: '__vizonCameraHelper',
    LIGHT_HELPER: '__vizonLightHelper',
    SHADOW_HELPER_VISIBLE: '__vizonShadowHelperVisible',
    BORDER_LINE_HELPER: '__vizonBorderLineHelper',
    LIGHT_TARGET_HANDLE: '__vizonLightTargetHandle',
  },

  /** 导线（conduit）编辑态数据 */
  CONDUIT: {
    POINTS_LOCAL: '__vizonConduitPointsLocal',
    POINTS_LOCAL_VERSION: '__vizonConduitPointsLocalVersion',
    EDIT_ENABLED: '__vizonConduitEditEnabled',
    NODE_META: '__vizonConduitNode',
  },
} as const;

