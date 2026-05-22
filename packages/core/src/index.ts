/**
 * vizon-3d-core 对外入口（聚合导出）。
 *
 * **包职责**：在 **不依赖 React** 的前提下，提供基于 three.js 的场景编辑器运行时（`ThreeEditor`）、
 * 可序列化的场景配置（`SceneSettings` / `VizonDocument`）、以及导入导出、历史撤销、资源加载等能力。
 * 应用层（如 `apps/web`）通过本文件的具名导出消费 API；请勿在应用里 deep-import `src` 内部路径，以免破坏封装。
 *
 * **源码目录速查**（`packages/core/src`）：
 * - `editor/ThreeEditor.ts` — 编辑器门面：生命周期、选中、历史、场景应用、持久化构建入口等。
 * - `editor/vizonPersist/` — **文档持久化子模块**：JSON 解析/迁移、场景树序列化、导入重建、`importDocument` 聚合。
 * - `editor/history/` — 撤销栈与对象/渲染器/场景设置的「预览→提交」历史辅助（纯逻辑 + `HistoryManager`）。
 * - `editor/selection/` — 多选集合纯推导与选中变更副作用编排（`SelectionOrchestrator`）。
 * - `editor/controllers/` — 垂直子系统：渲染器、环境、交互、资源加载等。
 * - `editor/services/` — 渲染循环、场景图同步等较长生命周期服务。
 * - `editor/picking/` — 射线拾取 layer 与可选/可见性守卫。
 * - `settings/` — `SceneSettings` 类型、`normalize`、与场景树的 diff。
 * - `defaults/` — 默认相机/灯光/模型及注册表常量。
 * - `types/document.ts` — `VizonDocument` / 节点快照等跨持久化边界的类型。
 * - `infra/` — 轻量事件总线、`userData` 辅助、常量 key、历史名字编码等。
 * - `material/`、`texture/` — 与材质切换、贴图加载相关的可复用逻辑（供 core / web 共用）。
 */
export { ThreeEditor } from './editor/ThreeEditor';
/** 选中集合纯推导：可单测，也可在上层策略里复用 */
export {
  computeNextPrimary,
  computeNextSelectedObjects,
  computeTransformAttachTarget
} from './editor/selection/nextSelection';
export { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS, VIZON_HISTORY_KEYS } from './infra/utils';
export { getVizonUserData } from './infra/utils';
export type { Vec3Like, XYZ } from './infra/utils';
export type { VizonDocument, VizonNode } from './types/document';
export {
  buildVizonDocumentFromEditor,
  importDocument,
  parseVizonDocument,
  migrateVizonDocument,
  VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT
} from './editor/vizonPersist';
export type { VizonDocumentBuildEditorLike } from './editor/vizonPersist';
export type {
  ThreeEditorEvents,
  ThreeEditorOptions,
  TransformMode,
  ViewPreset,
  ViewTransitionOptions
} from './editor/ThreeEditor';
export type { EditorHistoryRecord, EditorHistoryOperation } from './editor/history';
export {
  HistoryManager,
  cloneForHistory,
  encodeHistoryPayload,
  executeWithHistoryNotify,
  formatHistoryValue,
  getObjectHistoryTargetKind,
  isHistoryValueEqual,
  readNestedPath,
  readNestedValueCloned,
  runObjectPropertyHistoryStep,
  runRendererSettingsHistoryCommit,
  runSceneSettingsHistoryCommit,
  seedObjectPropertyPendingBaseline,
  takeObjectPropertyHistoryBaseline,
  createSingleSlotPending,
  seedSingleSlotBaselineIfEmpty,
  takeSingleSlotBaselineOrLive,
  type RunObjectPropertyHistoryParams,
  type RunRendererSettingsHistoryCommitParams,
  type RunSceneSettingsHistoryCommitParams,
  type SingleSlotPending
} from './editor/history';
/** 场景树节点类型：供结构面板、拖拽等 UI 使用 */
export type { SceneTreeNode, SceneTreeNodeKind } from './settings/sceneTree';
/** 轻量发布-订阅退订函数类型 */
export type { Unsubscribe } from './infra/events';

export type {
  SceneSettings,
  SceneSettingsBasic,
  SceneSettingsEnvironment,
  SceneSettingsFog,
  SceneSettingsGrid,
  SceneSettingsCamera,
  SceneSettingsHdri,
  SceneSettingsUploadedHdri,
  SceneSettingsBackgroundMode,
  RendererSettings,
  RendererOutputColorSpace,
  RendererToneMapping,
  RendererShadowMapType
} from './settings/sceneSettings';
export { createDefaultSceneSettings, normalizeSceneSettings } from './settings/sceneSettings';
export {
  createDefaultModel,
  defaultModels
} from './defaults/defaultModels';
export type { DefaultModelKey, CreateDefaultModelOptions, DefaultModelMeta } from './defaults/defaultModels';

export { createDefaultCamera, defaultCameras } from './defaults/defaultCameras';
export type { DefaultCameraKey, CreateDefaultCameraOptions, DefaultCameraMeta } from './defaults/defaultCameras';
export { createDefaultLight, defaultLights } from './defaults/defaultLights';
export type { DefaultLightKey, CreateDefaultLightOptions, DefaultLightMeta } from './defaults/defaultLights';
export {
  DEFAULT_SCENE_SETTINGS,
  DEFAULT_MODELS,
  DEFAULT_CAMERAS,
  DEFAULT_LIGHTS,
  DEFAULT_MESH_COLOR,
  DEFAULT_LIGHT_HELPER_COLOR
} from './defaults/registry';

/** 贴图加载（避免 apps 直接依赖 three.js API） */
export {
  loadImageTextureFromUrl,
  loadImageTextureFromFile,
  loadEquirectEnvMapTextureFromUrl,
  loadEquirectEnvMapTextureFromFile,
} from './texture/loadImageTexture';

/** 材质类型切换（避免 apps 直接依赖 three.js API） */
export { switchMaterialType, switchMaterialTypeOnObject } from './material/switchMaterialType';

/** 3D 模型缩略图生成（避免 apps 直接依赖 three.js API） */
export { generateModel3dThumbnail, isModel3dThumbnailSupported } from './model3d/generateModel3dThumbnail';

/** 模型自动缩放（拖拽添加到场景时归一化尺寸） */
export { normalizeModelSize } from './model3d/normalizeModelSize';
export type { NormalizeModelSizeOptions, NormalizeModelSizeResult } from './model3d/normalizeModelSize';
