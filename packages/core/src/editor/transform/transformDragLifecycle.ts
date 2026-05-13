/**
 * **Transform 拖拽生命周期**：负责记录拖拽开始快照，并在拖拽结束后收集应提交的历史操作。
 *
 * 这个模块只做“会话状态”和“历史候选收集”：
 * - 不直接写入 `HistoryManager`；
 * - 不直接操作 UI；
 * - 由 `ThreeEditor` 在合适时机把返回的 operation 真正提交。
 */
import * as THREE from 'three';

import type { LightTargetSnapshot } from '../helpers/EditorHelperManager';
import { createLightTargetHistoryOperation } from './lightTargetTransformHistory';
import {
  captureObjectTransform,
  createMultiObjectTransformHistoryOperation,
  createSingleObjectTransformHistoryOperation,
  type ObjectTransformSnapshot,
  type TransformMode
} from './objectTransformHistory';
import type { EditorHistoryOperation } from '../history';

/** 单次 TransformControls 拖拽会话中需要保留的起始态。 */
export type TransformDragSession = {
  primaryStartSnapshot: ObjectTransformSnapshot;
  selectedObjectSnapshots: Map<string, ObjectTransformSnapshot>;
  startWorldMatrices: Map<string, THREE.Matrix4>;
  primaryStartWorld: THREE.Matrix4;
  lightTargetSnapshot: LightTargetSnapshot | null;
};

type CreateTransformDragSessionOptions = {
  scene: THREE.Scene;
  selected: THREE.Object3D;
  selectedObjects: THREE.Object3D[];
  activeTransformObject?: THREE.Object3D;
  isLightTargetHandle: (obj: THREE.Object3D) => boolean;
  resolveLightByTargetHandle: (handle: THREE.Object3D) => THREE.Light | null;
  captureLightTargetSnapshot: (light: THREE.Light) => LightTargetSnapshot;
};

export function createTransformDragSession(options: CreateTransformDragSessionOptions): TransformDragSession {
  const {
    scene,
    selected,
    selectedObjects,
    activeTransformObject,
    isLightTargetHandle,
    resolveLightByTargetHandle,
    captureLightTargetSnapshot
  } = options;
  const lightTargetSnapshot =
    activeTransformObject && isLightTargetHandle(activeTransformObject)
      ? resolveLightByTargetHandle(activeTransformObject)
      : null;

  const selectedObjectSnapshots = new Map<string, ObjectTransformSnapshot>();
  const startWorldMatrices = new Map<string, THREE.Matrix4>();

  // 先强制刷新世界矩阵，再记录起始态，避免拖拽刚开始时拿到上一帧的 matrixWorld。
  scene.updateMatrixWorld(true);
  for (const obj of selectedObjects) {
    selectedObjectSnapshots.set(obj.uuid, captureObjectTransform(obj));
    startWorldMatrices.set(obj.uuid, obj.matrixWorld.clone());
  }

  return {
    primaryStartSnapshot: captureObjectTransform(selected),
    selectedObjectSnapshots,
    startWorldMatrices,
    primaryStartWorld: selected.matrixWorld.clone(),
    lightTargetSnapshot: lightTargetSnapshot ? captureLightTargetSnapshot(lightTargetSnapshot) : null
  };
}

/** 基于拖拽前后状态收集 history operation，不直接提交。 */
type CollectTransformDragHistoryOperationsOptions = {
  scene: THREE.Scene;
  selected: THREE.Object3D;
  selectedObjects: THREE.Object3D[];
  transformMode: TransformMode;
  session: TransformDragSession;
  captureLightTargetSnapshot: (light: THREE.Light) => LightTargetSnapshot;
  applyLightTargetSnapshot: (snapshot: LightTargetSnapshot) => void;
  applyObjectTransform: (target: THREE.Object3D, snapshot: ObjectTransformSnapshot) => void;
  applySelectionTransformSnapshots: (
    from: Map<string, ObjectTransformSnapshot>,
    to: Map<string, ObjectTransformSnapshot>
  ) => void;
};

export function collectTransformDragHistoryOperations(
  options: CollectTransformDragHistoryOperationsOptions
): EditorHistoryOperation[] {
  const {
    scene,
    selected,
    selectedObjects,
    transformMode,
    session,
    captureLightTargetSnapshot,
    applyLightTargetSnapshot,
    applyObjectTransform,
    applySelectionTransformSnapshots
  } = options;
  const operations: EditorHistoryOperation[] = [];

  if (session.lightTargetSnapshot) {
    const light = scene.getObjectByProperty('uuid', session.lightTargetSnapshot.lightUuid) as THREE.Light | null;
    if (light) {
      // 若本次拖的是 light target handle，则优先追加“看向点变化”的历史项。
      const operation = createLightTargetHistoryOperation({
        light,
        before: session.lightTargetSnapshot,
        after: captureLightTargetSnapshot(light),
        applySnapshot: (snapshot) => applyLightTargetSnapshot(snapshot)
      });
      if (operation) operations.push(operation);
    }
  }

  const after = captureObjectTransform(selected);
  if (session.selectedObjectSnapshots.size > 1) {
    const beforeMap = new Map(session.selectedObjectSnapshots);
    const afterMap = new Map<string, ObjectTransformSnapshot>();
    // 多选结束时逐个重新捕获快照，而不是信任拖拽时的临时值，确保撤销基于最终落点。
    for (const obj of selectedObjects) afterMap.set(obj.uuid, captureObjectTransform(obj));
    const operation = createMultiObjectTransformHistoryOperation({
      selectedObjects,
      beforeMap,
      afterMap,
      transformMode,
      applySnapshots: (from, to) => applySelectionTransformSnapshots(from, to)
    });
    if (operation) operations.push(operation);
    return operations;
  }

  // 单选场景退回到更轻量的单对象历史操作，避免把 map 序列化成不必要的复杂结构。
  const operation = createSingleObjectTransformHistoryOperation({
    target: selected,
    before: session.primaryStartSnapshot,
    after,
    transformMode,
    applySnapshot: (target, snapshot) => applyObjectTransform(target, snapshot)
  });
  if (operation) operations.push(operation);
  return operations;
}
