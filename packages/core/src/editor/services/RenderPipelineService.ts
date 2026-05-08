import * as THREE from 'three';
import type { OrbitControls } from 'three-stdlib';
import type { SceneSettings } from '../../settings/sceneSettings';

export type RenderPipelineHost = {
  getCanvas(): HTMLCanvasElement;
  getRenderer(): THREE.WebGLRenderer;
  getSceneSettings(): SceneSettings;
  getOrbit(): OrbitControls;
  maybeLogDirtyStats(): void;
  isPerFrameRendererSyncEnabled(): boolean;
  applyRendererSettingsPerFrame(): void;
  /** 当 shadowDirty 为 true 时需要更新阴影矩阵与 shadow map。 */
  getShadowDirty(): boolean;
  setShadowDirty(next: boolean): void;
  syncShadowCastingLights(): void;
  syncHelpersPerFrame(): void;
  syncCameraAndLightHelpersPerFrame(): void;
  updateConduitEndpointsPerFrame(): void;
  updateSelectionBoxHelperPerFrame(): void;
  renderEffects(): void;
};

/**
 * 渲染管线服务：承载 RAF 生命周期、resize 与每帧渲染编排。
 *
 * 设计约束：
 * - service 只负责“渲染调度顺序”和“每帧/每次 resize 的节流”，不做业务决策。
 * - 所有与编辑器状态相关的判断/计算（dirty 标记、shadow/helper 同步、效果渲染）由 `host` 完成。
 * - 这样能保证渲染链路在重构时仍保持稳定：start/stop/resize 只改变时机，不改变语义。
 */
export class RenderPipelineService {
  private host: RenderPipelineHost;
  private clock = new THREE.Clock();
  private frame: number | null = null;

  constructor(host: RenderPipelineHost) {
    this.host = host;
  }

  /**
   * 启动 RAF 渲染循环。
   * - 防止重复 start：如果 `this.frame` 已存在则直接返回。
   * - 每帧计算 dt（目前 render 中 dt 未使用，但保留参数用于未来效果模块扩展）。
   */
  start() {
    if (this.frame != null) return;
    this.clock.start();
    const tick = () => {
      const dt = this.clock.getDelta();
      this.host.getOrbit().update();
      this.render(dt);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /**
   * 停止 RAF 渲染循环，释放 requestAnimationFrame 句柄。
   */
  stop() {
    if (this.frame == null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /**
   * 执行一次“渲染链路”：
   * 1) 可选的 dirty stats 观测
   * 2) 可选的 renderer 设置同步（用于强制每帧刷新或 debug）
   * 3) 根据 shadow dirty 标记更新 shadow map（shadowMapAutoUpdate=false 时尤其重要）
   * 4) helper / 选区框 / conduit 等 overlay 更新
   * 5) 最后才进入 effects 渲染（确保前面的状态已经正确）
   */
  render(_dt?: number) {
    this.host.maybeLogDirtyStats();

    if (this.host.isPerFrameRendererSyncEnabled()) {
      this.host.applyRendererSettingsPerFrame();
    }

    const renderer = this.host.getRenderer();
    if (renderer?.shadowMap?.enabled && this.host.getShadowDirty()) {
      this.host.syncShadowCastingLights();
      renderer.shadowMap.needsUpdate = true;
      this.host.setShadowDirty(false);
    }

    this.host.syncHelpersPerFrame();
    this.host.syncCameraAndLightHelpersPerFrame();
    this.host.updateConduitEndpointsPerFrame();
    this.host.updateSelectionBoxHelperPerFrame();
    this.host.renderEffects();
  }

  /**
   * 同步画布尺寸并设置 DPR 限幅。
   * - 使用 `renderer.setSize(..., false)`：避免触发多余的清理/重新分配。
   * - DPR 上限为 2：在高分屏上控制 GPU 负载与像素填充成本。
   */
  resize(width: number, height: number, pixelRatio?: number) {
    const renderer = this.host.getRenderer();
    const dpr = pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
  }
}

