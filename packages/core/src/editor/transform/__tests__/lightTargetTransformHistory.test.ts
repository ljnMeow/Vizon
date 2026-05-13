import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createLightTargetHistoryOperation,
  formatVec3ForHistory,
  getLightTargetPropLabels,
  getLightTypeHistoryLabels,
  isSameLightTargetSnapshot
} from '../lightTargetTransformHistory';
import type { LightTargetSnapshot } from '../../helpers/EditorHelperManager';

describe('lightTargetTransformHistory', () => {
  it('detects equivalent snapshots with epsilon tolerance', () => {
    const a: LightTargetSnapshot = {
      lightUuid: 'light-1',
      lightType: 'SpotLight',
      target: { x: 1, y: 2, z: 3 }
    };
    const b: LightTargetSnapshot = {
      lightUuid: 'light-1',
      lightType: 'SpotLight',
      target: { x: 1 + 1e-7, y: 2 - 1e-7, z: 3 }
    };

    expect(isSameLightTargetSnapshot(a, b)).toBe(true);
  });

  it('creates light-target history operation with localized name and reversible handlers', () => {
    const light = new THREE.DirectionalLight();
    light.uuid = 'light-1';
    const before: LightTargetSnapshot = {
      lightUuid: light.uuid,
      lightType: 'DirectionalLight',
      target: { x: 0, y: 1, z: 2 }
    };
    const after: LightTargetSnapshot = {
      lightUuid: light.uuid,
      lightType: 'DirectionalLight',
      target: { x: 4, y: 5, z: 6 }
    };
    const applySnapshot = vi.fn();

    const operation = createLightTargetHistoryOperation({ light, before, after, applySnapshot });

    expect(operation).not.toBeNull();
    expect(operation?.name).toContain('Modify directional light property');
    expect(operation?.name).toContain('light-1');
    expect(operation?.mergeKey).toBe('light-target:light-1');
    expect(operation?.mergeWindowMs).toBe(120);

    operation?.do();
    operation?.undo();

    expect(applySnapshot).toHaveBeenNthCalledWith(1, after);
    expect(applySnapshot).toHaveBeenNthCalledWith(2, before);
  });

  it('returns null when snapshot values do not change', () => {
    const light = new THREE.SpotLight();
    const snapshot: LightTargetSnapshot = {
      lightUuid: light.uuid,
      lightType: 'SpotLight',
      target: { x: 1, y: 2, z: 3 }
    };

    expect(
      createLightTargetHistoryOperation({
        light,
        before: snapshot,
        after: { ...snapshot, target: { ...snapshot.target } },
        applySnapshot: vi.fn()
      })
    ).toBeNull();
  });

  it('exposes label helpers and formatted vector text', () => {
    const light = new THREE.RectAreaLight();

    expect(getLightTypeHistoryLabels(light)).toEqual({
      'zh-CN': '修改矩形光属性',
      'en-US': 'Modify rect area light property'
    });
    expect(getLightTargetPropLabels()).toEqual({
      'zh-CN': '看向点',
      'en-US': 'Target'
    });
    expect(formatVec3ForHistory({ x: 1.23456, y: 2, z: -3.33339 })).toBe('(1.2346, 2, -3.3334)');
  });
});
