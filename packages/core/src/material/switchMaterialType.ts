import * as THREE from 'three';

export type SwitchMaterialTypeOptions = {
  /**
   * 允许沿用的贴图槽（例如新材质支持 envMap，就可以把旧材质的 envMap 迁移过去）。
   * 不在该列表中的贴图，即使存在也不会迁移。
   */
  supportedTextureKeys?: string[];
};

function createMaterialByType(type: string): THREE.Material | null {
  switch (type) {
    case 'MeshBasicMaterial':
      return new THREE.MeshBasicMaterial();
    case 'MeshDepthMaterial':
      return new THREE.MeshDepthMaterial();
    case 'MeshNormalMaterial':
      return new THREE.MeshNormalMaterial();
    case 'MeshMatcapMaterial':
      return new THREE.MeshMatcapMaterial();
    case 'MeshLambertMaterial':
      return new THREE.MeshLambertMaterial();
    case 'MeshPhongMaterial':
      return new THREE.MeshPhongMaterial();
    case 'MeshToonMaterial':
      return new THREE.MeshToonMaterial();
    case 'MeshStandardMaterial':
      return new THREE.MeshStandardMaterial();
    case 'MeshPhysicalMaterial':
      return new THREE.MeshPhysicalMaterial();
    case 'PointsMaterial':
      return new THREE.PointsMaterial();
    case 'LineBasicMaterial':
      return new THREE.LineBasicMaterial();
    case 'ShadowMaterial':
      return new THREE.ShadowMaterial();
    case 'ShaderMaterial':
      return new THREE.ShaderMaterial();
    default:
      return null;
  }
}

function copyIfPresent<T extends object, K extends string>(from: any, to: any, key: K) {
  if (from && to && key in from && key in to) {
    to[key] = from[key];
  }
}

function copyColorIfPresent(from: any, to: any, key: 'color' | 'emissive' | 'specular') {
  const src = from?.[key];
  const dst = to?.[key];
  if (!src || !dst) return;
  if (typeof dst.set === 'function') {
    // THREE.Color
    dst.set(src);
    return;
  }
  to[key] = src;
}

function copyVec2IfPresent(from: any, to: any, key: 'normalScale' | 'clearcoatNormalScale') {
  const src = from?.[key];
  const dst = to?.[key];
  if (!src || !dst) return;
  if (typeof dst.set === 'function' && typeof src.x === 'number' && typeof src.y === 'number') {
    dst.set(src.x, src.y);
    return;
  }
  to[key] = src;
}

function migrateTextures(oldMat: any, nextMat: any, supportedTextureKeys: string[]) {
  for (const key of supportedTextureKeys) {
    const tex = oldMat?.[key];
    if (tex instanceof THREE.Texture) {
      nextMat[key] = tex;
    }
  }
}

/**
 * 将旧材质切换为新的 three.js 材质类型，并尽量迁移通用属性与贴图引用。
 * - 不在 `supportedTextureKeys` 内的贴图槽不会迁移。
 * - 旧材质对象本身会被 dispose（不会 dispose 贴图资源）。
 */
export function switchMaterialType(oldMaterial: any, nextType: string, options?: SwitchMaterialTypeOptions): THREE.Material {
  const next = createMaterialByType(nextType) ?? new THREE.MeshStandardMaterial();
  const supportedTextureKeys = options?.supportedTextureKeys ?? [];

  // 渲染/通用属性（尽量拷贝，不强制要求双方都有该字段）
  copyIfPresent(oldMaterial, next, 'side');
  copyIfPresent(oldMaterial, next, 'opacity');
  copyIfPresent(oldMaterial, next, 'transparent');
  copyIfPresent(oldMaterial, next, 'alphaTest');
  copyIfPresent(oldMaterial, next, 'depthTest');
  copyIfPresent(oldMaterial, next, 'depthWrite');
  copyIfPresent(oldMaterial, next, 'wireframe');
  copyIfPresent(oldMaterial, next, 'fog');
  copyIfPresent(oldMaterial, next, 'blending');
  copyIfPresent(oldMaterial, next, 'premultipliedAlpha');
  copyIfPresent(oldMaterial, next, 'alphaToCoverage');

  // 常见颜色/高光等
  copyColorIfPresent(oldMaterial, next, 'color');
  copyColorIfPresent(oldMaterial, next, 'emissive');
  copyColorIfPresent(oldMaterial, next, 'specular');
  copyIfPresent(oldMaterial, next, 'emissiveIntensity');
  copyIfPresent(oldMaterial, next, 'roughness');
  copyIfPresent(oldMaterial, next, 'metalness');
  copyIfPresent(oldMaterial, next, 'shininess');

  // 强度/尺度
  copyIfPresent(oldMaterial, next, 'envMapIntensity');
  copyIfPresent(oldMaterial, next, 'aoMapIntensity');
  copyVec2IfPresent(oldMaterial, next, 'normalScale');
  copyVec2IfPresent(oldMaterial, next, 'clearcoatNormalScale');

  // 贴图迁移
  migrateTextures(oldMaterial, next, supportedTextureKeys);

  (next as any).needsUpdate = true;

  if (oldMaterial && typeof oldMaterial.dispose === 'function') {
    oldMaterial.dispose();
  }

  return next;
}

/**
 * 对一个对象（及其子树）下的所有 Mesh/Line/Points 执行材质类型切换。
 * 返回是否发生了实际替换。
 */
export function switchMaterialTypeOnObject(root: any, nextType: string, options?: SwitchMaterialTypeOptions): boolean {
  if (!root?.traverse) return false;
  const supportedTextureKeys = options?.supportedTextureKeys ?? [];
  let changed = false;

  root.traverse((obj: any) => {
    const material = obj?.material;
    if (!material) return;

    if (Array.isArray(material)) {
      const nextList = material.map((m) => (m ? switchMaterialType(m, nextType, { supportedTextureKeys }) : m));
      obj.material = nextList;
      changed = true;
      return;
    }

    obj.material = switchMaterialType(material, nextType, { supportedTextureKeys });
    changed = true;
  });

  return changed;
}

