import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { computeNextMultiSelectionTransforms } from '../multiSelectionTransform';

describe('multiSelectionTransform', () => {
  it('computes local transforms for secondary selections from primary world delta', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Object3D();
    parent.position.set(10, 0, 0);
    scene.add(parent);

    const primary = new THREE.Object3D();
    primary.position.set(1, 0, 0);
    scene.add(primary);

    const secondary = new THREE.Object3D();
    secondary.position.set(2, 0, 0);
    parent.add(secondary);

    scene.updateMatrixWorld(true);

    const startWorldMatrices = new Map<string, THREE.Matrix4>([
      [primary.uuid, primary.matrixWorld.clone()],
      [secondary.uuid, secondary.matrixWorld.clone()]
    ]);
    const primaryStartWorld = primary.matrixWorld.clone();

    primary.position.set(4, 5, 6);
    scene.updateMatrixWorld(true);

    const next = computeNextMultiSelectionTransforms({
      primary,
      selectedObjects: [primary, secondary],
      primaryStartWorld,
      startWorldMatrices
    });

    const secondaryNext = next.get(secondary.uuid);
    expect(secondaryNext).toBeDefined();
    expect(secondaryNext?.position).toEqual({ x: 5, y: 5, z: 6 });
    expect(secondaryNext?.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(secondaryNext?.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('returns empty result when there is no effective multi-selection context', () => {
    const primary = new THREE.Object3D();
    primary.updateMatrixWorld(true);

    expect(
      computeNextMultiSelectionTransforms({
        primary,
        selectedObjects: [primary],
        primaryStartWorld: primary.matrixWorld.clone(),
        startWorldMatrices: new Map()
      })
    ).toEqual(new Map());
  });
});
