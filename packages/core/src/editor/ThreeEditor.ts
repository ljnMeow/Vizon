/**
 * **ThreeEditor** — vizon-3d-core 的 **运行时门面**（非 React）。
 *
 * **主要职责**：编排 `controllers` 与 `services`；维护 `SceneSettings` 与 THREE 场景同步；暴露
 * `start` / `render` / `resize` / `dispose`；处理选中、变换 Gizmo、历史撤销、剪贴板与场景节点编辑；
 * 通过 `events` 向 UI 推送 `select` / `sceneTreeChange` / `historyChange` / `sceneSettingsChange` 等。
 *
 * **不宜继续塞入的逻辑**：纯数据解析（见 `vizonPersist/`）、可单测的选中集合推导（`selection/nextSelection`）、
 * 历史 pending 纯函数（`history/`）。本文件仍保留 WebGL/DOM 强相关的 `writeNestedValue`、渲染管线钩子等与 three 紧耦合部分。
 *
 * @see `editor/vizonPersist/` 文档导入导出
 * @see `editor/history/` 撤销与属性预览提交辅助
 * @see `editor/selection/` 多选状态机与副作用编排
 */
import * as THREE from 'three';
import type { OrbitControls, TransformControls } from 'three-stdlib';
import { Emitter } from '../infra/events';
import {
  encodeHistoryI18nName,
  forEachMaterial,
  VIZON_HISTORY_KEYS,
  VIZON_STORAGE_KEYS,
  VIZON_USER_DATA_KEYS
} from '../infra/utils';
import { buildVizonDocumentFromEditor } from './vizonPersist';
import type { RendererSettings, SceneSettings } from '../settings/sceneSettings';
import type { SceneTreeNode } from '../settings/sceneTree';
import type { VizonDocument } from '../types/document';
import { createDefaultSceneSettings, normalizeSceneSettings } from '../settings/sceneSettings';
import { calcSceneSettingsDiff, mapSceneDiffToDirtyFlags } from '../settings/sceneSettingsDiff';
import { AssetLoader } from './controllers/AssetLoader';
import { CameraController } from './controllers/CameraController';
import { EnvironmentController } from './controllers/EnvironmentController';
import { EffectsController } from './controllers/EffectsController';
import { HelperController } from './controllers/HelperController';
import { InteractionController } from './controllers/InteractionController';
import { RendererController } from './controllers/RendererController';
import { ViewPresetController } from './controllers/ViewPresetController';
import { SceneTreeController } from './controllers/SceneTreeController';
import { StaticObjectFreezeController } from './controllers/StaticObjectFreezeController';
import { ConduitEditController } from './controllers/ConduitEditController';
import { isNonSelectableInHierarchy, isVisibleInHierarchy } from './picking/objectGuards';
import {
  cloneForHistory,
  createSingleSlotPending,
  encodeHistoryPayload,
  executeWithHistoryNotify,
  formatHistoryValue,
  getObjectHistoryTargetKind,
  HistoryManager,
  isHistoryValueEqual,
  readNestedValueCloned,
  runObjectPropertyHistoryStep,
  runRendererSettingsHistoryCommit,
  runSceneSettingsHistoryCommit,
  seedSingleSlotBaselineIfEmpty,
  type EditorHistoryOperation,
  type EditorHistoryRecord
} from './history';
import { computeNextPrimary, computeNextSelectedObjects, computeTransformAttachTarget } from './selection/nextSelection';
import { SelectionOrchestrator } from './selection/SelectionOrchestrator';
import {
  applyEditorOverlayLayer,
  configureRaycasterForScenePicking,
  enableEditorViewLayers
} from './picking/pickLayers';
import { EditorHelperManager, type LightTargetSnapshot } from './helpers/EditorHelperManager';
import { computeNextMultiSelectionTransforms } from './transform/multiSelectionTransform';
import { type ObjectTransformSnapshot } from './transform/objectTransformHistory';
import {
  collectTransformDragHistoryOperations,
  createTransformDragSession,
  type TransformDragSession
} from './transform/transformDragLifecycle';
import { handleTransformDraggingEffects } from './transform/transformDraggingEffects';
import { handleTransformObjectChange } from './transform/transformObjectChangeLifecycle';
import { applyObjectTransformSnapshot, applySelectionTransformSnapshotMap } from './transform/transformSnapshotApplication';
import { RenderPipelineService } from './services/RenderPipelineService';
import { SceneGraphService } from './services/SceneGraphService';

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
  select: { object: THREE.Object3D | null; objects: THREE.Object3D[] };
  sceneTreeChange: { tree: SceneTreeNode[] };
  historyChange: { records: EditorHistoryRecord[]; canUndo: boolean; canRedo: boolean };
  /**
   * 场景设置变更（来自 core 内部 apply，例如导入文档、撤销/重做、或外部直接调用 setSceneSettings）。
   * Web 层可用它来刷新 Inspector 的基础/环境/渲染器/相机/辅助器等回显状态。
   */
  sceneSettingsChange: { settings: SceneSettings; renderer: RendererSettings };
  /** 通知上层同步清理 Shift 多选相关的 React 状态（与 resetShiftMultiselectState 成对使用） */
  shiftMultiselectUiReset: Record<string, never>;
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
  /** 操作历史最多保留条数，默认 300 */
  historyMaxEntries?: number;
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
  private renderPipeline: RenderPipelineService;
  private sceneGraph: SceneGraphService;
  /** 当前选中可编辑对象；经 `isNonSelectableInHierarchy` 过滤 */
  private selected: THREE.Object3D | null = null;
  /** 当前多选对象列表（最后一个元素等于 `selected`） */
  private selectedObjects: THREE.Object3D[] = [];
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
  /** false 时仅隐藏 gizmo，但保留拾取链路 */
  private transformHandleVisible = true;
  /** 构造选项拷贝；控制 StaticObjectFreezeController 是否介入 */
  private freezeStaticObjects: boolean;
  // —— Transform 拖拽会话与监听 ——
  /** freeze 模式下监听 `dragging-changed` 的句柄；dispose 时需移除 */
  private onTransformDraggingChanged: ((e: { value?: boolean }) => void) | null = null;
  /** 监听 transform `objectChange`，驱动多选联动与 light target 同步 */
  private onTransformObjectChange: (() => void) | null = null;
  /** 当前 transform 拖拽会话：集中保存起始快照、world matrix 与 light target 状态 */
  private transformDragSession: TransformDragSession | null = null;

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
  private effectsController: EffectsController;
  private conduitEditController: ConduitEditController;
  private viewPresetController: ViewPresetController;
  private sceneTreeController: SceneTreeController;
  private staticObjectFreezeController: StaticObjectFreezeController;
  private selectionOrchestrator: SelectionOrchestrator;
  private assetLoader: AssetLoader;

  // —— 场景内额外相机/灯光的辅助器（独立于光/相机节点，避免矩阵双计）——
  /** 相机/灯光 helper 与 target handle 的生命周期、同步与 dirty 标记 */
  private editorHelperManager: EditorHelperManager;
  /** 选中含子节点时包围盒预览；红框、overlay 层、不可拾取 */
  private selectionBoxHelper: THREE.BoxHelper | null = null;
  /** 节点复制缓冲区（仅内存） */
  private clipboardObject: THREE.Object3D | null = null;
  /** 操作历史管理器：统一提供撤销/重做与记录列表 */
  private history: HistoryManager;
  /** 预览阶段暂存的对象属性“历史前值” */
  private pendingObjectPropHistoryBefore = new Map<string, unknown>();
  /** 预览阶段暂存的场景配置“历史前值”（单槽） */
  private pendingSceneHistoryBefore = createSingleSlotPending<SceneSettings>();
  /** 预览阶段暂存的渲染器配置“历史前值”（单槽） */
  private pendingRendererHistoryBefore = createSingleSlotPending<RendererSettings>();
  /** 渲染配置变更标记：当前仅用于观测，不影响现有渲染行为。 */
  private rendererDirty = false;
  /** 阴影相关变更标记：用于后续替换每帧阴影兜底。 */
  private shadowDirty = false;
  /** 场景/可视状态变更标记。 */
  private sceneDirty = false;
  /** dirty 命中计数，便于评估后续按需更新收益。 */
  private dirtyStats = { renderer: 0, shadow: 0, scene: 0 };
  /** dirty debug 日志节流时间戳。 */
  private dirtyStatsLastLogAt = 0;

  private isRendererSettingsEqual(a: RendererSettings, b: RendererSettings) {
    return (
      a.antialias === b.antialias &&
      a.outputColorSpace === b.outputColorSpace &&
      a.toneMapping === b.toneMapping &&
      a.toneMappingExposure === b.toneMappingExposure &&
      a.shadowMapEnabled === b.shadowMapEnabled &&
      a.shadowMapType === b.shadowMapType &&
      a.shadowMapAutoUpdate === b.shadowMapAutoUpdate
    );
  }

  private isSceneSettingsEqualForHistory(a: SceneSettings, b: SceneSettings) {
    // 说明：
    // - `sceneTree` 属于运行时派生状态，不应参与“设置是否变化”的判定（否则容易误触发历史与 apply）。
    // - 该比较用于 setSceneSettings 的早退与历史合并判断，不影响最终 normalize/apply。
    const aHdri = a.environment.hdri;
    const bHdri = b.environment.hdri;
    const hdriEqual =
      aHdri.type === bHdri.type &&
      (aHdri.type === 'uploaded' && bHdri.type === 'uploaded' ? aHdri.url === bHdri.url : true);

    return (
      a.version === b.version &&
      a.basic.sceneName === b.basic.sceneName &&
      a.basic.description === b.basic.description &&
      a.environment.backgroundMode === b.environment.backgroundMode &&
      a.environment.backgroundColor === b.environment.backgroundColor &&
      a.environment.environmentStrength === b.environment.environmentStrength &&
      hdriEqual &&
      a.environment.fog.enabled === b.environment.fog.enabled &&
      a.environment.fog.color === b.environment.fog.color &&
      a.environment.fog.near === b.environment.fog.near &&
      a.environment.fog.far === b.environment.fog.far &&
      a.camera.fov === b.camera.fov &&
      a.camera.near === b.camera.near &&
      a.camera.far === b.camera.far &&
      a.camera.position.x === b.camera.position.x &&
      a.camera.position.y === b.camera.position.y &&
      a.camera.position.z === b.camera.position.z &&
      a.camera.target.x === b.camera.target.x &&
      a.camera.target.y === b.camera.target.y &&
      a.camera.target.z === b.camera.target.z &&
      a.grid.enabled === b.grid.enabled &&
      a.grid.color === b.grid.color &&
      a.grid.opacity === b.grid.opacity &&
      a.helpers.axes.enabled === b.helpers.axes.enabled &&
      a.helpers.axes.size === b.helpers.axes.size &&
      this.isRendererSettingsEqual(a.renderer, b.renderer)
    );
  }

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
    this.history = new HistoryManager(options.historyMaxEntries);
    // 以下控制器无构造参数或仅依赖后续 inject，保持顺序以可读性为主
    this.cameraController = new CameraController();
    this.environmentController = new EnvironmentController();
    this.helperController = new HelperController();
    this.effectsController = new EffectsController(this.scene, this.camera);
    this.sceneTreeController = new SceneTreeController();
    this.staticObjectFreezeController = new StaticObjectFreezeController();
    this.editorHelperManager = new EditorHelperManager({
      scene: this.scene,
      requestShadowMapUpdate: () => this.requestShadowMapUpdate()
    });
    // 加载器持有 scene 引用，便于 `loadGLTF` 默认 add
    this.assetLoader = new AssetLoader(this.scene);

    // 指针拾取与 orbit/transform 生命周期集中在此类，避免 ThreeEditor 直接监听 DOM
    this.interactionController = new InteractionController({
      scene: this.scene,
      camera: this.camera,
      select: (obj, options) => this.select(obj, options),
      setSelectionHighlightEnabled: (enabled) => this.effectsController.setSelectionHighlightEnabled(enabled)
    });
    // antialias 切换时需要该控制器重建 WebGL 上下文并回调 recreateControls
    this.rendererController = new RendererController(this.canvas, this.interactionController);

    // 首屏 renderer：alpha true 便于与 DOM 背景融合（见 RendererController 实现）
    this.renderer = this.rendererController.createRenderer(this.sceneSettings.renderer.antialias);
    this.rendererController.applyRendererSettings(this.renderer, this.sceneSettings.renderer);
    this.effectsController.bindRenderer(this.renderer);

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
    this.conduitEditController = new ConduitEditController({ scene: this.scene, camera: this.camera, orbit: this.orbit });
    this.conduitEditController.setDomElement(this.renderer.domElement);
    // 仅在 freezeStaticObjects 时注册 dragging 监听，避免无意义闭包
    this.bindTransformDragHooks();
    this.selectionOrchestrator = new SelectionOrchestrator({
      scene: this.scene,
      freezeController: this.staticObjectFreezeController,
      effectsController: this.effectsController,
      transform: this.transform,
      getConduitEditController: () => this.conduitEditController,
      requestShadowMapUpdate: () => this.requestShadowMapUpdate()
    });
    this.viewPresetController = new ViewPresetController(this.camera, this.orbit);

    // SceneGraphService 必须在 bootstrapScene() 前初始化：
    // bootstrap 内会同步 sceneTree，而该方法已被委托到 service。
    this.sceneGraph = new SceneGraphService({
      getScene: () => this.scene,
      getCameraRoot: () => this.camera,
      getSceneTree: () => this.sceneTreeController.getSceneTree(this.scene, this.camera),
      updateSceneSettingsSceneTree: (tree) => {
        this.sceneSettings = {
          ...this.sceneSettings,
          sceneTree: tree
        };
      },
      emitSceneTreeChange: (tree) => this.events.emit('sceneTreeChange', { tree }),
      bindHelpersForSubtree: (root) => this.editorHelperManager.bindHelpersForSubtree(root),
      unbindHelpersForSubtree: (root) => this.editorHelperManager.unbindHelpersForSubtree(root),
      freezeObjectTreeIfEnabled: (root) => {
        if (this.freezeStaticObjects) this.staticObjectFreezeController.freezeObjectTree(root);
      },
      shouldFreezeStaticObjects: () => this.freezeStaticObjects,
      requestShadowMapUpdate: () => this.requestShadowMapUpdate(),
      renderOnce: () => {
        // renderPipeline 在后续才初始化；这里做安全兜底避免构造早期误调用崩溃。
        if ((this as any).renderPipeline) this.render();
      },
      clearSelectionIfContains: (obj) => {
        if (this.selectedObjects.includes(obj)) this.select(null);
      },
      isNonSelectableInHierarchy: (obj) => isNonSelectableInHierarchy(obj),
      isVisibleInHierarchy: (obj) => isVisibleInHierarchy(obj),
      syncHelperVisibilityForSubtree: (root) => this.editorHelperManager.syncHelperVisibilityForSubtree(root)
    });

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

    this.renderPipeline = new RenderPipelineService({
      getCanvas: () => this.canvas,
      getRenderer: () => this.renderer,
      getSceneSettings: () => this.sceneSettings,
      getOrbit: () => this.orbit,
      maybeLogDirtyStats: () => this.maybeLogDirtyStats(),
      isPerFrameRendererSyncEnabled: () => this.isPerFrameRendererSyncEnabled(),
      applyRendererSettingsPerFrame: () => this.rendererController.applyRendererSettings(this.renderer, this.sceneSettings.renderer),
      getShadowDirty: () => this.shadowDirty,
      setShadowDirty: (next) => {
        this.shadowDirty = next;
      },
      syncShadowCastingLights: () => this.syncShadowCastingLights(),
      syncHelpersPerFrame: () => {
        this.helperController.syncHelpers({ selected: this.selected, transformMode: this.transformMode });
      },
      syncCameraAndLightHelpersPerFrame: () => this.editorHelperManager.syncPerFrame(this.selected),
      updateConduitEndpointsPerFrame: () => {
        this.conduitEditController?.update();
      },
      updateSelectionBoxHelperPerFrame: () => this.updateSelectionBoxHelper(),
      renderEffects: () => this.effectsController.render(this.renderer)
    });

    // 构造内不能 await，于是 fire-and-forget：刷新环境贴图/雾等（force=true 跳过 diff 短路）
    void this.applySceneSettings(this.sceneSettings, this.sceneSettings, ++this.sceneSettingsApplyingSeq, true);
  }

  on = this.events.on.bind(this.events);

  /** 返回当前撤销栈展示用的历史记录列表（浅拷贝视图，具体语义见 `HistoryManager`）。 */
  getHistoryRecords(): EditorHistoryRecord[] {
    return this.history.getRecords();
  }

  /** 是否还能撤销一步。 */
  canUndo() {
    return this.history.canUndo();
  }

  /** 是否还能重做一步。 */
  canRedo() {
    return this.history.canRedo();
  }

  /**
   * 执行一条自定义历史操作（`do` / `undo`），并触发 `historyChange` 事件。
   * 供内部与扩展能力复用；一般 UI 应优先走 `undo`/`redo`/`setSceneSettings` 等封装方法。
   */
  async executeHistoryOperation(operation: EditorHistoryOperation) {
    await executeWithHistoryNotify(this.history, operation, () => this.emitHistoryChange());
  }

  /** 撤销一步：同步场景树并请求一帧渲染。 */
  async undo() {
    const ok = await this.history.undo();
    if (!ok) return false;
    this.emitHistoryChange();
    this.syncSceneTreeState();
    this.render();
    return true;
  }

  /** 重做一步：同步场景树并请求一帧渲染。 */
  async redo() {
    const ok = await this.history.redo();
    if (!ok) return false;
    this.emitHistoryChange();
    this.syncSceneTreeState();
    this.render();
    return true;
  }

  /** 剪贴板中是否有可粘贴对象（由最近一次 `copySelected` 写入）。 */
  canPaste() {
    return Boolean(this.clipboardObject);
  }

  /**
   * 将当前多选克隆到内存剪贴板：单选深拷贝节点；多选则包进临时 `Group` 便于整批粘贴。
   * @returns 是否成功写入剪贴板
   */
  copySelected() {
    if (this.selectedObjects.length === 0) return false;
    const targets = this.selectedObjects.filter((obj) => !isNonSelectableInHierarchy(obj));
    if (targets.length === 0) return false;
    if (targets.length === 1) {
      this.clipboardObject = targets[0].clone(true);
      return true;
    }
    const group = new THREE.Group();
    group.name = 'ClipboardGroup';
    for (const obj of targets) {
      const clone = obj.clone(true);
      clone.updateMatrixWorld(true);
      group.attach(clone);
    }
    this.clipboardObject = group;
    return true;
  }

  /**
   * 从剪贴板克隆并挂到场景，生成一条可撤销的「粘贴」历史。
   * @returns 是否执行了粘贴（剪贴板为空则 false）
   */
  async pasteFromClipboard() {
    if (!this.clipboardObject) return false;
    const pasted = this.clipboardObject.clone(true);
    await this.executeHistoryOperation({
      name: encodeHistoryI18nName({
        'zh-CN': `粘贴节点 - ${pasted.uuid}`,
        'en-US': `Paste node - ${pasted.uuid}`
      }),
      do: () => {
        this.add(pasted, { recordHistory: false });
        this.select(pasted);
      },
      undo: () => {
        this.detachObjectFromParent(pasted);
        this.select(null);
        this.syncSceneTreeState();
        this.render();
      }
    });
    return true;
  }

  /**
   * 删除当前多选（按子节点顺序从后往前摘离，便于撤销时按原 index 插回）。
   * @returns 是否有节点被删除
   */
  async deleteSelected() {
    const targets = this.selectedObjects.filter((target) => target.parent && !isNonSelectableInHierarchy(target));
    if (targets.length === 0) return false;
    const snapshot = targets
      .map((node) => ({ node, parent: node.parent, index: node.parent ? node.parent.children.indexOf(node) : -1 }))
      .filter((item) => Boolean(item.parent) && item.index >= 0)
      .sort((a, b) => b.index - a.index);
    if (snapshot.length === 0) return false;

    await this.executeHistoryOperation({
      name: encodeHistoryI18nName(
        snapshot.length === 1
          ? {
              'zh-CN': `删除节点 - ${snapshot[0].node.uuid}`,
              'en-US': `Delete node - ${snapshot[0].node.uuid}`
            }
          : {
              'zh-CN': `删除节点（${snapshot.length}个）`,
              'en-US': `Delete nodes (${snapshot.length})`
            }
      ),
      do: () => {
        for (const item of snapshot) this.detachObjectFromParent(item.node);
        this.select(null);
        this.syncSceneTreeState();
        this.render();
      },
      undo: () => {
        const restore = [...snapshot].sort((a, b) => a.index - b.index);
        for (const item of restore) {
          if (!item.parent || item.index < 0) continue;
          this.insertChildAt(item.parent, item.node, item.index);
        }
        this.syncSceneTreeState();
        this.render();
      }
    });
    return true;
  }

  /** 当前是否至少有两个可选中节点在同一父级下，满足「组合」前置条件。 */
  canGroupSelected() {
    return this.selectedObjects.filter((obj) => obj.parent && !isNonSelectableInHierarchy(obj)).length >= 2;
  }

  /** 当前主选是否为非空 `Group`，可进行「取消组合」。 */
  canUngroupSelected() {
    return Boolean(this.selected && this.selected.type === 'Group' && this.selected.parent && this.selected.children.length > 0);
  }

  /**
   * 将多选打成一个新 `Group`：以选中物体世界坐标质心为组原点，再 `attach` 各子节点。
   * 含边界情况：已选满某 Group 的全部可编辑子节点时不再嵌套；组内部分组合且只剩一个可编辑子时会自动拆壳。
   */
  async groupSelected() {
    const targets = this.selectedObjects.filter((obj) => obj.parent && !isNonSelectableInHierarchy(obj));
    if (targets.length < 2) return false;
    const unique = Array.from(new Set(targets));
    const snapshot = unique
      .map((node) => ({ node, parent: node.parent, index: node.parent ? node.parent.children.indexOf(node) : -1 }))
      .filter((item) => Boolean(item.parent) && item.index >= 0);
    if (snapshot.length < 2) return false;

    // 重复组合防御：若选中对象本身已构成同一个 Group 的“完整子集”，则不再创建嵌套 Group。
    // 例：Group(G) 下只有 A/B/C 三个可编辑节点，用户 Shift 多选 A/B/C 再点“组合”。
    const sameParent = snapshot.every((x) => x.parent === snapshot[0].parent);
    const parent = sameParent ? snapshot[0].parent : null;
    if (parent && parent.type === 'Group') {
      const groupChildren = parent.children.filter((child) => !isNonSelectableInHierarchy(child));
      const selectedSet = new Set(snapshot.map((x) => x.node));
      const isFullGroupSelection =
        groupChildren.length === snapshot.length && groupChildren.every((child) => selectedSet.has(child));
      if (isFullGroupSelection) {
        this.select(parent);
        this.syncSceneTreeState();
        this.render();
        return true;
      }
    }

    // 组内“部分组合”收敛：若本次组合发生在同一个 Group 内，
    // 且组合后该 Group 只剩 1 个可编辑节点，则自动解散该 Group（提升剩余节点，避免出现 group > node3 空壳层级）。
    const cleanupCandidate =
      parent && parent.type === 'Group' && parent.parent
        ? ({
            group: parent as THREE.Group,
            parent: parent.parent,
            index: parent.parent.children.indexOf(parent),
            performed: false,
            onlyChildUuid: null as string | null
          } as const)
        : null;

    this.scene.updateMatrixWorld(true);
    const center = new THREE.Vector3();
    for (const item of snapshot) {
      const w = new THREE.Vector3();
      item.node.getWorldPosition(w);
      center.add(w);
    }
    center.multiplyScalar(1 / snapshot.length);

    const group = new THREE.Group();
    group.name = `Group ${snapshot.length}`;
    group.position.copy(center);
    group.updateMatrixWorld(true);

    await this.executeHistoryOperation({
      name: encodeHistoryPayload(VIZON_HISTORY_KEYS.OP_PREFIX, {
        op: 'group',
        count: snapshot.length,
        uuids: snapshot.map((x) => x.node.uuid)
      }),
      do: () => {
        this.scene.add(group);
        group.updateMatrixWorld(true);
        for (const item of snapshot) {
          group.attach(item.node);
        }

        if (cleanupCandidate && cleanupCandidate.index >= 0) {
          const remaining = cleanupCandidate.group.children.filter((child) => !isNonSelectableInHierarchy(child));
          if (remaining.length === 1) {
            const [onlyChild] = remaining;
            (cleanupCandidate as any).performed = true;
            (cleanupCandidate as any).onlyChildUuid = onlyChild.uuid;
            // 提升剩余节点到 group 的父级，并把 group 本体删除。
            this.scene.updateMatrixWorld(true);
            cleanupCandidate.parent.updateMatrixWorld(true);
            cleanupCandidate.parent.attach(onlyChild);
            this.insertChildAt(cleanupCandidate.parent, onlyChild, cleanupCandidate.index);
            this.detachObjectFromParent(cleanupCandidate.group);
          }
        }

        this.select(group);
        this.syncSceneTreeState();
        this.render();
      },
      undo: () => {
        const parent = group.parent;
        if (!parent) return;
        for (const item of snapshot) {
          parent.attach(item.node);
        }
        for (const item of snapshot) {
          if (!item.parent || item.index < 0) continue;
          this.insertChildAt(item.parent, item.node, item.index);
        }

        if (cleanupCandidate && cleanupCandidate.index >= 0 && (cleanupCandidate as any).performed) {
          // 若 do() 阶段解散了旧 group，这里把它与剩余节点恢复回去。
          const restoredGroup = cleanupCandidate.group;
          const restoredParent = cleanupCandidate.parent;
          // 只在旧 group 当前未挂到父级时恢复（避免重复插入）。
          if (restoredGroup.parent !== restoredParent) {
            this.insertChildAt(restoredParent, restoredGroup, cleanupCandidate.index);
          }
          // 把被提升的“唯一剩余节点”重新挂回 group（此时它应该在 restoredParent 下）。
          const onlyChildUuid = (cleanupCandidate as any).onlyChildUuid as string | null;
          const expected = onlyChildUuid ? restoredParent.getObjectByProperty('uuid', onlyChildUuid) : null;
          if (expected) {
            restoredGroup.attach(expected);
          }
        }

        this.detachObjectFromParent(group);
        this.select(snapshot[0]?.node ?? null);
        this.syncSceneTreeState();
        this.render();
      }
    });
    return true;
  }

  /**
   * 取消组合：把当前选中 `Group` 的子节点按顺序提升到父级，并移除空组。
   * 撤销时会恢复组与子层级关系。
   */
  async ungroupSelected() {
    const group = this.selected && this.selected.type === 'Group' && this.selected.parent && this.selected.children.length > 0 ? this.selected : null;
    if (!group) return false;
    const snapshot = [
      {
        group,
        parent: group.parent!,
        index: group.parent!.children.indexOf(group),
        children: [...group.children]
      }
    ];

    await this.executeHistoryOperation({
      name: encodeHistoryPayload(VIZON_HISTORY_KEYS.OP_PREFIX, {
        op: 'ungroup',
        count: snapshot[0].children.length,
        groupUuid: group.uuid,
        uuids: snapshot[0].children.map((x) => x.uuid)
      }),
      do: () => {
        for (const item of snapshot) {
          let insertOffset = 0;
          for (const child of item.children) {
            item.parent.attach(child);
            this.insertChildAt(item.parent, child, item.index + insertOffset);
            insertOffset += 1;
          }
          this.detachObjectFromParent(item.group);
        }
        this.select(snapshot[0]?.children[0] ?? null);
        this.syncSceneTreeState();
        this.render();
      },
      undo: () => {
        for (const item of snapshot) {
          this.insertChildAt(item.parent, item.group, item.index);
          for (const child of item.children) {
            item.group.attach(child);
          }
        }
        this.select(snapshot[0]?.group ?? null);
        this.syncSceneTreeState();
        this.render();
      }
    });
    return true;
  }

  /**
   * 清空场景中所有用户可编辑根节点（网格、gizmo 等不可选子树会被 `isNonSelectableInHierarchy` 排除）。
   * 用于「清空画布」类操作，可整批撤销。
   */
  async clearSceneNodes() {
    const roots = this.scene.children.filter((child) => !isNonSelectableInHierarchy(child));
    if (roots.length === 0) return false;
    const snapshot = roots.map((node) => ({ node, parent: node.parent, index: node.parent ? node.parent.children.indexOf(node) : -1 }));
    await this.executeHistoryOperation({
      name: encodeHistoryI18nName({
        'zh-CN': '清空场景节点',
        'en-US': 'Clear scene nodes'
      }),
      do: () => {
        for (const item of snapshot) this.detachObjectFromParent(item.node);
        this.select(null);
        this.syncSceneTreeState();
        this.render();
      },
      undo: () => {
        for (const item of snapshot) {
          if (!item.parent || item.index < 0) continue;
          this.insertChildAt(item.parent, item.node, item.index);
        }
        this.syncSceneTreeState();
        this.render();
      }
    });
    return true;
  }

  /**
   * 重置工作区：移除所有用户节点并把 `SceneSettings` 恢复为默认工厂值（相机/雾/网格等一并重置）。
   * 与 `clearSceneNodes` 不同之处在于同时还原全局场景配置。
   */
  async resetWorkspace() {
    const roots = this.scene.children.filter((child) => !isNonSelectableInHierarchy(child));
    const snapshot = roots.map((node) => ({ node, parent: node.parent, index: node.parent ? node.parent.children.indexOf(node) : -1 }));
    const prevSettings = this.getSceneSettings();
    const nextSettings = createDefaultSceneSettings();

    await this.executeHistoryOperation({
      name: encodeHistoryI18nName({
        'zh-CN': '重置画布',
        'en-US': 'Reset workspace'
      }),
      do: async () => {
        for (const item of snapshot) this.detachObjectFromParent(item.node);
        this.select(null);
        await this.setSceneSettings(nextSettings, { recordHistory: false });
        this.syncSceneTreeState();
        this.render();
      },
      undo: async () => {
        for (const item of snapshot) {
          if (!item.parent || item.index < 0) continue;
          this.insertChildAt(item.parent, item.node, item.index);
        }
        await this.setSceneSettings(prevSettings, { recordHistory: false });
        this.syncSceneTreeState();
        this.render();
      }
    });
    return true;
  }

  /**
   * 按「点路径」写入场景中某对象的嵌套属性（如 `position.x`、`intensity`），并可选记入历史。
   * - `recordHistory: false`：进入「预览」模式，多次写入合并到同一条 pending，直到带 `recordHistory: true` 的提交；
   * - 默认 `true`：立即生成可撤销条目（支持 `mergeKey` 防抖合并，见 `HistoryManager`）。
   */
  async setObjectPropertyByUuid(
    uuid: string,
    path: string,
    nextValue: unknown,
    options?: { operationName?: string; recordHistory?: boolean }
  ): Promise<boolean> {
    const obj = this.scene.getObjectByProperty('uuid', uuid);
    if (!obj) return false;
    const before = this.readNestedValue(obj, path);
    const after = cloneForHistory(nextValue);

    return runObjectPropertyHistoryStep({
      pending: this.pendingObjectPropHistoryBefore,
      uuid,
      path,
      options,
      before,
      after,
      cloneForHistory,
      isHistoryValueEqual,
      buildDefaultOperationName: () =>
        encodeHistoryPayload(VIZON_HISTORY_KEYS.OP_PREFIX, {
          op: 'update_property',
          targetKind: getObjectHistoryTargetKind(obj),
          uuid,
          prop: path.split('.').filter(Boolean).slice(-1)[0] ?? path,
          valueText: formatHistoryValue(after) || undefined
        }),
      writeValue: (value) => this.writeNestedValue(obj, path, value),
      executeHistoryOperation: (op) => this.executeHistoryOperation(op)
    });
  }

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

  /**
   * 获取当前可持久化文档快照（VizonDocument）。
   * 适合导出/导入链路与开发期控制台调试。
   */
  getVizonDocument(options?: { generator?: string }): VizonDocument {
    return buildVizonDocumentFromEditor(this, options);
  }

  /**
   * 重新绑定指定子树内的相机/灯光 helper。
   * 用途：导入 JSON 后（尤其是跨版本/外部生成的 JSON），可能出现 helper 在 userData 中被延后补齐，
   * 此时需要显式触发一次 bind 才能把 helper 挂回 scene 并进入同步链路。
   */
  rebindRuntimeHelpersForSubtree(root: THREE.Object3D) {
    this.editorHelperManager.bindHelpersForSubtree(root);
    this.editorHelperManager.syncHelperVisibilityForSubtree(root);
    this.render();
  }

  /** 当前 WebGLRenderer 相关序列化配置的快照（抗锯齿、色调映射、阴影贴图类型等）。 */
  getRendererSettings(): RendererSettings {
    return { ...this.sceneSettings.renderer };
  }

  /**
   * 获取用于 UI 展示的场景树（相机 + scene 层级）。
   */
  getSceneTree(): SceneTreeNode[] {
    return this.sceneGraph.getSceneTree();
  }

  /**
   * 替换 renderer 相关设置（仅处理 renderer 侧能即时生效的部分，
   * 如 antialias 变化会触发 renderer 重建）。
   */
  setRendererSettings(next: RendererSettings, options?: { recordHistory?: boolean; operationName?: string }) {
    if (options?.recordHistory === false) {
      seedSingleSlotBaselineIfEmpty(this.pendingRendererHistoryBefore, { ...this.sceneSettings.renderer });
    }
    if (
      runRendererSettingsHistoryCommit({
        pending: this.pendingRendererHistoryBefore,
        next,
        options,
        getLiveRendererSettings: () => ({ ...this.sceneSettings.renderer }),
        isEqual: (a, b) => this.isRendererSettingsEqual(a, b),
        buildDefaultOperationName: () =>
          encodeHistoryI18nName({
            'zh-CN': '修改渲染器设置',
            'en-US': 'Modify renderer settings'
          }),
        applyWithoutHistory: (settings) => this.setRendererSettings(settings, { recordHistory: false }),
        executeHistoryOperation: (op) => this.executeHistoryOperation(op)
      })
    ) {
      return;
    }
    const prevRenderer = this.sceneSettings.renderer;
    // 将 renderer 配置纳入版本化结构，保证导出/导入/一致性
    const nextScene = normalizeSceneSettings({
      ...this.sceneSettings,
      renderer: next
    } as SceneSettings);
    const rendererChanged = calcSceneSettingsDiff(nextScene, this.sceneSettings).rendererChanged;
    if (rendererChanged) this.markDirty({ renderer: true, shadow: true });
    this.sceneSettings = nextScene;
    this.applyRendererSettings(nextScene.renderer, prevRenderer);
    this.emitSceneSettingsChange();
  }

  /**
   * 将 `RendererSettings` 应用到运行中的 `WebGLRenderer`：
   * `antialias` 变更会整实例重建并重新绑定 Orbit/Transform/特效与管道编辑控制器。
   */
  private applyRendererSettings(nextRenderer: RendererSettings, prevRenderer: RendererSettings) {
    this.markDirty({ renderer: true, shadow: true });
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
      this.effectsController.bindRenderer(this.renderer);
      this.conduitEditController = new ConduitEditController({ scene: this.scene, camera: this.camera, orbit: this.orbit });
      this.conduitEditController.setDomElement(this.renderer.domElement);
      this.bindTransformDragHooks();
      this.viewPresetController.setOrbit(this.orbit);
      // 重建 renderer 后需要重新同步尺寸/DPR，避免 antialias 切换后仍使用旧像素比。
      const w = this.canvas.clientWidth ?? 1;
      const h = this.canvas.clientHeight ?? 1;
      this.resize(Math.max(1, w), Math.max(1, h));
    }

    this.rendererController.applyRendererSettings(this.renderer, nextRenderer);
    if (nextRenderer.shadowMapEnabled !== prevRenderer.shadowMapEnabled) {
      this.invalidateSceneMaterials();
      this.applyShadowFrustumVisibilityForAllLights();
    }
    this.editorHelperManager.markLightHelpersDirty();
    this.requestShadowMapUpdate({ force: true });
  }

  /** 把 `SceneSettings.camera` 中的位置、目标点、FOV 等同步到视口相机与 OrbitControls。 */
  private applyCameraSettings(nextCamera: SceneSettings['camera']) {
    const width = Math.max(1, this.canvas.clientWidth || 1);
    const height = Math.max(1, this.canvas.clientHeight || 1);
    this.cameraController.applyCameraSettings(this.camera, this.orbit, nextCamera, width / height);
  }

  /**
   * 替换 scene settings 并把变更应用到 THREE.Scene。
   * 注意：HDRI 贴图属于异步加载项，该方法在应用完成后才 resolve。
   */
  async setSceneSettings(
    next: SceneSettings,
    options?: { recordHistory?: boolean; operationName?: string; forceApply?: boolean }
  ): Promise<void> {
    if (options?.recordHistory === false) {
      seedSingleSlotBaselineIfEmpty(this.pendingSceneHistoryBefore, this.getSceneSettings());
    }
    if (
      await runSceneSettingsHistoryCommit({
        pending: this.pendingSceneHistoryBefore,
        next,
        options,
        normalizeSceneSettings: normalizeSceneSettings,
        getLiveSceneSettings: () => this.getSceneSettings(),
        isEqualForHistory: (a, b) => this.isSceneSettingsEqualForHistory(a, b),
        buildDefaultOperationName: () =>
          encodeHistoryI18nName({
            'zh-CN': '修改场景设置',
            'en-US': 'Modify scene settings'
          }),
        applyWithoutHistory: (settings) => this.setSceneSettings(settings, { recordHistory: false }),
        executeHistoryOperation: (op) => this.executeHistoryOperation(op)
      })
    ) {
      return;
    }
    const normalized = normalizeSceneSettings(next);
    const prev = this.sceneSettings;
    const diff = calcSceneSettingsDiff(normalized, prev);
    const mapped = mapSceneDiffToDirtyFlags(diff);
    this.markDirty({
      renderer: mapped.rendererDirty,
      shadow: mapped.shadowDirty,
      scene: mapped.sceneDirty
    });
    this.sceneSettings = normalized;
    const seq = ++this.sceneSettingsApplyingSeq;
    await this.applySceneSettings(normalized, prev, seq, options?.forceApply === true);
    this.emitSceneSettingsChange();
  }

  /**
   * 启动 RAF 渲染循环。重复调用是安全的（幂等）。
   */
  start() {
    this.renderPipeline.start();
  }

  /**
   * 停止 RAF 渲染循环。
   */
  stop() {
    this.renderPipeline.stop();
  }

  /**
   * 单帧渲染。上层也可以自己驱动（例如与自定义时间轴/后处理集成）。
   */
  render(_dt?: number) {
    this.renderPipeline.render(_dt);
  }

  /**
   * 截图并返回 PNG 数据 URL。
   * - 仅渲染 layer 0（场景内容），排除 layer 1 编辑器辅助层（网格、坐标轴、Helper 等）
   * - 隐藏 transform gizmo，避免 gizmo 出现在截图中
   * - 经过 EffectComposer 渲染路径，包含用户设置的辉光/描边等后期效果
   */
  takeScreenshot(): string {
    const layersMask = this.camera.layers.mask;
    const transformVisible = this.transform.visible;
    // 只渲染 layer 0（场景对象），跳过编辑器辅助层
    this.camera.layers.set(0);
    this.transform.visible = false;
    // 经 EffectComposer 全效果渲染
    this.effectsController.render(this.renderer);
    const dataUrl = this.canvas.toDataURL('image/png');
    // 恢复
    this.camera.layers.mask = layersMask;
    this.transform.visible = transformVisible;
    return dataUrl;
  }

  /**
   * 阴影开启时每帧遍历场景内 `castShadow` 灯光，强制更新 shadow camera 与矩阵，
   * 避免编辑态下视锥/投影与物体不同步导致的阴影撕裂或消失。
   */
  private syncShadowCastingLights() {
    this.scene.traverse((obj: any) => {
      if (!obj?.isLight || !obj.castShadow) return;
      obj.updateMatrixWorld?.(true);
      obj.target?.updateMatrixWorld?.(true);
      obj.shadow?.camera?.updateProjectionMatrix?.();
      obj.shadow?.camera?.updateMatrixWorld?.(true);
      obj.shadow?.updateMatrices?.(obj);
    });
  }

  /**
   * 外部容器尺寸变化时调用。
   * 注意：这里的 width/height 是 CSS 像素，renderer 内部会乘以 DPR。
   */
  resize(width: number, height: number, pixelRatio?: number) {
    // 构造期 `renderPipeline` 可能尚未初始化：此时直接用旧逻辑兜底，避免启动崩溃。
    if ((this as any).renderPipeline) {
      this.renderPipeline.resize(width, height, pixelRatio);
    } else {
      const dpr = pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
    }
    const dpr = pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    this.effectsController.resize(width, height, dpr);
    const aspect = Math.max(1e-6, width) / Math.max(1e-6, height);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** 多选时的「主选」：等于 `getSelectedObjects()` 的最后一项；无选中时为 `null`。 */
  getSelected() {
    // 当前选中的对象（可能为 null，表示没有可编辑对象）
    return this.selected;
  }

  /** 当前多选列表的浅拷贝（顺序与最后一次点击 / toggle 结果一致）。 */
  getSelectedObjects() {
    return [...this.selectedObjects];
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
   * 将相机平滑过渡到目标（position / orbit.target / FOV / near / far）。
   * 与 `setViewPreset` 共用 RAF 动画槽位；`immediate` 或 `durationMs: 0` 时立即落点。
   */
  animateCameraTo(nextCamera: SceneSettings['camera'], opts?: ViewTransitionOptions): Promise<void> {
    const normalized = normalizeSceneSettings({
      ...this.sceneSettings,
      camera: nextCamera
    }).camera;

    const durationMs = Math.max(0, opts?.durationMs ?? 420);
    if (opts?.immediate || durationMs === 0) {
      this.viewPresetController.cancel();
      this.sceneSettings = normalizeSceneSettings({
        ...this.sceneSettings,
        camera: normalized
      });
      this.applyCameraSettings(this.sceneSettings.camera);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.viewPresetController.animateCameraTo(normalized, {
        durationMs,
        easing: opts?.easing,
        onComplete: () => {
          this.sceneSettings = normalizeSceneSettings({
            ...this.sceneSettings,
            camera: normalized
          });
          this.applyCameraSettings(this.sceneSettings.camera);
          resolve();
        }
      });
    });
  }

  /**
   * 目标是否可以作为 TransformControls 的附着对象：
   * 必须位于 `scene` 子树下，且不能是视口主相机（主相机不在场景图内）。
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

  /**
   * 更新选中状态并广播 `select` 事件；同时维护 Gizmo 挂载、多选冻结、灯光/相机 helper 脏标记与阴影刷新。
   * @param options.toggle `true` 时在集合中切换该对象（典型：Shift+点选），并打开多选描边高亮；`false` 时单选或清空。
   */
  select(object: THREE.Object3D | null, options?: { toggle?: boolean; targetHandle?: THREE.Object3D | null }) {
    const safe = object && !isNonSelectableInHierarchy(object) ? object : null;
    const prev = this.selected;
    const prevObjects = this.selectedObjects;
    // 非 Shift 单选模式下的点击：应清掉“临时高亮”（包括点空白清空）。
    if (!options?.toggle) {
      this.effectsController.setSelectionHighlightEnabled(false);
    } else {
      // Shift(toggle) 选中行为：确保临时 bloom 高亮开启（不依赖 keydown 是否先触发）。
      this.effectsController.setSelectionHighlightEnabled(true);
    }
    const nextObjects = computeNextSelectedObjects(prevObjects, safe, { toggle: options?.toggle });
    const nextPrimary = computeNextPrimary(nextObjects);
    const transformTarget = computeTransformAttachTarget(nextPrimary, nextObjects, options);

    const dirty = this.selectionOrchestrator.apply({
      freezeStaticObjects: this.freezeStaticObjects,
      prevObjects,
      nextObjects,
      prevPrimary: prev,
      nextPrimary,
      transformTarget,
      transformToolEnabled: this.transformToolEnabled,
      transformHandleVisible: this.transformHandleVisible,
      canAttachTransformTarget: (o) => this.canAttachTransformTarget(o),
      assignSelectionState: () => {
        this.selectedObjects = [...nextObjects];
        this.selected = nextPrimary;
      },
      onEmitSelect: (payload) => {
        this.events.emit('select', payload);
      }
    });
    if (dirty.cameraHelpersDirty) this.editorHelperManager.markCameraHelpersDirty();
    if (dirty.lightHelpersDirty) this.editorHelperManager.markLightHelpersDirty();
  }

  /**
   * 设置 gizmo 模式：translate/rotate/scale。
   */
  setTransformMode(mode: TransformMode) {
    this.transformMode = mode;
    this.transform.setMode(mode);
    this.editorHelperManager.markLightHelpersDirty();
  }

  /**
   * 控制 transform 工具是否启用：
   * - 禁用时不允许拾取写回 select
   * - gizmo 不应可交互（detach + enabled/visible 置空）
   */
  setTransformToolEnabled(enabled: boolean) {
    this.transformToolEnabled = enabled;

    // 关闭时确保 gizmo 不再接管交互
    if (enabled && this.transformHandleVisible && this.selectedObjects.length === 1 && this.canAttachTransformTarget(this.selected)) {
      if (this.freezeStaticObjects && this.selected) {
        this.staticObjectFreezeController.unfreezeAncestors(this.selected, this.scene);
      }
      this.transform.attach(this.selected);
      this.transform.visible = true;
    } else {
      this.transform.detach();
      this.transform.visible = false;
    }

    this.interactionController.setToolEnabled(enabled);
  }

  /**
   * 仅控制 transform gizmo 的可见/可挂载状态，不影响拾取链路。
   * 用于 Shift 临时多选模式（隐藏 helper，但仍可点击多选对象）。
   */
  setTransformHandleVisible(visible: boolean) {
    this.transformHandleVisible = visible;
    if (this.transformToolEnabled && this.transformHandleVisible && this.selectedObjects.length === 1 && this.canAttachTransformTarget(this.selected)) {
      if (this.freezeStaticObjects && this.selected) {
        this.staticObjectFreezeController.unfreezeAncestors(this.selected, this.scene);
      }
      this.transform.attach(this.selected);
      this.transform.visible = true;
      return;
    }
    this.transform.detach();
    this.transform.visible = false;
  }

  /**
   * 配置变换吸附：传入具体数值启用，传 null 禁用。
   * - translateSnap：平移步长（世界单位）
   * - rotationSnap：旋转步长（弧度）
   * - scaleSnap：缩放步长（无量纲倍率）
   */
  setSnapSettings(settings: { translateSnap: number | null; rotationSnap: number | null; scaleSnap: number | null }): void {
    // three-stdlib 类型定义的 setter 只接受 number，但底层实现以 null 判断是否启用吸附；用类型转换传 null 来禁用。
    this.transform.setTranslationSnap(settings.translateSnap as number);
    this.transform.setRotationSnap(settings.rotationSnap as number);
    this.transform.setScaleSnap(settings.scaleSnap as number);
  }

  /**
   * 重置 Shift 多选遗留状态并恢复变换把手可见性。
   * 典型场景：导入 JSON 时系统文件框可能导致 Shift keyup 丢失，拾取始终以 toggle 写入，Gizmo 因 select 内 `!options.toggle` 而不显示。
   */
  resetShiftMultiselectState() {
    this.interactionController.resetShiftMultiselectModifier();
    this.setTransformHandleVisible(true);
    this.events.emit('shiftMultiselectUiReset', {});
  }

  /**
   * 向场景根添加对象；默认包一层可撤销历史。会处理平行光/聚光灯的 `target`、相机与灯光 helper 的挂接，以及静态冻结子树。
   */
  add(
    object: THREE.Object3D,
    options?: { recordHistory?: boolean; operationName?: string; freezeSubtreeAfterAdd?: boolean }
  ) {
    if (options?.recordHistory ?? true) {
      const parent = object.parent;
      const { recordHistory: _recordHistoryIgnored, ...addRest } = options ?? {};
      void this.executeHistoryOperation({
        name:
          options?.operationName ??
          encodeHistoryI18nName({
            'zh-CN': `添加物体 - ${object.uuid}`,
            'en-US': `Add object - ${object.uuid}`
          }),
        do: () => this.add(object, { ...addRest, recordHistory: false }),
        undo: () => {
          if (!object.parent) return;
          object.parent.remove(object);
          if (this.selectedObjects.includes(object)) this.select(null);
          this.syncSceneTreeState();
          this.render();
        },
        redo: () => this.add(object, { ...addRest, recordHistory: false })
      });
      // 若对象之前挂在其他父节点，执行 add 时会自动 re-parent；这里保持现有行为
      if (parent && parent !== this.scene) {
        // no-op，仅保留变量以表明语义
      }
      return;
    }
    // 把外部创建的对象挂载到 three.Scene（不做额外校验）。
    this.scene.add(object);
    if (((object as any).isDirectionalLight || (object as any).isSpotLight) && (object as any).target) {
      const lightTarget = (object as any).target as THREE.Object3D;
      if (!lightTarget.parent) this.scene.add(lightTarget);
      lightTarget.updateMatrixWorld(true);
      object.updateMatrixWorld?.(true);
    }
    // helper 绑定属于 ThreeEditor 的“端到端交互链路副作用”：
    // - SceneGraphService 只做结构变更与 sceneTree 同步；
    // - ThreeEditor 维护 camera/light helper 的映射与 dirty 标记，并承担 helper 的可见性/阴影锥联动逻辑。
    this.editorHelperManager.bindHelpersForSubtree(object);
    // 文档导入等批量挂载场景：默认冻结父链会导致子节点选中后 Transform 矩阵不同步；导入路径传 freezeSubtreeAfterAdd:false
    const shouldFreezeSubtree = this.freezeStaticObjects && (options?.freezeSubtreeAfterAdd ?? true);
    if (shouldFreezeSubtree) {
      this.staticObjectFreezeController.freezeObjectTree(object);
    }
    // 新增/重挂对象后，阴影投射关系可能变化，触发下一帧阴影重建。
    this.requestShadowMapUpdate();
    this.syncSceneTreeState();
  }

  /**
   * 按 uuid 切换物体 `visible`；若隐藏导致当前选中链不可见则清空选择。支持历史合并（同 uuid 短时间多次切换）。
   */
  setObjectVisibleByUuid(
    uuid: string,
    visible: boolean,
    options?: { recordHistory?: boolean; operationName?: string }
  ): boolean {
    if (options?.recordHistory ?? true) {
      const currentObj = this.scene.getObjectByProperty('uuid', uuid);
      const prevVisible = Boolean(currentObj?.visible);
      if (!currentObj || isNonSelectableInHierarchy(currentObj)) return false;
      if (prevVisible === visible) return true;
      const objectName = this.getObjectDisplayName(currentObj);
      void this.executeHistoryOperation({
        name:
          options?.operationName ??
          encodeHistoryI18nName({
            'zh-CN': `${visible ? '显示物体' : '隐藏物体'}-${objectName}`,
            'en-US': `${visible ? 'Show object' : 'Hide object'} - ${objectName}`
          }),
        mergeKey: `object-visible:${uuid}`,
        mergeWindowMs: 280,
        do: () => {
          this.setObjectVisibleByUuid(uuid, visible, { recordHistory: false });
        },
        undo: () => {
          this.setObjectVisibleByUuid(uuid, prevVisible, { recordHistory: false });
        }
      });
      return true;
    }
    const obj = this.scene.getObjectByProperty('uuid', uuid);
    if (!obj || isNonSelectableInHierarchy(obj)) return false;
    obj.visible = visible;
    this.editorHelperManager.syncHelperVisibilityForSubtree(obj);
    if (!visible && this.selectedObjects.some((selected) => !isVisibleInHierarchy(selected))) {
      this.select(null);
    }
    this.requestShadowMapUpdate();
    this.syncSceneTreeState();
    return true;
  }

  /**
   * 从父节点移除对象（不记历史，适合已由外层包装撤销的调用）。
   * 同步移除关联的 CameraHelper / LightHelper 映射。
   */
  removeObjectByUuid(uuid: string): boolean {
    const obj = this.scene.getObjectByProperty('uuid', uuid);
    if (!obj || !obj.parent || isNonSelectableInHierarchy(obj)) return false;
    // 先做原有 helper 解绑/清理，再交由 service 执行结构移除与树同步。
    if (this.selectedObjects.includes(obj)) this.select(null);
    this.editorHelperManager.unbindHelpersForSubtree(obj);
    return this.sceneGraph.removeObjectByUuid(uuid);
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
    return this.sceneGraph.canMoveObjectByUuid(sourceUuid, targetUuid, placement);
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
    this.sceneGraph.insertChildAt(parent, child, index);
  }

  private detachObjectFromParent(child: THREE.Object3D) {
    this.sceneGraph.detachObjectFromParent(child);
  }

  private bindHelpersForSubtree(root: THREE.Object3D) {
    this.editorHelperManager.bindHelpersForSubtree(root);
  }

  private syncHelperVisibilityForSubtree(root: THREE.Object3D) {
    this.editorHelperManager.syncHelperVisibilityForSubtree(root);
  }

  private syncObjectHelperVisibility(node: THREE.Object3D) {
    this.editorHelperManager.syncHelperVisibilityForSubtree(node);
  }

  private unbindHelpersForSubtree(root: THREE.Object3D) {
    this.editorHelperManager.unbindHelpersForSubtree(root);
  }

  private bindLightTargetHandle(light: THREE.Light) {
    this.editorHelperManager.bindHelpersForSubtree(light);
  }

  private unbindLightTargetHandle(node: THREE.Object3D) {
    this.editorHelperManager.unbindHelpersForSubtree(node);
  }

  // —— Transform / Light target helpers ——
  private isLightTargetHandle(obj: THREE.Object3D) {
    return this.editorHelperManager.isLightTargetHandle(obj);
  }

  private resolveLightByTargetHandle(handle: THREE.Object3D): THREE.Light | null {
    return this.editorHelperManager.resolveLightByTargetHandle(handle);
  }

  private syncLightTargetFromHandle(handle: THREE.Object3D) {
    this.editorHelperManager.syncLightTargetFromHandle(handle);
  }

  private syncLightTargetHandleFromLight(light: THREE.Light, handle: THREE.Object3D) {
    this.editorHelperManager.syncLightTargetHandleFromLight(light, handle);
  }

  private captureLightTargetSnapshot(light: THREE.Light) {
    return this.editorHelperManager.captureLightTargetSnapshot(light);
  }

  private applyLightTargetSnapshot(snapshot: LightTargetSnapshot) {
    this.editorHelperManager.applyLightTargetSnapshot(snapshot);
    this.syncSceneTreeState();
    this.render();
  }

  private applyObjectTransformSnapshotWithEditorEffects(obj: THREE.Object3D, snapshot: ObjectTransformSnapshot) {
    applyObjectTransformSnapshot({
      object: obj,
      snapshot,
      isLightTargetHandle: (target) => this.isLightTargetHandle(target),
      syncLightTargetFromHandle: (handle) => this.syncLightTargetFromHandle(handle),
      markCameraHelpersDirty: () => this.editorHelperManager.markCameraHelpersDirty(),
      markLightHelpersDirty: () => this.editorHelperManager.markLightHelpersDirty()
    });
  }

  /**
   * 执行场景树拖拽排序或改父级（不自带历史，一般由 UI 在确认后包一层 `executeHistoryOperation`）。
   * `inside` 使用 `attach` 保持世界变换；`before`/`after` 先挂到目标父级再按 index 插入。
   */
  moveObjectByUuid(
    sourceUuid: string,
    targetUuid: string,
    placement: 'before' | 'after' | 'inside'
  ): boolean {
    // move 会导致 helper 绑定关系变化（attach/remove/insert），保持原逻辑：重绑 subtree。
    const obj = this.scene.getObjectByProperty('uuid', sourceUuid);
    if (obj) this.editorHelperManager.unbindHelpersForSubtree(obj);
    const ok = this.sceneGraph.moveObjectByUuid(sourceUuid, targetUuid, placement);
    if (ok && obj) this.editorHelperManager.bindHelpersForSubtree(obj);
    if (ok) {
      if ((obj as any)?.isCamera) this.editorHelperManager.markCameraHelpersDirty();
      if ((obj as any)?.isLight) this.editorHelperManager.markLightHelpersDirty();
    }
    return ok;
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
      if ((obj.userData as any)?.[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]) return false;
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

  /**
   * 根据 `calcSceneSettingsDiff` 结果增量应用环境/渲染器/相机/网格/辅助器；
   * `seq` 与 `getLatestSeq` 用于丢弃过期的异步 HDRI 回调。
   */
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
    this.effectsController.dispose();
    this.helperController.dispose();
    // pointer events are bound to renderer.domElement; disposing editor should abort them
    // (controller keeps its own AbortController)
    this.conduitEditController?.syncFromSelection(null);
    this.unbindTransformDragHooks();
    this.disposeSelectionBoxHelper();
    this.editorHelperManager.dispose();
    this.history.clear();
    this.disposeSceneResources();
    this.renderer.dispose();
  }

  private bootstrapScene() {
    this.helperController.mount(this.scene);
    this.syncSceneTreeState();
  }

  private invalidateSceneMaterials() {
    this.scene.traverse((obj: any) => {
      forEachMaterial(obj?.material as THREE.Material | THREE.Material[] | undefined, (mat) => {
        mat.needsUpdate = true;
      });
    });
  }

  private syncSceneTreeState() {
    this.sceneGraph.syncSceneTreeState();
  }

  // —— Transform 事件绑定与历史编排 ——
  private bindTransformDragHooks() {
    this.unbindTransformDragHooks();

    this.onTransformDraggingChanged = (e) => {
      if (!this.selected) return;
      const dragging = Boolean(e?.value);
      if (dragging) {
        this.transformDragSession = createTransformDragSession({
          scene: this.scene,
          selected: this.selected,
          selectedObjects: this.selectedObjects,
          activeTransformObject: (this.transform as any)?.object as THREE.Object3D | undefined,
          isLightTargetHandle: (obj) => this.isLightTargetHandle(obj),
          resolveLightByTargetHandle: (handle) => this.resolveLightByTargetHandle(handle),
          captureLightTargetSnapshot: (light) => this.captureLightTargetSnapshot(light)
        });
      } else if (this.transformDragSession) {
        const operations = collectTransformDragHistoryOperations({
          scene: this.scene,
          selected: this.selected,
          selectedObjects: this.selectedObjects,
          transformMode: this.transformMode,
          session: this.transformDragSession,
          captureLightTargetSnapshot: (light) => this.captureLightTargetSnapshot(light),
          applyLightTargetSnapshot: (snapshot) => this.applyLightTargetSnapshot(snapshot),
          applyObjectTransform: (target, snapshot) => this.applyObjectTransform(target, snapshot),
          applySelectionTransformSnapshots: (from, to) => this.applySelectionTransformSnapshots(from, to)
        });
        this.transformDragSession = null;
        for (const operation of operations) {
          void this.executeHistoryOperation(operation);
        }
      }
      handleTransformDraggingEffects({
        dragging,
        selected: this.selected,
        selectedObjects: this.selectedObjects,
        freezeStaticObjects: this.freezeStaticObjects,
        markCameraHelpersDirty: () => this.editorHelperManager.markCameraHelpersDirty(),
        markLightHelpersDirty: () => this.editorHelperManager.markLightHelpersDirty(),
        unfreezeObjectTree: (obj) => this.staticObjectFreezeController.unfreezeObjectTree(obj),
        freezeObjectTree: (obj) => this.staticObjectFreezeController.freezeObjectTree(obj)
      });
    };

    this.onTransformObjectChange = () => {
      handleTransformObjectChange({
        activeTransformObject: (this.transform as any)?.object as THREE.Object3D | undefined,
        selected: this.selected,
        applyMultiSelectionTransform: () => this.applyMultiSelectionTransform(),
        isLightTargetHandle: (obj) => this.isLightTargetHandle(obj),
        syncLightTargetFromHandle: (handle) => this.syncLightTargetFromHandle(handle),
        markLightHelpersDirty: () => this.editorHelperManager.markLightHelpersDirty(),
        requestShadowMapUpdate: () => this.requestShadowMapUpdate()
      });
    };

    (this.transform as any).addEventListener('dragging-changed', this.onTransformDraggingChanged);
    (this.transform as any).addEventListener('objectChange', this.onTransformObjectChange);
  }

  private unbindTransformDragHooks() {
    if (!this.onTransformDraggingChanged) return;
    (this.transform as any)?.removeEventListener?.('dragging-changed', this.onTransformDraggingChanged);
    this.onTransformDraggingChanged = null;
    if (this.onTransformObjectChange) {
      (this.transform as any)?.removeEventListener?.('objectChange', this.onTransformObjectChange);
      this.onTransformObjectChange = null;
    }
  }

  private updateSelectionBoxHelper() {
    const sel = this.selected;
    // 当对象已启用“特效边框”（OutlinePass）时，关闭旧的 BoxHelper 指示器，
    // 避免出现“对象轮廓 + 指示器框”双重边框。
    if (!sel || sel.children.length === 0 || this.hasOutlineBorderEffect(sel)) {
      this.disposeSelectionBoxHelper();
      return;
    }

    const attached = this.selectionBoxHelper;
    const needsNew = !attached || (attached as unknown as { object?: THREE.Object3D }).object !== sel;
    if (needsNew) {
      this.disposeSelectionBoxHelper();
      const box = new THREE.BoxHelper(sel, 0xff0000);
      box.name = 'VizonSelectionBoxHelper';
      (box.userData as Record<string, boolean | undefined>)[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = true;
      (box.userData as Record<string, boolean | undefined>)[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
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

  private hasOutlineBorderEffect(root: THREE.Object3D) {
    let enabled = false;
    root.traverse((obj) => {
      if (enabled) return;
      if (!(obj as any).isMesh) return;
      const borderEnabled = Boolean((obj.userData as any)?.[VIZON_STORAGE_KEYS.EFFECTS]?.borderEnabled);
      if (borderEnabled) enabled = true;
    });
    return enabled;
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

      forEachMaterial(material, (m) => {
        this.disposeMaterialTextures(m);
        m.dispose();
      });
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

  // —— Transform 快照回放与多选联动 ——
  private applyObjectTransform(obj: THREE.Object3D, snapshot: ObjectTransformSnapshot) {
    this.applyObjectTransformSnapshotWithEditorEffects(obj, snapshot);
    this.requestShadowMapUpdate();
    this.syncSceneTreeState();
    this.render();
  }

  private applySelectionTransformSnapshots(
    from: Map<string, ObjectTransformSnapshot>,
    to: Map<string, ObjectTransformSnapshot>
  ) {
    applySelectionTransformSnapshotMap({
      scene: this.scene,
      from,
      to,
      applyObjectTransformSnapshot: (obj, snapshot) => this.applyObjectTransformSnapshotWithEditorEffects(obj, snapshot)
    });
    this.requestShadowMapUpdate();
    this.syncSceneTreeState();
    this.render();
  }

  private applyMultiSelectionTransform() {
    if (!this.selected || this.selectedObjects.length <= 1) return;
    if (!this.transformDragSession) return;
    const nextTransforms = computeNextMultiSelectionTransforms({
      primary: this.selected,
      selectedObjects: this.selectedObjects,
      primaryStartWorld: this.transformDragSession.primaryStartWorld,
      startWorldMatrices: this.transformDragSession.startWorldMatrices
    });

    for (const obj of this.selectedObjects) {
      const next = nextTransforms.get(obj.uuid);
      if (!next) continue;
      this.applyObjectTransformSnapshotWithEditorEffects(obj, next);
    }
  }

  private getObjectDisplayName(obj: THREE.Object3D | null | undefined) {
    if (!obj) return '未命名对象';
    const n = String(obj.name ?? '').trim();
    if (n) return n;
    return String(obj.type ?? 'Object');
  }

  private emitHistoryChange() {
    this.events.emit('historyChange', {
      records: this.history.getRecords(),
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo()
    });
  }

  private emitSceneSettingsChange() {
    this.events.emit('sceneSettingsChange', {
      settings: this.getSceneSettings(),
      renderer: this.getRendererSettings()
    });
  }

  private readNestedValue(source: any, path: string) {
    if (!path) return source;
    return readNestedValueCloned(source, path, cloneForHistory);
  }

  private writeNestedValue(target: any, path: string, value: unknown) {
    const keys = path.split('.');
    if (keys.length === 0) return;
    let cur = target;
    for (let i = 0; i < keys.length - 1; i += 1) {
      const key = keys[i];
      if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    cur[keys[keys.length - 1]] = value;
    // 当对象树启用了静态矩阵冻结（matrixAutoUpdate=false）时，
    // 直接写 position/rotation/scale 不会自动刷新矩阵，导致需要下一次交互才“看见变化”。
    // 这里对 Object3D 做一次兜底更新，保证 Inspector 输入实时反馈。
    const maybeObj3d = target as any;
    if (maybeObj3d?.isObject3D) {
      if (this.isLightTargetHandle(maybeObj3d)) {
        this.syncLightTargetFromHandle(maybeObj3d);
      }
      if (maybeObj3d?.isLight) this.editorHelperManager.markLightHelpersDirty();
      if (maybeObj3d?.isCamera) {
        const needsProjectionUpdate =
          path === 'fov' ||
          path === 'near' ||
          path === 'far' ||
          path === 'zoom' ||
          path === 'aspect' ||
          path === 'left' ||
          path === 'right' ||
          path === 'top' ||
          path === 'bottom';
        if (needsProjectionUpdate) {
          maybeObj3d.updateProjectionMatrix?.();
          this.editorHelperManager.markCameraHelpersDirty();
        }
      }
      if (maybeObj3d?.isDirectionalLight || maybeObj3d?.isSpotLight) {
        if (path.startsWith('target.position.')) {
          const handle = this.editorHelperManager.getLightTargetHandle(maybeObj3d.uuid);
          if (handle) this.syncLightTargetHandleFromLight(maybeObj3d, handle);
        }
        if (path.startsWith('shadow.camera.')) {
          maybeObj3d.shadow?.camera?.updateProjectionMatrix?.();
        }
        if (path.startsWith('shadow.')) {
          maybeObj3d.shadow?.camera?.updateMatrixWorld?.(true);
        }
      }
      if (maybeObj3d?.isRectAreaLight) {
        if (path.startsWith(`userData.${VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET}`)) {
          const targetPos = (maybeObj3d.userData as any)?.[VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET];
          if (targetPos && typeof targetPos === 'object') {
            maybeObj3d.lookAt?.(Number(targetPos.x ?? 0), Number(targetPos.y ?? 0), Number(targetPos.z ?? 0));
          }
          const handle = this.editorHelperManager.getLightTargetHandle(maybeObj3d.uuid);
          if (handle) this.syncLightTargetHandleFromLight(maybeObj3d, handle);
        }
      }
      if (maybeObj3d.matrixAutoUpdate === false) {
        maybeObj3d.updateMatrix?.();
      }
      maybeObj3d.updateMatrixWorld?.(true);
    }
    this.requestShadowMapUpdate();
    this.syncSceneTreeState();
    this.render();
  }

  /**
   * 请求下一帧重建阴影贴图。
   * - autoUpdate=false：这是必要触发；
   * - autoUpdate=true：在编辑态交互（缩放/选中/拖拽）后主动置位，可避免阴影偶发丢帧/失效观感。
   */
  private requestShadowMapUpdate(opts?: { force?: boolean }) {
    const shadowMap = this.renderer?.shadowMap;
    if (!shadowMap?.enabled) return;
    // 当用户关闭 Auto Update 时，应冻结阴影贴图，避免移动灯光/物体仍触发实时更新。
    // force=true 用于 renderer 设置变更等“显式请求”场景。
    if (!this.sceneSettings.renderer.shadowMapAutoUpdate && !opts?.force) return;
    this.markDirty({ shadow: true });
    shadowMap.needsUpdate = true;
  }

  private markDirty(next: { renderer?: boolean; shadow?: boolean; scene?: boolean }) {
    if (next.renderer) {
      this.rendererDirty = true;
      this.dirtyStats.renderer += 1;
    }
    if (next.shadow) {
      this.shadowDirty = true;
      this.dirtyStats.shadow += 1;
    }
    if (next.scene) {
      this.sceneDirty = true;
      this.dirtyStats.scene += 1;
    }
  }

  private maybeLogDirtyStats() {
    if (!this.isDirtyStatsDebugEnabled()) return;
    const now = Date.now();
    if (now - this.dirtyStatsLastLogAt < 1000) return;
    this.dirtyStatsLastLogAt = now;
    if (!this.rendererDirty && !this.shadowDirty && !this.sceneDirty) return;
    console.debug('[ThreeEditor][dirty]', {
      flags: {
        rendererDirty: this.rendererDirty,
        shadowDirty: this.shadowDirty,
        sceneDirty: this.sceneDirty
      },
      hits: this.dirtyStats
    });
  }

  private isDirtyStatsDebugEnabled() {
    try {
      return window.localStorage?.getItem('VIZON_EDITOR_DEBUG_DIRTY') === '1';
    } catch {
      return false;
    }
  }

  private isPerFrameRendererSyncEnabled() {
    try {
      return window.localStorage?.getItem('VIZON_EDITOR_FORCE_RENDERER_SYNC') === '1';
    } catch {
      return false;
    }
  }

  private applyShadowFrustumVisibilityForAllLights() {
    this.editorHelperManager.applyShadowFrustumVisibilityForAllLights();
  }
}
