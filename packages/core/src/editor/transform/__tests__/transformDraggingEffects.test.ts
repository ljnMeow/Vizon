import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { handleTransformDraggingEffects } from '../transformDraggingEffects';

describe('transformDraggingEffects', () => {
  it('marks camera helpers and unfreezes selected objects while dragging', () => {
    const selected = new THREE.PerspectiveCamera();
    const selectedObjects = [new THREE.Object3D(), new THREE.Object3D()];
    const markCameraHelpersDirty = vi.fn();
    const markLightHelpersDirty = vi.fn();
    const unfreezeObjectTree = vi.fn();
    const freezeObjectTree = vi.fn();

    handleTransformDraggingEffects({
      dragging: true,
      selected,
      selectedObjects,
      freezeStaticObjects: true,
      markCameraHelpersDirty,
      markLightHelpersDirty,
      unfreezeObjectTree,
      freezeObjectTree
    });

    expect(markCameraHelpersDirty).toHaveBeenCalledTimes(1);
    expect(markLightHelpersDirty).not.toHaveBeenCalled();
    expect(unfreezeObjectTree).toHaveBeenCalledTimes(2);
    expect(unfreezeObjectTree).toHaveBeenNthCalledWith(1, selectedObjects[0]);
    expect(unfreezeObjectTree).toHaveBeenNthCalledWith(2, selectedObjects[1]);
    expect(freezeObjectTree).not.toHaveBeenCalled();
  });

  it('marks light helpers and refreezes selected objects after dragging ends', () => {
    const selected = new THREE.DirectionalLight();
    const object = new THREE.Object3D();
    const updateMatrixWorld = vi.spyOn(object, 'updateMatrixWorld');
    const markCameraHelpersDirty = vi.fn();
    const markLightHelpersDirty = vi.fn();
    const unfreezeObjectTree = vi.fn();
    const freezeObjectTree = vi.fn();

    handleTransformDraggingEffects({
      dragging: false,
      selected,
      selectedObjects: [object],
      freezeStaticObjects: true,
      markCameraHelpersDirty,
      markLightHelpersDirty,
      unfreezeObjectTree,
      freezeObjectTree
    });

    expect(markCameraHelpersDirty).not.toHaveBeenCalled();
    expect(markLightHelpersDirty).toHaveBeenCalledTimes(1);
    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
    expect(freezeObjectTree).toHaveBeenCalledWith(object);
    expect(unfreezeObjectTree).not.toHaveBeenCalled();
  });
});
