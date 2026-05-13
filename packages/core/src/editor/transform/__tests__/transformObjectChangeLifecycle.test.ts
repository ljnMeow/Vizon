import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { handleTransformObjectChange } from '../transformObjectChangeLifecycle';

describe('transformObjectChangeLifecycle', () => {
  it('runs multi-selection update, syncs light target handle, and marks light helpers for selected light', () => {
    const handle = new THREE.Object3D();
    const selected = Object.assign(new THREE.DirectionalLight(), { isLight: true });
    const applyMultiSelectionTransform = vi.fn();
    const isLightTargetHandle = vi.fn(() => true);
    const syncLightTargetFromHandle = vi.fn();
    const markLightHelpersDirty = vi.fn();
    const requestShadowMapUpdate = vi.fn();

    handleTransformObjectChange({
      activeTransformObject: handle,
      selected,
      applyMultiSelectionTransform,
      isLightTargetHandle,
      syncLightTargetFromHandle,
      markLightHelpersDirty,
      requestShadowMapUpdate
    });

    expect(applyMultiSelectionTransform).toHaveBeenCalledTimes(1);
    expect(isLightTargetHandle).toHaveBeenCalledWith(handle);
    expect(syncLightTargetFromHandle).toHaveBeenCalledWith(handle);
    expect(markLightHelpersDirty).toHaveBeenCalledTimes(1);
    expect(requestShadowMapUpdate).toHaveBeenCalledTimes(1);
  });

  it('still requests shadow update without active handle or light selection', () => {
    const applyMultiSelectionTransform = vi.fn();
    const requestShadowMapUpdate = vi.fn();

    handleTransformObjectChange({
      selected: new THREE.Object3D(),
      applyMultiSelectionTransform,
      isLightTargetHandle: vi.fn(),
      syncLightTargetFromHandle: vi.fn(),
      markLightHelpersDirty: vi.fn(),
      requestShadowMapUpdate
    });

    expect(applyMultiSelectionTransform).toHaveBeenCalledTimes(1);
    expect(requestShadowMapUpdate).toHaveBeenCalledTimes(1);
  });
});
