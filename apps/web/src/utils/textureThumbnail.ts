/**
 * 贴图缩略图生成工具（客户端）。
 *
 * 仅处理普通图片（PNG/JPEG/WebP）。
 * HDR/EXR 文件的缩略图由服务端 imageio 自动生成，客户端无需处理。
 */

/** 为普通图片文件生成缩略图。HDR/EXR 文件返回 null，由服务端处理。 */
export async function generateThumbnail(file: File | Blob, maxSize = 128): Promise<Blob | null> {
  // HDR/EXR 缩略图由服务端生成，客户端跳过
  if (file instanceof File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'hdr' || ext === 'exr') return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}
