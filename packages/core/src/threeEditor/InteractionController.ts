import * as THREE from 'three';
import { OrbitControls, TransformControls } from 'three-stdlib';
import type { TransformMode } from '../ThreeEditor';

/**
 * InteractionController：
 * 把“交互相关”的职责从 ThreeEditor 中剥离出来，主要包括：
 * - OrbitControls / TransformControls 的创建与销毁
 * - TransformControls 拖拽时联动 OrbitControls（禁用轨道旋转）
 * - pointerdown 拾取并过滤不可选对象/辅助对象
 *
 * 设计目标：ThreeEditor 只负责编排，交互细节尽量局部化。
 */
export type InteractionControllerInit = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  select: (object: THREE.Object3D | null) => void;
};

export type InteractionRecreateControlsOptions = {
  domElement: HTMLElement;
  transformMode: TransformMode;
  orbitTarget: THREE.Vector3;
  orbitEnabled: boolean;
  selected: THREE.Object3D | null;
  toolEnabled: boolean;
  enableDamping?: boolean;
};

export class InteractionController {
  private camera: THREE.PerspectiveCamera;
  private orbit: OrbitControls | null = null;
  private transform: TransformControls | null = null;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private dragging = false;
  private pointerAbort: AbortController | null = null;
  private domElement: HTMLElement | null = null;
  private toolEnabled = true;

  private findPickTarget(obj: THREE.Object3D): THREE.Object3D | undefined {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const pick = (cur.userData as any).__vizonPickTarget as THREE.Object3D | undefined;
      if (pick) return pick;
      cur = cur.parent;
    }
    return undefined;
  }

  /**
   * @param init.scene / init.camera 来自 ThreeEditor 的三维核心实例
   * @param init.select 由外层提供，用于把“拾取结果”写回 core 的 selected 状态并触发事件
   */
  constructor(private readonly init: InteractionControllerInit) {
    this.camera = init.camera;
  }

  setCamera(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /**
   * 当 renderer 重建或 orbit/transform 需要重排时，统一走这个方法。
   * 关键点：需要恢复 selected（把 transform attach/detach 回到正确状态）。
   */
  recreateControls(opts: InteractionRecreateControlsOptions) {
    this.disposePointerEvents();
    this.disposeControls();

    const { domElement, toolEnabled } = opts;
    this.domElement = domElement;
    this.toolEnabled = toolEnabled;
    domElement.style.touchAction = 'none';

    this.orbit = new OrbitControls(this.camera, domElement);
    this.orbit.enableDamping = opts.enableDamping ?? true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.target.copy(opts.orbitTarget);
    this.orbit.minDistance = 0.15;
    this.orbit.maxDistance = 500;
    this.orbit.enabled = opts.orbitEnabled;
    this.camera.lookAt(this.orbit.target);
    this.orbit.update();

    this.transform = new TransformControls(this.camera, domElement);
    this.transform.setMode(opts.transformMode);
    (this.transform as any).addEventListener('dragging-changed', (e: any) => {
      this.dragging = Boolean((e as any).value);
      if (this.orbit) this.orbit.enabled = !this.dragging;
    });
    this.init.scene.add(this.transform);

    // 恢复选择态（不触发 select 事件；行为与原 recreateRenderer 保持一致）
    this.restoreSelection(opts.selected, toolEnabled);

    if (toolEnabled) {
      this.attachPointerEvents(domElement);
    }

    return { orbit: this.orbit!, transform: this.transform! };
  }

  restoreSelection(selected: THREE.Object3D | null, toolEnabled: boolean) {
    // restoreSelection 不触发 select 事件，仅恢复 transform 的可见/挂载状态
    if (!this.transform) return;

    if (selected && toolEnabled) {
      this.transform.attach(selected);
      this.transform.visible = true;
    } else {
      this.transform.detach();
      this.transform.visible = false;
    }
  }

  setToolEnabled(enabled: boolean) {
    this.toolEnabled = enabled;

    // 控制拾取链路是否存在：禁用时不再 raycast/写回 select。
    if (!this.domElement) return;
    if (enabled) {
      this.attachPointerEvents(this.domElement);
    } else {
      this.disposePointerEvents();
    }
  }

  getOrbit() {
    return this.orbit;
  }

  getTransform() {
    return this.transform;
  }

  dispose() {
    this.disposePointerEvents();
    this.disposeControls();
  }

  private attachPointerEvents(dom: HTMLElement) {
    // 使用 AbortController 统一注销 pointerdown 监听，避免 renderer/controls 重建后出现重复监听
    this.pointerAbort?.abort();
    this.pointerAbort = new AbortController();

    dom.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (this.dragging) return;
        if (e.button !== 0) return;

        const rect = dom.getBoundingClientRect();
        const x = (e.clientX - rect.left) / Math.max(1, rect.width);
        const y = (e.clientY - rect.top) / Math.max(1, rect.height);
        this.pointerNdc.set(x * 2 - 1, -(y * 2 - 1));
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);

        const intersects = this.raycaster.intersectObjects(this.init.scene.children, true);
        const hit = intersects.find((i: THREE.Intersection) => {
          const obj = i.object;
          // 避免选中 gizmo/辅助对象：TransformControls 自己挂在 scene 上（且其子节点很多）。
          if (obj === this.transform || this.isTransformChild(obj)) return false;

          // 对于带映射标记的 helper/代理：即便它标了 __vizonNonSelectable，也允许通过映射进入 selected。
          const pickTarget = this.findPickTarget(obj);
          if (pickTarget) return true;

          return !this.isNonSelectable(obj);
        });

        const pickTarget = hit?.object != null ? this.findPickTarget(hit.object) : undefined;
        this.init.select(pickTarget ?? hit?.object ?? null);
      },
      { signal: this.pointerAbort.signal }
    );
  }

  private disposePointerEvents() {
    this.pointerAbort?.abort();
    this.pointerAbort = null;
  }

  private disposeControls() {
    if (this.orbit) this.orbit.dispose();
    this.orbit = null;

    if (this.transform) {
      this.transform.detach();
      this.transform.dispose();
      this.init.scene.remove(this.transform);
    }
    this.transform = null;
    this.dragging = false;
  }

  private isTransformChild(obj: THREE.Object3D) {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur === this.transform) return true;
      cur = cur.parent;
    }
    return false;
  }

  private isNonSelectable(obj: THREE.Object3D) {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if ((cur.userData as any).__vizonNonSelectable) return true;
      cur = cur.parent;
    }
    return false;
  }
}

