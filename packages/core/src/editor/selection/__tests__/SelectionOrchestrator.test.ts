/** `SelectionOrchestrator.apply` 与 mock 依赖。 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { SelectionOrchestrator } from '../SelectionOrchestrator';

function createOrchestrator() {
  const freezeController = {
    freezeObjectTree: vi.fn(),
    unfreezeObjectTree: vi.fn(),
    unfreezeAncestors: vi.fn()
  };
  const effectsController = {
    setSelectedObjects: vi.fn()
  };
  const transform = {
    attach: vi.fn(),
    detach: vi.fn(),
    visible: false
  };
  const conduit = {
    syncFromSelection: vi.fn()
  };
  const requestShadowMapUpdate = vi.fn();
  const scene = new THREE.Scene();
  const o = new SelectionOrchestrator({
    scene,
    freezeController: freezeController as any,
    effectsController: effectsController as any,
    transform: transform as any,
    getConduitEditController: () => conduit as any,
    requestShadowMapUpdate
  });
  return { o, freezeController, effectsController, transform, conduit, requestShadowMapUpdate, scene };
}

type ApplyInput = Parameters<SelectionOrchestrator['apply']>[0];

function baseApply(overrides: Partial<ApplyInput>): ApplyInput {
  const obj = new THREE.Group();
  const onEmitSelect = vi.fn();
  const assignSelectionState = vi.fn();
  return {
    freezeStaticObjects: false,
    prevObjects: [],
    nextObjects: [obj],
    prevPrimary: null,
    nextPrimary: obj,
    transformTarget: obj,
    transformToolEnabled: false,
    transformHandleVisible: false,
    canAttachTransformTarget: ((o: THREE.Object3D | null): o is THREE.Object3D => o != null),
    assignSelectionState,
    onEmitSelect,
    ...overrides
  };
}

describe('SelectionOrchestrator', () => {
  it('在 assign 之后调用 setSelectedObjects，再发出 select 事件', () => {
    const { o, effectsController } = createOrchestrator();
    const obj = new THREE.Group();
    let order = '';
    effectsController.setSelectedObjects.mockImplementation(() => {
      order += 'B';
    });
    const onEmitSelect = vi.fn(() => {
      order += 'C';
    });
    o.apply(
      baseApply({
        nextObjects: [obj],
        nextPrimary: obj,
        transformTarget: obj,
        assignSelectionState: () => {
          order += 'A';
        },
        onEmitSelect
      })
    );
    expect(order).toBe('ABC');
    expect(effectsController.setSelectedObjects).toHaveBeenCalledWith([obj]);
    expect(onEmitSelect).toHaveBeenCalledWith({ object: obj, objects: [obj] });
  });

  it('freezeStaticObjects 时对离开集合 freeze、对进入集合 unfreeze + unfreezeAncestors', () => {
    const { o, freezeController, scene } = createOrchestrator();
    const a = new THREE.Group();
    const b = new THREE.Group();
    o.apply(
      baseApply({
        freezeStaticObjects: true,
        prevObjects: [a],
        nextObjects: [b],
        prevPrimary: a,
        nextPrimary: b,
        transformTarget: b
      })
    );
    expect(freezeController.freezeObjectTree).toHaveBeenCalledWith(a);
    expect(freezeController.unfreezeObjectTree).toHaveBeenCalledWith(b);
    expect(freezeController.unfreezeAncestors).toHaveBeenCalledWith(b, scene);
  });

  it('满足 gizmo 条件时 attach 并在 freeze 模式下解冻祖先', () => {
    const { o, freezeController, transform, scene } = createOrchestrator();
    const obj = new THREE.Group();
    o.apply(
      baseApply({
        freezeStaticObjects: true,
        nextObjects: [obj],
        nextPrimary: obj,
        transformTarget: obj,
        transformToolEnabled: true,
        transformHandleVisible: true,
        canAttachTransformTarget: (o): o is THREE.Object3D => o === obj
      })
    );
    expect(freezeController.unfreezeAncestors).toHaveBeenCalledWith(obj, scene);
    expect(transform.attach).toHaveBeenCalledWith(obj);
    expect(transform.visible).toBe(true);
  });

  it('不满足 gizmo 条件时 detach', () => {
    const { o, transform } = createOrchestrator();
    const obj = new THREE.Group();
    o.apply(
      baseApply({
        nextObjects: [obj],
        nextPrimary: obj,
        transformTarget: obj,
        transformToolEnabled: false
      })
    );
    expect(transform.detach).toHaveBeenCalled();
    expect(transform.visible).toBe(false);
  });

  it('调用 conduit 与 requestShadowMapUpdate', () => {
    const { o, conduit, requestShadowMapUpdate } = createOrchestrator();
    const obj = new THREE.Group();
    o.apply(
      baseApply({
        nextObjects: [obj],
        nextPrimary: obj,
        transformTarget: obj
      })
    );
    expect(conduit.syncFromSelection).toHaveBeenCalledWith(obj);
    expect(requestShadowMapUpdate).toHaveBeenCalled();
  });

  it('选中平行光时标记 lightHelpersDirty', () => {
    const { o } = createOrchestrator();
    const light = new THREE.DirectionalLight();
    const r = o.apply(
      baseApply({
        nextObjects: [light],
        nextPrimary: light,
        transformTarget: light
      })
    );
    expect(r.lightHelpersDirty).toBe(true);
  });
});
