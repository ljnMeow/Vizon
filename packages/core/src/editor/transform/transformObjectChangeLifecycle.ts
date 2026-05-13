/**
 * **Transform 实时变化副作用**：在 `TransformControls` 的 `objectChange` 事件里，
 * 统一编排多选跟随、灯光 target 同步、helper 刷新和阴影更新请求。
 *
 * 与 `transformDraggingEffects` 的区别：
 * - 那边关注“拖拽开始/结束”；
 * - 这里关注“拖拽过程中的每一次对象变化”。
 */
import * as THREE from 'three';

/** `objectChange` 期间的实时副作用编排：多选联动、light target 同步与阴影刷新。 */
type HandleTransformObjectChangeOptions = {
  activeTransformObject?: THREE.Object3D;
  selected: THREE.Object3D | null;
  applyMultiSelectionTransform: () => void;
  isLightTargetHandle: (obj: THREE.Object3D) => boolean;
  syncLightTargetFromHandle: (handle: THREE.Object3D) => void;
  markLightHelpersDirty: () => void;
  requestShadowMapUpdate: () => void;
};

export function handleTransformObjectChange(options: HandleTransformObjectChangeOptions) {
  const {
    activeTransformObject,
    selected,
    applyMultiSelectionTransform,
    isLightTargetHandle,
    syncLightTargetFromHandle,
    markLightHelpersDirty,
    requestShadowMapUpdate
  } = options;

  // 先让多选对象追随主对象，后续 helper/light 刷新才能基于最新姿态工作。
  applyMultiSelectionTransform();

  if (activeTransformObject && isLightTargetHandle(activeTransformObject)) {
    // 如果拖的是 target handle，本次变化的真正业务含义是“灯光朝向点变了”。
    syncLightTargetFromHandle(activeTransformObject);
  }

  if ((selected as { isLight?: boolean } | null)?.isLight) {
    markLightHelpersDirty();
  }

  // 灯光位置、目标点、甚至普通遮挡物移动，都可能影响阴影，因此统一请求一次刷新。
  requestShadowMapUpdate();
}
