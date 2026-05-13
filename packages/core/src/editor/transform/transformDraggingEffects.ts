/**
 * **拖拽期间副作用**：在 `dragging-changed` 事件触发时，集中处理 helper 刷新与静态树冻结策略。
 *
 * 这里不关心“拖了多少”或“历史怎么记”，只处理拖拽过程中的运行时体验问题：
 * - camera/light helper 需要即时标脏；
 * - freezeStaticObjects 模式下，拖拽时临时解冻，结束后重新冻结。
 */
import * as THREE from 'three';

/** `dragging-changed` 期间的收尾副作用：helper dirty 与 static subtree freeze/unfreeze。 */
type HandleTransformDraggingEffectsOptions = {
  dragging: boolean;
  selected: THREE.Object3D;
  selectedObjects: THREE.Object3D[];
  freezeStaticObjects: boolean;
  markCameraHelpersDirty: () => void;
  markLightHelpersDirty: () => void;
  unfreezeObjectTree: (object: THREE.Object3D) => void;
  freezeObjectTree: (object: THREE.Object3D) => void;
};

export function handleTransformDraggingEffects(options: HandleTransformDraggingEffectsOptions) {
  const {
    dragging,
    selected,
    selectedObjects,
    freezeStaticObjects,
    markCameraHelpersDirty,
    markLightHelpersDirty,
    unfreezeObjectTree,
    freezeObjectTree
  } = options;

  if ((selected as { isCamera?: boolean }).isCamera) markCameraHelpersDirty();
  if ((selected as { isLight?: boolean }).isLight) markLightHelpersDirty();

  if (!freezeStaticObjects) return;

  if (dragging) {
    // 拖拽中必须恢复 matrixAutoUpdate，否则 gizmo 改值后不会继续传播到子树。
    for (const object of selectedObjects) unfreezeObjectTree(object);
    return;
  }

  for (const object of selectedObjects) {
    // 结束拖拽时先把最新矩阵烘焙到 world，再冻结，避免冻结住旧状态。
    object.updateMatrixWorld(true);
    freezeObjectTree(object);
  }
}
