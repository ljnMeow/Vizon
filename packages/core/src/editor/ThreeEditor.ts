import * as THREE from 'three';
import type { OrbitControls, TransformControls } from 'three-stdlib';
import { Emitter } from '../infra/events';
import type { RendererSettings, SceneSettings } from '../settings/sceneSettings';
import type { SceneTreeNode } from '../settings/sceneTree';
import { createDefaultSceneSettings, normalizeSceneSettings } from '../settings/sceneSettings';
import { calcSceneSettingsDiff } from '../settings/sceneSettingsDiff';
import { AssetLoader } from './controllers/AssetLoader';
import { CameraController } from './controllers/CameraController';
import { EnvironmentController } from './controllers/EnvironmentController';
import { HelperController } from './controllers/HelperController';
import { InteractionController } from './controllers/InteractionController';
import { RendererController } from './controllers/RendererController';
import { ViewPresetController } from './controllers/ViewPresetController';
import { SceneTreeController } from './controllers/SceneTreeController';
import { StaticObjectFreezeController } from './controllers/StaticObjectFreezeController';
import { isNonSelectableInHierarchy, isVisibleInHierarchy } from './picking/objectGuards';
import {
  applyEditorOverlayLayer,
  configureRaycasterForScenePicking,
  enableEditorViewLayers
} from './picking/pickLayers';

/** TransformControls 工作模式：平移 / 旋转 / 缩放 */
export type TransformMode = 'translate' | 'rotate' | 'scale';

/** 正交工程视图名称；`default` 为斜 45° 透视观察 */
export type ViewPreset = 'default' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/**
 * 视角切换动画选项：
 * - durationMs：补间时长；
 * - easing：归一化时间 t∈[0,1] 的曲线；
 * - animateTarget：是否连 orbit.target 一起动画；
 * - immediate：为 true 时跳过 RAF 直接落点。
 */
export type ViewTransitionOptions = {
  durationMs?: number;
  easing?: (t: number) => number;
  animateTarget?: boolean;
  immediate?: boolean;
};

/**
 * 对外事件表：`on()` 订阅时使用这些 key。
 * - select：当前选中 three 对象变化（可为 null）；
 * - sceneTreeChange：结构树刷新，供侧边栏重绘。
 */
export type ThreeEditorEvents = {
  select: { object: THREE.Object3D | null };
  sceneTreeChange: { tree: SceneTreeNode[] };
};

/** 构造 `ThreeEditor` 时的选项：画布、初值、可选场景配置与实验开关 */
export type ThreeEditorOptions = {
  /** 已插入 DOM 的 canvas；WebGLRenderer 会复用此元素 */
  canvas: HTMLCanvasElement;
  /** 首次渲染前使用的逻辑宽高（CSS 像素），避免 clientWidth 为 0 时闪烁 */
  initialSize?: { width: number; height: number };
  /** 覆盖 `window.devicePixelRatio` 上限逻辑时可传入；默认在 resize 内限幅到 2 */
  pixelRatio?: number;
  /** 清屏色；若设置则覆盖 scene 背景对「空白边缘」的显示（仍与 environment.background 协同） */
  clearColor?: THREE.ColorRepresentation;
  /** OrbitControls 阻尼；未传时默认开启 */
  enableDamping?: boolean;
  /**
   * 与默认 `SceneSettings` 做浅层合并后再 `normalize`，作为首帧状态 truth。
   */
  initialSceneSettings?: Partial<SceneSettings>;
  /**
   * 为 true 时：未选中的静态子树将 `matrixAutoUpdate=false` 以省每帧矩阵更新；
   * 拖拽 gizmo 时会临时解冻当前选中节点。
   */
  freezeStaticObjects?: boolean;
};

/**
 * Three.js 编辑器运行时门面（`editor/` 目录其余模块皆为其服务）。
 *
 * 职责边界：
 * - 编排 controllers、同步 `SceneSettings` 与 THREE 对象；
 * - 暴露 `start/render/resize/dispose` 生命周期；
 * - 不依赖 React；上层通过 `events` 与 getter 拉取状态。
 */
export class ThreeEditor {
  /** 与 WebGLRenderer 绑定的同一个 canvas 引用 */
  readonly canvas: HTMLCanvasElement;
  /** 所有可编辑内容的根；主相机不在其子树中（见 `canAttachTransformTarget`） */
  readonly scene: THREE.Scene;
  /** 视口渲染与 OrbitControls 绑定的透视相机（非「场景里拖入的」相机对象） */
  camera: THREE.PerspectiveCamera;
  /** 当前 WebGL 上下文；antialias 变更时整实例会被 RendererController 替换 */
  renderer: THREE.WebGLRenderer;
  /** 轨道控制：与 `camera`、DOM 元素绑定；UI 可读 `target` 做面板联动 */
  orbit: OrbitControls;
  /** 变换 Gizmo；与 `orbit` 互斥拖拽（dragging 时禁用 orbit） */
  transform: TransformControls;
  /** 轻量事件总线，替代自定义 EventEmitter 依赖 */
  readonly events = new Emitter<ThreeEditorEvents>();

  // —— 动画循环与选择态 ——
  /** `render` 循环用时钟，供未来扩展动画 dt */
  private clock = new THREE.Clock();
  /** `requestAnimationFrame` 句柄；非 null 表示循环在跑 */
  private frame: number | null = null;
  /** 当前选中可编辑对象；经 `isNonSelectableInHierarchy` 过滤 */
  private selected: THREE.Object3D | null = null;
  /** 归一化后的完整场景配置快照（含 sceneTree 缓存字段） */
  private sceneSettings: SceneSettings;
  /**
   * 单调递增序号：`setSceneSettings` / 构造末尾 apply 时 +1；
   * 异步 HDRI 加载完成时比对，丢弃过期回调。
   */
  private sceneSettingsApplyingSeq = 0;

  /** Gizmo 模式；与 `transform.setMode` 同步 */
  private transformMode: TransformMode = 'translate';
  /** false 时关闭 pointer 拾取与 gizmo attach */
  private transformToolEnabled = true;
  /** 构造选项拷贝；控制 StaticObjectFreezeController 是否介入 */
  private freezeStaticObjects: boolean;
  /** freeze 模式下监听 `dragging-changed` 的句柄；dispose 时需移除 */
  private onTransformDraggingChanged: ((e: { value?: boolean }) => void) | null = null;

  // —— 视口投射 / 拖拽放置（复用向量，避免高频 new）——
  /** 地面求交：NDC 临时向量 */
  private groundNdc = new THREE.Vector2();
  /** 仅用于 `setFromCamera` + 与水平面求交 */
  private groundRaycaster = new THREE.Raycaster();
  /** 世界 XZ 平面；`constant` 会在运行时按 planeY 调整 */
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** `intersectPlane` 写出交点 */
  private groundPoint = new THREE.Vector3();
  /** 模型落点：NDC */
  private dropNdc = new THREE.Vector2();
  /**
   * 与 Interaction 拾取相同 layer 策略：仅场景内容层，忽略 overlay 上物体，
   * 仍会在 find 里二次过滤 gizmo/helper。
   */
  private dropRaycaster = new THREE.Raycaster();
  /** `ray.at` 备用落点 */
  private dropPoint = new THREE.Vector3();

  // —— 子系统（单类一责）——
  private interactionController: InteractionController;
  private rendererController: RendererController;
  private cameraController: CameraController;
  private environmentController: EnvironmentController;
  private helperController: HelperController;
  private viewPresetController: ViewPresetController;
  private sceneTreeController: SceneTreeController;
  private staticObjectFreezeController: StaticObjectFreezeController;
  private assetLoader: AssetLoader;

  // —— 场景内额外相机/灯光的辅助器（独立于光/相机节点，避免矩阵双计）——
  /** uuid(相机) → CameraHelper，生命周期随 `add`/`removeObjectByUuid` */
  private cameraHelpers = new Map<string, THREE.CameraHelper>();
  /** uuid(灯光) → 各类 LightHelper */
  private lightHelpers = new Map<string, THREE.Object3D>();
  /** 有相机增删或需强制刷新时为 true，render 中批量 `helper.update()` */
  private cameraHelpersDirty = true;
  private lightHelpersDirty = true;

  /** 选中含子节点时包围盒预览；红框、overlay 层、不可拾取 */
  private selectionBoxHelper: THREE.BoxHelper | null = null;

  constructor(options: ThreeEditorOptions) {
    // 保存宿主画布引用；后续 Renderer 与 Orbit 都挂在其上
    this.canvas = options.canvas;

    // 世界根节点；命名便于调试器与 glTF 导出约定
    this.scene = new THREE.Scene();
    this.scene.name = 'Scene';

    // 视口专用透视相机：宽高比在 resize 里更新，far 较大以兼容大场景编辑
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10_000);
    // 初始机位略高、略远，减少首次进入时「贴在模型脸上」的不良体验
    this.camera.position.set(9.4, 6.0, 9.4);
    this.camera.lookAt(0, 0.8, 0);
    // 除 layer0 用户物体外，还需渲染 layer1（gizmo/网格等 overlay）
    enableEditorViewLayers(this.camera);
    // 放置射线与拾取一致：只与内容层求交，减轻大场景点击成本
    configureRaycasterForScenePicking(this.dropRaycaster);

    // —— 构建首帧 SceneSettings：defaults 与 partial 深度合并后再 normalize ——
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

    // 数值/枚举兜底在 normalize 内完成，避免 UI 脏数据搞崩 WebGL
    this.sceneSettings = normalizeSceneSettings(patched);
    this.freezeStaticObjects = Boolean(options.freezeStaticObjects);
    // 以下控制器无构造参数或仅依赖后续 inject，保持顺序以可读性为主
    this.cameraController = new CameraController();
    this.environmentController = new EnvironmentController();
    this.helperController = new HelperController();
    this.sceneTreeController = new SceneTreeController();
    this.staticObjectFreezeController = new StaticObjectFreezeController();
    // 加载器持有 scene 引用，便于 `loadGLTF` 默认 add
    this.assetLoader = new AssetLoader(this.scene);

    // 指针拾取与 orbit/transform 生命周期集中在此类，避免 ThreeEditor 直接监听 DOM
    this.interactionController = new InteractionController({
      scene: this.scene,
      camera: this.camera,
      select: (obj) => this.select(obj)
    });
    // antialias 切换时需要该控制器重建 WebGL 上下文并回调 recreateControls
    this.rendererController = new RendererController(this.canvas, this.interactionController);

    // 首屏 renderer：alpha true 便于与 DOM 背景融合（见 RendererController 实现）
    this.renderer = this.rendererController.createRenderer(this.sceneSettings.renderer.antialias);
    this.rendererController.applyRendererSettings(this.renderer, this.sceneSettings.renderer);

    // 创建 Orbit + TransformControls，挂到 scene 与 domElement；restore 当前无选中故 detach
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
    // 仅在 freezeStaticObjects 时注册 dragging 监听，避免无意义闭包
    this.bindTransformDragHooks();
    this.viewPresetController = new ViewPresetController(this.camera, this.orbit);

    // 向 scene 挂上 Grid/Axes 并 emit 初始 sceneTree
    this.bootstrapScene();

    // 可选强制清屏色（例如与 App 顶栏色一致）
    if (options.clearColor != null) {
      this.renderer.setClearColor(options.clearColor as any, 1);
    }

    // 立即同步像素比与投影矩阵，避免首帧 gl 尺寸为 0
    const w = options.initialSize?.width ?? this.canvas.clientWidth ?? 1;
    const h = options.initialSize?.height ?? this.canvas.clientHeight ?? 1;
    this.resize(w, h, options.pixelRatio);

    // 构造内不能 await，于是 fire-and-forget：刷新环境贴图/雾等（force=true 跳过 diff 短路）
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
    return this.sceneTreeController.getSceneTree(this.scene, this.camera);
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
    // 预留：未来可在这里消费 _dt 做动画；当前 helper 同步不依赖 dt
    this.helperController.syncHelpers({ selected: this.selected, transformMode: this.transformMode });
    // 选中场景内相机时，每帧更新 CameraHelper 与视锥线框；否则仅在有 dirty 时批量更新省 CPU
    const selectedIsCamera = Boolean((this.selected as any)?.isCamera);
    const selectedIsLight = Boolean((this.selected as any)?.isLight);
    if (this.cameraHelpersDirty || selectedIsCamera) {
      for (const helper of this.cameraHelpers.values()) {
        helper.update(); // 同步 world-space 视锥
      }
      this.cameraHelpersDirty = false; // 本帧已消化
    }
    if (this.lightHelpersDirty || selectedIsLight) {
      for (const helper of this.lightHelpers.values()) {
        (helper as any).update?.(); // Spot/Directional 等 helper 需跟目标姿态
      }
      this.lightHelpersDirty = false;
    }
    this.updateSelectionBoxHelper(); // 可能创建/更新 BoxHelper

    this.renderer.render(this.scene, this.camera); // 单视口单相机
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
  private canAttachTransformTarget(object: THREE.Object3D | null): object is THREE.Object3D {
    if (!object) return false;
    // 主相机作为根节点独立展示，不在 scene 子树中，不能 attach 到 TransformControls。
    if (object === this.camera) return false;
    let cur: THREE.Object3D | null = object;
    while (cur) {
      if (cur === this.scene) return true;
      cur = cur.parent;
    }
    return false;
  }

  select(object: THREE.Object3D | null) {
    const safe = object && !isNonSelectableInHierarchy(object) ? object : null;
    const prev = this.selected;

    if (this.freezeStaticObjects && prev && prev !== safe) {
      this.staticObjectFreezeController.freezeObjectTree(prev);
    }
    if (this.freezeStaticObjects && safe) {
      this.staticObjectFreezeController.unfreezeObjectTree(safe);
    }

    this.selected = safe;
    if ((prev as any)?.isCamera || (safe as any)?.isCamera) this.cameraHelpersDirty = true;
    if ((prev as any)?.isLight || (safe as any)?.isLight) this.lightHelpersDirty = true;

    if (this.transformToolEnabled && this.canAttachTransformTarget(safe)) {
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
    this.lightHelpersDirty = true;
  }

  /**
   * 控制 transform 工具是否启用：
   * - 禁用时不允许拾取写回 select
   * - gizmo 不应可交互（detach + enabled/visible 置空）
   */
  setTransformToolEnabled(enabled: boolean) {
    this.transformToolEnabled = enabled;

    // 关闭时确保 gizmo 不再接管交互
    if (enabled && this.canAttachTransformTarget(this.selected)) {
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
    // 默认相机 helper：作为独立对象加入 scene，避免作为子节点导致二次变换偏移。
    if ((object as any).isCamera) {
      const helper = (object.userData as any)?.__vizonCameraHelper as THREE.CameraHelper | undefined;
      if (helper && !this.cameraHelpers.has(object.uuid)) {
        this.cameraHelpers.set(object.uuid, helper);
        this.scene.add(helper);
        helper.update();
        this.cameraHelpersDirty = true;
      }
    }
    if ((object as any).isLight) {
      const helper = (object.userData as any)?.__vizonLightHelper as THREE.Object3D | undefined;
      if (helper && !this.lightHelpers.has(object.uuid)) {
        this.lightHelpers.set(object.uuid, helper);
        this.scene.add(helper);
        (helper as any).update?.();
        this.lightHelpersDirty = true;
      }
    }
    if (this.freezeStaticObjects) {
      this.staticObjectFreezeController.freezeObjectTree(object);
    }
    this.syncSceneTreeState();
  }

  setObjectVisibleByUuid(uuid: string, visible: boolean): boolean {
    const obj = this.scene.getObjectByProperty('uuid', uuid);
    if (!obj || isNonSelectableInHierarchy(obj)) return false;
    obj.visible = visible;
    if (!visible && this.selected && !isVisibleInHierarchy(this.selected)) {
      this.select(null);
    }
    this.syncSceneTreeState();
    return true;
  }

  removeObjectByUuid(uuid: string): boolean {
    const obj = this.scene.getObjectByProperty('uuid', uuid);
    if (!obj || !obj.parent || isNonSelectableInHierarchy(obj)) return false;
    if (obj === this.selected) this.select(null);
    obj.parent.remove(obj);
    // 同步移除相机 helper（如果存在）。
    const helper = this.cameraHelpers.get(uuid);
    if (helper) {
      helper.parent?.remove(helper);
      this.cameraHelpers.delete(uuid);
      this.cameraHelpersDirty = true;
    }
    const lightHelper = this.lightHelpers.get(uuid);
    if (lightHelper) {
      lightHelper.parent?.remove(lightHelper);
      this.lightHelpers.delete(uuid);
      this.lightHelpersDirty = true;
    }
    this.syncSceneTreeState();
    return true;
  }

  /**
   * 移动/排序节点：
   * - 支持同一父节点下重新排序（before/after）
   * - 支持挂载到另一个节点下面（inside）
   *
   * @remarks
   * - 不允许移动 scene 根节点、TransformControls 等不可选对象
   * - 不允许把对象挂到自己的子树中（避免循环）
   */
  canMoveObjectByUuid(
    sourceUuid: string,
    targetUuid: string,
    placement: 'before' | 'after' | 'inside'
  ): boolean {
    const resolved = this.resolveMoveObjects(sourceUuid, targetUuid);
    if (!resolved) return false;
    return this.isMovePlacementValid(resolved.source, resolved.target, placement);
  }

  private resolveMoveObjects(
    sourceUuid: string,
    targetUuid: string
  ): { source: THREE.Object3D; target: THREE.Object3D } | null {
    const source = this.scene.getObjectByProperty('uuid', sourceUuid);
    if (!source || !source.parent) return null;
    if (isNonSelectableInHierarchy(source)) return null;
    if (source.type === 'Scene') return null;
    if ((source as any).isTransformControls) return null;

    const target = targetUuid === this.camera.uuid ? this.camera : this.scene.getObjectByProperty('uuid', targetUuid);
    if (!target) return null;
    if (isNonSelectableInHierarchy(target)) return null;

    return { source, target };
  }

  private isUnderSourceSubtree(source: THREE.Object3D, target: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = target;
    while (cur) {
      if (cur === source) return true;
      cur = cur.parent;
    }
    return false;
  }

  private isMovePlacementValid(
    source: THREE.Object3D,
    target: THREE.Object3D,
    placement: 'before' | 'after' | 'inside'
  ): boolean {
    if (source === target) return false;
    if (this.isUnderSourceSubtree(source, target)) return false;

    if (placement === 'inside') {
      // 根主相机只作为独立根节点展示，不允许挂载子节点到它下面。
      if (target === this.camera) return false;
      return !isNonSelectableInHierarchy(target);
    }

    const parent = target.parent;
    if (!parent) return false;
    if (isNonSelectableInHierarchy(parent)) return false;
    return true;
  }

  private insertChildAt(parent: THREE.Object3D, child: THREE.Object3D, index: number): void {
    if (child.parent) child.parent.remove(child);
    const n = Math.max(0, Math.min(index, parent.children.length));
    parent.children.splice(n, 0, child);
    child.parent = parent;
  }

  moveObjectByUuid(
    sourceUuid: string,
    targetUuid: string,
    placement: 'before' | 'after' | 'inside'
  ): boolean {
    const resolved = this.resolveMoveObjects(sourceUuid, targetUuid);
    if (!resolved) return false;
    const { source, target } = resolved;
    if (!this.isMovePlacementValid(source, target, placement)) return false;

    if (placement === 'inside') {
      // reparent：保持 source 的 world transform 不变（避免挂载后“位置跳变”）
      this.scene.updateMatrixWorld(true);
      target.updateMatrixWorld(true);
      target.attach(source);
      if ((source as any).isCamera) this.cameraHelpersDirty = true;
      if ((source as any).isLight) this.lightHelpersDirty = true;
      this.syncSceneTreeState();
      return true;
    }

    const parent = target.parent;
    if (!parent) return false;
    this.scene.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    parent.attach(source);

    const targetIndex = parent.children.indexOf(target);
    if (targetIndex < 0) return false;
    parent.remove(source);
    const refreshedTargetIndex = parent.children.indexOf(target);
    if (refreshedTargetIndex < 0) return false;
    const insertIndex = placement === 'before' ? refreshedTargetIndex : refreshedTargetIndex + 1;
    this.insertChildAt(parent, source, insertIndex);
    if ((source as any).isCamera) this.cameraHelpersDirty = true;
    if ((source as any).isLight) this.lightHelpersDirty = true;

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
   * 将视口归一化坐标（0~1）转换为“放置点”：
   * - 优先射线命中场景中的可见几何体（忽略 gizmo/辅助对象）
   * - 若未命中，则回退到水平地面（y=groundPlaneY）
   * - 若仍无法得到点，则沿射线在 defaultDistance 处取一点
   */
  getDropPointFromViewport(
    normalizedX: number,
    normalizedY: number,
    opts?: { groundPlaneY?: number; defaultDistance?: number }
  ) {
    const groundPlaneY = opts?.groundPlaneY ?? 0;
    const defaultDistance = opts?.defaultDistance ?? 6;

    this.dropNdc.set(normalizedX * 2 - 1, -(normalizedY * 2 - 1));
    this.dropRaycaster.setFromCamera(this.dropNdc, this.camera);

    const intersects = this.dropRaycaster.intersectObjects(this.scene.children, true);
    const hit = intersects.find((i) => {
      const obj = i.object;
      if (!isVisibleInHierarchy(obj)) return false;
      // 排除 gizmo/TransformControls
      if (obj === this.transform || this.isTransformChild(obj)) return false;
      // 排除编辑器辅助对象与显式标记隐藏对象
      if ((obj as any).isTransformControls) return false;
      if ((obj.userData as any)?.hideInEditor) return false;
      if (obj.type.endsWith('Helper')) return false;
      // 一些不可选对象也不应作为放置落点（例如网格/坐标轴）
      if (isNonSelectableInHierarchy(obj)) return false;
      return true;
    });

    if (hit?.point) {
      return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    }

    const ground = this.getGroundPointFromViewport(normalizedX, normalizedY, groundPlaneY);
    if (ground) return ground;

    const p = this.dropRaycaster.ray.at(defaultDistance, this.dropPoint);
    return { x: p.x, y: p.y, z: p.z };
  }

  /**
   * 加载 GLTF/GLB，并默认加入 scene。
   * - 资源管理（缓存、释放、材质替换）会在后续的 asset 系统里扩展
   */
  async loadGLTF(url: string, opts?: { addToScene?: boolean }) {
    const out = await this.assetLoader.loadGLTF(url, opts);
    if (opts?.addToScene ?? true) {
      if (this.freezeStaticObjects) {
        this.staticObjectFreezeController.freezeObjectTree(out);
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
    this.disposeSelectionBoxHelper();
    this.cameraHelpers.clear();
    this.lightHelpers.clear();
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

  private bindTransformDragHooks() {
    if (!this.freezeStaticObjects) return;
    this.unbindTransformDragHooks();

    this.onTransformDraggingChanged = (e) => {
      if (!this.selected) return;
      const dragging = Boolean(e?.value);
      if ((this.selected as any).isCamera) this.cameraHelpersDirty = true;
      if ((this.selected as any).isLight) this.lightHelpersDirty = true;
      if (dragging) {
        this.staticObjectFreezeController.unfreezeObjectTree(this.selected);
        return;
      }
      this.selected.updateMatrixWorld(true);
      this.staticObjectFreezeController.freezeObjectTree(this.selected);
    };

    (this.transform as any).addEventListener('dragging-changed', this.onTransformDraggingChanged);
  }

  private unbindTransformDragHooks() {
    if (!this.onTransformDraggingChanged) return;
    (this.transform as any)?.removeEventListener?.('dragging-changed', this.onTransformDraggingChanged);
    this.onTransformDraggingChanged = null;
  }

  private updateSelectionBoxHelper() {
    const sel = this.selected;
    if (!sel || sel.children.length === 0) {
      this.disposeSelectionBoxHelper();
      return;
    }

    const attached = this.selectionBoxHelper;
    const needsNew = !attached || (attached as unknown as { object?: THREE.Object3D }).object !== sel;
    if (needsNew) {
      this.disposeSelectionBoxHelper();
      const box = new THREE.BoxHelper(sel, 0xff0000);
      box.name = 'VizonSelectionBoxHelper';
      (box.userData as { __vizonNonSelectable?: boolean; hideInEditor?: boolean }).__vizonNonSelectable = true;
      (box.userData as { hideInEditor?: boolean }).hideInEditor = true;
      const mat = box.material as THREE.LineBasicMaterial;
      mat.depthTest = false;
      mat.transparent = true;
      mat.opacity = 0.95;
      box.renderOrder = 999;
      applyEditorOverlayLayer(box);
      this.scene.add(box);
      this.selectionBoxHelper = box;
    }
    this.selectionBoxHelper!.update();
  }

  private disposeSelectionBoxHelper() {
    const box = this.selectionBoxHelper;
    if (!box) return;
    box.parent?.remove(box);
    box.geometry.dispose();
    const m = box.material as THREE.Material | THREE.Material[];
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m.dispose();
    this.selectionBoxHelper = null;
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

  private isTransformChild(obj: THREE.Object3D) {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur === this.transform) return true;
      cur = cur.parent;
    }
    return false;
  }
}

