/**
 * vizon-3d-core 对外入口（聚合导出）。
 *
 * 作用：
 * - 把编辑器门面 `ThreeEditor` 暴露给 apps/web 等上层；
 * - 暴露可序列化的 `SceneSettings` 与工厂函数（默认相机/灯光/模型等）。
 *
 * 目录说明（与源码结构对应）：
 * - `settings/`：场景配置数据与 diff；
 * - `defaults/`：创建默认 three 对象的工厂；
 * - `editor/`：运行时编辑器（渲染、交互、环境等）；
 * - `infra/`：事件、数学等基础设施。
 */
export { ThreeEditor } from './editor/ThreeEditor';
export type {
  ThreeEditorEvents,
  ThreeEditorOptions,
  TransformMode,
  ViewPreset,
  ViewTransitionOptions
} from './editor/ThreeEditor';
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
