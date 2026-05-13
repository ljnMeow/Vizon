/**
 * **Renderer 配置映射表**：把 `SceneSettings.renderer` 中可序列化的字符串枚举，
 * 翻译成 three.js `WebGLRenderer` 真正需要的常量值。
 *
 * 设计动机：
 * - settings 层保持 JSON 友好的稳定字符串；
 * - 渲染层只在真正应用配置时再映射到 three 常量；
 * - `satisfies Record<...>` 让新增枚举时在编译期立即暴露遗漏。
 */
import * as THREE from 'three';
import type { RendererOutputColorSpace, RendererToneMapping, RendererSettings } from '../../settings/sceneSettings';
export const rendererOutputColorSpaceToThree = {
  SRGBColorSpace: THREE.SRGBColorSpace,
  LinearSRGBColorSpace: THREE.LinearSRGBColorSpace
} satisfies Record<RendererOutputColorSpace, string>;

/** renderer toneMapping 映射表（core 字符串 -> three ToneMapping）。 */
export const rendererToneMappingToThree = {
  NoToneMapping: THREE.NoToneMapping,
  LinearToneMapping: THREE.LinearToneMapping,
  ReinhardToneMapping: THREE.ReinhardToneMapping,
  CineonToneMapping: THREE.CineonToneMapping,
  ACESFilmicToneMapping: THREE.ACESFilmicToneMapping
} satisfies Record<RendererToneMapping, THREE.ToneMapping>;

/** renderer.shadowMap.type 映射表（core shadowMapType -> three ShadowMapType）。 */
export const rendererShadowMapTypeToThree = {
  BasicShadowMap: THREE.BasicShadowMap,
  PCFShadowMap: THREE.PCFShadowMap,
  PCFSoftShadowMap: THREE.PCFSoftShadowMap
} satisfies Record<RendererSettings['shadowMapType'], number>;
