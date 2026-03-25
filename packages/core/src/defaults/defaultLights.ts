/**
 * 默认灯光工厂（`defaults/`）：供资产面板「拖入默认光」时调用。
 *
 * 约定：
 * - `userData.__vizonDefaultLight` 标记为 core 预设，便于日后批量升级/过滤；
 * - 需要可视化辅助的灯在 `userData.__vizonLightHelper` 存引用，由 `ThreeEditor.add` 挂到 scene；
 * - helper 上 `__vizonPickTarget` 指向真实 Light，拾取时选中灯而非线框网格。
 */
import * as THREE from 'three';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

/** 可创建的灯光种类枚举（与 UI 列表 key 对齐） */
export type DefaultLightKey =
  | 'ambientLight'
  | 'directionalLight'
  | 'pointLight'
  | 'spotLight'
  | 'hemisphereLight'
  | 'rectAreaLight';

/** 与 SceneSettings 中向量字段风格一致的 Plain 对象，避免 editor 侧强依赖 Vector3 */
export type Vec3Like = { x: number; y: number; z: number };

/** 工厂可选参数：覆盖名称、位置、目标点、是否生成 helper */
export type CreateDefaultLightOptions = {
  position?: Vec3Like;
  target?: Vec3Like;
  name?: string;
  /**
   * 是否为该灯光创建并挂载 helper。
   * @default true
   */
  helperEnabled?: boolean;
};

/** UI 元数据：下拉或图标列表用 */
export type DefaultLightMeta = {
  key: DefaultLightKey;
  label: string;
};

/** 内置顺序即面板默认排列顺序 */
export const defaultLights: DefaultLightMeta[] = [
  { key: 'ambientLight', label: 'ambientLight' },
  { key: 'directionalLight', label: 'directionalLight' },
  { key: 'pointLight', label: 'pointLight' },
  { key: 'spotLight', label: 'spotLight' },
  { key: 'hemisphereLight', label: 'hemisphereLight' },
  { key: 'rectAreaLight', label: 'rectAreaLight' }
];

/** 所有灯光 helper 的统一线框色（高对比暖色，便于深灰网格背景辨认） */
const DEFAULT_LIGHT_HELPER_COLOR = 0xffb703;

/**
 * RectAreaLight 着色器依赖全局 uniform 注册表；进程级只需 init 一次。
 * 用模块级布尔防止重复 init（虽通常无害，但避免无意义工作）。
 */
let rectAreaUniformsInited = false;

/**
 * 给任意 Light 写上元数据与可选 position；不创建 helper。
 */
function applyCommon(light: THREE.Light, key: DefaultLightKey, opts?: CreateDefaultLightOptions) {
  light.name = opts?.name ?? light.type; // 未起名则用 three 类型名
  (light.userData as any).__vizonDefaultLight = true; // 业务标记：预设灯
  (light.userData as any).__vizonDefaultLightKey = key; // 记录创建枚举，便于导入导出
  if (opts?.position) {
    light.position.set(opts.position.x, opts.position.y, opts.position.z);
  }
}

/** 解析「光看向哪里」：未传 target 时默认世界原点 */
function getTarget(opts?: CreateDefaultLightOptions): THREE.Vector3 {
  const target = opts?.target ?? { x: 0, y: 0, z: 0 };
  return new THREE.Vector3(target.x, target.y, target.z);
}

/**
 * 统一配置灯光 helper 的材质与用户数据：
 * - 不参与结构树、不可直接选中线框（由 pickTarget 映射到灯）；
 * - depthTest 关闭减少 Z-fighting，略透明避免完全遮挡模型。
 */
function configureLightHelper(helper: THREE.Object3D, light: THREE.Light) {
  helper.userData.__vizonNonSelectable = true; // helper 本身非业务节点
  helper.userData.hideInEditor = true; // 结构面板隐藏
  helper.userData.__vizonPickTarget = light; // 射线命中 helper 时选中灯

  const mat = (helper as any).material as THREE.Material | THREE.Material[] | undefined;
  const materials = mat ? (Array.isArray(mat) ? mat : [mat]) : [];
  for (const m of materials) {
    if ('color' in m && (m as any).color?.set) {
      (m as any).color.setHex(DEFAULT_LIGHT_HELPER_COLOR); // 线框颜色
    }
    m.depthTest = false; // 始终画在模型之上（editor 可读性优先）
    m.depthWrite = false;
    (m as any).toneMapped = false; // 不受曝光影响，亮度稳定
    m.transparent = true;
    m.opacity = 0.9;
    m.needsUpdate = true;
  }
  helper.renderOrder = 8_000; // 较晚绘制，减少被透明物体误挡
}

/**
 * 按 key 创建一盏合理的默认灯；调用方需自行 `scene.add` 或走 `ThreeEditor.add`。
 */
export function createDefaultLight(key: DefaultLightKey, opts?: CreateDefaultLightOptions) {
  const helperEnabled = opts?.helperEnabled ?? true; // 默认带 helper，便于编辑 aim

  if (key === 'ambientLight') {
    const light = new THREE.AmbientLight(0xffffff, 0.6); // 环境光无方向、无阴影
    applyCommon(light, key, opts);
    return light;
  }

  if (key === 'directionalLight') {
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(4, 6, 4); // 经典斜上方主光
    applyCommon(light, key, opts);
    light.target.position.copy(getTarget(opts)); // Directional 需 target 才有朝向语义
    light.target.updateMatrixWorld();
    if (helperEnabled) {
      const helper = new THREE.DirectionalLightHelper(light, 1.2, DEFAULT_LIGHT_HELPER_COLOR);
      configureLightHelper(helper, light);
      (light.userData as any).__vizonLightHelper = helper; // editor 取出并 scene.add
    }
    return light;
  }

  if (key === 'pointLight') {
    const light = new THREE.PointLight(0xffffff, 1.0, 0, 2); // distance 0 表示无限衰减距离（three 语义）
    light.position.set(0, 2, 0);
    applyCommon(light, key, opts);
    if (helperEnabled) {
      const helper = new THREE.PointLightHelper(light, 0.45, DEFAULT_LIGHT_HELPER_COLOR);
      configureLightHelper(helper, light);
      (light.userData as any).__vizonLightHelper = helper;
    }
    return light;
  }

  if (key === 'spotLight') {
    // 锥角较窄、范围有限，避免 SpotLightHelper 几何巨大挡满视口
    const light = new THREE.SpotLight(0xffffff, 1.2, 12, Math.PI / 10, 0.2, 1);
    light.position.set(2, 4, 2);
    applyCommon(light, key, opts);
    light.target.position.copy(getTarget(opts));
    light.target.updateMatrixWorld();
    if (helperEnabled) {
      const helper = new THREE.SpotLightHelper(light, DEFAULT_LIGHT_HELPER_COLOR);
      configureLightHelper(helper, light);
      (light.userData as any).__vizonLightHelper = helper;
    }
    return light;
  }

  if (key === 'hemisphereLight') {
    const light = new THREE.HemisphereLight(0xb1e1ff, 0x444422, 1.0); // 天光蓝 + 地面褐
    light.position.set(0, 3, 0);
    applyCommon(light, key, opts);
    if (helperEnabled) {
      const helper = new THREE.HemisphereLightHelper(light, 0.9, DEFAULT_LIGHT_HELPER_COLOR);
      configureLightHelper(helper, light);
      (light.userData as any).__vizonLightHelper = helper;
    }
    return light;
  }

  // —— RectAreaLight：必须在使用前初始化 RectAreaLightUniformsLib ——
  if (!rectAreaUniformsInited) {
    RectAreaLightUniformsLib.init(); // 注册 shader 所需 uniform
    rectAreaUniformsInited = true;
  }
  const light = new THREE.RectAreaLight(0xffffff, 4.0, 2.5, 2.5); // 强度与宽高为经验默认值
  light.position.set(2, 3, 2);
  applyCommon(light, key, opts);
  light.lookAt(getTarget(opts)); // 面光法线指向 target
  if (helperEnabled) {
    const helper = new RectAreaLightHelper(light, DEFAULT_LIGHT_HELPER_COLOR);
    configureLightHelper(helper, light);
    (light.userData as any).__vizonLightHelper = helper;
  }
  return light;
}
