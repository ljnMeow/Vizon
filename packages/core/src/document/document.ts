import * as THREE from 'three';
import type { ThreeEditor } from '../editor/ThreeEditor';
import { createDefaultCamera } from '../defaults/defaultCameras';
import { createDefaultLight } from '../defaults/defaultLights';
import { createDefaultModel } from '../defaults/defaultModels';
import { normalizeSceneSettings } from '../settings/sceneSettings';
import { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../infra/utils';
import type { SceneSettings } from '../settings/sceneSettings';
import type { VizonDocument, VizonNode, VizonNodeId, VizonQuat, VizonVec3 } from '../types/document';
import { VIZON_EDITOR_OVERLAY_LAYER } from '../editor/picking/pickLayers';

const LATEST_SCHEMA_VERSION = 1 as const;
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
  // Layer-based fast path: overlay layer is for gizmo/grid/helpers etc.
  const overlay = new THREE.Layers();
  overlay.set(VIZON_EDITOR_OVERLAY_LAYER);
  if (obj.layers.test(overlay)) return true;
  // Additional name/type guards for safety.
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
      if (seen.has(objValue as object)) return undefined; // break circular refs
      seen.add(objValue as object);

      const anyV = value as any;
      // Drop runtime class instances/references that should never be serialized in userData.
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

function createSceneSnapshot(editor: ThreeEditor): Record<string, unknown> {
  const tempScene = new THREE.Scene();
  const originalUserData = new WeakMap<THREE.Object3D, Record<string, unknown>>();

  const pruneRuntimeChildrenInPlace = (node: THREE.Object3D) => {
    sanitizeUserDataInPlace(node);
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = node.children[i];
      if (isRuntimeHelperObject(child)) {
        node.remove(child);
        continue;
      }
      pruneRuntimeChildrenInPlace(child);
    }
  };

  const sanitizeSourceUserDataBeforeClone = (node: THREE.Object3D) => {
    if (isRuntimeHelperObject(node)) return;
    originalUserData.set(node, { ...(node.userData as Record<string, unknown> | undefined) });
    sanitizeUserDataInPlace(node);
    for (const child of node.children) sanitizeSourceUserDataBeforeClone(child);
  };

  const restoreSourceUserDataAfterClone = (node: THREE.Object3D) => {
    if (originalUserData.has(node)) {
      node.userData = originalUserData.get(node)!;
    }
    for (const child of node.children) restoreSourceUserDataAfterClone(child);
  };

  for (const root of editor.scene.children) {
    if (isRuntimeHelperObject(root)) continue;
    sanitizeSourceUserDataBeforeClone(root);
    try {
      const clonedRoot = root.clone(true);
      pruneRuntimeChildrenInPlace(clonedRoot);
      tempScene.add(clonedRoot);
    } finally {
      restoreSourceUserDataAfterClone(root);
    }
  }

  return tempScene.toJSON() as unknown as Record<string, unknown>;
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

function readDefaultsComponent(obj: THREE.Object3D): VizonNode['components'] {
  const ud: any = obj.userData as any;
  const modelKey = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_MODEL_KEY];
  const lightKey = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_LIGHT_KEY];
  const cameraKey = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_CAMERA_KEY];
  const defaults: any = {};
  if (typeof modelKey === 'string') defaults.modelKey = modelKey;
  if (typeof lightKey === 'string') defaults.lightKey = lightKey;
  if (typeof cameraKey === 'string') defaults.cameraKey = cameraKey;
  return Object.keys(defaults).length ? { defaults } : {};
}

function readFlags(obj: THREE.Object3D): VizonNode['flags'] {
  const ud: any = obj.userData as any;
  const flags: NonNullable<VizonNode['flags']> = {};
  if (typeof ud?.[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] === 'boolean') flags.hideInEditor = ud[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR];
  if (typeof ud?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] === 'boolean') flags.nonSelectable = ud[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE];
  if (typeof ud?.[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE] === 'boolean') flags.nonPickable = ud[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE];
  if (typeof ud?.[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC] === 'boolean') flags.dynamic = ud[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC];
  return Object.keys(flags).length ? flags : undefined;
}

function readLightComponent(obj: THREE.Object3D): VizonNode['components'] {
  const light = obj as any;
  if (!light?.isLight) return {};
  const color = light.color ? `#${(light.color as THREE.Color).getHexString()}` : undefined;
  return {
    light: {
      color,
      intensity: typeof light.intensity === 'number' ? light.intensity : undefined,
      castShadow: typeof light.castShadow === 'boolean' ? light.castShadow : undefined,
    },
  };
}

function readCameraComponent(obj: THREE.Object3D): VizonNode['components'] {
  const cam = obj as any;
  if (!cam?.isCamera) return {};
  return {
    camera: {
      fov: typeof cam.fov === 'number' ? cam.fov : undefined,
      near: typeof cam.near === 'number' ? cam.near : undefined,
      far: typeof cam.far === 'number' ? cam.far : undefined,
    },
  };
}

function mergeComponents(...parts: Array<VizonNode['components']>): VizonNode['components'] | undefined {
  const out: any = {};
  for (const p of parts) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (v == null) continue;
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function exportNode(obj: THREE.Object3D, parentId: VizonNodeId | null): VizonNode {
  return {
    id: obj.uuid,
    name: obj.name ?? '',
    type: obj.type ?? 'Object3D',
    parentId,
    children: obj.children.map((c) => c.uuid),
    visible: Boolean(obj.visible),
    layers: toLayers(obj),
    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
    quaternion: { x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w },
    scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    flags: readFlags(obj),
    components: mergeComponents(
      readDefaultsComponent(obj),
      readEffectsComponent(obj),
      readLightComponent(obj),
      readCameraComponent(obj)
    ),
  };
}

export function exportDocument(editor: ThreeEditor, options?: { generator?: string }): VizonDocument {
  const sceneSettings = editor.getSceneSettings();
  const nodes: VizonNode[] = [];

  const walk = (obj: THREE.Object3D, parentId: VizonNodeId | null) => {
    if (isEditorInternalObject(obj)) return;
    nodes.push(exportNode(obj, parentId));
    for (const child of obj.children) walk(child, obj.uuid);
  };

  for (const root of editor.scene.children) walk(root, null);

  const ts = nowIso();
  return {
    meta: {
      schemaVersion: LATEST_SCHEMA_VERSION,
      createdAt: ts,
      updatedAt: ts,
      generator: options?.generator,
      upAxis: 'y',
      units: 'meter',
    },
    sceneSettings,
    sceneSnapshot: createSceneSnapshot(editor),
    nodes,
    assets: {},
  };
}

export function parseVizonDocument(input: unknown): VizonDocument {
  const migrated = migrateVizonDocument(input);
  // After migration, always run normalization so importer can trust invariants.
  return normalizeVizonDocument(migrated);
}

/**
 * Migration pipeline:
 * - Accepts unknown inputs
 * - Validates minimal shape
 * - Migrates older schema versions up to latest
 *
 * Today only v1 exists; keep this function as the single entry so future versions
 * can be added without changing import callers.
 */
export function migrateVizonDocument(input: unknown): VizonDocument {
  if (!isRecord(input)) throw new Error('Invalid VizonDocument: not an object');
  const meta = isRecord(input.meta) ? input.meta : null;
  const schemaVersion = meta ? toFiniteNumber(meta.schemaVersion, NaN) : NaN;

  if (schemaVersion === 1) {
    // v1 is already the latest; just coerce minimal types (deep normalization happens later).
    return {
      meta: {
        schemaVersion: 1,
        createdAt: toString(meta?.createdAt, nowIso()),
        updatedAt: toString(meta?.updatedAt, nowIso()),
        generator: typeof meta?.generator === 'string' ? meta.generator : undefined,
        units: meta?.units === 'centimeter' || meta?.units === 'millimeter' || meta?.units === 'meter' ? meta.units : undefined,
        upAxis: meta?.upAxis === 'z' || meta?.upAxis === 'y' ? meta.upAxis : undefined,
      },
      sceneSettings: (input.sceneSettings as any) as SceneSettings,
      sceneSnapshot: isRecord(input.sceneSnapshot) ? (input.sceneSnapshot as any) : undefined,
      nodes: Array.isArray(input.nodes) ? (input.nodes as any) : [],
      assets: isRecord(input.assets) ? (input.assets as any) : undefined,
    };
  }

  throw new Error(`Unsupported VizonDocument schemaVersion: ${String(schemaVersion)}`);
}

function normalizeVizonDocument(doc: VizonDocument): VizonDocument {
  const sceneSettingsRaw = doc.sceneSettings as unknown;
  if (!isRecord(sceneSettingsRaw)) throw new Error('Invalid VizonDocument.sceneSettings');
  const sceneSettings = normalizeSceneSettings(sceneSettingsRaw as SceneSettings);

  const nodesRaw = doc.nodes;
  if (!Array.isArray(nodesRaw)) throw new Error('Invalid VizonDocument.nodes');
  const nodes: VizonNode[] = nodesRaw.map((n) => normalizeNode(n));

  return {
    ...doc,
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

export async function importDocument(
  editor: ThreeEditor,
  input: unknown,
  options?: { resetSceneSettings?: boolean }
): Promise<void> {
  const doc = parseVizonDocument(input);

  // Clean current workspace content first.
  // Note: clearSceneNodes is a public API that correctly updates selection & scene tree state.
  await editor.clearSceneNodes();

  // Prefer full-fidelity scene snapshot restore when available.
  if (doc.sceneSnapshot && isRecord(doc.sceneSnapshot)) {
    const loader = new THREE.ObjectLoader();
    const parsed = loader.parse(doc.sceneSnapshot as any);
    if ((parsed as any).isScene) {
      const parsedScene = parsed as THREE.Scene;
      for (const child of parsedScene.children) {
        editor.add(child, { recordHistory: false, operationName: 'Import document snapshot' });
      }
    } else {
      editor.add(parsed, { recordHistory: false, operationName: 'Import document snapshot' });
    }

    if (options?.resetSceneSettings !== false) {
      await editor.setSceneSettings(doc.sceneSettings, { recordHistory: false, operationName: 'Import scene settings' });
    }
    editor.render();
    return;
  }

  // Fallback: node-based restore for older docs without sceneSnapshot.
  const created = new Map<string, THREE.Object3D>();

  const createObjectForNode = (n: VizonNode): THREE.Object3D => {
    const defaults = n.components?.defaults;
    if (defaults?.modelKey) return createDefaultModel(defaults.modelKey as any);
    if (defaults?.lightKey) return createDefaultLight(defaults.lightKey as any, { target: { x: 0, y: 0, z: 0 } });
    if (defaults?.cameraKey) return createDefaultCamera(defaults.cameraKey as any);

    // Fallback creation for unknown nodes (keeps hierarchy/transform stable).
    // Use Group rather than Object3D so it behaves well in editors.
    return new THREE.Group();
  };

  const applyNodeToObject = (n: VizonNode, obj: THREE.Object3D) => {
    obj.uuid = n.id; // keep stable identity
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

    // Minimal light/camera restore (only if object supports it).
    const anyObj: any = obj as any;
    const light = n.components?.light;
    if (light && anyObj?.isLight) {
      if (typeof light.intensity === 'number') anyObj.intensity = light.intensity;
      if (typeof light.castShadow === 'boolean') anyObj.castShadow = light.castShadow;
      if (typeof light.color === 'string') {
        try {
          anyObj.color?.set?.(light.color);
        } catch {
          // ignore invalid color
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

  // Create all objects first.
  for (const n of doc.nodes) {
    const obj = createObjectForNode(n);
    applyNodeToObject(n, obj);
    created.set(n.id, obj);
  }

  // Attach hierarchy.
  for (const n of doc.nodes) {
    const obj = created.get(n.id)!;
    if (n.parentId && created.has(n.parentId)) {
      created.get(n.parentId)!.add(obj);
    }
  }

  // Add roots to editor (this will bind helpers / light targets properly).
  for (const n of doc.nodes) {
    if (n.parentId) continue;
    const obj = created.get(n.id)!;
    editor.add(obj, { recordHistory: false, operationName: 'Import document' });
  }

  if (options?.resetSceneSettings === false) return;
  await editor.setSceneSettings(doc.sceneSettings, { recordHistory: false, operationName: 'Import scene settings' });
  editor.render();
}

