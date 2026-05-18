/**
 * 纹理文件分辨率规范化工具。
 *
 * 在用户上传纹理时检查图片尺寸，超出最大分辨率则等比缩放后重新编码，
 * 避免 8K 等超大纹理直接进入 ZIP 和 GPU 内存导致包体积膨胀和性能问题。
 * HDR 格式（.hdr/.exr）无法用 Canvas 处理，自动跳过。
 */

const MAX_TEXTURE_DIMENSION = 4096;

/** HDR 文件扩展名（无法用 Canvas 缩放的格式） */
const HDR_EXTENSIONS = new Set(['.hdr', '.exr']);

export interface NormalizeResult {
  file: File;
  resized: boolean;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
}

/** 判断文件是否为无法用 Canvas 处理的 HDR 格式 */
function isHdrFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return HDR_EXTENSIONS.has(name.slice(name.lastIndexOf('.')));
}

/** 计算等比缩放后的尺寸，保证最大边不超过 maxDim */
function computeResizedDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDim: number
): { width: number; height: number } {
  const ratio = maxDim / Math.max(srcWidth, srcHeight);
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

/** 将 Canvas 内容重新编码为指定 MIME 类型的 File */
function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

/**
 * 规范化纹理文件：检查分辨率，超限则等比缩放。
 *
 * - 未超限：原样返回，resized = false
 * - 超限：等比缩放到 MAX_TEXTURE_DIMENSION 内，重新编码为原格式
 * - .hdr/.exr 文件：跳过处理，原样返回
 */
export async function normalizeTextureFile(file: File): Promise<NormalizeResult> {
  // HDR 格式无法用 Canvas 处理，跳过
  if (isHdrFile(file)) {
    return {
      file,
      resized: false,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // 无法解码的文件（非图片），原样返回
    return {
      file,
      resized: false,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
    };
  }

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;

  // 未超限，直接返回
  if (originalWidth <= MAX_TEXTURE_DIMENSION && originalHeight <= MAX_TEXTURE_DIMENSION) {
    bitmap.close();
    return {
      file,
      resized: false,
      originalWidth,
      originalHeight,
      width: originalWidth,
      height: originalHeight,
    };
  }

  // 超限，等比缩放
  const { width, height } = computeResizedDimensions(originalWidth, originalHeight, MAX_TEXTURE_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // 重新编码为原格式，PNG 用无损，其他格式用 0.92 质量
  const mimeType = file.type || 'image/png';
  const quality = mimeType === 'image/png' ? undefined : 0.92;
  const blob = await canvasToBlob(canvas, mimeType, quality ?? 1);

  if (!blob) {
    // 编码失败，返回原文件
    return {
      file,
      resized: false,
      originalWidth,
      originalHeight,
      width: originalWidth,
      height: originalHeight,
    };
  }

  const resizedFile = new File([blob], file.name, {
    type: mimeType,
    lastModified: Date.now(),
  });

  return {
    file: resizedFile,
    resized: true,
    originalWidth,
    originalHeight,
    width,
    height,
  };
}

export { MAX_TEXTURE_DIMENSION };
