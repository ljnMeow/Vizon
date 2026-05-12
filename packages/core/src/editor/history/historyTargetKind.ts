/**
 * **历史 payload 中的对象分类**：把 `Object3D` 映射为 `perspective_camera`、`directional_light` 等字符串，
 * 供 `encodeHistoryPayload` 写入机器可读的 `update_property` / `transform` 记录（非 i18n 标题）。
 */
import type { Object3D } from 'three';

/**
 * 用于 `update_property` 历史 payload 的目标类型标识。
 */
export function getObjectHistoryTargetKind(obj: Object3D | null | undefined): string {
  if (!obj) return 'object';
  const anyObj = obj as any;
  if (anyObj?.isOrthographicCamera) return 'orthographic_camera';
  if (anyObj?.isPerspectiveCamera) return 'perspective_camera';
  if (anyObj?.isCamera) return 'camera';
  if (anyObj?.isDirectionalLight) return 'directional_light';
  if (anyObj?.isPointLight) return 'point_light';
  if (anyObj?.isSpotLight) return 'spot_light';
  if (anyObj?.isAmbientLight) return 'ambient_light';
  if (anyObj?.isHemisphereLight) return 'hemisphere_light';
  if (anyObj?.isRectAreaLight) return 'rect_area_light';
  if (anyObj?.isLight) return 'light';
  return 'object';
}
