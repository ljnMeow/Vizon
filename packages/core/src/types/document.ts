import type { SceneSettings, SceneSettingsBasic, SceneSettingsEnvironment, SceneSettingsCamera, SceneSettingsGrid, RendererSettings } from '../settings/sceneSettings';
import type { SceneTreeNode, SceneTreeNodeKind } from '../settings/sceneTree';

export type VizonSchemaVersion = 1 | 2;

export type VizonUpAxis = 'y' | 'z';
export type VizonUnits = 'meter' | 'centimeter' | 'millimeter';

export type VizonDocumentMeta = {
  schemaVersion: VizonSchemaVersion;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  generator?: string; // e.g. "apps/web"
  units?: VizonUnits;
  upAxis?: VizonUpAxis;
};

export type VizonContentNode = {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  kind: SceneTreeNodeKind;
  children: VizonContentNode[];
  attribute: Record<string, unknown>;
  material?: Record<string, unknown> | Array<Record<string, unknown>>;
  effects?: Record<string, unknown>;
};

export type VizonNodeId = string; // use Object3D.uuid

export type VizonVec3 = { x: number; y: number; z: number };
export type VizonQuat = { x: number; y: number; z: number; w: number };

export type VizonNodeComponents = {
  /**
   * Default factories (fast-path restore).
   * If present, importer should prefer factory creation then apply transforms & overrides.
   */
  defaults?: {
    modelKey?: string;
    lightKey?: string;
    cameraKey?: string;
  };

  /** Effects settings (currently sourced from userData white-list). */
  effects?: {
    borderEnabled?: boolean;
    borderWidth?: number;
    borderColor?: string;
    glowEnabled?: boolean;
    glowColor?: string;
    glowRange?: number;
    glowBrightness?: number;
  };

  /** Light properties for non-default lights (minimal subset). */
  light?: {
    color?: string; // "#rrggbb"
    intensity?: number;
    castShadow?: boolean;
  };

  /** Camera properties for scene cameras (minimal subset). */
  camera?: {
    fov?: number;
    near?: number;
    far?: number;
  };
};

export type VizonNode = {
  id: VizonNodeId;
  name: string;
  type: string; // three Object3D.type
  parentId: VizonNodeId | null;
  children: VizonNodeId[];

  visible: boolean;
  layers: number[]; // enabled layers indices

  position: VizonVec3;
  quaternion: VizonQuat;
  scale: VizonVec3;

  /**
   * Controlled flags that impact editor interactions.
   * These are sourced from known userData keys, but stored explicitly for stability.
   */
  flags?: {
    hideInEditor?: boolean;
    nonSelectable?: boolean;
    nonPickable?: boolean;
    dynamic?: boolean;
  };

  components?: VizonNodeComponents;
};

export type VizonAssets = {
  // Placeholder for future indexed assets.
  // Keep as object to allow forward-compatible extension without breaking schema.
  materials?: Record<string, unknown>;
  geometries?: Record<string, unknown>;
  textures?: Record<string, unknown>;
  envs?: Record<string, unknown>;
  models?: Record<string, unknown>;
};

export type VizonDocument = {
  meta: VizonDocumentMeta;
  basic: SceneSettingsBasic;
  environment: SceneSettingsEnvironment;
  camera: SceneSettingsCamera;
  grid: SceneSettingsGrid;
  helpers: SceneSettings['helpers'];
  renderer: RendererSettings;
  sceneTree: SceneTreeNode[];
  content: VizonContentNode[];
  assets?: VizonAssets;
  /**
   * 向后兼容旧文档结构，仅用于读取历史数据，不再作为主写入字段。
   */
  sceneSettings?: SceneSettings;
  sceneSnapshot?: Record<string, unknown>;
  nodes?: VizonNode[];
};

