/**
 * 贴图分类映射工具。
 *
 * 将 TextureFieldKey（材质贴图槽位）和 HDRI 上传上下文映射为用户可见的 8 种分类。
 * 分类逻辑与 MaterialTextureMapsSection.tsx 的 5 组结构对应，加上 HDRI 分类。
 */

import type { TextureFieldKey } from '../pages/DesignPage/Inspector/Material/materialConstants';
import type { TextureCategory } from '../api/textures';

/** 将材质贴图槽位映射为用户可见分类。 */
export function categoryFromTextureSlot(slot: TextureFieldKey): TextureCategory {
  switch (slot) {
    case 'map':
      return 'color_map';
    case 'envMap':
      return 'environment_map';
    case 'alphaMap':
      return 'opacity_map';
    case 'lightMap':
    case 'aoMap':
    case 'emissiveMap':
    case 'specularMap':
      return 'lighting_map';
    case 'bumpMap':
    case 'normalMap':
    case 'displacementMap':
      return 'normal_map';
    case 'roughnessMap':
    case 'metalnessMap':
      return 'pbr_map';
    default:
      return 'physical_map';
  }
}

/** HDRI 上传统一归类为场景环境贴图。 */
export function categoryFromHdri(): TextureCategory {
  return 'scene_environment';
}

/** 检测文件是否为 HDR 格式（.hdr / .exr）。 */
export function isHdrFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.hdr') || name.endsWith('.exr');
}

/** 根据文件和上传上下文推断贴图分类。 */
export function inferCategory(file: File, slot: TextureFieldKey | 'hdri'): TextureCategory {
  if (slot === 'hdri' || isHdrFile(file)) return 'scene_environment';
  return categoryFromTextureSlot(slot);
}
