/**
 * **灯光/辅助器工具集**：负责把 helper 或 target handle 变成“编辑器语义”的对象。
 *
 * 提供的能力包括：
 * - 给 helper 打上不可选、隐藏于结构树、代理拾取目标等 `userData` 标记；
 * - 统一处理 helper 材质的颜色、透明度、renderOrder 与关闭深度测试；
 * - 创建可拖拽的灯光 target handle，并在需要时把目标点持久化回 `userData`。
 */
import * as THREE from 'three';
import { forEachMaterial, VIZON_USER_DATA_KEYS } from '../../infra/utils';

export type LightTargetHandleType = 'DirectionalLight' | 'SpotLight' | 'RectAreaLight';

type ConfigureEditorHelperObjectOptions = {
  color?: number;
  opacity?: number;
  renderOrder?: number;
};

type CreateLightTargetHandleOptions = {
  color?: number;
  opacity?: number;
  renderOrder?: number;
  persistTargetData?: boolean;
};

export function configureEditorHelperObject(
  helper: THREE.Object3D,
  pickTarget: THREE.Object3D,
  options?: ConfigureEditorHelperObjectOptions
) {
  const color = options?.color;
  const opacity = options?.opacity ?? 0.9;
  const renderOrder = options?.renderOrder ?? 8_000;

  const ud = (helper.userData ??= {}) as Record<string, unknown>;
  // helper 本身不应出现在常规选中与场景树中，但点击它时应把焦点转发给真实对象。
  ud[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = true;
  ud[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
  ud[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET] = pickTarget;

  helper.traverse((node) => {
    forEachMaterial((node as { material?: THREE.Material | THREE.Material[] }).material, (material) => {
      if (color != null && 'color' in material && (material as { color?: { setHex?: (value: number) => void } }).color?.setHex) {
        (material as { color: { setHex: (value: number) => void } }).color.setHex(color);
      }
      // helper 需要像 overlay 一样永远压在内容层上方，避免被模型遮住导致“看不见点不到”。
      material.depthTest = false;
      material.depthWrite = false;
      (material as THREE.Material & { toneMapped?: boolean }).toneMapped = false;
      material.transparent = true;
      material.opacity = typeof material.opacity === 'number' ? opacity : material.opacity;
      material.needsUpdate = true;
    });
  });

  helper.renderOrder = Math.max(helper.renderOrder ?? 0, renderOrder);
  return helper;
}

export function createLightTargetHandle(
  light: THREE.Light,
  target: THREE.Vector3,
  lightType: LightTargetHandleType,
  options?: CreateLightTargetHandleOptions
) {
  const color = options?.color ?? 0xffffff;
  const opacity = options?.opacity ?? 0.92;
  const renderOrder = options?.renderOrder ?? 8_100;
  const persistTargetData = options?.persistTargetData ?? false;

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 12),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity,
      toneMapped: false
    })
  );
  // 目标点用小球而不是 helper 线框，原因是它既要可见，也要能稳定被 TransformControls 选中。
  handle.name = `${light.type}TargetHandle`;
  handle.position.copy(target);
  handle.renderOrder = renderOrder;
  // 点击 handle 实际上是编辑这盏灯，因此 PICK_TARGET 指向 light 本体。
  handle.userData[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET] = light;
  handle.userData[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE] = true;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_UUID] = light.uuid;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_TYPE] = lightType;
  (light.userData as Record<string, unknown>)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE] = handle;

  if (persistTargetData) {
    // 某些默认灯光/导入流程希望目标点能序列化，因此这里可选把坐标写回 userData。
    if (lightType === 'DirectionalLight' || lightType === 'SpotLight') {
      (light.userData as Record<string, unknown>)[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET] = {
        x: target.x,
        y: target.y,
        z: target.z
      };
    } else {
      (light.userData as Record<string, unknown>)[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] = {
        x: target.x,
        y: target.y,
        z: target.z
      };
    }
  }

  return handle;
}

export function readPersistedLightTarget(light: THREE.Light): { type: LightTargetHandleType; target: THREE.Vector3 } | null {
  const ud = (light.userData ?? {}) as Record<string, unknown>;
  const anyLight = light as THREE.Light & {
    isDirectionalLight?: boolean;
    isSpotLight?: boolean;
    isRectAreaLight?: boolean;
    target?: { position?: THREE.Vector3 };
  };

  if (anyLight.isDirectionalLight || anyLight.isSpotLight) {
    const raw = ud[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET] as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object') {
      return {
        type: anyLight.isDirectionalLight ? 'DirectionalLight' : 'SpotLight',
        target: new THREE.Vector3(Number(raw.x) || 0, Number(raw.y) || 0, Number(raw.z) || 0)
      };
    }
    // 若 userData 里没有持久化值，则退回 three 内建 target 的当前位置。
    if (anyLight.target?.position) {
      return {
        type: anyLight.isDirectionalLight ? 'DirectionalLight' : 'SpotLight',
        target: anyLight.target.position.clone()
      };
    }
    return null;
  }

  if (anyLight.isRectAreaLight) {
    const raw = ud[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] as Record<string, unknown> | undefined;
    return {
      type: 'RectAreaLight',
      // RectAreaLight 没有 target 对象；没有持久化数据时退回原点，保持结果结构稳定。
      target: raw && typeof raw === 'object'
        ? new THREE.Vector3(Number(raw.x) || 0, Number(raw.y) || 0, Number(raw.z) || 0)
        : new THREE.Vector3(0, 0, 0)
    };
  }

  return null;
}
