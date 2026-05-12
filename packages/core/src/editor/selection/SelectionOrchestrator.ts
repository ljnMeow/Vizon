/**
 * **选中变更副作用编排**：在 `nextSelection` 纯函数得出新集合后，顺序执行 freeze 差分、
 * `effectsController.setSelectedObjects`、Gizmo attach/detach、conduit 同步、`select` 事件、主光 shadow 矩阵与 `requestShadowMapUpdate`。
 * 由 `ThreeEditor.select` 调用，便于单独 mock 依赖做单元测试。
 */
import * as THREE from 'three';

import type { ConduitEditController } from '../controllers/ConduitEditController';
import type { EffectsController } from '../controllers/EffectsController';
import type { StaticObjectFreezeController } from '../controllers/StaticObjectFreezeController';

/** TransformControls 在编排里用到的最小表面 */
export type SelectionTransformHandle = {
  attach(object: THREE.Object3D): void;
  detach(): void;
  visible: boolean;
};

export type SelectionOrchestratorInit = {
  scene: THREE.Scene;
  freezeController: StaticObjectFreezeController;
  effectsController: EffectsController;
  transform: SelectionTransformHandle;
  getConduitEditController: () => ConduitEditController | null | undefined;
  requestShadowMapUpdate: () => void;
};

export type SelectionApplyInput = {
  freezeStaticObjects: boolean;
  prevObjects: readonly THREE.Object3D[];
  nextObjects: readonly THREE.Object3D[];
  prevPrimary: THREE.Object3D | null;
  nextPrimary: THREE.Object3D | null;
  transformTarget: THREE.Object3D | null;
  transformToolEnabled: boolean;
  transformHandleVisible: boolean;
  canAttachTransformTarget: (object: THREE.Object3D | null) => object is THREE.Object3D;
  /** 在 freeze 完成之后、写入 effects / gizmo 之前调用，用于同步 `ThreeEditor` 上的选中引用 */
  assignSelectionState: () => void;
  onEmitSelect: (payload: { object: THREE.Object3D | null; objects: THREE.Object3D[] }) => void;
};

export type SelectionApplyResult = {
  cameraHelpersDirty: boolean;
  lightHelpersDirty: boolean;
};

function updatePrimaryLightShadowMatricesIfNeeded(primary: THREE.Object3D | null) {
  if (
    !(primary as any)?.isDirectionalLight &&
    !(primary as any)?.isSpotLight &&
    !(primary as any)?.isPointLight
  ) {
    return;
  }
  const light = primary as any;
  light.updateMatrixWorld?.(true);
  light.target?.updateMatrixWorld?.(true);
  light.shadow?.camera?.updateProjectionMatrix?.();
  light.shadow?.camera?.updateMatrixWorld?.(true);
  light.shadow?.updateMatrices?.(light);
}

/**
 * 选中变更后的副作用编排：冻结策略、effects 多选高亮、gizmo、导管编辑、事件与阴影刷新。
 * 纯决策仍由 `nextSelection` 等模块负责；本类只做 three 与控制器的顺序调用。
 */
export class SelectionOrchestrator {
  constructor(private readonly init: SelectionOrchestratorInit) {}

  apply(input: SelectionApplyInput): SelectionApplyResult {
    const {
      freezeStaticObjects,
      prevObjects,
      nextObjects,
      prevPrimary,
      nextPrimary,
      transformTarget,
      transformToolEnabled,
      transformHandleVisible,
      canAttachTransformTarget,
      assignSelectionState,
      onEmitSelect
    } = input;

    const { scene, freezeController, effectsController, transform, getConduitEditController, requestShadowMapUpdate } =
      this.init;

    if (freezeStaticObjects) {
      const prevSet = new Set(prevObjects);
      const nextSet = new Set(nextObjects);
      for (const item of prevObjects) {
        if (!nextSet.has(item)) freezeController.freezeObjectTree(item);
      }
      for (const item of nextObjects) {
        if (!prevSet.has(item)) {
          freezeController.unfreezeObjectTree(item);
          freezeController.unfreezeAncestors(item, scene);
        }
      }
    }

    assignSelectionState();

    effectsController.setSelectedObjects([...nextObjects]);

    const cameraHelpersDirty = Boolean((prevPrimary as any)?.isCamera || (nextPrimary as any)?.isCamera);
    let lightHelpersDirty = Boolean((prevPrimary as any)?.isLight || (nextPrimary as any)?.isLight);

    if (transformToolEnabled && transformHandleVisible && nextObjects.length === 1 && canAttachTransformTarget(transformTarget)) {
      if (freezeStaticObjects && transformTarget) {
        freezeController.unfreezeAncestors(transformTarget, scene);
      }
      transform.attach(transformTarget!);
      transform.visible = true;
    } else {
      transform.detach();
      transform.visible = false;
    }

    getConduitEditController()?.syncFromSelection(nextPrimary);

    onEmitSelect({ object: nextPrimary, objects: [...nextObjects] });

    if ((nextPrimary as any)?.isDirectionalLight || (nextPrimary as any)?.isSpotLight || (nextPrimary as any)?.isPointLight) {
      updatePrimaryLightShadowMatricesIfNeeded(nextPrimary);
      lightHelpersDirty = true;
    }

    requestShadowMapUpdate();

    return { cameraHelpersDirty, lightHelpersDirty };
  }
}
