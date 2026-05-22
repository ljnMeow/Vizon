import * as THREE from 'three';
import { VIZON_USER_DATA_KEYS } from '../infra/utils/keys';

export type NormalizeModelSizeOptions = {
  /** Target max dimension. Default 2.0. */
  targetSize?: number;
};

export type NormalizeModelSizeResult = {
  originalMaxDim: number;
  scaleFactor: number;
};

/**
 * Normalize a model's size and position so it fits a target max dimension,
 * is centered horizontally (X/Z), and sits with its bottom at y=0.
 *
 * Mutates the object in place. Call after loading but before adding to scene.
 */
export function normalizeModelSize(
  root: THREE.Object3D,
  opts?: NormalizeModelSizeOptions,
): NormalizeModelSizeResult {
  const targetSize = opts?.targetSize ?? 2.0;

  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const sizeVec = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
  const safeMaxDim = maxDim > 0 ? maxDim : 1;

  const scaleFactor = targetSize / safeMaxDim;
  root.scale.multiplyScalar(scaleFactor);

  // Recompute after scaling
  root.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(root);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

  // Center XZ, bottom at y=0
  root.position.x -= scaledCenter.x;
  root.position.z -= scaledCenter.z;
  root.position.y -= scaledBox.min.y;

  // Store metadata
  const ud = root.userData as Record<string, unknown>;
  ud[VIZON_USER_DATA_KEYS.AUTOSCALE.ORIGINAL_MAX_DIM] = maxDim;
  ud[VIZON_USER_DATA_KEYS.AUTOSCALE.SCALE_FACTOR] = scaleFactor;
  ud[VIZON_USER_DATA_KEYS.AUTOSCALE.APPLIED] = true;

  return { originalMaxDim: maxDim, scaleFactor };
}
