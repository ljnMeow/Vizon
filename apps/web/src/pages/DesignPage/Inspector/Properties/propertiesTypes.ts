/** 三维坐标轴 key */
export type AxisKey = 'x' | 'y' | 'z';

/** 通用三维向量结构 */
export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

/** 当前选中对象的位移 / 旋转 / 缩放状态 */
export type TransformState = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

/** 阴影与裁剪相关状态 */
export type ShadowState = {
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  canCastShadow: boolean;
  canReceiveShadow: boolean;
  canFrustumCulled: boolean;
};

/** 可见性、可拾取性与冻结状态 */
export type VisibilityPickFreezeState = {
  visible: boolean;
  pickable: boolean;
  frozen: boolean;
  locked: boolean;
  canPickable: boolean;
  canFreeze: boolean;
  canLock: boolean;
};

/** 透明度编辑状态 */
export type OpacityState = {
  opacity: number;
  canOpacity: boolean;
};

/** 渲染顺序编辑状态 */
export type RenderOrderState = {
  renderOrder: number;
  canRenderOrder: boolean;
};

export type PerspectiveCameraParamsState = {
  fov: number;
  near: number;
  far: number;
  zoom: number;
  canEdit: boolean;
};

export type OrthographicCameraParamsState = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  zoom: number;
  canEdit: boolean;
};

export type LightColorState = {
  color: string;
  canColor: boolean;
};

export type LightIntensityState = {
  intensity: number;
  canIntensity: boolean;
};

export type LightTargetState = {
  target: Vec3;
  canEdit: boolean;
};

export type PointLightParamsState = {
  distance: number;
  decay: number;
  canEdit: boolean;
};

export type SpotLightParamsState = {
  distance: number;
  angle: number;
  penumbra: number;
  decay: number;
  focus: number;
  target: Vec3;
  canEdit: boolean;
};

export type HemisphereLightParamsState = {
  groundColor: string;
  canEdit: boolean;
};

export type RectAreaLightParamsState = {
  width: number;
  height: number;
  target: Vec3;
  canEdit: boolean;
};

export type DirectionalLightShadowState = {
  intensity: number;
  bias: number;
  normalBias: number;
  radius: number;
  mapSizeWidth: number;
  mapSizeHeight: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  helperVisible: boolean;
  canEdit: boolean;
};

export type SpotLightShadowState = {
  intensity: number;
  bias: number;
  normalBias: number;
  radius: number;
  mapSizeWidth: number;
  mapSizeHeight: number;
  near: number;
  far: number;
  fov: number;
  helperVisible: boolean;
  canEdit: boolean;
};

export type PointLightShadowState = {
  intensity: number;
  bias: number;
  normalBias: number;
  radius: number;
  mapSizeWidth: number;
  mapSizeHeight: number;
  near: number;
  far: number;
  helperVisible: boolean;
  canEdit: boolean;
};

/** 当前选中对象的基础信息 */
export type SelectedObjectInfo = {
  uuid: string;
  type: string;
  name: string;
} | null;
