/**
 * **Transform 快照回放**：把历史系统保存的 transform 快照重新写回 three 对象。
 *
 * 使用场景：
 * - undo / redo；
 * - 多选拖拽历史项的 do/undo；
 * - 任何需要把“记录下来的局部变换”重新落回场景树的地方。
 */
import * as THREE from 'three';

import type { ObjectTransformSnapshot } from './objectTransformHistory';

/** 将 transform snapshot 写回单个对象，并触发 editor 相关 helper/light 副作用。 */
type ApplyObjectTransformSnapshotOptions = {
  object: THREE.Object3D;
  snapshot: ObjectTransformSnapshot;
  isLightTargetHandle: (obj: THREE.Object3D) => boolean;
  syncLightTargetFromHandle: (handle: THREE.Object3D) => void;
  markCameraHelpersDirty: () => void;
  markLightHelpersDirty: () => void;
};

export function applyObjectTransformSnapshot(options: ApplyObjectTransformSnapshotOptions) {
  const {
    object,
    snapshot,
    isLightTargetHandle,
    syncLightTargetFromHandle,
    markCameraHelpersDirty,
    markLightHelpersDirty
  } = options;
  // 这里直接写 position/rotation/scale，而不是整体覆盖 matrix，保持与编辑器常规写法一致。
  object.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
  object.rotation.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z);
  object.scale.set(snapshot.scale.x, snapshot.scale.y, snapshot.scale.z);
  object.updateMatrixWorld(true);

  // 回放对象本身的 transform 后，还要补上与编辑器 helper 相关的连带状态。
  if (isLightTargetHandle(object)) syncLightTargetFromHandle(object);
  if ((object as { isCamera?: boolean }).isCamera) markCameraHelpersDirty();
  if ((object as { isLight?: boolean }).isLight) markLightHelpersDirty();
}

type ApplySelectionTransformSnapshotMapOptions = {
  scene: THREE.Scene;
  from: Map<string, ObjectTransformSnapshot>;
  to: Map<string, ObjectTransformSnapshot>;
  applyObjectTransformSnapshot: (object: THREE.Object3D, snapshot: ObjectTransformSnapshot) => void;
};

/** 按 uuid 将 snapshot map 应用回当前 scene 中仍存在的对象。 */
export function applySelectionTransformSnapshotMap(options: ApplySelectionTransformSnapshotMapOptions) {
  const { scene, from, to, applyObjectTransformSnapshot } = options;
  for (const [uuid, fallbackSnapshot] of from.entries()) {
    // 历史记录时存在的对象，在回放时可能已被删除；这里选择静默跳过而不是抛错。
    const object = scene.getObjectByProperty('uuid', uuid);
    if (!object) continue;
    applyObjectTransformSnapshot(object, to.get(uuid) ?? fallbackSnapshot);
  }
}
