import * as THREE from 'three';
import type { ThreeEditor } from './ThreeEditor';
import { createDefaultCamera } from '../defaults/defaultCameras';
import { createDefaultLight } from '../defaults/defaultLights';
import { createDefaultModel } from '../defaults/defaultModels';
import { normalizeSceneSettings } from '../settings/sceneSettings';
import { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../infra/utils';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import type { SceneSettings } from '../settings/sceneSettings';
import type {
  VizonContentNode,
  VizonDocument,
  VizonNode,
  VizonQuat,
  VizonVec3,
} from '../types/document';
import type { SceneTreeNodeKind } from '../settings/sceneTree';
import { VIZON_EDITOR_OVERLAY_LAYER } from './picking/pickLayers';

/** 与持久化 meta 对齐的版本号 */
const LATEST_SCHEMA_VERSION = 2 as const;

const RUNTIME_HELPER_TYPES = new Set([
  'TransformControlsGizmo',
  'TransformControlsPlane',
  'GridHelper',
  'AxesHelper',
  'CameraHelper',
  'DirectionalLightHelper',
  'PointLightHelper',
  'SpotLightHelper',
  'HemisphereLightHelper',
  'RectAreaLightHelper',
  'BoxHelper',
  'LineSegments2',
]);

function nowIso() {
  return new Date().toISOString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toFiniteNumber(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function toBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function toVec3(input: unknown, fallback: VizonVec3): VizonVec3 {
  if (!isRecord(input)) return fallback;
  return {
    x: toFiniteNumber(input.x, fallback.x),
    y: toFiniteNumber(input.y, fallback.y),
    z: toFiniteNumber(input.z, fallback.z),
  };
}

function toQuat(input: unknown, fallback: VizonQuat): VizonQuat {
  if (!isRecord(input)) return fallback;
  return {
    x: toFiniteNumber(input.x, fallback.x),
    y: toFiniteNumber(input.y, fallback.y),
    z: toFiniteNumber(input.z, fallback.z),
    w: toFiniteNumber(input.w, fallback.w),
  };
}

function toLayers(obj: THREE.Object3D): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    const layer = new THREE.Layers();
    layer.set(i);
    if (obj.layers.test(layer)) out.push(i);
  }
  return out;
}

function applyLayers(obj: THREE.Object3D, layers: number[]) {
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
  if (Array.isArray(material)) {
    const list = material
      .map((m) => {
        try {
          return m.toJSON() as unknown as Record<string, unknown>;
        } catch {
          return undefined;
        }
      })
      .filter((x): x is Record<string, unknown> => Boolean(x));
    return list.length ? list : undefined;
  }
  try {
    return material.toJSON() as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
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
    const mat = node?.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    const materials = Array.isArray(mat) ? mat : [mat];
    for (const m of materials) {
      (m as any).depthTest = false;
      (m as any).depthWrite = false;
      (m as any).toneMapped = false;
      (m as any).transparent = true;
      (m as any).opacity = typeof (m as any).opacity === 'number' ? (m as any).opacity : 0.9;
      (m as any).needsUpdate = true;
    }
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

function applyImportedLightTargetFromUserData(light: THREE.Light) {
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

function ensureImportedLightTargetHandle(light: THREE.Light) {
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

function createRuntimeLightHelper(light: THREE.Light): THREE.Object3D | null {
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

function createRuntimeCameraHelper(camera: THREE.Camera): THREE.CameraHelper {
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

/** 序列化编辑器场景内容树根（不包含运行时 helper）；与 ThreeEditor#getSceneSettings 分离，仅在此处承担 content 拼装 */
export function serializeVizonSceneContent(editor: ThreeEditor): VizonContentNode[] {
  return editor.scene.children
    .filter((root) => !isRuntimeHelperObject(root))
    .map((root) => serializeNodeForContent(root));
}

/**
 * 从 ThreeEditor#getSceneSettings 的快照拼出持久化文档；场景字段不再有第二套来源。
 */
export function buildVizonDocumentFromEditor(editor: ThreeEditor, options?: { generator?: string }): VizonDocument {
  const sceneSettings = editor.getSceneSettings();
  const ts = nowIso();
  const content = serializeVizonSceneContent(editor);
  return {
    meta: {
      schemaVersion: LATEST_SCHEMA_VERSION,
      createdAt: ts,
      updatedAt: ts,
      generator: options?.generator,
      upAxis: 'y',
      units: 'meter',
    },
    basic: { ...sceneSettings.basic },
    environment: {
      ...sceneSettings.environment,
      fog: { ...sceneSettings.environment.fog },
      hdri: { ...sceneSettings.environment.hdri },
    },
    camera: {
      ...sceneSettings.camera,
      position: { ...sceneSettings.camera.position },
      target: { ...sceneSettings.camera.target },
    },
    grid: { ...sceneSettings.grid },
    helpers: {
      axes: { ...sceneSettings.helpers.axes },
    },
    renderer: { ...sceneSettings.renderer },
    sceneTree: sceneSettings.sceneTree.map((node) => ({ ...node })),
    content,
    assets: {},
  };
}

export function parseVizonDocument(input: unknown): VizonDocument {
  const migrated = migrateVizonDocument(input);
  return normalizeVizonDocument(migrated);
}

/**
 * 迁移入口：后续版本只在此追加分支，调用方仍用 parseVizonDocument。
 */
export function migrateVizonDocument(input: unknown): VizonDocument {
  if (!isRecord(input)) throw new Error('Invalid VizonDocument: not an object');
  const meta = isRecord(input.meta) ? input.meta : null;
  const schemaVersion = meta ? toFiniteNumber(meta.schemaVersion, NaN) : NaN;

  if (schemaVersion === 2) {
    return {
      meta: {
        schemaVersion: 2,
        createdAt: toString(meta?.createdAt, nowIso()),
        updatedAt: toString(meta?.updatedAt, nowIso()),
        generator: typeof meta?.generator === 'string' ? meta.generator : undefined,
        units: meta?.units === 'centimeter' || meta?.units === 'millimeter' || meta?.units === 'meter' ? meta.units : undefined,
        upAxis: meta?.upAxis === 'z' || meta?.upAxis === 'y' ? meta.upAxis : undefined,
      },
      basic: (input.basic as any) ?? {},
      environment: (input.environment as any) ?? {},
      camera: (input.camera as any) ?? {},
      grid: (input.grid as any) ?? {},
      helpers: (input.helpers as any) ?? {},
      renderer: (input.renderer as any) ?? {},
      sceneTree: Array.isArray(input.sceneTree) ? (input.sceneTree as any) : [],
      content: Array.isArray(input.content) ? (input.content as any) : [],
      sceneSettings: isRecord(input.sceneSettings) ? (input.sceneSettings as any) : undefined,
      sceneSnapshot: isRecord(input.sceneSnapshot) ? (input.sceneSnapshot as any) : undefined,
      nodes: Array.isArray(input.nodes) ? (input.nodes as any) : undefined,
      assets: isRecord(input.assets) ? (input.assets as any) : undefined,
    };
  }

  if (schemaVersion === 1) {
    const sceneSettings = normalizeSceneSettings((input.sceneSettings as any) as SceneSettings);
    return {
      meta: {
        schemaVersion: 2,
        createdAt: toString(meta?.createdAt, nowIso()),
        updatedAt: toString(meta?.updatedAt, nowIso()),
        generator: typeof meta?.generator === 'string' ? meta.generator : undefined,
        units: meta?.units === 'centimeter' || meta?.units === 'millimeter' || meta?.units === 'meter' ? meta.units : undefined,
        upAxis: meta?.upAxis === 'z' || meta?.upAxis === 'y' ? meta.upAxis : undefined,
      },
      basic: { ...sceneSettings.basic },
      environment: { ...sceneSettings.environment, fog: { ...sceneSettings.environment.fog }, hdri: { ...sceneSettings.environment.hdri } },
      camera: { ...sceneSettings.camera, position: { ...sceneSettings.camera.position }, target: { ...sceneSettings.camera.target } },
      grid: { ...sceneSettings.grid },
      helpers: { axes: { ...sceneSettings.helpers.axes } },
      renderer: { ...sceneSettings.renderer },
      sceneTree: sceneSettings.sceneTree ?? [],
      content: [],
      sceneSettings,
      sceneSnapshot: isRecord(input.sceneSnapshot) ? (input.sceneSnapshot as any) : undefined,
      nodes: Array.isArray(input.nodes) ? (input.nodes as any) : [],
      assets: isRecord(input.assets) ? (input.assets as any) : undefined,
    };
  }

  throw new Error(`Unsupported VizonDocument schemaVersion: ${String(schemaVersion)}`);
}

function normalizeVizonDocument(doc: VizonDocument): VizonDocument {
  const sceneSettings = normalizeSceneSettings({
    basic: doc.basic,
    environment: doc.environment,
    camera: doc.camera,
    grid: doc.grid,
    helpers: doc.helpers,
    renderer: doc.renderer,
    sceneTree: Array.isArray(doc.sceneTree) ? doc.sceneTree : [],
  } as SceneSettings);

  const normalizedContent = Array.isArray(doc.content) ? doc.content : [];
  const nodesRaw = doc.nodes;
  const nodes = Array.isArray(nodesRaw) ? nodesRaw.map((n) => normalizeNode(n)) : undefined;

  return {
    ...doc,
    basic: { ...sceneSettings.basic },
    environment: { ...sceneSettings.environment, fog: { ...sceneSettings.environment.fog }, hdri: { ...sceneSettings.environment.hdri } },
    camera: { ...sceneSettings.camera, position: { ...sceneSettings.camera.position }, target: { ...sceneSettings.camera.target } },
    grid: { ...sceneSettings.grid },
    helpers: { axes: { ...sceneSettings.helpers.axes } },
    renderer: { ...sceneSettings.renderer },
    sceneTree: sceneSettings.sceneTree,
    content: normalizedContent as VizonContentNode[],
    sceneSettings,
    nodes,
    sceneSnapshot: isRecord(doc.sceneSnapshot) ? doc.sceneSnapshot : undefined,
  };
}

function normalizeNode(input: unknown): VizonNode {
  if (!isRecord(input)) throw new Error('Invalid node: not an object');
  const id = toString(input.id, '');
  if (!id) throw new Error('Invalid node.id');

  const fallbackVec3: VizonVec3 = { x: 0, y: 0, z: 0 };
  const fallbackScale: VizonVec3 = { x: 1, y: 1, z: 1 };
  const fallbackQuat: VizonQuat = { x: 0, y: 0, z: 0, w: 1 };

  const children = Array.isArray(input.children) ? input.children.map((c) => toString(c, '')).filter(Boolean) : [];
  const layers = Array.isArray(input.layers)
    ? input.layers.map((l) => toFiniteNumber(l, -1)).filter((n) => Number.isInteger(n) && n >= 0 && n < 32)
    : [0];

  const node: VizonNode = {
    id,
    name: toString(input.name, ''),
    type: toString(input.type, 'Object3D'),
    parentId: input.parentId == null ? null : toString(input.parentId, null as any),
    children,
    visible: toBool(input.visible, true),
    layers,
    position: toVec3(input.position, fallbackVec3),
    quaternion: toQuat(input.quaternion, fallbackQuat),
    scale: toVec3(input.scale, fallbackScale),
  };

  if (isRecord(input.flags)) {
    node.flags = {
      hideInEditor: input.flags.hideInEditor == null ? undefined : toBool(input.flags.hideInEditor, false),
      nonSelectable: input.flags.nonSelectable == null ? undefined : toBool(input.flags.nonSelectable, false),
      nonPickable: input.flags.nonPickable == null ? undefined : toBool(input.flags.nonPickable, false),
      dynamic: input.flags.dynamic == null ? undefined : toBool(input.flags.dynamic, false),
    };
  }

  if (isRecord(input.components)) {
    node.components = input.components as any;
  }

  return node;
}

/** 从节点 attribute 取出 Three.toJSON 产生的 object 块（仅认 objectSnapshot） */
function extractObjectSnapshot(node: VizonContentNode): Record<string, unknown> | undefined {
  const attr = node.attribute;
  if (!isRecord(attr)) return undefined;
  if (isRecord(attr.objectSnapshot)) return attr.objectSnapshot as Record<string, unknown>;
  return undefined;
}

type ImportedContentHelperIndex = Map<
  string,
  { lightHelper?: PersistedHelperSnapshot; cameraHelper?: PersistedHelperSnapshot }
>;

function buildImportedContentHelperIndex(roots: VizonContentNode[]): ImportedContentHelperIndex {
  const index: ImportedContentHelperIndex = new Map();
  const visit = (n: VizonContentNode) => {
    const attr = n.attribute;
    if (isRecord(attr)) {
      const light = isRecord((attr as any).light) ? ((attr as any).light as any) : null;
      const camera = isRecord((attr as any).camera) ? ((attr as any).camera as any) : null;
      const normalizeHelper = (value: unknown): PersistedHelperSnapshot | undefined => {
        if (value === true) return { enabled: true, type: 'unknown' };
        if (!isRecord(value)) return undefined;
        // 兼容：只要不是显式 enabled:false，都视为希望恢复 helper
        if ((value as any).enabled === false) return undefined;
        return {
          enabled: true,
          type: typeof (value as any).type === 'string' ? String((value as any).type) : 'unknown',
        };
      };
      const lightHelper = light ? normalizeHelper(light.helper) : undefined;
      const cameraHelper = camera ? normalizeHelper(camera.helper) : undefined;
      if (lightHelper || cameraHelper) {
        index.set(n.uuid, {
          lightHelper: lightHelper as PersistedHelperSnapshot | undefined,
          cameraHelper: cameraHelper as PersistedHelperSnapshot | undefined,
        });
      }
    }
    for (const c of n.children ?? []) visit(c);
  };
  for (const r of roots) visit(r);
  return index;
}

function restoreRuntimeHelpersFromImportedContent(editor: ThreeEditor, roots: VizonContentNode[]) {
  const helperIndex = buildImportedContentHelperIndex(roots);
  for (const [uuid, meta] of helperIndex.entries()) {
    const obj = editor.scene.getObjectByProperty('uuid', uuid) as any;
    if (!obj) continue;

    if (meta.cameraHelper && obj?.isCamera) {
      const cam = obj as THREE.Camera;
      const ud = ((cam as any).userData ??= {}) as any;
      if (!ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]) {
        ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] = createRuntimeCameraHelper(cam);
      }
      editor.rebindRuntimeHelpersForSubtree(cam);
      continue;
    }
    if (meta.lightHelper && obj?.isLight) {
      const light = obj as THREE.Light;
      const ud = ((light as any).userData ??= {}) as any;
      if (!ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]) {
        const helper = createRuntimeLightHelper(light);
        if (helper) ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper;
      }
      ensureImportedLightTargetHandle(light);
      editor.rebindRuntimeHelpersForSubtree(light);
    }
  }
}

/**
 * 以 content 为主：优先挂带 objectSnapshot 的节点；若当前节点无快照则下钻子节点（兼容仅子级带快照的导出）。
 * 若节点已有快照，则视为整棵子树已由 Three 序列化，不再递归子 content 以免重复挂接。
 */
function importSceneFromContentNodes(editor: ThreeEditor, roots: VizonContentNode[]): number {
  const loader = new THREE.ObjectLoader();
  let count = 0;
  const helperIndex = buildImportedContentHelperIndex(roots);
  const addedRoots: THREE.Object3D[] = [];
  const fixNum = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const sanitizeImportedObjectTree = (root: THREE.Object3D) => {
    root.traverse((obj) => {
      const badMatrix = (obj.matrix?.elements ?? []).some((x: number) => !Number.isFinite(x));
      if (badMatrix) {
        obj.matrix.identity();
        obj.position.set(0, 0, 0);
        obj.quaternion.set(0, 0, 0, 1);
        obj.scale.set(1, 1, 1);
      } else {
        // ObjectLoader 在 JSON 含 matrix 且 matrixAutoUpdate=false（导出前被静态冻结）时只恢复 matrix，不会分解到 TRS；
        // 下面 updateMatrix() 始终用 position/quaternion/scale 重算 matrix，若不先分解，会用默认 TRS 覆盖正确矩阵。
        if (obj.matrixAutoUpdate === false) {
          obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
        }
        obj.position.set(
          fixNum(obj.position.x, 0),
          fixNum(obj.position.y, 0),
          fixNum(obj.position.z, 0)
        );
        obj.scale.set(
          fixNum(obj.scale.x, 1),
          fixNum(obj.scale.y, 1),
          fixNum(obj.scale.z, 1)
        );
        obj.quaternion.set(
          fixNum(obj.quaternion.x, 0),
          fixNum(obj.quaternion.y, 0),
          fixNum(obj.quaternion.z, 0),
          fixNum(obj.quaternion.w, 1)
        );
        if (!Number.isFinite(obj.quaternion.lengthSq()) || obj.quaternion.lengthSq() === 0) {
          obj.quaternion.set(0, 0, 0, 1);
        } else {
          obj.quaternion.normalize();
        }
      }
      // 导入后按常规参与矩阵更新，避免残留 false 与编辑器/gizmo 链路不一致。
      obj.matrixAutoUpdate = true;
      const anyObj = obj as any;
      if (anyObj?.isPerspectiveCamera) {
        if (!Number.isFinite(anyObj.fov)) anyObj.fov = 50;
        if (!Number.isFinite(anyObj.near)) anyObj.near = 0.01;
        if (!Number.isFinite(anyObj.far)) anyObj.far = 1000;
        anyObj.near = Math.max(0.001, anyObj.near);
        anyObj.far = Math.max(anyObj.near + 1e-3, Math.min(100_000, anyObj.far));
        anyObj.fov = Math.max(10, Math.min(120, anyObj.fov));
        anyObj.updateProjectionMatrix?.();
      } else if (anyObj?.isOrthographicCamera) {
        if (!Number.isFinite(anyObj.near)) anyObj.near = 0.01;
        if (!Number.isFinite(anyObj.far)) anyObj.far = 1000;
        if (!Number.isFinite(anyObj.left)) anyObj.left = -10;
        if (!Number.isFinite(anyObj.right)) anyObj.right = 10;
        if (!Number.isFinite(anyObj.top)) anyObj.top = 10;
        if (!Number.isFinite(anyObj.bottom)) anyObj.bottom = -10;
        if (!Number.isFinite(anyObj.zoom)) anyObj.zoom = 1;
        anyObj.near = Math.max(0.001, anyObj.near);
        anyObj.far = Math.max(anyObj.near + 1e-3, Math.min(100_000, anyObj.far));
        anyObj.zoom = Math.max(0.01, anyObj.zoom);
        anyObj.updateProjectionMatrix?.();
      }
      if (anyObj?.isLight) {
        if ('intensity' in anyObj && !Number.isFinite(anyObj.intensity)) anyObj.intensity = 1;
        if ('distance' in anyObj && !Number.isFinite(anyObj.distance)) anyObj.distance = 0;
        if ('decay' in anyObj && !Number.isFinite(anyObj.decay)) anyObj.decay = 2;
        if ('angle' in anyObj && !Number.isFinite(anyObj.angle)) anyObj.angle = Math.PI / 3;
        if ('penumbra' in anyObj && !Number.isFinite(anyObj.penumbra)) anyObj.penumbra = 0;
        const shadowCam = anyObj.shadow?.camera as any;
        if (shadowCam) {
          if (!Number.isFinite(shadowCam.near)) shadowCam.near = 0.1;
          if (!Number.isFinite(shadowCam.far)) shadowCam.far = 1000;
          shadowCam.near = Math.max(0.001, shadowCam.near);
          shadowCam.far = Math.max(shadowCam.near + 1e-3, Math.min(100_000, shadowCam.far));
          shadowCam.updateProjectionMatrix?.();
        }
      }
      obj.updateMatrix();
      obj.updateMatrixWorld(true);
    });
  };
  const addParsedObject = (parsed: THREE.Object3D) => {
    // 在 add() 之前把 helper/target handle 写入 userData，确保 ThreeEditor.add 能正确 bind。
    parsed.traverse((node: any) => {
      const meta = helperIndex.get(node?.uuid);
      if (meta?.cameraHelper && node?.isCamera) {
        const cam = node as THREE.Camera;
        const ud = ((cam as any).userData ??= {}) as any;
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]) {
          ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] = createRuntimeCameraHelper(cam);
        }
      }
      if (meta?.lightHelper && node?.isLight) {
        const light = node as THREE.Light;
        const ud = ((light as any).userData ??= {}) as any;
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]) {
          const helper = createRuntimeLightHelper(light);
          if (helper) ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper;
        }
        applyImportedLightTargetFromUserData(light);
        ensureImportedLightTargetHandle(light);
      }
    });

    if ((parsed as any).isScene) {
      const scene = parsed as THREE.Scene;
      const children = [...scene.children];
      for (const child of children) {
        sanitizeImportedObjectTree(child);
        editor.add(child, {
          recordHistory: false,
          operationName: 'Import document content',
          freezeSubtreeAfterAdd: false,
        });
        addedRoots.push(child);
        count++;
      }
      return;
    }
    sanitizeImportedObjectTree(parsed);
    editor.add(parsed, {
      recordHistory: false,
      operationName: 'Import document content',
      freezeSubtreeAfterAdd: false,
    });
    addedRoots.push(parsed);
    count++;
  };
  const addOne = (snapshot: Record<string, unknown>) => {
    const parsed = loader.parse(snapshot as any);
    addParsedObject(parsed);
  };
  const visit = (node: VizonContentNode): void => {
    const snap = extractObjectSnapshot(node);
    if (snap) {
      addOne(snap);
      return;
    }
    for (const c of node.children ?? []) visit(c);
  };
  for (const root of roots) visit(root);

  // 二次兜底：避免 helper 元数据存在但在 add() 时未被绑定（例如外部 JSON/兼容分支导致的延后写入）。
  for (const root of addedRoots) {
    root.traverse((node: any) => {
      const meta = helperIndex.get(node?.uuid);
      if (meta?.cameraHelper && node?.isCamera) {
        const cam = node as THREE.Camera;
        const ud = ((cam as any).userData ??= {}) as any;
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]) {
          ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] = createRuntimeCameraHelper(cam);
        }
      }
      if (meta?.lightHelper && node?.isLight) {
        const light = node as THREE.Light;
        const ud = ((light as any).userData ??= {}) as any;
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]) {
          const helper = createRuntimeLightHelper(light);
          if (helper) ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper;
        }
        ensureImportedLightTargetHandle(light);
      }
    });
    editor.rebindRuntimeHelpersForSubtree(root);
  }

  return count;
}

/** 应用 JSON 中的环境/相机/网格等；sceneTree 必须用当前场景重建，禁止沿用文件里的过期树 */
async function applyImportedDocumentSettings(
  editor: ThreeEditor,
  doc: VizonDocument,
  importOptions?: { resetSceneSettings?: boolean }
): Promise<void> {
  if (importOptions?.resetSceneSettings === false) return;
  await editor.setSceneSettings(
    normalizeSceneSettings({
      basic: doc.basic,
      environment: doc.environment,
      camera: doc.camera,
      grid: doc.grid,
      helpers: doc.helpers,
      renderer: doc.renderer,
      sceneTree: editor.getSceneTree(),
    } as SceneSettings),
    { recordHistory: false, operationName: 'Import scene settings', forceApply: true }
  );
}

/** 把 JSON 快照恢复到编辑器内部（清空后重建）；与 SceneSettings 仅通过 parse 后的文档字段对齐一套结构 */
export async function importDocument(
  editor: ThreeEditor,
  input: unknown,
  options?: { resetSceneSettings?: boolean }
): Promise<void> {
  const doc = parseVizonDocument(input);

  await editor.clearSceneNodes();

  // 以 content 为唯一场景数据来源（物体/场景内灯光/场景内相机等均应在 objectSnapshot 内）
  if (Array.isArray(doc.content) && doc.content.length > 0) {
    const added = importSceneFromContentNodes(editor, doc.content);
    if (added === 0) {
      throw new Error(
        'VizonDocument.content 中未找到有效的 attribute.objectSnapshot，无法恢复场景。请使用由本编辑器导出的 JSON 或检查 content 节点是否包含 Three.js 序列化块。'
      );
    }
    await applyImportedDocumentSettings(editor, doc, options);
    // 显式按 content helper 标记补齐并重绑定（不依赖 add() 时机与隐式链路）
    restoreRuntimeHelpersFromImportedContent(editor, doc.content);
    editor.resetShiftMultiselectState();
    editor.render();
    return;
  }

  if (doc.sceneSnapshot && isRecord(doc.sceneSnapshot)) {
    const loader = new THREE.ObjectLoader();
    const parsed = loader.parse(doc.sceneSnapshot as any);
    if ((parsed as any).isScene) {
      const parsedScene = parsed as THREE.Scene;
      for (const child of parsedScene.children) {
        editor.add(child, {
          recordHistory: false,
          operationName: 'Import document snapshot',
          freezeSubtreeAfterAdd: false,
        });
      }
    } else {
      editor.add(parsed, {
        recordHistory: false,
        operationName: 'Import document snapshot',
        freezeSubtreeAfterAdd: false,
      });
    }

    await applyImportedDocumentSettings(editor, doc, options);
    editor.resetShiftMultiselectState();
    editor.render();
    return;
  }

  const created = new Map<string, THREE.Object3D>();

  const createObjectForNode = (n: VizonNode): THREE.Object3D => {
    const defaults = n.components?.defaults;
    if (defaults?.modelKey) return createDefaultModel(defaults.modelKey as any);
    if (defaults?.lightKey) return createDefaultLight(defaults.lightKey as any, { target: { x: 0, y: 0, z: 0 } });
    if (defaults?.cameraKey) return createDefaultCamera(defaults.cameraKey as any);
    return new THREE.Group();
  };

  const applyNodeToObject = (n: VizonNode, obj: THREE.Object3D) => {
    obj.uuid = n.id;
    obj.name = n.name ?? '';
    obj.visible = Boolean(n.visible);

    obj.position.set(n.position.x, n.position.y, n.position.z);
    obj.quaternion.set(n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w);
    obj.scale.set(n.scale.x, n.scale.y, n.scale.z);
    obj.updateMatrixWorld(true);

    applyLayers(obj, n.layers);

    const ud = (obj.userData ??= {}) as any;
    if (n.flags) {
      if (n.flags.hideInEditor != null) ud[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = Boolean(n.flags.hideInEditor);
      if (n.flags.nonSelectable != null) ud[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = Boolean(n.flags.nonSelectable);
      if (n.flags.nonPickable != null) ud[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE] = Boolean(n.flags.nonPickable);
      if (n.flags.dynamic != null) ud[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC] = Boolean(n.flags.dynamic);
    }

    const effects = n.components?.effects;
    if (effects) {
      ud[VIZON_STORAGE_KEYS.EFFECTS] = {
        borderEnabled: Boolean(effects.borderEnabled),
        borderWidth: toFiniteNumber(effects.borderWidth, 1),
        borderColor: toString(effects.borderColor, '#ff0000'),
        glowEnabled: Boolean(effects.glowEnabled),
        glowColor: toString(effects.glowColor, '#66ccff'),
        glowRange: toFiniteNumber(effects.glowRange, 30),
        glowBrightness: toFiniteNumber(effects.glowBrightness, 1),
      };
    }

    const anyObj: any = obj as any;
    const light = n.components?.light;
    if (light && anyObj?.isLight) {
      if (typeof light.intensity === 'number') anyObj.intensity = light.intensity;
      if (typeof light.castShadow === 'boolean') anyObj.castShadow = light.castShadow;
      if (typeof light.color === 'string') {
        try {
          anyObj.color?.set?.(light.color);
        } catch {
          // 非法颜色忽略
        }
      }
    }
    const cam = n.components?.camera;
    if (cam && anyObj?.isCamera) {
      if (typeof cam.near === 'number') anyObj.near = cam.near;
      if (typeof cam.far === 'number') anyObj.far = cam.far;
      if (typeof cam.fov === 'number') anyObj.fov = cam.fov;
      anyObj.updateProjectionMatrix?.();
    }
  };

  for (const n of doc.nodes ?? []) {
    const obj = createObjectForNode(n);
    applyNodeToObject(n, obj);
    created.set(n.id, obj);
  }

  for (const n of doc.nodes ?? []) {
    const obj = created.get(n.id)!;
    if (n.parentId && created.has(n.parentId)) {
      created.get(n.parentId)!.add(obj);
    }
  }

  for (const n of doc.nodes ?? []) {
    if (n.parentId) continue;
    const obj = created.get(n.id)!;
    editor.add(obj, {
      recordHistory: false,
      operationName: 'Import document',
      freezeSubtreeAfterAdd: false,
    });
  }

  await applyImportedDocumentSettings(editor, doc, options);
  editor.resetShiftMultiselectState();
  editor.render();
}
