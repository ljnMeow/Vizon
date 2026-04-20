import * as THREE from 'three';

/**
 * 从 URL 加载普通位图贴图（如 blob: / https:）。
 * 与 `EnvironmentController` 中 LDR 环境图路径一致：默认按 sRGB 处理。
 *
 * 调用方若传入 `blob:` URL，应在合适时机自行 `URL.revokeObjectURL`（本模块在 `loadImageTextureFromFile` 内会处理）。
 */
export async function loadImageTextureFromUrl(url: string, options?: { name?: string }): Promise<THREE.Texture> {
  const loader = new THREE.TextureLoader();
  const texture = await loader.loadAsync(url);
  if (options?.name) texture.name = options.name;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 从 URL 加载等距柱状（equirectangular）环境贴图。
 * 注意：这只负责把贴图配置为可作为 envMap 使用（mapping/colorSpace），
 * 若用于 PBR（Standard/Physical）获得更真实效果，通常还需要在 renderer 侧做 PMREM 预过滤。
 */
export async function loadEquirectEnvMapTextureFromUrl(
  url: string,
  options?: { name?: string }
): Promise<THREE.Texture> {
  const texture = await loadImageTextureFromUrl(url, options);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

/**
 * 从用户选择的本地文件加载贴图（内部创建并释放 blob URL）。
 */
export async function loadImageTextureFromFile(file: File): Promise<THREE.Texture> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImageTextureFromUrl(url, { name: file.name });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 从用户选择的本地文件加载等距柱状（equirectangular）环境贴图（内部创建并释放 blob URL）。
 */
export async function loadEquirectEnvMapTextureFromFile(file: File): Promise<THREE.Texture> {
  const url = URL.createObjectURL(file);
  try {
    return await loadEquirectEnvMapTextureFromUrl(url, { name: file.name });
  } finally {
    URL.revokeObjectURL(url);
  }
}
