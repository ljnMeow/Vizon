/**
 * **多选 transform 纯推导**：当主选对象被 TransformControls 拖动后，
 * 计算其它被选对象在各自父空间中应该落到的新 position/rotation/scale。
 *
 * 算法核心：
 * - 先算出主对象世界矩阵相对拖拽开始时的 delta；
 * - 再把这个 delta 乘到每个从对象的起始世界矩阵上；
 * - 最后投回从对象父节点局部空间，得到可直接写回的局部 transform。
 */
import * as THREE from 'three';

import type { ObjectTransformSnapshot } from './objectTransformHistory';

function normalizeZero(value: number) {
  // three / 矩阵分解后偶尔会得到 -0，序列化与 diff 时看起来很吓人，但语义上应视作 0。
  return Object.is(value, -0) ? 0 : value;
}

type MultiSelectionTransformOptions = {
  primary: THREE.Object3D;
  selectedObjects: THREE.Object3D[];
  primaryStartWorld: THREE.Matrix4;
  startWorldMatrices: Map<string, THREE.Matrix4>;
};

export function computeNextMultiSelectionTransforms(
  options: MultiSelectionTransformOptions
): Map<string, ObjectTransformSnapshot> {
  const { primary, selectedObjects, primaryStartWorld, startWorldMatrices } = options;
  const result = new Map<string, ObjectTransformSnapshot>();
  if (selectedObjects.length <= 1 || startWorldMatrices.size <= 1) return result;

  // primary 当前世界矩阵 * primary 起始世界矩阵逆 = 本次拖拽产生的世界空间增量。
  const invPrimaryStartWorld = primaryStartWorld.clone().invert();
  const delta = primary.matrixWorld.clone().multiply(invPrimaryStartWorld);
  const parentWorldInverse = new THREE.Matrix4();
  const nextWorld = new THREE.Matrix4();
  const nextPos = new THREE.Vector3();
  const nextQuat = new THREE.Quaternion();
  const nextScale = new THREE.Vector3();
  const nextEuler = new THREE.Euler();

  for (const obj of selectedObjects) {
    if (obj === primary) continue;
    const startWorld = startWorldMatrices.get(obj.uuid);
    if (!startWorld) continue;
    nextWorld.copy(delta).multiply(startWorld);
    if (obj.parent) {
      // TransformControls 改的是局部 position/rotation/scale，因此需要把世界结果再投回父空间。
      parentWorldInverse.copy(obj.parent.matrixWorld).invert();
      nextWorld.premultiply(parentWorldInverse);
    }
    nextWorld.decompose(nextPos, nextQuat, nextScale);
    nextEuler.setFromQuaternion(nextQuat, obj.rotation.order);
    result.set(obj.uuid, {
      position: {
        x: normalizeZero(nextPos.x),
        y: normalizeZero(nextPos.y),
        z: normalizeZero(nextPos.z)
      },
      rotation: {
        x: normalizeZero(nextEuler.x),
        y: normalizeZero(nextEuler.y),
        z: normalizeZero(nextEuler.z)
      },
      scale: {
        x: normalizeZero(nextScale.x),
        y: normalizeZero(nextScale.y),
        z: normalizeZero(nextScale.z)
      }
    });
  }

  return result;
}
