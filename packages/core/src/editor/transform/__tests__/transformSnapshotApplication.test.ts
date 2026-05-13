import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  applyObjectTransformSnapshot,
  applySelectionTransformSnapshotMap
} from '../transformSnapshotApplication';
import type { ObjectTransformSnapshot } from '../objectTransformHistory';

describe('transformSnapshotApplication', () => {
  it('applies snapshot and triggers handle/helper side effects', () => {
    const object = new THREE.PerspectiveCamera();
    const snapshot: ObjectTransformSnapshot = {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
      scale: { x: 4, y: 5, z: 6 }
    };
    const syncLightTargetFromHandle = vi.fn();
    const markCameraHelpersDirty = vi.fn();
    const markLightHelpersDirty = vi.fn();

    applyObjectTransformSnapshot({
      object,
      snapshot,
      isLightTargetHandle: () => true,
      syncLightTargetFromHandle,
      markCameraHelpersDirty,
      markLightHelpersDirty
    });

    expect(object.position.toArray()).toEqual([1, 2, 3]);
    expect(object.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3]);
    expect(object.scale.toArray()).toEqual([4, 5, 6]);
    expect(syncLightTargetFromHandle).toHaveBeenCalledWith(object);
    expect(markCameraHelpersDirty).toHaveBeenCalledTimes(1);
    expect(markLightHelpersDirty).not.toHaveBeenCalled();
  });

  it('applies snapshot map using current scene objects and fallback snapshots', () => {
    const scene = new THREE.Scene();
    const first = new THREE.Object3D();
    first.uuid = 'a';
    const second = new THREE.Object3D();
    second.uuid = 'b';
    scene.add(first);
    scene.add(second);

    const fallback: ObjectTransformSnapshot = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    const next: ObjectTransformSnapshot = {
      position: { x: 7, y: 8, z: 9 },
      rotation: { x: 0, y: 0.5, z: 0 },
      scale: { x: 2, y: 2, z: 2 }
    };
    const applyObjectSnapshot = vi.fn();

    applySelectionTransformSnapshotMap({
      scene,
      from: new Map([
        ['a', fallback],
        ['b', fallback]
      ]),
      to: new Map([['b', next]]),
      applyObjectTransformSnapshot: applyObjectSnapshot
    });

    expect(applyObjectSnapshot).toHaveBeenNthCalledWith(1, first, fallback);
    expect(applyObjectSnapshot).toHaveBeenNthCalledWith(2, second, next);
  });
});
