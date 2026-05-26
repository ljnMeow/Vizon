/**
 * 贴图资源库同步工具。
 *
 * 在材质面板或场景设置上传贴图时，自动将贴图同步到用户的资源库。
 * 设计为 fire-and-forget：失败不阻塞主上传流程，仅 console.warn。
 * 上传过程会显示独立的进度提示（message.loading），不影响调用方的 loading 流程。
 */

import type { TextureFieldKey } from '../pages/DesignPage/Inspector/Material/materialConstants';
import { uploadTextureWithProgress } from '../api/textures';
import { message } from '../components/GlobalMessage';
import { appMessages } from '../i18n/messages';
import { getApiErrorMessage } from './apiError';
import { STORAGE_KEYS } from './keys';
import { inferCategory } from './textureCategoryMap';
import { generateThumbnail } from './textureThumbnail';

/**
 * 将贴图文件同步到用户资源库（fire-and-forget，带独立进度提示）。
 *
 * 在贴图上传成功后调用，不阻塞主流程。
 * 上传期间会显示独立的 loading 进度条，完成后自动关闭。
 * 失败时仅 console.warn，不影响当前会话中的贴图使用。
 */
export function syncTextureToLibrary(
  file: File,
  slot: TextureFieldKey | 'hdri'
): void {
  const category = inferCategory(file, slot);
  const locale = typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEYS.LOCALE) === 'en-US' ? 'en-US' : 'zh-CN';
  const t = appMessages[locale].userAssets.textureLibrary;
  const loadingHandle = message.loading(`${t.uploading} 0%`);
  loadingHandle.update({ progress: 0 });

  generateThumbnail(file)
    .then((thumbnail) => {
      return uploadTextureWithProgress(
        {
          name: file.name,
          file,
          thumbnail: thumbnail ?? undefined,
          category,
          textureSlot: slot === 'hdri' ? 'hdri' : slot,
        },
        (percent) => {
          if (percent >= 100) {
            loadingHandle.update({ text: t.uploadProcessing, progress: 100 });
          } else {
            loadingHandle.update({ text: `${t.uploading} ${percent}%`, progress: percent });
          }
        }
      );
    })
    .then(() => {
      loadingHandle.hide();
      void message.success(t.uploadSuccess);
    })
    .catch((err) => {
      loadingHandle.hide();
      console.warn('[textureLibrarySync] Failed to sync texture to library:', err);
      void message.error(`${t.uploadFailedPrefix}${getApiErrorMessage(err, t.uploadFailed)}`);
    });
}
