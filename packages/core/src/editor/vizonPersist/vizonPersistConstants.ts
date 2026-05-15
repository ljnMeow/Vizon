/**
 * 持久化层 **常量**：schema 版本号、导入错误标识、以及序列化时跳过的运行时 helper 类型名集合。
 * 与 `vizonPersistScene` 中「不参与 objectSnapshot 的对象」逻辑保持一致。
 */

/**
 * 与持久化 meta 对齐的当前最高版本号。
 * 每次发布破坏性文档格式变更时递增，同时在 migrateVizonDocument 中追加对应迁移分支。
 */
export const LATEST_SCHEMA_VERSION = 2 as const;

/**
 * 导入失败错误标识：content 数组非空，但其中没有任何带 objectSnapshot 的根节点。
 * 这意味着文档存在场景描述，但无法从中恢复任何 Three.js 对象。
 * 由上层（如 apps/web）用 i18n 映射为用户可读说明，而不在 core 层硬编码中文字符串。
 */
export const VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT = 'VIZON_IMPORT_NO_OBJECT_SNAPSHOT' as const;

/**
 * 序列化与导入时需要跳过的运行时 helper 对象类型集合。
 *
 * 这些对象由编辑器在运行时创建（如灯光预览线框、轴线辅助器、阴影视锥等），
 * 不属于用户创作内容，不应被写入 objectSnapshot 或 scene.json。
 * 与 `vizonPersistScene.ts` 中的 `isRuntimeHelperObject` 判断逻辑保持同步。
 */
export const RUNTIME_HELPER_TYPES = new Set([
  // 变换控件相关，由 ThreeEditor TransformControls 在运行时创建
  'TransformControlsGizmo',
  'TransformControlsPlane',
  // 场景辅助器，由 SceneSettings 网格/坐标轴开关控制
  'GridHelper',
  'AxesHelper',
  // 相机视锥辅助线框
  'CameraHelper',
  // 各类灯光辅助线框
  'DirectionalLightHelper',
  'PointLightHelper',
  'SpotLightHelper',
  'HemisphereLightHelper',
  'RectAreaLightHelper',
  // 物体选中时的包围盒线框
  'BoxHelper',
  // 轮廓描边效果使用的线段（LineSegments2 来自 three/examples）
  'LineSegments2',
]);
