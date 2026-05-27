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
    NON_DELETABLE: '__vizonNonDeletable',
    LOCKED: '__vizonLocked',
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
    /**
     * DirectionalLight / SpotLight 的 target 位置持久化快照。
     * three.js 的 light.target 是一个 Object3D，但它不一定会被挂载到 scene，
     * 导致导出/导入后 target 位置难以稳定回显。这里用纯数据兜底。
     *
     * 值：{ x:number; y:number; z:number }
     */
    LIGHT_TARGET: '__vizonLightTarget',
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
    // 注意：DEFAULTS.LIGHT_TARGET_HANDLE 用于在 handle 自身上打“这是 target handle”的标记（boolean）
    // 这里用于在 light.userData 上存放“handle 引用”（Object3D）。必须使用不同 key，避免类型冲突。
    LIGHT_TARGET_HANDLE: '__vizonLightTargetHandleRef',
  },

  /** 导线（conduit）编辑态数据 */
  CONDUIT: {
    POINTS_LOCAL: '__vizonConduitPointsLocal',
    POINTS_LOCAL_VERSION: '__vizonConduitPointsLocalVersion',
    EDIT_ENABLED: '__vizonConduitEditEnabled',
    NODE_META: '__vizonConduitNode',
  },

  /** 模型自动缩放元数据 */
  AUTOSCALE: {
    ORIGINAL_MAX_DIM: '__vizonAutoscaleOriginalMaxDim',
    SCALE_FACTOR: '__vizonAutoscaleScaleFactor',
    APPLIED: '__vizonAutoscaleApplied',
  },
} as const;

