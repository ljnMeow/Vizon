/**
 * **编辑器 Helper 管理器**：集中维护相机辅助器、灯光辅助器、灯光 target handle 的绑定、
 * 可见性同步、脏标记刷新与快照应用。
 *
 * 它的存在是为了把「帮助对象」从 `ThreeEditor` 主流程里剥离出来：
 * - 帮助对象通常不属于业务场景树本体，但要跟随真实对象联动；
 * - 需要统一标记为不可选 / 编辑器隐藏 / 可代理拾取；
 * - 某些 helper 每帧都可能要更新，但又不想在主循环里散落细节。
 */
import * as THREE from 'three';
import { getVizonUserData, VIZON_USER_DATA_KEYS } from '../../infra/utils';
import { isVisibleInHierarchy } from '../picking/objectGuards';
import { configureEditorHelperObject } from './lightHelperUtils';

export type LightTargetSnapshot = {
  lightUuid: string;
  lightType: 'DirectionalLight' | 'SpotLight' | 'RectAreaLight';
  target: { x: number; y: number; z: number };
};

type EditorHelperManagerOptions = {
  scene: THREE.Scene;
  requestShadowMapUpdate: () => void;
};

export class EditorHelperManager {
  /** uuid -> CameraHelper；便于按对象增量绑定/解绑，而不是每帧全场景重扫。 */
  private cameraHelpers = new Map<string, THREE.CameraHelper>();
  /** uuid -> LightHelper；与相机 helper 分开维护，便于分别标脏刷新。 */
  private lightHelpers = new Map<string, THREE.Object3D>();
  /** light.uuid -> target handle；供 TransformControls 拖拽时快速反查。 */
  private lightTargetHandles = new Map<string, THREE.Object3D>();
  /** 相机 helper 参数变化后置脏，留到下一帧统一 update。 */
  private cameraHelpersDirty = true;
  /** 灯光 helper/阴影视锥变化后置脏，避免在多次写入中重复 update。 */
  private lightHelpersDirty = true;

  constructor(private readonly options: EditorHelperManagerOptions) {}

  bindHelpersForSubtree(root: THREE.Object3D) {
    root.traverse((node) => {
      const anyNode = node as THREE.Object3D & {
        isCamera?: boolean;
        isLight?: boolean;
        isDirectionalLight?: boolean;
        isSpotLight?: boolean;
        target?: THREE.Object3D;
      };

      if (anyNode.isCamera) {
        const helper = getVizonUserData(node)[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] as THREE.CameraHelper | undefined;
        if (helper && !this.cameraHelpers.has(node.uuid)) {
          // helper 单独挂到 scene 根上，避免受对象父子层级的额外缩放/隐藏干扰。
          this.cameraHelpers.set(node.uuid, helper);
          this.options.scene.add(helper);
          helper.update();
          this.cameraHelpersDirty = true;
        }
      }

      if (anyNode.isLight) {
        const helper = getVizonUserData(node)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] as THREE.Object3D | undefined;
        if (helper && !this.lightHelpers.has(node.uuid)) {
          this.lightHelpers.set(node.uuid, helper);
          this.options.scene.add(helper);
          // 绑定当下立刻做一次颜色/阴影可见性同步，避免首帧闪旧状态。
          this.syncLightHelperColor(node as THREE.Light, helper);
          this.syncShadowFrustumHelperVisibility(node as THREE.Light, helper);
          (helper as { update?: () => void }).update?.();
          this.lightHelpersDirty = true;
        }

        if ((anyNode.isDirectionalLight || anyNode.isSpotLight) && anyNode.target) {
          // three 的 Directional/Spot target 本身只是数学参考点，不应在编辑器里作为常规节点出现。
          anyNode.target.userData[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = true;
          anyNode.target.userData[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
          if (!anyNode.target.parent) this.options.scene.add(anyNode.target);
        }

        this.bindLightTargetHandle(node as THREE.Light);
      }

      this.syncObjectHelperVisibility(node);
    });
  }

  unbindHelpersForSubtree(root: THREE.Object3D) {
    root.traverse((node) => {
      const cameraHelper = this.cameraHelpers.get(node.uuid);
      if (cameraHelper) {
        cameraHelper.parent?.remove(cameraHelper);
        this.cameraHelpers.delete(node.uuid);
        this.cameraHelpersDirty = true;
      }

      const lightHelper = this.lightHelpers.get(node.uuid);
      if (lightHelper) {
        lightHelper.parent?.remove(lightHelper);
        this.lightHelpers.delete(node.uuid);
        this.lightHelpersDirty = true;
      }

      this.unbindLightTargetHandle(node);
    });
  }

  syncHelperVisibilityForSubtree(root: THREE.Object3D) {
    root.traverse((node) => this.syncObjectHelperVisibility(node));
  }

  syncPerFrame(selected: THREE.Object3D | null) {
    const selectedIsCamera = Boolean((selected as { isCamera?: boolean } | null)?.isCamera);
    const selectedIsLight = Boolean((selected as { isLight?: boolean } | null)?.isLight);

    if (this.cameraHelpersDirty || selectedIsCamera) {
      // 选中相机时即使没有全局 dirty，也要让 helper 随实时拖拽更新视锥。
      for (const helper of this.cameraHelpers.values()) helper.update();
      this.cameraHelpersDirty = false;
    }

    if (this.lightHelpersDirty || selectedIsLight) {
      for (const [uuid, helper] of this.lightHelpers.entries()) {
        // 灯光本体可能已被删除；运行时按 uuid 回查，避免持有悬空引用。
        const light = this.options.scene.getObjectByProperty('uuid', uuid) as THREE.Light | null;
        if (light) this.syncLightHelperColor(light, helper);
        (helper as { update?: () => void }).update?.();
        if (light) this.syncShadowFrustumHelperVisibility(light, helper);
      }
      this.lightHelpersDirty = false;
    }
  }

  markCameraHelpersDirty() {
    this.cameraHelpersDirty = true;
  }

  markLightHelpersDirty() {
    this.lightHelpersDirty = true;
  }

  dispose() {
    for (const helper of this.cameraHelpers.values()) helper.parent?.remove(helper);
    for (const helper of this.lightHelpers.values()) helper.parent?.remove(helper);
    for (const handle of this.lightTargetHandles.values()) handle.parent?.remove(handle);
    this.cameraHelpers.clear();
    this.lightHelpers.clear();
    this.lightTargetHandles.clear();
    this.cameraHelpersDirty = true;
    this.lightHelpersDirty = true;
  }

  isLightTargetHandle(obj: THREE.Object3D) {
    return Boolean((obj.userData as Record<string, unknown> | undefined)?.[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE]);
  }

  resolveLightByTargetHandle(handle: THREE.Object3D): THREE.Light | null {
    const lightUuid = (handle.userData as Record<string, unknown> | undefined)?.[
      VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_UUID
    ] as string | undefined;
    if (!lightUuid) return null;
    const light = this.options.scene.getObjectByProperty('uuid', lightUuid) as (THREE.Object3D & { isLight?: boolean }) | null;
    return light?.isLight ? (light as THREE.Light) : null;
  }

  getLightTargetHandle(lightUuid: string) {
    return this.lightTargetHandles.get(lightUuid) ?? null;
  }

  syncLightTargetFromHandle(handle: THREE.Object3D) {
    const light = this.resolveLightByTargetHandle(handle);
    if (!light) return;
    const p = handle.position;
    const anyLight = light as THREE.Light & {
      isDirectionalLight?: boolean;
      isSpotLight?: boolean;
      isRectAreaLight?: boolean;
      target?: { position?: { set?: (x: number, y: number, z: number) => void }; updateMatrixWorld?: (force?: boolean) => void };
      lookAt?: (x: number, y: number, z: number) => void;
      shadow?: { updateMatrices?: (light: THREE.Light) => void };
    };
    if (anyLight.isDirectionalLight || anyLight.isSpotLight) {
      // 平行光/聚光灯都有显式 target 对象；拖动 handle 就是改它的位置。
      anyLight.target?.position?.set?.(p.x, p.y, p.z);
      anyLight.target?.updateMatrixWorld?.(true);
      light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET] = { x: p.x, y: p.y, z: p.z };
    } else if (anyLight.isRectAreaLight) {
      // RectAreaLight 没有 three 内建 target；这里通过持久化数据 + lookAt 维持朝向。
      light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] = { x: p.x, y: p.y, z: p.z };
      anyLight.lookAt?.(p.x, p.y, p.z);
    }
    light.updateMatrixWorld?.(true);
    anyLight.shadow?.updateMatrices?.(light);
    this.lightHelpersDirty = true;
    this.options.requestShadowMapUpdate();
  }

  syncLightTargetHandleFromLight(light: THREE.Light, handle: THREE.Object3D) {
    const anyLight = light as THREE.Light & {
      isDirectionalLight?: boolean;
      isSpotLight?: boolean;
      isRectAreaLight?: boolean;
      target?: { position?: { x?: number; y?: number; z?: number } };
    };
    if (anyLight.isDirectionalLight || anyLight.isSpotLight) {
      const t = anyLight.target?.position;
      if (t) handle.position.set(Number(t.x ?? 0), Number(t.y ?? 0), Number(t.z ?? 0));
      light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET] = {
        x: Number(t?.x ?? 0),
        y: Number(t?.y ?? 0),
        z: Number(t?.z ?? 0)
      };
      return;
    }
    if (anyLight.isRectAreaLight) {
      const target = light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] as
        | { x?: number; y?: number; z?: number }
        | undefined;
      if (target) handle.position.set(Number(target.x ?? 0), Number(target.y ?? 0), Number(target.z ?? 0));
    }
  }

  captureLightTargetSnapshot(light: THREE.Light): LightTargetSnapshot {
    const anyLight = light as THREE.Light & {
      isDirectionalLight?: boolean;
      isSpotLight?: boolean;
      target?: { position?: { x?: number; y?: number; z?: number } };
    };
    if (anyLight.isDirectionalLight || anyLight.isSpotLight) {
      const p = anyLight.target?.position ?? { x: 0, y: 0, z: 0 };
      return {
        lightUuid: light.uuid,
        lightType: anyLight.isDirectionalLight ? 'DirectionalLight' : 'SpotLight',
        target: { x: Number(p.x ?? 0), y: Number(p.y ?? 0), z: Number(p.z ?? 0) }
      };
    }
    const t = (light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] as
      | { x?: number; y?: number; z?: number }
      | undefined) ?? { x: 0, y: 0, z: 0 };
    return {
      lightUuid: light.uuid,
      lightType: 'RectAreaLight',
      target: { x: Number(t.x ?? 0), y: Number(t.y ?? 0), z: Number(t.z ?? 0) }
    };
  }

  isSameLightTargetSnapshot(a: LightTargetSnapshot, b: LightTargetSnapshot) {
    const eps = 1e-6;
    const close = (x: number, y: number) => Math.abs(x - y) <= eps;
    return (
      a.lightUuid === b.lightUuid &&
      a.lightType === b.lightType &&
      close(a.target.x, b.target.x) &&
      close(a.target.y, b.target.y) &&
      close(a.target.z, b.target.z)
    );
  }

  applyLightTargetSnapshot(snapshot: LightTargetSnapshot) {
    const light = this.options.scene.getObjectByProperty('uuid', snapshot.lightUuid) as THREE.Light | null;
    if (!light) return;
    const anyLight = light as THREE.Light & {
      target?: { position?: { set?: (x: number, y: number, z: number) => void }; updateMatrixWorld?: (force?: boolean) => void };
      lookAt?: (x: number, y: number, z: number) => void;
      shadow?: { updateMatrices?: (light: THREE.Light) => void };
    };
    if (snapshot.lightType === 'DirectionalLight' || snapshot.lightType === 'SpotLight') {
      anyLight.target?.position?.set?.(snapshot.target.x, snapshot.target.y, snapshot.target.z);
      anyLight.target?.updateMatrixWorld?.(true);
      light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET] = { ...snapshot.target };
    } else {
      light.userData[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET] = { ...snapshot.target };
      anyLight.lookAt?.(snapshot.target.x, snapshot.target.y, snapshot.target.z);
    }
    // 撤销/重做时不仅灯本体要回滚，编辑器里的拖拽 handle 也要一起回到正确位置。
    const handle = this.lightTargetHandles.get(light.uuid);
    if (handle) this.syncLightTargetHandleFromLight(light, handle);
    anyLight.shadow?.updateMatrices?.(light);
    this.lightHelpersDirty = true;
    this.options.requestShadowMapUpdate();
  }

  applyShadowFrustumVisibilityForAllLights() {
    for (const [uuid, helper] of this.lightHelpers.entries()) {
      const light = this.options.scene.getObjectByProperty('uuid', uuid) as THREE.Light | null;
      if (!light) continue;
      this.syncShadowFrustumHelperVisibility(light, helper);
    }
  }

  private syncObjectHelperVisibility(node: THREE.Object3D) {
    const effectiveVisible = isVisibleInHierarchy(node);
    const cameraHelper = this.cameraHelpers.get(node.uuid);
    if (cameraHelper) cameraHelper.visible = effectiveVisible;
    const lightHelper = this.lightHelpers.get(node.uuid);
    if (lightHelper) {
      lightHelper.visible = effectiveVisible;
      if (effectiveVisible && (node as THREE.Object3D & { isLight?: boolean }).isLight) {
        this.syncShadowFrustumHelperVisibility(node as THREE.Light, lightHelper);
      }
    }
    const targetHandle = this.lightTargetHandles.get(node.uuid);
    if (targetHandle) targetHandle.visible = effectiveVisible;
  }

  private bindLightTargetHandle(light: THREE.Light) {
    const handle = getVizonUserData(light)[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE] as THREE.Object3D | undefined;
    if (!handle || this.lightTargetHandles.has(light.uuid)) return;
    this.lightTargetHandles.set(light.uuid, handle);
    if (!handle.parent) this.options.scene.add(handle);
    this.syncLightTargetHandleFromLight(light, handle);
  }

  private unbindLightTargetHandle(node: THREE.Object3D) {
    if (!(node as THREE.Object3D & { isLight?: boolean }).isLight) return;
    const handle = this.lightTargetHandles.get(node.uuid);
    if (!handle) return;
    handle.parent?.remove(handle);
    this.lightTargetHandles.delete(node.uuid);
  }

  private syncLightHelperColor(light: THREE.Light, helper: THREE.Object3D) {
    const lightColor = (light as THREE.Light & { color?: { getHex?: () => number } }).color;
    if (!lightColor?.getHex) return;
    const targetHex = lightColor.getHex();
    const helperColor = (helper as THREE.Object3D & { color?: { setHex?: (hex: number) => void } }).color;
    helperColor?.setHex?.(targetHex);
    helper.traverse((node) => {
      const helperMaterial = (node as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }).material;
      if (!helperMaterial) return;
      const materials = Array.isArray(helperMaterial) ? helperMaterial : [helperMaterial];
      for (const mat of materials) {
        const colorLike = (mat as THREE.Material & { color?: { setHex?: (hex: number) => void } }).color;
        if (!colorLike?.setHex) continue;
        colorLike.setHex(targetHex);
        mat.needsUpdate = true;
      }
    });
  }

  private syncShadowFrustumHelperVisibility(light: THREE.Light, helper: THREE.Object3D) {
    this.ensureShadowCameraHelper(light, helper);
    const userVisible = getVizonUserData(light)[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] !== false;
    const castShadow = Boolean((light as THREE.Light & { castShadow?: boolean }).castShadow);
    const nextVisible = userVisible && castShadow;
    helper.traverse((node) => {
      const anyNode = node as THREE.Object3D & { isCameraHelper?: boolean; type?: string };
      if (!(anyNode.isCameraHelper || anyNode.type === 'CameraHelper')) return;
      node.visible = nextVisible;
    });
  }

  private ensureShadowCameraHelper(light: THREE.Light, helper: THREE.Object3D) {
    const anyLight = light as THREE.Light & {
      isDirectionalLight?: boolean;
      isSpotLight?: boolean;
      isPointLight?: boolean;
      shadow?: { camera?: THREE.Camera };
    };
    const isShadowLight = Boolean(anyLight.isDirectionalLight || anyLight.isSpotLight || anyLight.isPointLight);
    const shadowCamera = anyLight.shadow?.camera;
    if (!isShadowLight || !shadowCamera) return;

    let hasCameraHelper = false;
    helper.traverse((node) => {
      const anyNode = node as THREE.Object3D & { isCameraHelper?: boolean; type?: string };
      if (anyNode.isCameraHelper || anyNode.type === 'CameraHelper') hasCameraHelper = true;
    });
    if (hasCameraHelper) return;

    const shadowHelper = new THREE.CameraHelper(shadowCamera);
    configureEditorHelperObject(shadowHelper, light);
    helper.add(shadowHelper);
    this.syncLightHelperColor(light, shadowHelper);
    this.lightHelpersDirty = true;
  }
}
