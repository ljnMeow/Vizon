import { describe, expect, it } from 'vitest';
import {
  TEXTURE_ACCEPT_COLOR,
  TEXTURE_ACCEPT_DATA,
  TEXTURE_ACCEPT_HDRI,
  getTextureCategoryUploadConfig,
} from '../textureCategoryUpload';

describe('getTextureCategoryUploadConfig', () => {
  it('颜色/环境贴图分类使用颜色类 accept', () => {
    expect(getTextureCategoryUploadConfig('color_map').accept).toBe(TEXTURE_ACCEPT_COLOR);
    expect(getTextureCategoryUploadConfig('environment_map').hintKey).toBe('color');
  });

  it('法线/PBR 等数据贴图分类仅 PNG', () => {
    expect(getTextureCategoryUploadConfig('normal_map').accept).toBe(TEXTURE_ACCEPT_DATA);
    expect(getTextureCategoryUploadConfig('pbr_map').hintKey).toBe('data');
  });

  it('场景环境分类支持 HDR/EXR', () => {
    expect(getTextureCategoryUploadConfig('scene_environment').accept).toBe(TEXTURE_ACCEPT_HDRI);
    expect(getTextureCategoryUploadConfig('scene_environment').hintKey).toBe('hdri');
  });
});
