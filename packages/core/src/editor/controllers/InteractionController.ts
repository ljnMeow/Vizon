import * as THREE from 'three';
import { OrbitControls, TransformControls } from 'three-stdlib';
import type { TransformMode } from '../ThreeEditor';
import { VIZON_USER_DATA_KEYS } from '../../infra/utils';
import { isNonPickableInHierarchy, isNonSelectableInHierarchy, isVisibleInHierarchy } from '../picking/objectGuards';
import {
  applyEditorOverlayLayer,
  configureRaycasterForScenePicking,
  VIZON_EDITOR_OVERLAY_LAYER
} from '../picking/pickLayers';

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
  select: (object: THREE.Object3D | null, options?: { toggle?: boolean; targetHandle?: THREE.Object3D | null }) => void;
  setSelectionHighlightEnabled: (enabled: boolean) => void;
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
  /** 拾取与 Orbit/Transform 共用的透视相机（与 ThreeEditor.camera 同一引用） */
  private camera: THREE.PerspectiveCamera;
  private orbit: OrbitControls | null = null;
  private transform: TransformControls | null = null;

  /** 已配置为仅检测「场景内容层」，避免命中 overlay 上大段无用遍历 */
  private raycaster = new THREE.Raycaster();
  /** 复用向量：client 坐标 → NDC */
  private pointerNdc = new THREE.Vector2();
  /** TransformControls dragging 为 true 时屏蔽单击拾取，防止误切换选中 */
  private dragging = false;
  /** 绑定 pointerdown 时用的 signal，dispose / 重建时一次 abort 全部注销 */
  private pointerAbort: AbortController | null = null;
  /** 当前 renderer.domElement；工具开关需知道往谁身上挂监听 */
  private domElement: HTMLElement | null = null;
  /** false 时移除监听，避免禁选模式下仍 raycast */
  private toolEnabled = true;
  /** 全局记录 Shift 是否按下，避免 pointer 事件修饰键丢失 */
  private isShiftPressed = false;
  /** 键盘监听注销句柄 */
  private detachKeyboardEvents: (() => void) | null = null;

  /**
   * 沿父链查找「代理拾取目标」：CameraHelper 等线框 mesh 通过 userData 指向真实 Camera/Light。
   */
  private findPickTarget(obj: THREE.Object3D): THREE.Object3D | undefined {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const pick = (cur.userData as any)[VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET] as THREE.Object3D | undefined;
      if (pick) return pick; // 命中即返回，不再往上走
      cur = cur.parent;
    }
    return undefined;
  }

  private findTargetHandle(obj: THREE.Object3D): THREE.Object3D | undefined {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if ((cur.userData as any)[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE]) return cur;
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
    configureRaycasterForScenePicking(this.raycaster);
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
    this.disposeKeyboardEvents();
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
    applyEditorOverlayLayer(this.transform);
    // TransformControls 内部的 gizmo 拾取使用它自己的 Raycaster。
    // 由于我们把 gizmo/平面等对象统一放到了 overlay layer，
    // 需要把 TransformControls 的 Raycaster layers 一并打开，否则“看得到但点不动”。
    ((this.transform as any).raycaster?.layers?.enable?.(VIZON_EDITOR_OVERLAY_LAYER) ?? undefined);
    this.transform.setMode(opts.transformMode);
    (this.transform as any).addEventListener('dragging-changed', (e: any) => {
      this.dragging = Boolean((e as any).value);
      if (this.orbit) this.orbit.enabled = !this.dragging;
    });
    this.init.scene.add(this.transform);

    // 恢复选择态（不触发 select 事件；行为与原 recreateRenderer 保持一致）
    this.restoreSelection(opts.selected, toolEnabled);

    if (toolEnabled) {
      this.attachKeyboardEvents();
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
      this.attachKeyboardEvents();
      this.attachPointerEvents(this.domElement);
    } else {
      this.disposePointerEvents();
      this.disposeKeyboardEvents();
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
    this.disposeKeyboardEvents();
    this.disposeControls();
  }

  private attachKeyboardEvents() {
    this.detachKeyboardEvents?.();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') return;
      if (this.isShiftPressed) return;
      this.isShiftPressed = true;
      // 进入 Shift 多选模式：开启“临时高亮”（松开 Shift 后仍会保留，直到用户单选/点空白清掉）。
      this.init.setSelectionHighlightEnabled(true);
      // 进入 Shift 多选模式时，先清空当前选中（隐藏 helper 并清理单选态）。
      this.init.select(null);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') return;
      if (!this.isShiftPressed) return;
      this.isShiftPressed = false;
      // 松开 Shift 仅退出“增选模式”，不清空选中，也不关闭临时高亮。
    };
    const onBlur = () => {
      if (!this.isShiftPressed) return;
      this.isShiftPressed = false;
      // blur 时同样只退出“增选模式”
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.detachKeyboardEvents = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      this.isShiftPressed = false;
    };
  }

  private attachPointerEvents(dom: HTMLElement) {
    // 使用 AbortController 统一注销 pointerdown 监听，避免 renderer/controls 重建后出现重复监听
    this.pointerAbort?.abort();
    this.pointerAbort = new AbortController();

    dom.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (this.dragging) return; // 拖拽 gizmo 过程中不处理点击选中
        if (e.button !== 0) return; // 仅响应主键，避免中键平移抢 focus

        const rect = dom.getBoundingClientRect();
        const x = (e.clientX - rect.left) / Math.max(1, rect.width); // 归一化到 [0,1]
        const y = (e.clientY - rect.top) / Math.max(1, rect.height);
        this.pointerNdc.set(x * 2 - 1, -(y * 2 - 1)); // 转标准 NDC，Y 轴翻转匹配 WebGL
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);

        // 从 scene 根递归；layers 已剪掉 overlay，但 helper 仍在内容层需业务过滤
        const intersects = this.raycaster.intersectObjects(this.init.scene.children, true);
        const hit = intersects.find((i: THREE.Intersection) => {
          const obj = i.object;
          if (!isVisibleInHierarchy(obj)) return false; // 隐藏父级下的 mesh 视作不可见
          if (obj === this.transform || this.isTransformChild(obj)) return false; // 不选 gizmo 子网格

          const pickTarget = this.findPickTarget(obj);
          if (pickTarget) {
            // 代理命中（如 CameraHelper/LightHelper）也必须遵守可见 + 可拾取过滤。
            return (
              isVisibleInHierarchy(pickTarget) &&
              !isNonSelectableInHierarchy(pickTarget) &&
              !isNonPickableInHierarchy(pickTarget)
            );
          }

          // 普通物体：非装饰/可见分支才允许鼠标拾取
          return !isNonSelectableInHierarchy(obj) && !isNonPickableInHierarchy(obj);
        });

        const pickedHandle = hit?.object != null ? this.findTargetHandle(hit.object) : undefined;
        const pickTarget = hit?.object != null ? this.findPickTarget(hit.object) : undefined;
        const next = pickTarget ?? hit?.object ?? null; // 优先落到「真实」灯/相机
        if (next && !isVisibleInHierarchy(next)) {
          this.init.select(null); // 理论防御：映射目标被隐藏则清空选中
          return;
        }
        this.init.select(next, { toggle: this.isShiftPressed, targetHandle: pickedHandle ?? null }); // 面板选中灯光，gizmo 可挂到 target handle
      },
      { signal: this.pointerAbort.signal }
    );
  }

  private disposePointerEvents() {
    this.pointerAbort?.abort();
    this.pointerAbort = null;
  }

  private disposeKeyboardEvents() {
    this.detachKeyboardEvents?.();
    this.detachKeyboardEvents = null;
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

}

