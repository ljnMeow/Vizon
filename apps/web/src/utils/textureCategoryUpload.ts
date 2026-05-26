/**
 * 贴图资源库按分类的上传 accept / 格式提示配置。
 *
 * 与材质面板 FIELD_ACCEPT 分类逻辑对齐（见 MaterialTextureMapsSection、textureCategoryMap）。
 */

import type { TextureCategory } from '../api/textures';

/** 颜色类贴图：PNG / JPEG / WebP */
export const TEXTURE_ACCEPT_COLOR = 'image/png,image/jpeg,image/webp';
/** 数据类贴图：仅 PNG（无损） */
export const TEXTURE_ACCEPT_DATA = 'image/png';
/** 场景环境 / HDRI：HDR、EXR 及常见位图 */
export const TEXTURE_ACCEPT_HDRI = '.hdr,.exr,image/png,image/jpeg,image/webp';
/** 全量白名单（物理贴图等混合分类） */
export const TEXTURE_ACCEPT_ALL = 'image/png,image/jpeg,image/webp,.hdr,.exr';

/** 格式提示 i18n 键类型（对应 textureLibrary.uploadFormatHint*） */
export type TextureUploadFormatHintKey = 'color' | 'data' | 'hdri' | 'all';

export type TextureCategoryUploadConfig = {
  accept: string;
  hintKey: TextureUploadFormatHintKey;
};

/** 按用户资源库分类返回文件选择 accept 与格式提示键。 */
export function getTextureCategoryUploadConfig(category: TextureCategory): TextureCategoryUploadConfig {
  switch (category) {
    case 'color_map':
    case 'environment_map':
      return { accept: TEXTURE_ACCEPT_COLOR, hintKey: 'color' };
    case 'opacity_map':
    case 'normal_map':
    case 'pbr_map':
      return { accept: TEXTURE_ACCEPT_DATA, hintKey: 'data' };
    case 'lighting_map':
      // 含自发光等颜色槽与光照/AO 数据槽，允许颜色类格式
      return { accept: TEXTURE_ACCEPT_COLOR, hintKey: 'color' };
    case 'scene_environment':
      return { accept: TEXTURE_ACCEPT_HDRI, hintKey: 'hdri' };
    case 'physical_map':
    default:
      return { accept: TEXTURE_ACCEPT_ALL, hintKey: 'all' };
  }
}
