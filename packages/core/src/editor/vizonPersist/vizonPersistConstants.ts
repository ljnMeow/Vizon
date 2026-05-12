/**
 * 持久化层 **常量**：schema 版本、导入错误标识、以及序列化时跳过的运行时 helper 类型名集合。
 * 与 `vizonPersistScene` 中「不参与 objectSnapshot 的对象」逻辑保持一致。
 */

/** 与持久化 meta 对齐的版本号 */
export const LATEST_SCHEMA_VERSION = 2 as const;

/**
 * `importDocument`：content 非空但未恢复任何对象（无有效 objectSnapshot）。
 * 由上层（如 web）用 i18n 映射为用户可读说明。
 */
export const VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT = 'VIZON_IMPORT_NO_OBJECT_SNAPSHOT' as const;

/** 不参与 objectSnapshot 的运行时 helper 类型集合（与 isRuntimeHelperObject 对齐）。 */
export const RUNTIME_HELPER_TYPES = new Set([
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
