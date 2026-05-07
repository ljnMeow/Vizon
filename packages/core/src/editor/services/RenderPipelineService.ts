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
 * 设计约束（T006 阶段）：
 * - 仅搬运 + 委托，不改变行为；
 * - 具体业务逻辑仍在 Host（ThreeEditor）内部，service 只负责调度顺序与节流。
 */
export class RenderPipelineService {
  private host: RenderPipelineHost;
  private clock = new THREE.Clock();
  private frame: number | null = null;

  constructor(host: RenderPipelineHost) {
    this.host = host;
  }

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

  stop() {
    if (this.frame == null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

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

  resize(width: number, height: number, pixelRatio?: number) {
    const renderer = this.host.getRenderer();
    const dpr = pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
  }
}

