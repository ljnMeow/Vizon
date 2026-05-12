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
import { forEachMaterial, type Vec3Like, getVizonUserData, VIZON_USER_DATA_KEYS } from '../infra/utils';
import { DEFAULT_LIGHT_HELPER_COLOR, DEFAULT_LIGHTS } from './registry';

/** 可创建的灯光种类枚举（与 UI 列表 key 对齐） */
export type DefaultLightKey =
  | 'ambientLight'
  | 'directionalLight'
  | 'pointLight'
  | 'spotLight'
  | 'hemisphereLight'
  | 'rectAreaLight';

export type { Vec3Like };

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
  ...DEFAULT_LIGHTS
];

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
  (light.userData as any)[VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_LIGHT] = true; // 业务标记：预设灯
  (light.userData as any)[VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_LIGHT_KEY] = key; // 记录创建枚举，便于导入导出
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
  helper.userData[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = true; // helper 本身非业务节点
  helper.userData[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true; // 结构面板隐藏
  helper.userData[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET] = light; // 射线命中 helper 时选中灯

  const mat = (helper as any).material as THREE.Material | THREE.Material[] | undefined;
  forEachMaterial(mat, (m) => {
    if ('color' in m && (m as any).color?.set) {
      (m as any).color.setHex(DEFAULT_LIGHT_HELPER_COLOR); // 线框颜色
    }
    m.depthTest = false; // 始终画在模型之上（editor 可读性优先）
    m.depthWrite = false;
    (m as any).toneMapped = false; // 不受曝光影响，亮度稳定
    m.transparent = true;
    m.opacity = 0.9;
    m.needsUpdate = true;
  });
  helper.renderOrder = 8_000; // 较晚绘制，减少被透明物体误挡
}

function createLightTargetHandle(light: THREE.Light, target: THREE.Vector3, lightType: 'DirectionalLight' | 'SpotLight' | 'RectAreaLight') {
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 12),
    new THREE.MeshBasicMaterial({
      color: DEFAULT_LIGHT_HELPER_COLOR,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.92,
      toneMapped: false
    })
  );
  handle.name = `${light.type}TargetHandle`;
  handle.position.copy(target);
  handle.renderOrder = 8_100;
  // 点击控制点时，业务选中语义仍归属灯光本体；编辑器会用额外参数把 gizmo 挂到 handle。
  handle.userData[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET] = light;
  // 不在结构树展示，避免污染用户的业务节点层级；但保持可拾取可拖拽。
  handle.userData[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE] = true;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_UUID] = light.uuid;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_TYPE] = lightType;
  (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE] = handle;
  return handle;
}

function isShadowHelperVisible(light: THREE.Light) {
  const ud = getVizonUserData(light);
  return Boolean(light.castShadow && ud[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] !== false);
}

function createShadowLightHelperGroup(args: {
  name: string;
  light: THREE.Light;
  lightHelper: THREE.Object3D & { update?: () => void };
  shadowCamera: THREE.Camera & { updateProjectionMatrix?: () => void; updateMatrixWorld?: (force?: boolean) => void };
  updateMatrices: () => void;
}) {
  const { name, light, lightHelper, shadowCamera, updateMatrices } = args;
  const helperGroup = new THREE.Group();
  helperGroup.name = name;

  const shadowHelper = new THREE.CameraHelper(shadowCamera);
  shadowHelper.visible = isShadowHelperVisible(light);
  helperGroup.add(lightHelper);
  helperGroup.add(shadowHelper);

  (helperGroup as any).update = () => {
    updateMatrices();
    (lightHelper as any).update?.();
    shadowCamera.updateProjectionMatrix?.();
    shadowCamera.updateMatrixWorld?.(true);
    shadowHelper.visible = isShadowHelperVisible(light);
    shadowHelper.update();
  };

  configureLightHelper(helperGroup, light);
  helperGroup.traverse((child) => {
    if (child === helperGroup) return;
    configureLightHelper(child, light);
  });
  return helperGroup;
}

/**
 * 按 key 创建一盏合理的默认灯；调用方需自行 `scene.add` 或走 `ThreeEditor.add`。
 */
export function createDefaultLight(key: DefaultLightKey, opts?: CreateDefaultLightOptions) {
  const helperEnabled = opts?.helperEnabled ?? true; // 默认带 helper，便于编辑 aim

  if (key === 'ambientLight') {
    const light = new THREE.AmbientLight(DEFAULT_LIGHT_HELPER_COLOR, 0.6); // 环境光无方向、无阴影
    applyCommon(light, key, opts);
    return light;
  }

  if (key === 'directionalLight') {
    const light = new THREE.DirectionalLight(DEFAULT_LIGHT_HELPER_COLOR, 1.0);
    light.position.set(4, 8, 4); // 稍抬高主光高度，减少近距离硬阴影
    applyCommon(light, key, opts);
    light.target.position.copy(getTarget(opts)); // Directional 需 target 才有朝向语义
    (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE] = createLightTargetHandle(
      light,
      light.target.position.clone(),
      'DirectionalLight'
    );
    // 默认不显示阴影视锥（视锥线框较干扰；需要时可在属性面板手动开启）
    (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] = false;
    light.castShadow = false;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -4;
    light.shadow.camera.right = 4;
    light.shadow.camera.top = 4;
    light.shadow.camera.bottom = -4;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 20;
    light.shadow.intensity = 1;
    light.shadow.bias = -0.0001;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 1.5;
    light.target.updateMatrixWorld();
    if (helperEnabled) {
      const helperGroup = createShadowLightHelperGroup({
        name: 'DirectionalLightHelpers',
        light,
        lightHelper: new THREE.DirectionalLightHelper(light, 1.2),
        shadowCamera: light.shadow.camera,
        updateMatrices: () => {
          light.updateMatrixWorld(true);
          light.target.updateMatrixWorld(true);
          light.shadow.updateMatrices(light);
        }
      });
      (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helperGroup;
    }
    return light;
  }

  if (key === 'pointLight') {
    const light = new THREE.PointLight(DEFAULT_LIGHT_HELPER_COLOR, 5.0, 0, 2); // distance 0 表示无限衰减距离（three 语义）
    light.position.set(0, 2, 0);
    applyCommon(light, key, opts);
    // 默认不显示阴影视锥（需要时在属性面板手动开启）
    (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] = false;
    light.castShadow = false;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 20;
    light.shadow.intensity = 1;
    light.shadow.bias = -0.0001;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 1.5;
    if (helperEnabled) {
      const helperGroup = createShadowLightHelperGroup({
        name: 'PointLightHelpers',
        light,
        lightHelper: new THREE.PointLightHelper(light, 0.45),
        shadowCamera: light.shadow.camera,
        updateMatrices: () => {
          light.updateMatrixWorld(true);
          light.shadow.updateMatrices(light);
        }
      });
      (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helperGroup;
    }
    return light;
  }

  if (key === 'spotLight') {
    // 锥角较窄、范围有限，避免 SpotLightHelper 几何巨大挡满视口
    // SpotLightShadow 的 fov 会在 updateMatrices 中由 angle/focus 推导：
    // fov ≈ radToDeg(2 * angle * focus)。这里让默认 angle 与 fov=45 对齐，避免面板读值不一致。
    const light = new THREE.SpotLight(DEFAULT_LIGHT_HELPER_COLOR, 5.0, 12, Math.PI / 8, 0.2, 1);
    // three 默认 focus=1，但这里显式设置，避免不同版本或序列化造成“默认值不一致”的认知偏差。
    light.focus = 1;
    light.position.set(2, 4, 2);
    applyCommon(light, key, opts);
    light.target.position.copy(getTarget(opts));
    (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE] = createLightTargetHandle(
      light,
      light.target.position.clone(),
      'SpotLight'
    );
    // 默认不显示阴影视锥（需要时在属性面板手动开启）
    (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] = false;
    light.castShadow = false;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 20;
    light.shadow.camera.fov = 45;
    light.shadow.intensity = 1;
    light.shadow.bias = -0.0001;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 1.5;
    light.target.updateMatrixWorld();
    if (helperEnabled) {
      const helperGroup = createShadowLightHelperGroup({
        name: 'SpotLightHelpers',
        light,
        lightHelper: new THREE.SpotLightHelper(light),
        shadowCamera: light.shadow.camera,
        updateMatrices: () => {
          light.updateMatrixWorld(true);
          light.target.updateMatrixWorld(true);
          light.shadow.updateMatrices(light);
        }
      });
      (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helperGroup;
    }
    return light;
  }

  if (key === 'hemisphereLight') {
    const light = new THREE.HemisphereLight(DEFAULT_LIGHT_HELPER_COLOR, DEFAULT_LIGHT_HELPER_COLOR, 1.0);
    light.position.set(0, 3, 0);
    applyCommon(light, key, opts);
    if (helperEnabled) {
      const helper = new THREE.HemisphereLightHelper(light, 0.9);
      configureLightHelper(helper, light);
      (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper;
    }
    return light;
  }

  // —— RectAreaLight：必须在使用前初始化 RectAreaLightUniformsLib ——
  if (!rectAreaUniformsInited) {
    RectAreaLightUniformsLib.init(); // 注册 shader 所需 uniform
    rectAreaUniformsInited = true;
  }
  const light = new THREE.RectAreaLight(DEFAULT_LIGHT_HELPER_COLOR, 4.0, 2.5, 2.5); // 强度与宽高为经验默认值
  light.position.set(2, 3, 2);
  applyCommon(light, key, opts);
  const rectTarget = getTarget(opts);
  // RectAreaLight 没有 target 对象：用 userData 持久化“看向点”语义，便于 editor/UI 回读与撤销。
  (light.userData as any)[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] = {
    x: rectTarget.x,
    y: rectTarget.y,
    z: rectTarget.z,
  };
  light.lookAt(rectTarget); // 面光法线指向 target
  (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE] = createLightTargetHandle(
    light,
    rectTarget.clone(),
    'RectAreaLight'
  );
  if (helperEnabled) {
    const helper = new RectAreaLightHelper(light);
    configureLightHelper(helper, light);
    (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper;
  }
  return light;
}
