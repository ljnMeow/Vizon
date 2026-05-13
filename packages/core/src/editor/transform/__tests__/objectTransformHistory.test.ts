import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  captureObjectTransform,
  createMultiObjectTransformHistoryOperation,
  createSingleObjectTransformHistoryOperation,
  getTransformActionLabel,
  hasTransformSnapshotMapChanges,
  isSameTransformSnapshot,
  type ObjectTransformSnapshot
} from '../objectTransformHistory';

describe('objectTransformHistory', () => {
  it('captures and compares object transform snapshots', () => {
    const obj = new THREE.Object3D();
    obj.position.set(1, 2, 3);
    obj.rotation.set(0.1, 0.2, 0.3);
    obj.scale.set(4, 5, 6);

    const snapshot = captureObjectTransform(obj);

    expect(snapshot).toEqual({
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
      scale: { x: 4, y: 5, z: 6 }
    });
    expect(
      isSameTransformSnapshot(snapshot, {
        ...snapshot,
        position: { ...snapshot.position, x: snapshot.position.x + 1e-7 }
      })
    ).toBe(true);
  });

  it('creates single-object transform history operation', () => {
    const obj = new THREE.Mesh();
    obj.uuid = 'obj-1';
    const before: ObjectTransformSnapshot = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    const after: ObjectTransformSnapshot = {
      position: { x: 3, y: 4, z: 5 },
      rotation: { x: 0, y: 0.5, z: 0 },
      scale: { x: 1, y: 2, z: 1 }
    };
    const applySnapshot = vi.fn();

    const operation = createSingleObjectTransformHistoryOperation({
      target: obj,
      before,
      after,
      transformMode: 'translate',
      applySnapshot
    });

    expect(operation).not.toBeNull();
    expect(operation?.name).toContain('"op":"transform"');
    expect(operation?.name).toContain('"action":"move"');
    expect(operation?.name).toContain('"uuid":"obj-1"');
    expect(operation?.mergeKey).toBe('transform-object:obj-1:translate');

    operation?.do();
    operation?.undo();

    expect(applySnapshot).toHaveBeenNthCalledWith(1, obj, after);
    expect(applySnapshot).toHaveBeenNthCalledWith(2, obj, before);
  });

  it('creates multi-object transform history operation when any snapshot changes', () => {
    const first = new THREE.Object3D();
    first.uuid = 'a';
    const second = new THREE.Object3D();
    second.uuid = 'b';
    const beforeMap = new Map<string, ObjectTransformSnapshot>([
      [
        'a',
        {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      ],
      [
        'b',
        {
          position: { x: 1, y: 1, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      ]
    ]);
    const afterMap = new Map(beforeMap);
    afterMap.set('b', {
      position: { x: 2, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });
    const applySnapshots = vi.fn();

    expect(hasTransformSnapshotMapChanges(beforeMap, afterMap)).toBe(true);

    const operation = createMultiObjectTransformHistoryOperation({
      selectedObjects: [first, second],
      beforeMap,
      afterMap,
      transformMode: 'rotate',
      applySnapshots
    });

    expect(operation).not.toBeNull();
    expect(operation?.name).toContain('"action":"rotate"');
    expect(operation?.name).toContain('"uuid":"a,b"');
    expect(operation?.mergeKey).toBe('transform-objects:a|b:rotate');

    operation?.do();
    operation?.undo();

    expect(applySnapshots).toHaveBeenNthCalledWith(1, beforeMap, afterMap);
    expect(applySnapshots).toHaveBeenNthCalledWith(2, afterMap, beforeMap);
  });

  it('returns null when transform snapshot has not changed', () => {
    const obj = new THREE.Object3D();
    const snapshot: ObjectTransformSnapshot = {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
      scale: { x: 1, y: 1, z: 1 }
    };

    expect(
      createSingleObjectTransformHistoryOperation({
        target: obj,
        before: snapshot,
        after: { ...snapshot, position: { ...snapshot.position } },
        transformMode: 'scale',
        applySnapshot: vi.fn()
      })
    ).toBeNull();
    expect(getTransformActionLabel('scale')).toBe('scale');
  });
});
