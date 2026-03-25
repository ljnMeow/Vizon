import * as THREE from 'three';
import type { RendererOutputColorSpace, RendererToneMapping, RendererSettings } from '../../settings/sceneSettings';

/**
 * Settings -> three.js 常量映射表：
 * - 将 core 的“字符串枚举”转换为 three.js 期望的枚举值
 * - 使用 `satisfies Record<...>` 保证 key/value 类型完整匹配（编译期兜底）
 */
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

