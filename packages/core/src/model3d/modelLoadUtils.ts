/**
 * 3D 模型加载工具（格式推断、URL 解析、导入后处理）。
 *
 * 职责：
 * - 从 URL/展示名推断 glTF/GLB/OBJ/STL 格式，避免 ZIP 包名误导 Loader 选择
 * - 将后端绝对 `/media/` URL 转为同域相对路径，便于 Vite 代理与 WebGL 贴图加载
 * - 导入后统一修正贴图色彩空间，并等待尚未解码完成的 HTMLImageElement 贴图就绪
 *
 * 由 `AssetLoader`、`generateModel3dThumbnail` 等模块在加载完成后调用 `prepareImportedModelRoot`。
 * 贴图等待仅针对 HTMLImageElement；GLTFLoader 常用的 ImageBitmap 已解码，无需阻塞。
 */

import * as THREE from 'three';
import { VIZON_USER_DATA_KEYS } from '../infra/utils/keys';

/** 根据文件扩展名推断的模型格式。 */
export type ModelFormat = 'gltf' | 'glb' | 'obj' | 'stl';

const FORMAT_SUFFIXES: readonly { ext: string; format: ModelFormat }[] = [
  { ext: '.glb', format: 'glb' },
  { ext: '.gltf', format: 'gltf' },
  { ext: '.obj', format: 'obj' },
  { ext: '.stl', format: 'stl' },
];

/** 从 URL/路径解析扩展名并推断格式（忽略查询串与 hash）。 */
export function detectModelFormatFromPath(path: string): ModelFormat | null {
  const normalized = path.split('?')[0].split('#')[0].toLowerCase();
  for (const { ext, format } of FORMAT_SUFFIXES) {
    if (normalized.endsWith(ext)) return format;
  }
  return null;
}

/**
 * 推断模型格式：优先使用真实文件 URL，再回退展示名。
 * 避免 ZIP 包名（如 factory.zip）或用户重命名覆盖实际入口扩展名。
 */
export function detectModelFormat(url: string, displayName?: string): ModelFormat | null {
  return detectModelFormatFromPath(url) ?? (displayName ? detectModelFormatFromPath(displayName) : null);
}

/** 从模型 URL 取入口文件名（用于 Loader 辅助推断）。 */
export function getModelEntryFileName(url: string, displayName?: string): string | undefined {
  try {
    const pathname = new URL(url, 'http://local.invalid').pathname;
    const base = pathname.split('/').pop();
    if (base) return base;
  } catch {
    /* ignore */
  }
  return displayName;
}

/**
 * 将后端返回的绝对 `/media/` URL 转为同域相对路径，便于 Vite 代理加载贴图。
 * 非浏览器环境（测试）原样返回。
 */
export function resolveMediaUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith('/media/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

const MAP_KEYS = [
  'map',
  'emissiveMap',
  'normalMap',
  'aoMap',
  'roughnessMap',
  'metalnessMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
] as const;

/** 导入模型后的统一后处理（等待异步贴图就绪）。 */

const TEXTURE_LOAD_TIMEOUT_MS = 30_000;

/** 仅对尚未解码完成的 HTMLImageElement 等待；ImageBitmap 等类型 GLTFLoader 已解码完毕。 */
function isPendingHtmlImage(image: unknown): image is HTMLImageElement {
  return (
    typeof HTMLImageElement !== 'undefined' &&
    image instanceof HTMLImageElement &&
    !image.complete
  );
}

/** 等待模型上尚未完成的贴图解码，避免首帧无贴图。 */
export async function awaitModelTexturesLoaded(root: THREE.Object3D): Promise<void> {
  const waits: Promise<void>[] = [];

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const key of MAP_KEYS) {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key];
        const image = tex?.image;
        if (!isPendingHtmlImage(image)) continue;
        waits.push(
          new Promise((resolve, reject) => {
            const timer =
              typeof window !== 'undefined'
                ? window.setTimeout(() => {
                    reject(new Error(`贴图加载超时: ${key}`));
                  }, TEXTURE_LOAD_TIMEOUT_MS)
                : undefined;
            const cleanup = () => {
              if (timer !== undefined) window.clearTimeout(timer);
            };
            image.onload = () => {
              cleanup();
              resolve();
            };
            image.onerror = () => {
              cleanup();
              reject(new Error(`贴图加载失败: ${key}`));
            };
          })
        );
      }
    }
  });

  if (waits.length > 0) await Promise.all(waits);
}

/** 导入模型后的统一后处理（异步贴图就绪）。 */
export async function prepareImportedModelRoot(root: THREE.Object3D): Promise<void> {
  await awaitModelTexturesLoaded(root);
}

/**
 * 拖拽导入模型时确保根为可锁定的 Group：
 * - 根已是 Group：直接设置 locked；
 * - 否则外包一层 Group 并设置 locked。
 *
 * 返回应加入场景的对象（可能是原根或新建的外层 Group）。
 */
export function ensureLockedModelGroupRoot(root: THREE.Object3D): THREE.Object3D {
  const applyLocked = (group: THREE.Object3D) => {
    const ud = (group.userData ?? {}) as Record<string, unknown>;
    group.userData = ud;
    ud[VIZON_USER_DATA_KEYS.COMMON.LOCKED] = true;
  };

  if (root.type === 'Group') {
    applyLocked(root);
    return root;
  }

  const wrapper = new THREE.Group();
  wrapper.name = root.name || 'Model';
  applyLocked(wrapper);
  wrapper.add(root);
  return wrapper;
}
