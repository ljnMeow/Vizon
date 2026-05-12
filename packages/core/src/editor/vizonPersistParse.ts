import { normalizeSceneSettings } from '../settings/sceneSettings';
import type { SceneSettings } from '../settings/sceneSettings';
import type { VizonContentNode, VizonDocument, VizonNode, VizonQuat, VizonVec3 } from '../types/document';
import { isRecord, nowIso, toBool, toFiniteNumber, toQuat, toString, toVec3 } from './vizonPersistShared';

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

export function normalizeVizonDocument(doc: VizonDocument): VizonDocument {
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

export function normalizeNode(input: unknown): VizonNode {
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
