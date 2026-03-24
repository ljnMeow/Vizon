import * as THREE from 'three';
import type { OrbitControls, TransformControls } from 'three-stdlib';
import { Emitter } from './events';
import type { RendererSettings, SceneSettings } from './sceneSettings';
import type { SceneTreeNode, SceneTreeNodeKind } from './sceneTree';
import { createDefaultSceneSettings, normalizeSceneSettings } from './sceneSettings';
import { calcSceneSettingsDiff } from './threeEditor/sceneSettingsDiff';
import { AssetLoader } from './threeEditor/AssetLoader';
import { CameraController } from './threeEditor/CameraController';
import { EnvironmentController } from './threeEditor/EnvironmentController';
import { HelperController } from './threeEditor/HelperController';
import { InteractionController } from './threeEditor/InteractionController';
import { RendererController } from './threeEditor/RendererController';
import { ViewPresetController } from './threeEditor/ViewPresetController';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type ViewPreset = 'default' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type ViewTransitionOptions = {
  durationMs?: number;
  easing?: (t: number) => number;
  animateTarget?: boolean;
  immediate?: boolean;
};

export type ThreeEditorEvents = {
  select: { object: THREE.Object3D | null };
  sceneTreeChange: { tree: SceneTreeNode[] };
};

export type ThreeEditorOptions = {
  canvas: HTMLCanvasElement;
  initialSize?: { width: number; height: number };
  pixelRatio?: number;
  clearColor?: THREE.ColorRepresentation;
  enableDamping?: boolean;
  /**
   * Optional initial scene settings. When not provided, core uses defaults.
   */
  initialSceneSettings?: Partial<SceneSettings>;
  /**
   * 实验特性：对静态对象启用矩阵冻结（matrixAutoUpdate=false）。
   * 仅建议用于编辑器场景；动画对象会自动跳过。
   */
  freezeStaticObjects?: boolean;
};

/**
 * Three.js 编辑器核心（不含 UI）。
 *
 * 设计目标：
 * - **可发布为 npm 包**：只暴露可复用的核心能力，UI/状态管理留给上层应用
 * - **最小可用**：场景渲染、相机控制、拾取选中、Gizmo 变换、GLTF 加载
 * - **生命周期明确**：start/stop/resize/dispose，便于在 React 等框架中挂载与卸载
 */
export class ThreeEditor {
  private static readonly SCENE_TREE_IGNORED_TYPES = new Set([
    'GridHelper',
    'AxesHelper',
    'TransformControls',
    'TransformControlsGizmo',
    'TransformControlsPlane',
    'CameraHelper',
    'PointLightHelper',
    'DirectionalLightHelper',
    'HemisphereLightHelper',
    'SpotLightHelper'
  ]);

  readonly canvas: HTMLCanvasElement;
  readonly scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  // renderer 实例本身由 RendererController 管理创建/重建，但对外仍暴露用于必要的高级扩展。
  renderer: THREE.WebGLRenderer;
  // orbit/transform 是交互与 UI 同步的关键对象：web 端直接读取 orbit.target/camera 以做面板展示与联动。
  orbit: OrbitControls;
  transform: TransformControls;
  readonly events = new Emitter<ThreeEditorEvents>();

  private clock = new THREE.Clock();
  private frame: number | null = null;
  private selected: THREE.Object3D | null = null;
  private sceneSettings: SceneSettings;
  // seq：用于异步 apply（HDRI 加载）竞态控制，确保“最后一次 setSceneSettings”生效。
  private sceneSettingsApplyingSeq = 0;
  private transformMode: TransformMode = 'translate';
  private transformToolEnabled = true;
  private freezeStaticObjects: boolean;
  private onTransformDraggingChanged: ((e: { value?: boolean }) => void) | null = null;
  // 热路径复用临时对象，减少拖拽放置时的 GC 抖动。
  private groundNdc = new THREE.Vector2();
  private groundRaycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private groundPoint = new THREE.Vector3();

  private interactionController: InteractionController;
  private rendererController: RendererController;
  private cameraController: CameraController;
  private environmentController: EnvironmentController;
  private helperController: HelperController;
  private viewPresetController: ViewPresetController;
  private assetLoader: AssetLoader;

  constructor(options: ThreeEditorOptions) {
    this.canvas = options.canvas;

    this.scene = new THREE.Scene();
    this.scene.name = 'Scene';

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10_000);
    // 默认视角更拉远一点，避免“贴脸”体验（同时会影响 setViewPreset 的默认半径）
    this.camera.position.set(9.4, 6.0, 9.4);
    this.camera.lookAt(0, 0.8, 0);

    // 预先合并/归一化：renderer 创建时就需要 antialias 等设置已就绪
    const base = createDefaultSceneSettings();
    const patched = options.initialSceneSettings
      ? ({
          ...base,
          ...options.initialSceneSettings,
          basic: {
            ...base.basic,
            ...(options.initialSceneSettings.basic ?? {})
          },
          environment: {
            ...base.environment,
            ...(options.initialSceneSettings.environment ?? {}),
            fog: {
              ...base.environment.fog,
              ...(options.initialSceneSettings.environment?.fog ?? {})
            }
          },
          camera: {
            ...base.camera,
            ...(options.initialSceneSettings.camera ?? {}),
            position: {
              ...base.camera.position,
              ...(options.initialSceneSettings.camera?.position ?? {})
            },
            target: {
              ...base.camera.target,
              ...(options.initialSceneSettings.camera?.target ?? {})
            }
          },
          grid: {
            ...base.grid,
            ...(options.initialSceneSettings.grid ?? {})
          },
          helpers: {
            ...base.helpers,
            ...(options.initialSceneSettings.helpers ?? {}),
            axes: {
              ...base.helpers.axes,
              ...(options.initialSceneSettings.helpers?.axes ?? {})
            }
          },
          renderer: {
            ...base.renderer,
            ...(options.initialSceneSettings.renderer ?? {})
          },
          sceneTree: options.initialSceneSettings.sceneTree ?? base.sceneTree
        } as SceneSettings)
      : base;

    this.sceneSettings = normalizeSceneSettings(patched);
    this.freezeStaticObjects = Boolean(options.freezeStaticObjects);
    this.cameraController = new CameraController();
    this.environmentController = new EnvironmentController();
    this.helperController = new HelperController();
    this.assetLoader = new AssetLoader(this.scene);

    this.interactionController = new InteractionController({
      scene: this.scene,
      camera: this.camera,
      select: (obj) => this.select(obj)
    });
    this.rendererController = new RendererController(this.canvas, this.interactionController);

    this.renderer = this.rendererController.createRenderer(this.sceneSettings.renderer.antialias);
    this.rendererController.applyRendererSettings(this.renderer, this.sceneSettings.renderer);

    // 轨道相机 + gizmo：由 InteractionController 统一创建与绑定。
    const { orbit, transform } = this.interactionController.recreateControls({
      domElement: this.renderer.domElement,
      transformMode: this.transformMode,
      orbitTarget: new THREE.Vector3(
        this.sceneSettings.camera.target.x,
        this.sceneSettings.camera.target.y,
        this.sceneSettings.camera.target.z
      ),
      orbitEnabled: true,
      selected: null,
      toolEnabled: this.transformToolEnabled,
      enableDamping: options.enableDamping ?? true
    });
    this.orbit = orbit;
    this.transform = transform;
    this.bindTransformDragHooks();
    this.viewPresetController = new ViewPresetController(this.camera, this.orbit);

    this.bootstrapScene();

    if (options.clearColor != null) {
      this.renderer.setClearColor(options.clearColor as any, 1);
    }

    const w = options.initialSize?.width ?? this.canvas.clientWidth ?? 1;
    const h = options.initialSize?.height ?? this.canvas.clientHeight ?? 1;
    this.resize(w, h, options.pixelRatio);

    // Constructor cannot be async, but we still want the three.Scene updated ASAP.
    void this.applySceneSettings(this.sceneSettings, this.sceneSettings, ++this.sceneSettingsApplyingSeq, true);
  }

  on = this.events.on.bind(this.events);

  /**
   * 获取当前 scene settings（core 内部维护的数据真相）。
   * UI 层不应原地修改返回对象。
   */
  getSceneSettings(): SceneSettings {
    const s = this.sceneSettings;
    return {
      ...s,
      basic: { ...s.basic },
      environment: {
        ...s.environment,
        fog: { ...s.environment.fog },
        hdri: s.environment.hdri.type === 'uploaded' ? { ...s.environment.hdri } : { ...s.environment.hdri }
      },
      camera: {
        ...s.camera,
        position: { ...s.camera.position },
        target: { ...s.camera.target }
      },
      grid: { ...s.grid },
      helpers: {
        axes: { ...s.helpers.axes },
      },
      renderer: { ...s.renderer },
      sceneTree: this.getSceneTree()
    };
  }

  getRendererSettings(): RendererSettings {
    return { ...this.sceneSettings.renderer };
  }

  /**
   * 获取用于 UI 展示的场景树（相机 + scene 层级）。
   */
  getSceneTree(): SceneTreeNode[] {
    const cameraNode: SceneTreeNode = {
      uuid: this.camera.uuid,
      name: this.camera.name || 'Camera',
      type: this.camera.type,
      visible: this.camera.visible,
      kind: 'camera',
      children: []
    };

    const sceneNode: SceneTreeNode = {
      uuid: this.scene.uuid,
      name: this.scene.name || 'Scene',
      type: this.scene.type,
      visible: this.scene.visible,
      kind: 'scene',
      children: this.scene.children
        .map((child) => this.toSceneTreeNode(child))
        .filter((node): node is SceneTreeNode => node != null)
    };

    return [cameraNode, sceneNode];
  }

  /**
   * 替换 renderer 相关设置（仅处理 renderer 侧能即时生效的部分，
   * 如 antialias 变化会触发 renderer 重建）。
   */
  setRendererSettings(next: RendererSettings) {
    const prevRenderer = this.sceneSettings.renderer;
    // 将 renderer 配置纳入版本化结构，保证导出/导入/一致性
    const nextScene = normalizeSceneSettings({
      ...this.sceneSettings,
      renderer: next
    } as SceneSettings);
    this.sceneSettings = nextScene;
    this.applyRendererSettings(nextScene.renderer, prevRenderer);
  }

  private applyRendererSettings(nextRenderer: RendererSettings, prevRenderer: RendererSettings) {
    if (nextRenderer.antialias !== prevRenderer.antialias) {
      const orbitTarget = this.orbit.target.clone();
      const orbitEnabled = this.orbit.enabled;
      const selected = this.selected;

      const recreated = this.rendererController.recreateRenderer(this.renderer, {
        antialias: nextRenderer.antialias,
        orbitTarget,
        orbitEnabled,
        selected,
        transformMode: this.transformMode,
        toolEnabled: this.transformToolEnabled
      });

      this.renderer = recreated.renderer;
      this.orbit = recreated.orbit;
      this.transform = recreated.transform;
      this.bindTransformDragHooks();
      this.viewPresetController.setOrbit(this.orbit);
      // 重建 renderer 后需要重新同步尺寸/DPR，避免 antialias 切换后仍使用旧像素比。
      const w = this.canvas.clientWidth ?? 1;
      const h = this.canvas.clientHeight ?? 1;
      this.resize(Math.max(1, w), Math.max(1, h));
    }

    this.rendererController.applyRendererSettings(this.renderer, nextRenderer);
  }

  private applyCameraSettings(nextCamera: SceneSettings['camera']) {
    const width = Math.max(1, this.canvas.clientWidth || 1);
    const height = Math.max(1, this.canvas.clientHeight || 1);
    this.cameraController.applyCameraSettings(this.camera, this.orbit, nextCamera, width / height);
  }

  /**
   * 替换 scene settings 并把变更应用到 THREE.Scene。
   * 注意：HDRI 贴图属于异步加载项，该方法在应用完成后才 resolve。
   */
  async setSceneSettings(next: SceneSettings): Promise<void> {
    const normalized = normalizeSceneSettings(next);
    const prev = this.sceneSettings;
    this.sceneSettings = normalized;
    const seq = ++this.sceneSettingsApplyingSeq;
    await this.applySceneSettings(normalized, prev, seq);
  }

  /**
   * 启动 RAF 渲染循环。重复调用是安全的（幂等）。
   */
  start() {
    if (this.frame != null) return;
    this.clock.start();
    const tick = () => {
      const dt = this.clock.getDelta();
      this.orbit.update();
      this.render(dt);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /**
   * 停止 RAF 渲染循环。
   */
  stop() {
    if (this.frame == null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /**
   * 单帧渲染。上层也可以自己驱动（例如与自定义时间轴/后处理集成）。
   */
  render(_dt?: number) {
    // TransformControls 拖拽/旋转光源后，需要同步更新 helper 与 pick proxy。
    this.helperController.syncHelpers({ selected: this.selected, transformMode: this.transformMode });

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 外部容器尺寸变化时调用。
   * 注意：这里的 width/height 是 CSS 像素，renderer 内部会乘以 DPR。
   */
  resize(width: number, height: number, pixelRatio?: number) {
    const dpr = pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const aspect = Math.max(1e-6, width) / Math.max(1e-6, height);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  getSelected() {
    // 当前选中的对象（可能为 null，表示没有可编辑对象）
    return this.selected;
  }

  /**
   * 获取当前视图预设（仅表示“最近一次设置的预设”）。
   * 注意：用户通过 OrbitControls 自由旋转后，该值不会自动推断更新。
   */
  getViewPreset(): ViewPreset {
    return this.viewPresetController.getViewPreset();
  }

  /**
   * 切换“视觉/视图”预设：以 orbit.target 为中心，保持当前观察距离不变，
   * 只改变相机方位到常见的前/后/左/右/上/下，以及一个默认斜 45° 视角。
   */
  setViewPreset(preset: ViewPreset, opts?: ViewTransitionOptions) {
    this.viewPresetController.setViewPreset(preset, opts);
  }

  /**
   * 设置当前选中对象。会同步 TransformControls 的 attach/detach。
   */
  select(object: THREE.Object3D | null) {
    const safe = object && !this.isNonSelectable(object) ? object : null;
    const prev = this.selected;

    if (this.freezeStaticObjects && prev && prev !== safe) {
      this.freezeObjectTree(prev);
    }
    if (this.freezeStaticObjects && safe) {
      this.unfreezeObjectTree(safe);
    }

    this.selected = safe;

    if (safe && this.transformToolEnabled) {
      this.transform.attach(safe);
      this.transform.visible = true;
    } else {
      this.transform.detach();
      this.transform.visible = false;
    }
    this.events.emit('select', { object: safe });
  }

  /**
   * 设置 gizmo 模式：translate/rotate/scale。
   */
  setTransformMode(mode: TransformMode) {
    this.transformMode = mode;
    this.transform.setMode(mode);
  }

  /**
   * 控制 transform 工具是否启用：
   * - 禁用时不允许拾取写回 select
   * - gizmo 不应可交互（detach + enabled/visible 置空）
   */
  setTransformToolEnabled(enabled: boolean) {
    this.transformToolEnabled = enabled;

    // 关闭时确保 gizmo 不再接管交互
    if (enabled && this.selected) {
      this.transform.attach(this.selected);
      this.transform.visible = true;
    } else {
      this.transform.detach();
      this.transform.visible = false;
    }

    this.interactionController.setToolEnabled(enabled);
  }

  add(object: THREE.Object3D) {
    // 把外部创建的对象挂载到 three.Scene（不做额外校验）。
    this.scene.add(object);
    if (this.freezeStaticObjects) {
      this.freezeObjectTree(object);
    }
    this.syncSceneTreeState();
  }

  setObjectVisibleByUuid(uuid: string, visible: boolean): boolean {
    const obj = this.scene.getObjectByProperty('uuid', uuid);
    if (!obj || this.isNonSelectable(obj)) return false;
    obj.visible = visible;
    if (!visible && this.selected && !this.isVisibleInHierarchy(this.selected)) {
      this.select(null);
    }
    this.syncSceneTreeState();
    return true;
  }

  removeObjectByUuid(uuid: string): boolean {
    const obj = this.scene.getObjectByProperty('uuid', uuid);
    if (!obj || !obj.parent || this.isNonSelectable(obj)) return false;
    if (obj === this.selected) this.select(null);
    obj.parent.remove(obj);
    this.syncSceneTreeState();
    return true;
  }

  /**
   * 将视口归一化坐标（0~1）投影到水平地面（y=planeY）。
   * 常用于拖拽放置模型时计算落点，避免 UI 层直接依赖 three.js 数学对象。
   */
  getGroundPointFromViewport(normalizedX: number, normalizedY: number, planeY = 0) {
    this.groundNdc.set(normalizedX * 2 - 1, -(normalizedY * 2 - 1));
    this.groundRaycaster.setFromCamera(this.groundNdc, this.camera);
    this.groundPlane.constant = -planeY;
    const hit = this.groundRaycaster.ray.intersectPlane(this.groundPlane, this.groundPoint);
    if (!hit) return null;

    return {
      x: hit.x,
      y: hit.y,
      z: hit.z
    };
  }

  /**
   * 加载 GLTF/GLB，并默认加入 scene。
   * - 资源管理（缓存、释放、材质替换）会在后续的 asset 系统里扩展
   */
  async loadGLTF(url: string, opts?: { addToScene?: boolean }) {
    const out = await this.assetLoader.loadGLTF(url, opts);
    if (opts?.addToScene ?? true) {
      if (this.freezeStaticObjects) {
        this.freezeObjectTree(out);
      }
      this.syncSceneTreeState();
    }
    return out;
  }

  private async applySceneSettings(next: SceneSettings, prev: SceneSettings, seq: number, force = false) {
    const diff = calcSceneSettingsDiff(next, prev) as ReturnType<typeof calcSceneSettingsDiff> & {
      helpersChanged?: boolean;
    };
    const environmentChanged = diff.environmentChanged;
    const rendererChanged = diff.rendererChanged;
    const cameraChanged = diff.cameraChanged;
    const gridChanged = diff.gridChanged;
    const helpersChanged = Boolean(diff.helpersChanged);

    if (!environmentChanged && !rendererChanged && !cameraChanged && !gridChanged && !helpersChanged && !force) return;

    if (rendererChanged || force) {
      this.applyRendererSettings(next.renderer, prev.renderer);
    }

    if (cameraChanged || force) {
      this.applyCameraSettings(next.camera);
    }

    if (gridChanged || force) {
      this.helperController.applyGrid(next.grid);
    }

    if (helpersChanged || force) {
      this.helperController.applyHelpers(next.helpers);
    }

    const shouldContinue = await this.environmentController.applyEnvironment({
      scene: this.scene,
      renderer: this.renderer,
      next: next.environment,
      prev: prev.environment,
      seq,
      getLatestSeq: () => this.sceneSettingsApplyingSeq
    });

    if (!shouldContinue) return;

    this.environmentController.applyFog({
      scene: this.scene,
      fog: next.environment.fog,
      seq,
      getLatestSeq: () => this.sceneSettingsApplyingSeq
    });
  }

  /**
   * 释放内部资源与事件绑定。React 组件卸载时必须调用。
   */
  dispose() {
    this.stop();
    this.events.clear();
    this.viewPresetController.cancel();
    this.interactionController.dispose();
    this.environmentController.dispose();
    this.helperController.dispose();
    this.unbindTransformDragHooks();
    this.disposeSceneResources();
    this.renderer.dispose();
  }

  private bootstrapScene() {
    this.helperController.mount(this.scene);
    this.syncSceneTreeState();
  }

  private syncSceneTreeState() {
    const tree = this.getSceneTree();
    this.sceneSettings = {
      ...this.sceneSettings,
      sceneTree: tree
    };
    this.events.emit('sceneTreeChange', { tree });
  }

  private toSceneTreeNode(obj: THREE.Object3D): SceneTreeNode | null {
    if (this.isIgnoredInSceneTree(obj)) return null;
    const children = obj.children.map((child) => this.toSceneTreeNode(child)).filter((node): node is SceneTreeNode => node != null);
    if (obj.type === 'Object3D' && !obj.name && children.length === 0) return null;
    return {
      uuid: obj.uuid,
      name: obj.name || obj.type,
      type: obj.type,
      visible: obj.visible,
      kind: this.getSceneNodeKind(obj),
      children
    };
  }

  private getSceneNodeKind(obj: THREE.Object3D): SceneTreeNodeKind {
    if (obj.type === 'Scene') return 'scene';
    if ((obj as any).isCamera) return 'camera';
    if ((obj as any).isLight) return 'light';
    if (obj.type === 'Group') return 'group';
    return 'object';
  }

  private isIgnoredInSceneTree(obj: THREE.Object3D) {
    if (this.isNonSelectable(obj)) return true;
    if ((obj as any).isTransformControls) return true;
    if (ThreeEditor.SCENE_TREE_IGNORED_TYPES.has(obj.type)) return true;
    if (obj.name === 'TransformControlsEditor') return true;
    if (obj.parent?.type === 'TransformControlsGizmo') return true;
    if ((obj.userData as any)?.hideInEditor) return true;
    return false;
  }

  private isNonSelectable(obj: THREE.Object3D) {
    // 通过 userData 标记跳过辅助对象/ gizmo，避免拾取链路选到不该编辑的内容。
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if ((cur.userData as any).__vizonNonSelectable) return true;
      cur = cur.parent;
    }
    return false;
  }

  private isSameOrAncestor(target: THREE.Object3D, node: THREE.Object3D) {
    let cur: THREE.Object3D | null = node;
    while (cur) {
      if (cur === target) return true;
      cur = cur.parent;
    }
    return false;
  }

  private isVisibleInHierarchy(node: THREE.Object3D) {
    let cur: THREE.Object3D | null = node;
    while (cur) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  }

  private freezeObjectTree(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (!this.canFreezeObject(obj)) return;
      obj.matrixAutoUpdate = false;
      obj.updateMatrix();
      obj.updateMatrixWorld(true);
    });
  }

  private unfreezeObjectTree(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (!this.canFreezeObject(obj)) return;
      obj.matrixAutoUpdate = true;
      obj.updateMatrixWorld(true);
    });
  }

  private canFreezeObject(obj: THREE.Object3D) {
    if ((obj as any).isCamera) return false;
    if ((obj as any).isLight) return false;
    if ((obj as any).isBone) return false;
    if ((obj as any).isSkinnedMesh) return false;
    if ((obj as any).isTransformControls) return false;
    if (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane') return false;
    if ((obj.userData as any).__vizonNonSelectable) return false;
    if ((obj.userData as any).__vizonDynamic) return false;
    return true;
  }

  private bindTransformDragHooks() {
    if (!this.freezeStaticObjects) return;
    this.unbindTransformDragHooks();

    this.onTransformDraggingChanged = (e) => {
      if (!this.selected) return;
      const dragging = Boolean(e?.value);
      if (dragging) {
        this.unfreezeObjectTree(this.selected);
        return;
      }
      this.selected.updateMatrixWorld(true);
      this.freezeObjectTree(this.selected);
    };

    (this.transform as any).addEventListener('dragging-changed', this.onTransformDraggingChanged);
  }

  private unbindTransformDragHooks() {
    if (!this.onTransformDraggingChanged) return;
    (this.transform as any)?.removeEventListener?.('dragging-changed', this.onTransformDraggingChanged);
    this.onTransformDraggingChanged = null;
  }

  private disposeSceneResources() {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      const material = (mesh as any).material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;

      const materials = Array.isArray(material) ? material : [material];
      for (const m of materials) {
        this.disposeMaterialTextures(m);
        m.dispose();
      }
    });
  }

  private disposeMaterialTextures(material: THREE.Material) {
    // 统一释放材质上的贴图资源（map/normalMap/envMap 等），避免 WebGL 纹理泄漏。
    for (const value of Object.values(material as unknown as Record<string, unknown>)) {
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
  }
}

