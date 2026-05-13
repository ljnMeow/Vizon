import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  collectTransformDragHistoryOperations,
  createTransformDragSession
} from '../transformDragLifecycle';

describe('transformDragLifecycle', () => {
  it('captures drag session snapshots, world matrices, and light target snapshot', () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.uuid = 'light-1';
    light.target.position.set(1, 2, 3);
    scene.add(light);
    scene.add(light.target);

    const handle = new THREE.Object3D();
    handle.userData.isLightTargetHandle = true;

    const selected = new THREE.Object3D();
    selected.position.set(4, 5, 6);
    scene.add(selected);

    const session = createTransformDragSession({
      scene,
      selected,
      selectedObjects: [selected],
      activeTransformObject: handle,
      isLightTargetHandle: (obj) => obj === handle,
      resolveLightByTargetHandle: () => light,
      captureLightTargetSnapshot: (targetLight) => ({
        lightUuid: targetLight.uuid,
        lightType: 'DirectionalLight',
        target: {
          x: targetLight.target.position.x,
          y: targetLight.target.position.y,
          z: targetLight.target.position.z
        }
      })
    });

    expect(session.primaryStartSnapshot.position).toEqual({ x: 4, y: 5, z: 6 });
    expect(session.selectedObjectSnapshots.get(selected.uuid)?.position).toEqual({ x: 4, y: 5, z: 6 });
    expect(session.startWorldMatrices.get(selected.uuid)).toBeInstanceOf(THREE.Matrix4);
    expect(session.lightTargetSnapshot).toEqual({
      lightUuid: 'light-1',
      lightType: 'DirectionalLight',
      target: { x: 1, y: 2, z: 3 }
    });
  });

  it('collects light-target and object transform operations at drag end', () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.uuid = 'light-2';
    light.target.position.set(0, 0, 0);
    scene.add(light);
    scene.add(light.target);

    const selected = new THREE.Object3D();
    selected.uuid = 'obj-2';
    selected.position.set(1, 1, 1);
    scene.add(selected);
    scene.updateMatrixWorld(true);

    const session = createTransformDragSession({
      scene,
      selected,
      selectedObjects: [selected],
      isLightTargetHandle: () => false,
      resolveLightByTargetHandle: () => null,
      captureLightTargetSnapshot: (targetLight) => ({
        lightUuid: targetLight.uuid,
        lightType: 'DirectionalLight',
        target: {
          x: targetLight.target.position.x,
          y: targetLight.target.position.y,
          z: targetLight.target.position.z
        }
      })
    });
    session.lightTargetSnapshot = {
      lightUuid: light.uuid,
      lightType: 'DirectionalLight',
      target: { x: 0, y: 0, z: 0 }
    };

    selected.position.set(7, 8, 9);
    light.target.position.set(3, 4, 5);

    const applyLightTargetSnapshot = vi.fn();
    const applyObjectTransform = vi.fn();
    const applySelectionTransformSnapshots = vi.fn();

    const operations = collectTransformDragHistoryOperations({
      scene,
      selected,
      selectedObjects: [selected],
      transformMode: 'translate',
      session,
      captureLightTargetSnapshot: (targetLight) => ({
        lightUuid: targetLight.uuid,
        lightType: 'DirectionalLight',
        target: {
          x: targetLight.target.position.x,
          y: targetLight.target.position.y,
          z: targetLight.target.position.z
        }
      }),
      applyLightTargetSnapshot,
      applyObjectTransform,
      applySelectionTransformSnapshots
    });

    expect(operations).toHaveLength(2);
    operations[0]?.do();
    operations[1]?.undo();

    expect(applyLightTargetSnapshot).toHaveBeenCalledWith({
      lightUuid: 'light-2',
      lightType: 'DirectionalLight',
      target: { x: 3, y: 4, z: 5 }
    });
    expect(applyObjectTransform).toHaveBeenCalledWith(selected, {
      position: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });
    expect(applySelectionTransformSnapshots).not.toHaveBeenCalled();
  });
});
