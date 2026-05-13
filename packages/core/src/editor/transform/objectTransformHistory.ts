/**
 * **对象 transform 历史辅助**：提供 transform 快照捕获、比较，以及单选/多选拖拽的历史操作构造。
 *
 * 设计目标：
 * - 把 `ThreeEditor` 里“记录拖拽前后状态”的重复逻辑抽离出来；
 * - 统一 mergeKey、历史文案与 snapshot 结构；
 * - 让这部分逻辑保持纯函数风格，便于单测。
 */
import * as THREE from 'three';
import { VIZON_HISTORY_KEYS } from '../../infra/utils';
import { encodeHistoryPayload, getObjectHistoryTargetKind, type EditorHistoryOperation } from '../history';

export type TransformMode = 'translate' | 'rotate' | 'scale';

export type ObjectTransformSnapshot = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

export function captureObjectTransform(obj: THREE.Object3D): ObjectTransformSnapshot {
  // 只记录本地变换，不记录 matrix/matrixWorld；这样撤销时能继续尊重父子层级关系。
  return {
    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
    rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
    scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
  };
}

export function isSameTransformSnapshot(a: ObjectTransformSnapshot, b: ObjectTransformSnapshot) {
  const eps = 1e-6;
  // 旋转/缩放在矩阵分解后可能有极小抖动，直接严格比较会制造很多假变化。
  const close = (x: number, y: number) => Math.abs(x - y) <= eps;
  return (
    close(a.position.x, b.position.x) &&
    close(a.position.y, b.position.y) &&
    close(a.position.z, b.position.z) &&
    close(a.rotation.x, b.rotation.x) &&
    close(a.rotation.y, b.rotation.y) &&
    close(a.rotation.z, b.rotation.z) &&
    close(a.scale.x, b.scale.x) &&
    close(a.scale.y, b.scale.y) &&
    close(a.scale.z, b.scale.z)
  );
}

export function getTransformActionLabel(mode: TransformMode) {
  if (mode === 'rotate') return 'rotate';
  if (mode === 'scale') return 'scale';
  return 'move';
}

export function hasTransformSnapshotMapChanges(
  beforeMap: Map<string, ObjectTransformSnapshot>,
  afterMap: Map<string, ObjectTransformSnapshot>
) {
  // 只关心 beforeMap 中已登记对象的变化；拖拽期间临时加入/移除的对象不在这里处理。
  return Array.from(beforeMap.entries()).some(([uuid, snapshot]) => {
    const next = afterMap.get(uuid);
    return next ? !isSameTransformSnapshot(snapshot, next) : false;
  });
}

type CreateSingleObjectTransformHistoryOperationOptions = {
  target: THREE.Object3D;
  before: ObjectTransformSnapshot;
  after: ObjectTransformSnapshot;
  transformMode: TransformMode;
  applySnapshot: (target: THREE.Object3D, snapshot: ObjectTransformSnapshot) => void;
};

export function createSingleObjectTransformHistoryOperation(
  options: CreateSingleObjectTransformHistoryOperationOptions
): EditorHistoryOperation | null {
  const { target, before, after, transformMode, applySnapshot } = options;
  if (isSameTransformSnapshot(before, after)) return null;
  const actionLabel = getTransformActionLabel(transformMode);
  const targetKind = getObjectHistoryTargetKind(target);
  return {
    // 历史 payload 继续沿用统一编码协议，便于上层 UI 做本地化解析。
    name: encodeHistoryPayload(VIZON_HISTORY_KEYS.OP_PREFIX, {
      op: 'transform',
      action: actionLabel,
      targetKind,
      uuid: target.uuid
    }),
    mergeKey: `transform-object:${target.uuid}:${transformMode}`,
    mergeWindowMs: 120,
    do: () => applySnapshot(target, after),
    undo: () => applySnapshot(target, before)
  };
}

type CreateMultiObjectTransformHistoryOperationOptions = {
  selectedObjects: THREE.Object3D[];
  beforeMap: Map<string, ObjectTransformSnapshot>;
  afterMap: Map<string, ObjectTransformSnapshot>;
  transformMode: TransformMode;
  applySnapshots: (
    from: Map<string, ObjectTransformSnapshot>,
    to: Map<string, ObjectTransformSnapshot>
  ) => void;
};

export function createMultiObjectTransformHistoryOperation(
  options: CreateMultiObjectTransformHistoryOperationOptions
): EditorHistoryOperation | null {
  const { selectedObjects, beforeMap, afterMap, transformMode, applySnapshots } = options;
  if (!hasTransformSnapshotMapChanges(beforeMap, afterMap)) return null;
  // 多选 mergeKey 用“排序后的 uuid 集合”，避免选中顺序不同导致同一批对象无法合并历史。
  const uuids = selectedObjects.map((obj) => obj.uuid);
  return {
    name: encodeHistoryPayload(VIZON_HISTORY_KEYS.OP_PREFIX, {
      op: 'transform',
      action: getTransformActionLabel(transformMode),
      targetKind: 'object',
      uuid: uuids.join(',')
    }),
    mergeKey: `transform-objects:${uuids.slice().sort().join('|')}:${transformMode}`,
    mergeWindowMs: 120,
    do: () => applySnapshots(beforeMap, afterMap),
    undo: () => applySnapshots(afterMap, beforeMap)
  };
}
