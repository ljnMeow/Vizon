/**
 * 浏览器端贴图资源会话仓库。
 *
 * 职责：
 * - 在当前页面会话内保留上传得到的贴图 `File`
 * - 给运行时 `THREE.Texture` 挂上一份稳定的资源元数据
 * - 提供不依赖 three 临时加载 URL 的预览地址
 * - 在项目包导出时把原始二进制内容重新取出来
 *
 * 生命周期：
 * - 仅存在于内存中
 * - 刷新页面或关闭标签页后失效
 * - 只有显式导出项目包后，资源才会被真正带走
 */
import type { TextureFieldKey } from '../pages/DesignPage/Inspector/Material/materialConstants';

/** 挂在 `texture.userData` 上的共享 key，供 UI 预览和项目包导入导出共用。 */
export const TEXTURE_ASSET_REF_KEY = '__vizonTextureAssetRef';

/** 可安全挂载到运行时贴图对象上的可序列化资源元数据。 */
export type TextureAssetRef = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  lastModified: number;
};

/** 会话仓库内的完整记录：除元数据外，还包含原始文件与按需生成的预览地址。 */
type TextureAssetRecord = TextureAssetRef & {
  file: File;
  previewUrl?: string;
};

/** 单页级贴图仓库，按资产 id 建立索引。 */
const textureAssetSession = new Map<string, TextureAssetRecord>();

/** 为当前浏览器会话生成一个足够稳定的贴图资产 id。 */
function createAssetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tex_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** 从运行时贴图对象中读取我们自定义挂载的资源引用。 */
export function getTextureAssetRef(texture: unknown): TextureAssetRef | null {
  const ref = (texture as { userData?: Record<string, unknown> } | null)?.userData?.[TEXTURE_ASSET_REF_KEY];
  if (!ref || typeof ref !== 'object') return null;

  const { id, originalName, mimeType, size, lastModified } = ref as Partial<TextureAssetRef>;
  if (
    typeof id !== 'string' ||
    typeof originalName !== 'string' ||
    typeof mimeType !== 'string' ||
    typeof size !== 'number' ||
    typeof lastModified !== 'number'
  ) {
    return null;
  }

  return { id, originalName, mimeType, size, lastModified };
}

/** 把资源元数据写回运行时贴图，便于后续 UI 与打包流程再次找到它。 */
export function attachTextureAssetRef(texture: { name?: string; userData?: Record<string, unknown> }, ref: TextureAssetRef) {
  texture.userData ??= {};
  texture.userData[TEXTURE_ASSET_REF_KEY] = ref;
  if (!texture.name) texture.name = ref.originalName;
}

/**
 * 把本地贴图文件放入当前会话缓存。
 *
 * 说明：
 * - `existingAssetId` 用于项目包导入时复用旧资产 id，避免绑定关系失真
 * - 如果同一个资产 id 已经存在预览 URL，会先释放旧 URL 再替换
 */
export async function cacheTextureAssetFile(file: File, existingAssetId?: string): Promise<TextureAssetRef> {
  const prev = existingAssetId ? textureAssetSession.get(existingAssetId) : null;
  if (prev?.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(prev.previewUrl);
  }

  const ref: TextureAssetRef = {
    id: existingAssetId ?? createAssetId(),
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    lastModified: file.lastModified || Date.now()
  };

  textureAssetSession.set(ref.id, { ...ref, file });
  return ref;
}

/** 读取某个资产 id 对应的完整缓存记录。 */
export function getCachedTextureAsset(assetId: string) {
  return textureAssetSession.get(assetId) ?? null;
}

/**
 * 为 UI 预览获取一条稳定的图片地址。
 *
 * 这里按需从原始 `File` 生成并缓存 blob URL，而不是复用
 * `texture.image.src`，因为 three 的加载 URL 往往会在贴图创建完成后立刻被释放。
 */
export function getCachedTextureAssetPreviewUrl(assetId: string): string | null {
  const record = textureAssetSession.get(assetId);
  if (!record) return null;
  if (!record.previewUrl) {
    record.previewUrl = URL.createObjectURL(record.file);
  }
  return record.previewUrl;
}

/** 在导出项目包时按资产 id 读取原始文件字节。 */
export async function getCachedTextureAssetBytes(assetId: string): Promise<Uint8Array | null> {
  const record = textureAssetSession.get(assetId);
  if (!record) return null;
  const fileLike = record.file as File & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof fileLike.arrayBuffer === 'function') {
    return new Uint8Array(await fileLike.arrayBuffer());
  }

  const blobBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read cached texture asset.'));
    reader.readAsArrayBuffer(record.file);
  });
  return new Uint8Array(blobBytes);
}

/** 导出项目包时优先从文件名、其次从 MIME 推断扩展名。 */
export function getAssetExtension(ref: Pick<TextureAssetRef, 'originalName' | 'mimeType'>) {
  const fileMatch = /\.([a-zA-Z0-9]+)$/.exec(ref.originalName);
  if (fileMatch) return fileMatch[1].toLowerCase();

  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tif',
    'image/ktx2': 'ktx2'
  };
  return mimeMap[ref.mimeType] ?? 'bin';
}

/** 运行时类型守卫：判断字符串是否是受支持的材质贴图槽位 key。 */
export function isTextureFieldKey(value: string): value is TextureFieldKey {
  const textureFields: TextureFieldKey[] = [
    'map',
    'envMap',
    'alphaMap',
    'lightMap',
    'aoMap',
    'specularMap',
    'emissiveMap',
    'bumpMap',
    'normalMap',
    'displacementMap',
    'roughnessMap',
    'metalnessMap',
    'gradientMap',
    'anisotropyMap',
    'clearcoatMap',
    'clearcoatRoughnessMap',
    'clearcoatNormalMap',
    'iridescenceMap',
    'iridescenceThicknessMap',
    'sheenColorMap',
    'sheenRoughnessMap',
    'transmissionMap',
    'thicknessMap',
    'specularIntensityMap',
    'specularColorMap'
  ];
  return textureFields.includes(value as TextureFieldKey);
}
