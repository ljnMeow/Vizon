import * as THREE from 'three';
import type { RendererSettings } from '../../settings/sceneSettings';
import type { TransformMode } from '../ThreeEditor';
import { clamp } from '../../infra/utils/math';
import { rendererOutputColorSpaceToThree, rendererShadowMapTypeToThree, rendererToneMappingToThree } from './rendererMappings';
import type { InteractionController } from './InteractionController';
import type { InteractionRecreateControlsOptions } from './InteractionController';

/**
 * RendererController：
 * 负责 renderer 的创建/应用设置/重建。
 *
 * 其中 `antialias` 在 three.js 中只能在创建时生效，
 * 所以当 `SceneSettings.renderer.antialias` 变化时需要重建 renderer，
 * 同时让 InteractionController 重新创建 orbit/transform 并恢复 selected 状态。
 */
export class RendererController {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly interactionController: InteractionController
  ) {}

  /**
   * 创建 WebGLRenderer。
   * @param antialias 是否开启 antialias（只能在创建阶段设置）
   */
  createRenderer(antialias: boolean) {
    return new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias,
      alpha: true,
      powerPreference: 'high-performance'
    });
  }

  /**
   * 把 core 的 renderer 设置应用到 three renderer 上。
   * @remarks 不处理 antialias 重建；重建由外层调用者决定。
   */
  applyRendererSettings(renderer: THREE.WebGLRenderer, nextRenderer: RendererSettings) {
    renderer.outputColorSpace = rendererOutputColorSpaceToThree[nextRenderer.outputColorSpace];
    renderer.toneMapping = rendererToneMappingToThree[nextRenderer.toneMapping];
    renderer.toneMappingExposure = clamp(nextRenderer.toneMappingExposure, 0, 10);
    renderer.shadowMap.enabled = Boolean(nextRenderer.shadowMapEnabled);
    renderer.shadowMap.type = rendererShadowMapTypeToThree[nextRenderer.shadowMapType];
    renderer.shadowMap.autoUpdate = Boolean(nextRenderer.shadowMapAutoUpdate);
  }

  /**
   * 当 antialias 等关键项变化时执行重建：
   * - 创建新的 WebGLRenderer
   * - 触发 InteractionController 重新创建 orbit/transform 并恢复 selected
   * - 释放旧 renderer 资源
   */
  recreateRenderer(
    prevRenderer: THREE.WebGLRenderer,
    opts: {
      antialias: boolean;
      orbitTarget: THREE.Vector3;
      orbitEnabled: boolean;
      selected: THREE.Object3D | null;
      transformMode: TransformMode;
      toolEnabled: boolean;
    }
  ) {
    const nextRenderer = this.createRenderer(opts.antialias);

    // 保持原行为：重建后先把 outputColorSpace 置为 SRGB（后续 applyRendererSettings 会覆盖）。
    nextRenderer.outputColorSpace = THREE.SRGBColorSpace;

    const interactionOpts: InteractionRecreateControlsOptions = {
      domElement: nextRenderer.domElement,
      transformMode: opts.transformMode,
      orbitTarget: opts.orbitTarget,
      orbitEnabled: opts.orbitEnabled,
      selected: opts.selected,
      toolEnabled: opts.toolEnabled,
      enableDamping: true
    };

    const { orbit, transform } = this.interactionController.recreateControls(interactionOpts);

    // 释放旧 renderer（controls 已被 interactionController dispose/recreate 覆盖）
    prevRenderer.dispose();

    return { renderer: nextRenderer, orbit, transform } as const;
  }
}

