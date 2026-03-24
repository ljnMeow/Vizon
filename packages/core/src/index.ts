/**
 * core 对外入口：
 * - 导出编辑器 facade（ThreeEditor）
 * - 导出 scene/renderer 配置相关类型与辅助函数（数据真相 + 校验归一化）
 *
 * 注意：UI/状态管理不属于 core 的职责边界，上层应用按需要自行组织。
 */
export { ThreeEditor } from './ThreeEditor';
export type {
  ThreeEditorEvents,
  ThreeEditorOptions,
  TransformMode,
  ViewPreset,
  ViewTransitionOptions
} from './ThreeEditor';
export type { SceneTreeNode, SceneTreeNodeKind } from './sceneTree';
export type { Unsubscribe } from './events';

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
} from './sceneSettings';
export { createDefaultSceneSettings, normalizeSceneSettings } from './sceneSettings';
export {
  createDefaultModel,
  defaultModels
} from './defaultModels';
export type { DefaultModelKey, CreateDefaultModelOptions, DefaultModelMeta } from './defaultModels';
