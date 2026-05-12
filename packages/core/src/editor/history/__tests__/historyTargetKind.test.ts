/** `getObjectHistoryTargetKind`。 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { getObjectHistoryTargetKind } from '../historyTargetKind';

describe('getObjectHistoryTargetKind', () => {
  it('识别相机与灯光', () => {
    expect(getObjectHistoryTargetKind(new THREE.PerspectiveCamera())).toBe('perspective_camera');
    expect(getObjectHistoryTargetKind(new THREE.DirectionalLight())).toBe('directional_light');
    expect(getObjectHistoryTargetKind(new THREE.Mesh())).toBe('object');
    expect(getObjectHistoryTargetKind(null)).toBe('object');
  });
});
