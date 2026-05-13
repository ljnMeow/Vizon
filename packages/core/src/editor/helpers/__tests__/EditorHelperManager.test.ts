import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { EditorHelperManager } from '../EditorHelperManager';
import { createLightTargetHandle } from '../lightHelperUtils';
import { VIZON_USER_DATA_KEYS } from '../../../infra/utils';

describe('EditorHelperManager', () => {
  it('binds light helpers and target handles into the scene', () => {
    const scene = new THREE.Scene();
    const requestShadowMapUpdate = vi.fn();
    const manager = new EditorHelperManager({ scene, requestShadowMapUpdate });

    const light = new THREE.SpotLight(0xffffff, 1);
    const helper = new THREE.SpotLightHelper(light);
    const handle = createLightTargetHandle(light, new THREE.Vector3(1, 2, 3), 'SpotLight', { persistTargetData: true });
    light.userData[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper;
    scene.add(light);

    manager.bindHelpersForSubtree(light);

    expect(helper.parent).toBe(scene);
    expect(handle.parent).toBe(scene);
    expect(manager.getLightTargetHandle(light.uuid)).toBe(handle);
    expect(light.target.parent).toBe(scene);
  });

  it('syncs light targets from target handles back into light state', () => {
    const scene = new THREE.Scene();
    const requestShadowMapUpdate = vi.fn();
    const manager = new EditorHelperManager({ scene, requestShadowMapUpdate });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(light);
    const handle = createLightTargetHandle(light, new THREE.Vector3(0, 0, 0), 'DirectionalLight', { persistTargetData: true });
    manager.bindHelpersForSubtree(light);

    handle.position.set(4, 5, 6);
    manager.syncLightTargetFromHandle(handle);

    expect(light.target.position.toArray()).toEqual([4, 5, 6]);
    expect(light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET]).toEqual({ x: 4, y: 5, z: 6 });
    expect(requestShadowMapUpdate).toHaveBeenCalled();
  });

  it('applies snapshots and keeps target handles in sync', () => {
    const scene = new THREE.Scene();
    const requestShadowMapUpdate = vi.fn();
    const manager = new EditorHelperManager({ scene, requestShadowMapUpdate });

    const light = new THREE.RectAreaLight();
    scene.add(light);
    const handle = createLightTargetHandle(light, new THREE.Vector3(0, 0, 0), 'RectAreaLight', { persistTargetData: true });
    manager.bindHelpersForSubtree(light);

    manager.applyLightTargetSnapshot({
      lightUuid: light.uuid,
      lightType: 'RectAreaLight',
      target: { x: 7, y: 8, z: 9 }
    });

    expect(handle.position.toArray()).toEqual([7, 8, 9]);
    expect(light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET]).toEqual({ x: 7, y: 8, z: 9 });
    expect(requestShadowMapUpdate).toHaveBeenCalled();
  });
});
