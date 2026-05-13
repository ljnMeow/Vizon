import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  configureEditorHelperObject,
  createLightTargetHandle,
  readPersistedLightTarget
} from '../lightHelperUtils';
import { VIZON_USER_DATA_KEYS } from '../../../infra/utils';

describe('lightHelperUtils', () => {
  describe('configureEditorHelperObject', () => {
    it('marks helper nodes as editor-only and rewrites material flags', () => {
      const pickTarget = new THREE.Object3D();
      const helper = new THREE.Group();
      const child = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0x123456, opacity: 0.4, transparent: false })
      );
      helper.add(child);

      configureEditorHelperObject(helper, pickTarget, { color: 0xffaa00 });

      expect(helper.userData[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE]).toBe(true);
      expect(helper.userData[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]).toBe(true);
      expect(helper.userData[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET]).toBe(pickTarget);
      const material = child.material as THREE.MeshBasicMaterial;
      expect(material.color.getHex()).toBe(0xffaa00);
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(0.9);
      expect(helper.renderOrder).toBe(8_000);
    });
  });

  describe('createLightTargetHandle', () => {
    it('creates a draggable handle and can persist target metadata', () => {
      const light = new THREE.SpotLight();
      const target = new THREE.Vector3(1, 2, 3);

      const handle = createLightTargetHandle(light, target, 'SpotLight', {
        color: 0xff0000,
        persistTargetData: true
      });

      expect(handle.name).toBe('SpotLightTargetHandle');
      expect(handle.position.toArray()).toEqual([1, 2, 3]);
      expect(handle.userData[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET]).toBe(light);
      expect(handle.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_TYPE]).toBe('SpotLight');
      expect(light.userData[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE]).toBe(handle);
      expect(light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET]).toEqual({ x: 1, y: 2, z: 3 });
      expect(((handle.material as THREE.MeshBasicMaterial).color.getHex())).toBe(0xff0000);
    });
  });

  describe('readPersistedLightTarget', () => {
    it('reads persisted directional targets first and falls back to runtime target position', () => {
      const directional = new THREE.DirectionalLight();
      directional.target.position.set(9, 8, 7);
      directional.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET] = { x: 4, y: 5, z: 6 };

      expect(readPersistedLightTarget(directional)?.target.toArray()).toEqual([4, 5, 6]);

      delete directional.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET];
      expect(readPersistedLightTarget(directional)?.target.toArray()).toEqual([9, 8, 7]);
    });

    it('reads rect area light targets from userData and falls back to origin', () => {
      const rect = new THREE.RectAreaLight();
      rect.userData[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] = { x: 3, y: 2, z: 1 };
      expect(readPersistedLightTarget(rect)?.target.toArray()).toEqual([3, 2, 1]);

      const emptyRect = new THREE.RectAreaLight();
      expect(readPersistedLightTarget(emptyRect)?.target.toArray()).toEqual([0, 0, 0]);
    });
  });
});
