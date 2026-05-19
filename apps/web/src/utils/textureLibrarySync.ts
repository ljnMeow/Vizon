/**
 * 贴图资源库同步工具。
 *
 * 在材质面板或场景设置上传贴图时，自动将贴图同步到用户的资源库。
 * 设计为 fire-and-forget：失败不阻塞主上传流程，仅 console.warn。
 */

import type { TextureFieldKey } from '../pages/DesignPage/Inspector/Material/materialConstants';
import { createTexture } from '../api/textures';
import { inferCategory } from './textureCategoryMap';
import { generateThumbnail } from './textureThumbnail';

/**
 * 将贴图文件同步到用户资源库（fire-and-forget）。
 *
 * 在贴图上传成功后调用，不阻塞主流程。
 * 失败时仅 console.warn，不影响当前会话中的贴图使用。
 */
export function syncTextureToLibrary(
  file: File,
  slot: TextureFieldKey | 'hdri'
): void {
  const category = inferCategory(file, slot);

  generateThumbnail(file)
    .then((thumbnail) => {
      return createTexture({
        name: file.name,
        file,
        thumbnail: thumbnail ?? undefined,
        category,
        textureSlot: slot === 'hdri' ? 'hdri' : slot,
      });
    })
    .catch((err) => {
      console.warn('[textureLibrarySync] Failed to sync texture to library:', err);
    });
}
