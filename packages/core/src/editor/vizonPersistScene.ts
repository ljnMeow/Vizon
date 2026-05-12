import * as THREE from 'three';
import { forEachMaterial, VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../infra/utils';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import type { VizonContentNode, VizonNode } from '../types/document';
import type { SceneTreeNodeKind } from '../settings/sceneTree';
import { VIZON_EDITOR_OVERLAY_LAYER } from './picking/pickLayers';
import { RUNTIME_HELPER_TYPES } from './vizonPersistConstants';
import { isRecord, toBool, toFiniteNumber, toString } from './vizonPersistShared';

function toLayers(obj: THREE.Object3D): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    const layer = new THREE.Layers();
    layer.set(i);
    if (obj.layers.test(layer)) out.push(i);
  }
  return out;
}

export function applyLayers(obj: THREE.Object3D, layers: number[]) {
  obj.layers.disableAll();
  for (const i of layers) {
    if (Number.isInteger(i) && i >= 0 && i < 32) obj.layers.enable(i);
  }
}

function isEditorInternalObject(obj: THREE.Object3D) {
  const overlay = new THREE.Layers();
  overlay.set(VIZON_EDITOR_OVERLAY_LAYER);
  if (obj.layers.test(overlay)) return true;
  if ((obj as any).isTransformControls) return true;
  if (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane') return true;
  if (obj.name === 'TransformControlsEditor') return true;
  return false;
}

function isRuntimeHelperObject(obj: THREE.Object3D) {
  if (isEditorInternalObject(obj)) return true;
  if (RUNTIME_HELPER_TYPES.has(obj.type)) return true;
  const ud: any = obj.userData as any;
  if (ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE]) return true;
  if (ud?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] && ud?.[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]) return true;
  return false;
}

function sanitizeUserDataInPlace(obj: THREE.Object3D) {
  const ud = (obj.userData ??= {}) as Record<string, unknown>;
  const runtimeKeys = [
    VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET,
    VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER,
    VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER,
    VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE,
    VIZON_USER_DATA_KEYS.HELPERS.BORDER_LINE_HELPER,
  ];
  for (const key of runtimeKeys) delete ud[key];

  const toSerializable = (value: unknown, seen: WeakSet<object>): unknown => {
    if (value == null) return value;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;

    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const item of value) {
        const s = toSerializable(item, seen);
        if (s !== undefined) out.push(s);
      }
      return out;
    }

    if (t === 'object') {
      const objValue = value as Record<string, unknown>;
      if (seen.has(objValue as object)) return undefined;
      seen.add(objValue as object);

      const anyV = value as any;
      if (
        anyV?.isObject3D ||
        anyV?.isMaterial ||
        anyV?.isTexture ||
        anyV?.isGeometry ||
        anyV?.isVector2 ||
        anyV?.isVector3 ||
        anyV?.isVector4 ||
        anyV?.isEuler ||
        anyV?.isColor ||
        anyV?.isMatrix3 ||
        anyV?.isMatrix4 ||
        anyV?.isQuaternion
      ) {
        return undefined;
      }

      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(objValue)) {
        const s = toSerializable(v, seen);
        if (s !== undefined) out[k] = s;
      }
      return out;
    }

    return undefined;
  };

  const safe = toSerializable(ud, new WeakSet()) as Record<string, unknown> | undefined;
  obj.userData = safe ?? {};
  for (const key of runtimeKeys) {
    delete (obj.userData as Record<string, unknown>)[key];
  }
}

function getSceneNodeKind(obj: THREE.Object3D): SceneTreeNodeKind {
  if (obj.type === 'Scene') return 'scene';
  if ((obj as any).isCamera) return 'camera';
  if ((obj as any).isLight) return 'light';
  if (obj.type === 'Group') return 'group';
  return 'object';
}

function serializeMaterial(
  material: THREE.Material | THREE.Material[] | null | undefined
): Record<string, unknown> | Array<Record<string, unknown>> | undefined {
  if (!material) return undefined;
  const list: Record<string, unknown>[] = [];
  forEachMaterial(material, (m) => {
    try {
      list.push(m.toJSON() as unknown as Record<string, unknown>);
    } catch {
      /* skip */
    }
  });
  if (Array.isArray(material)) {
    return list.length ? list : undefined;
  }
  return list[0];
}

function toSerializableUserData(input: unknown): Record<string, unknown> {
  const walk = (value: unknown, seen: WeakSet<object>): unknown => {
    if (value == null) return value;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;

    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const item of value) {
        const mapped = walk(item, seen);
        if (mapped !== undefined) out.push(mapped);
      }
      return out;
    }

    if (!isRecord(value)) return undefined;
    if (seen.has(value)) return undefined;
    seen.add(value);

    const anyV = value as any;
    if (
      anyV?.isObject3D ||
      anyV?.isMaterial ||
      anyV?.isTexture ||
      anyV?.isGeometry ||
      anyV?.isVector2 ||
      anyV?.isVector3 ||
      anyV?.isVector4 ||
      anyV?.isEuler ||
      anyV?.isColor ||
      anyV?.isMatrix3 ||
      anyV?.isMatrix4 ||
      anyV?.isQuaternion
    ) {
      return undefined;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const mapped = walk(v, seen);
      if (mapped !== undefined) out[k] = mapped;
    }
    return out;
  };

  const normalized = walk(input, new WeakSet());
  return isRecord(normalized) ? normalized : {};
}

function readEffectsComponent(obj: THREE.Object3D): VizonNode['components'] {
  const raw = (obj.userData as any)?.[VIZON_STORAGE_KEYS.EFFECTS];
  if (!isRecord(raw)) return {};
  const effects = {
    borderEnabled: toBool(raw.borderEnabled, false),
    borderWidth: toFiniteNumber(raw.borderWidth, 1),
    borderColor: toString(raw.borderColor, '#ff0000'),
    glowEnabled: toBool(raw.glowEnabled, false),
    glowColor: toString(raw.glowColor, '#66ccff'),
    glowRange: toFiniteNumber(raw.glowRange, 30),
    glowBrightness: toFiniteNumber(raw.glowBrightness, 1),
  };
  return { effects };
}

type PersistedHelperSnapshot = {
  enabled: true;
  /** helper 的 three 类型（例如 DirectionalLightHelper / Group 等），用于调试/前向兼容 */
  type: string;
  /** helper 自身的 toJSON 快照（不用于直接 restore 绑定，但保留数据以便未来演进） */
  objectSnapshot?: Record<string, unknown>;
};

function configureRuntimeHelperObject(helper: THREE.Object3D, pickTarget: THREE.Object3D) {
  const ud = (helper.userData ??= {}) as any;
  ud[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = true;
  ud[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
  ud[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET] = pickTarget;

  helper.traverse((node: any) => {
    forEachMaterial(node?.material as THREE.Material | THREE.Material[] | undefined, (m) => {
      (m as any).depthTest = false;
      (m as any).depthWrite = false;
      (m as any).toneMapped = false;
      (m as any).transparent = true;
      (m as any).opacity = typeof (m as any).opacity === 'number' ? (m as any).opacity : 0.9;
      (m as any).needsUpdate = true;
    });
  });
  helper.renderOrder = Math.max(helper.renderOrder ?? 0, 8_000);
}

function createLightTargetHandle(
  light: THREE.Light,
  target: THREE.Vector3,
  lightType: 'DirectionalLight' | 'SpotLight' | 'RectAreaLight'
) {
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    })
  );
  handle.name = `${light.type}TargetHandle`;
  handle.position.copy(target);
  handle.renderOrder = 8_100;
  handle.userData[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET] = light;
  handle.userData[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE] = true;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_UUID] = light.uuid;
  handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_TYPE] = lightType;
  (light.userData as any)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE] = handle;
  if (lightType === 'DirectionalLight' || lightType === 'SpotLight') {
    (light.userData as any)[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET] = { x: target.x, y: target.y, z: target.z };
  } else if (lightType === 'RectAreaLight') {
    (light.userData as any)[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] = { x: target.x, y: target.y, z: target.z };
  }
  return handle;
}

export function applyImportedLightTargetFromUserData(light: THREE.Light) {
  const anyLight: any = light as any;
  if (!(anyLight?.isDirectionalLight || anyLight?.isSpotLight)) return;
  const ud: any = light.userData ?? {};
  const t = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET];
  if (!t || typeof t !== 'object') return;
  const x = toFiniteNumber((t as any).x, 0);
  const y = toFiniteNumber((t as any).y, 0);
  const z = toFiniteNumber((t as any).z, 0);
  if (anyLight.target?.position?.set) {
    anyLight.target.position.set(x, y, z);
    anyLight.target.updateMatrixWorld?.(true);
  }
  // 同步阴影矩阵，保证导入后阴影视锥 helper 立即正确
  anyLight.shadow?.updateMatrices?.(anyLight);
}

export function ensureImportedLightTargetHandle(light: THREE.Light) {
  const ud: any = light.userData ?? {};
  if (ud?.[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE]) return;

  const anyLight: any = light as any;
  if (anyLight?.isDirectionalLight && anyLight.target) {
    // 优先用持久化的 target（更稳定），否则 fallback 到 three 的 target 当前位置
    const t = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET];
    const target = isRecord(t)
      ? new THREE.Vector3(toFiniteNumber(t.x, 0), toFiniteNumber(t.y, 0), toFiniteNumber(t.z, 0))
      : anyLight.target.position.clone();
    if (anyLight.target?.position?.copy) anyLight.target.position.copy(target);
    anyLight.target?.updateMatrixWorld?.(true);
    anyLight.shadow?.updateMatrices?.(anyLight);
    createLightTargetHandle(light, target, 'DirectionalLight');
    return;
  }
  if (anyLight?.isSpotLight && anyLight.target) {
    const t = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET];
    const target = isRecord(t)
      ? new THREE.Vector3(toFiniteNumber(t.x, 0), toFiniteNumber(t.y, 0), toFiniteNumber(t.z, 0))
      : anyLight.target.position.clone();
    if (anyLight.target?.position?.copy) anyLight.target.position.copy(target);
    anyLight.target?.updateMatrixWorld?.(true);
    anyLight.shadow?.updateMatrices?.(anyLight);
    createLightTargetHandle(light, target, 'SpotLight');
    return;
  }
  if (anyLight?.isRectAreaLight) {
    const rectTargetRaw = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET];
    const target = isRecord(rectTargetRaw)
      ? new THREE.Vector3(
          toFiniteNumber(rectTargetRaw.x, 0),
          toFiniteNumber(rectTargetRaw.y, 0),
          toFiniteNumber(rectTargetRaw.z, 0)
        )
      : new THREE.Vector3(0, 0, 0);
    createLightTargetHandle(light, target, 'RectAreaLight');
  }
}

export function createRuntimeLightHelper(light: THREE.Light): THREE.Object3D | null {
  const anyLight: any = light as any;

  if (anyLight?.isDirectionalLight) {
    const helperGroup = new THREE.Group();
    helperGroup.name = 'DirectionalLightHelpers';
    const lightHelper = new THREE.DirectionalLightHelper(light as any, 1.2) as any;
    helperGroup.add(lightHelper);
    // CameraHelper（阴影视锥）后续会被编辑器懒创建/同步；这里先不强制创建，避免导入时矩阵未稳定。
    (helperGroup as any).update = () => {
      (lightHelper as any).update?.();
      // 阴影视锥 helper 是 ThreeEditor.ensureShadowCameraHelper 懒创建并挂到 helperGroup 里的，
      // 这里需要同步调用其 update()，否则移动灯光时阴影视锥不会跟随更新。
      helperGroup.traverse((n: any) => {
        if (n === helperGroup) return;
        if (n?.isCameraHelper || n?.type === 'CameraHelper') n.update?.();
      });
    };
    configureRuntimeHelperObject(helperGroup, light);
    helperGroup.traverse((child) => child !== helperGroup && configureRuntimeHelperObject(child, light));
    return helperGroup;
  }
  if (anyLight?.isPointLight) {
    const helperGroup = new THREE.Group();
    helperGroup.name = 'PointLightHelpers';
    const lightHelper = new THREE.PointLightHelper(light as any, 0.45) as any;
    helperGroup.add(lightHelper);
    (helperGroup as any).update = () => (lightHelper as any).update?.();
    configureRuntimeHelperObject(helperGroup, light);
    helperGroup.traverse((child) => child !== helperGroup && configureRuntimeHelperObject(child, light));
    return helperGroup;
  }
  if (anyLight?.isSpotLight) {
    const helperGroup = new THREE.Group();
    helperGroup.name = 'SpotLightHelpers';
    const lightHelper = new THREE.SpotLightHelper(light as any) as any;
    helperGroup.add(lightHelper);
    (helperGroup as any).update = () => {
      (lightHelper as any).update?.();
      helperGroup.traverse((n: any) => {
        if (n === helperGroup) return;
        if (n?.isCameraHelper || n?.type === 'CameraHelper') n.update?.();
      });
    };
    configureRuntimeHelperObject(helperGroup, light);
    helperGroup.traverse((child) => child !== helperGroup && configureRuntimeHelperObject(child, light));
    return helperGroup;
  }
  if (anyLight?.isHemisphereLight) {
    const helper = new THREE.HemisphereLightHelper(light as any, 0.9) as any;
    configureRuntimeHelperObject(helper, light);
    (helper as any).update?.();
    return helper;
  }
  if (anyLight?.isRectAreaLight) {
    const helper = new RectAreaLightHelper(light as any) as any;
    configureRuntimeHelperObject(helper, light);
    (helper as any).update?.();
    return helper;
  }
  return null;
}

export function createRuntimeCameraHelper(camera: THREE.Camera): THREE.CameraHelper {
  const helper = new THREE.CameraHelper(camera);
  configureRuntimeHelperObject(helper, camera);
  helper.renderOrder = 9_000;
  return helper;
}

function createObjectSnapshot(
  root: THREE.Object3D,
  options?: { includeRuntimeHelpers?: boolean }
): Record<string, unknown> {
  const includeRuntimeHelpers = Boolean(options?.includeRuntimeHelpers);
  const originalUserData = new WeakMap<THREE.Object3D, Record<string, unknown>>();

  const collectSourceNodes = (node: THREE.Object3D) => {
    const out: THREE.Object3D[] = [];
    node.traverse((obj) => {
      if (!includeRuntimeHelpers && isRuntimeHelperObject(obj)) return;
      out.push(obj);
    });
    return out;
  };

  const collectClonedNodes = (node: THREE.Object3D) => {
    const out: THREE.Object3D[] = [];
    node.traverse((obj) => out.push(obj));
    return out;
  };

  const sanitizeSourceUserDataBeforeClone = (node: THREE.Object3D) => {
    if (!includeRuntimeHelpers && isRuntimeHelperObject(node)) return;
    originalUserData.set(node, { ...(node.userData as Record<string, unknown> | undefined) });
    sanitizeUserDataInPlace(node);
    for (const child of node.children) sanitizeSourceUserDataBeforeClone(child);
  };
  const restoreSourceUserDataAfterClone = (node: THREE.Object3D) => {
    if (originalUserData.has(node)) node.userData = originalUserData.get(node)!;
    for (const child of node.children) restoreSourceUserDataAfterClone(child);
  };
  const pruneRuntimeChildrenInPlace = (node: THREE.Object3D) => {
    if (includeRuntimeHelpers) return;
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = node.children[i];
      if (isRuntimeHelperObject(child)) {
        node.remove(child);
      } else {
        pruneRuntimeChildrenInPlace(child);
      }
    }
  };
  sanitizeSourceUserDataBeforeClone(root);
  try {
    const sourceNodes = collectSourceNodes(root);
    const cloned = root.clone(true);
    pruneRuntimeChildrenInPlace(cloned);
    const clonedNodes = collectClonedNodes(cloned);
    // THREE.Object3D.clone() 默认会生成新的 uuid；为了让导入后能按 uuid 回补 helper/面板联动，
    // 这里把 clone 子树的 uuid 强制对齐到源对象（同时保持 prune 后的结构）。
    const n = Math.min(sourceNodes.length, clonedNodes.length);
    for (let i = 0; i < n; i++) clonedNodes[i].uuid = sourceNodes[i].uuid;
    return cloned.toJSON() as unknown as Record<string, unknown>;
  } finally {
    restoreSourceUserDataAfterClone(root);
  }
}

function serializeNodeForContent(obj: THREE.Object3D): VizonContentNode {
  const children = obj.children
    .filter((child) => !isRuntimeHelperObject(child))
    .map((child) => serializeNodeForContent(child));
  const anyObj = obj as any;
  const effectsComponent = readEffectsComponent(obj);
  const effects = effectsComponent?.effects as Record<string, unknown> | undefined;

  const helperSnapshots: { light?: PersistedHelperSnapshot; camera?: PersistedHelperSnapshot } = {};
  const rawUd: any = obj.userData as any;
  if (anyObj?.isLight) {
    const helper = rawUd?.[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] as THREE.Object3D | undefined;
    if (helper && (helper as any).isObject3D) {
      helperSnapshots.light = {
        enabled: true,
        type: helper.type,
      };
    }
  }
  if (anyObj?.isCamera) {
    const helper = rawUd?.[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] as THREE.Object3D | undefined;
    if (helper && (helper as any).isObject3D) {
      helperSnapshots.camera = {
        enabled: true,
        type: helper.type,
      };
    }
  }

  return {
    uuid: obj.uuid,
    name: obj.name || obj.type,
    type: obj.type,
    visible: obj.visible,
    kind: getSceneNodeKind(obj),
    children,
    attribute: {
      objectSnapshot: createObjectSnapshot(obj),
      castShadow: typeof anyObj.castShadow === 'boolean' ? anyObj.castShadow : undefined,
      receiveShadow: typeof anyObj.receiveShadow === 'boolean' ? anyObj.receiveShadow : undefined,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      quaternion: { x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      layers: toLayers(obj),
      userData: toSerializableUserData(obj.userData),
      ...(helperSnapshots.light ? { light: { helper: helperSnapshots.light } } : {}),
      ...(helperSnapshots.camera ? { camera: { helper: helperSnapshots.camera } } : {}),
    },
    material: serializeMaterial(anyObj.material),
    effects,
  };
}

/**
 * 序列化场景根下可编辑内容（不包含运行时 helper）。
 */
export function serializeVizonSceneContent(scene: THREE.Scene): VizonContentNode[] {
  return scene.children
    .filter((root) => !isRuntimeHelperObject(root))
    .map((root) => serializeNodeForContent(root));
}
