import type { SceneSettings, RendererSettings } from './sceneSettings';

/**
 * 用于 `SceneSettings` 的差异判断：
 * - 环境相关改变（背景模式/颜色/strength/HDRI URL/雾）
 * - renderer 相关改变（antialias、tone mapping、shadow 等）
 * - camera 相关改变（fov/near/far/position/target）
 *
 * 目的：让 apply 流程只在必要时执行，减少无谓的 three 状态更新与异步 HDRI 重载。
 */
export type SceneSettingsDiff = {
  environmentChanged: boolean;
  rendererChanged: boolean;
  cameraChanged: boolean;
  gridChanged: boolean;
  helpersChanged: boolean;
};

/**
 * 计算下一帧/下一状态与上一帧/上一状态的差异标记。
 *
 * @remarks
 * - 该函数是纯函数：不会产生副作用
 * - 输入类型由 core 的 `SceneSettings` 约束，diff 判定与 `ThreeEditor.applySceneSettings` 的行为保持一致
 */
export function calcSceneSettingsDiff(next: SceneSettings, prev: SceneSettings): SceneSettingsDiff {
  // 任一项变化都触发 environment 应用分支（含可能较慢的 HDRI 加载）
  const environmentChanged =
    next.environment.backgroundMode !== prev.environment.backgroundMode ||
    next.environment.backgroundColor !== prev.environment.backgroundColor ||
    next.environment.environmentStrength !== prev.environment.environmentStrength ||
    next.environment.hdri.type !== prev.environment.hdri.type ||
    (next.environment.hdri.type === 'uploaded' && prev.environment.hdri.type === 'uploaded'
      ? next.environment.hdri.url !== prev.environment.hdri.url
      : false) || // 仅当两侧均为 uploaded 时才比较 url，避免把类型切换误判为 url 变
    next.environment.fog.enabled !== prev.environment.fog.enabled ||
    next.environment.fog.color !== prev.environment.fog.color ||
    next.environment.fog.near !== prev.environment.fog.near ||
    next.environment.fog.far !== prev.environment.fog.far;

  // renderer 多数项可热更；antialias 在实现层会触发 WebGL 重建
  const rendererChanged =
    next.renderer.antialias !== prev.renderer.antialias ||
    next.renderer.outputColorSpace !== prev.renderer.outputColorSpace ||
    next.renderer.toneMapping !== prev.renderer.toneMapping ||
    next.renderer.toneMappingExposure !== prev.renderer.toneMappingExposure ||
    next.renderer.shadowMapEnabled !== prev.renderer.shadowMapEnabled ||
    next.renderer.shadowMapType !== prev.renderer.shadowMapType ||
    next.renderer.shadowMapAutoUpdate !== prev.renderer.shadowMapAutoUpdate;

  // `RendererSettings` 目前只用于类型可读性与未来扩展占位。
  // 为避免 TS/ESLint 报 unused，这里显式占位。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _rendererSettingsForTypeOnly: RendererSettings | null = null;

  // 与 orbit 联动的透视相机参数；全等量比较避免对象向量化带来的引用噪声
  const cameraChanged =
    next.camera.fov !== prev.camera.fov ||
    next.camera.near !== prev.camera.near ||
    next.camera.far !== prev.camera.far ||
    next.camera.position.x !== prev.camera.position.x ||
    next.camera.position.y !== prev.camera.position.y ||
    next.camera.position.z !== prev.camera.position.z ||
    next.camera.target.x !== prev.camera.target.x ||
    next.camera.target.y !== prev.camera.target.y ||
    next.camera.target.z !== prev.camera.target.z;

  const gridChanged =
    next.grid.enabled !== prev.grid.enabled ||
    next.grid.color !== prev.grid.color ||
    next.grid.opacity !== prev.grid.opacity;

  const helpersChanged =
    next.helpers.axes.enabled !== prev.helpers.axes.enabled ||
    next.helpers.axes.size !== prev.helpers.axes.size;

  return { environmentChanged, rendererChanged, cameraChanged, gridChanged, helpersChanged };
}

