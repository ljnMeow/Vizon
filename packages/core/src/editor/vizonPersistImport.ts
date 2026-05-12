import * as THREE from 'three';
import type { ThreeEditor } from './ThreeEditor';
import { createDefaultCamera } from '../defaults/defaultCameras';
import { createDefaultLight } from '../defaults/defaultLights';
import { createDefaultModel } from '../defaults/defaultModels';
import { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../infra/utils';
import { normalizeSceneSettings } from '../settings/sceneSettings';
import type { SceneSettings } from '../settings/sceneSettings';
import type { VizonContentNode, VizonDocument, VizonNode } from '../types/document';
import { VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT } from './vizonPersistConstants';
import {
  applyImportedLightTargetFromUserData,
  applyLayers,
  createRuntimeCameraHelper,
  createRuntimeLightHelper,
  ensureImportedLightTargetHandle,
} from './vizonPersistScene';
import { isRecord, toFiniteNumber, toString } from './vizonPersistShared';

/** 与序列化侧 attribute.helper 对齐；导入时仅读 enabled/type。 */
type PersistedHelperSnapshot = {
  enabled: true;
  type: string;
  objectSnapshot?: Record<string, unknown>;
};

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

/**
 * 将已 parse 的文档恢复到编辑器（调用方须已 `clearSceneNodes`）。
 * 与 SceneSettings 仅通过 parse 后的文档字段对齐一套结构。
 */
export async function importParsedDocument(
  editor: ThreeEditor,
  doc: VizonDocument,
  options?: { resetSceneSettings?: boolean }
): Promise<void> {
  // 以 content 为唯一场景数据来源（物体/场景内灯光/场景内相机等均应在 objectSnapshot 内）
  if (Array.isArray(doc.content) && doc.content.length > 0) {
    const added = importSceneFromContentNodes(editor, doc.content);
    if (added === 0) {
      throw new Error(VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT);
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
