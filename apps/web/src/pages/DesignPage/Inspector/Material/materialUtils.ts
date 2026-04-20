import { materialSideOrder, materialSideKeyToValue, type MaterialBlendingKey, type MaterialSideKey, valueToBlendingKey } from './materialConstants';

export function getFirstMeshMaterial(root: any): any | null {
  // 取选中对象树里“第一个可用材质”，用于 UI 初始展示
  if (!root?.traverse) return null;
  let first: any = null;
  root.traverse((obj: any) => {
    if (first) return;
    if (!obj?.isMesh) return;
    if (!obj.material) return;
    if (Array.isArray(obj.material)) first = obj.material.find(Boolean) ?? null;
    else first = obj.material;
  });
  return first;
}

export function getMeshMaterials(root: any): any[] {
  // 仅收集支持 blending 的材质，供混合模式面板使用
  const materials: any[] = [];
  if (!root?.traverse) return materials;
  root.traverse((child: any) => {
    const material = child?.material;
    if (!material) return;
    const list = Array.isArray(material) ? material : [material];
    for (const m of list) {
      if (!m) continue;
      if (typeof (m as any).blending !== 'number') continue;
      materials.push(m);
    }
  });
  return materials;
}

export function getAllMeshMaterials(root: any): any[] {
  // 收集所有网格材质（含多材质数组）
  const materials: any[] = [];
  if (!root?.traverse) return materials;
  root.traverse((child: any) => {
    const material = child?.material;
    if (!material) return;
    const list = Array.isArray(material) ? material : [material];
    for (const m of list) {
      if (!m) continue;
      materials.push(m);
    }
  });
  return materials;
}

export function getBlendingKey(material: any): MaterialBlendingKey | null {
  // 将 three.js 的 blending 数值反查为 UI key
  if (!material) return null;
  const v = (material as any).blending;
  if (typeof v !== 'number') return null;
  return valueToBlendingKey.get(v) ?? null;
}

export function getSideKey(material: any): MaterialSideKey | null {
  // 将 side 数值映射为 Front/Back/Double key
  if (!material) return null;
  const v = (material as any).side;
  if (typeof v !== 'number') return null;
  for (const key of materialSideOrder) {
    if (materialSideKeyToValue[key] === v) return key;
  }
  return null;
}

export function normalizeHexColor(input: string): string {
  // 统一 hex 颜色格式，保证输出 #rrggbb
  const raw = input?.trim?.() ?? '';
  if (!raw) return '#000000';
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (withHash.length === 7) return withHash;
  if (withHash.length === 4) {
    const r = withHash[1];
    const g = withHash[2];
    const b = withHash[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return `#${withHash.replace('#', '').slice(0, 6)}`.toLowerCase();
}

export function getMaterialColorValue(material: any): string | null {
  // 兼容 three Color / number / string 三种来源
  const c = material?.color;
  if (!c) return null;
  if (typeof c.getHexString === 'function') return normalizeHexColor(`#${c.getHexString()}`);
  if (typeof c.getHex === 'function') {
    const hex = c.getHex();
    return `#${hex.toString(16).padStart(6, '0')}`;
  }
  if (typeof c === 'number') return `#${c.toString(16).padStart(6, '0')}`;
  if (typeof c === 'string') return normalizeHexColor(c);
  return null;
}

export function hexToRgbNormalized(hex: string): { r: number; g: number; b: number } {
  // 用于写入顶点色数组（0~1 浮点）
  const normalized = normalizeHexColor(hex);
  const hexStr = normalized.replace('#', '');
  const r = Number.parseInt(hexStr.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hexStr.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hexStr.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export function clamp01(n: number): number {
  // 透明度、alphaTest 等参数统一钳制到 [0, 1]
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

export function getFirstMeshGeometry(root: any): any | null {
  // 取第一个网格几何体，供顶点色读取初值
  if (!root?.traverse) return null;
  let first: any = null;
  root.traverse((obj: any) => {
    if (first) return;
    if (!obj?.isMesh) return;
    if (!obj?.geometry) return;
    first = obj.geometry;
  });
  return first;
}

export function getAllMeshes(root: any): any[] {
  // 获取所有网格节点，便于批量写入顶点色
  const meshes: any[] = [];
  if (!root?.traverse) return meshes;
  root.traverse((obj: any) => {
    if (!obj?.isMesh) return;
    if (!obj?.geometry) return;
    meshes.push(obj);
  });
  return meshes;
}

export function getVertexColorValueFromGeometry(geometry: any): string | null {
  // 从几何体 color attribute 的首个顶点颜色推导 UI 初始色值
  const attr = geometry?.attributes?.color;
  const array = attr?.array;
  if (!array || array.length < 3) return null;
  let r = array[0] as number;
  let g = array[1] as number;
  let b = array[2] as number;
  const isNormalized = r <= 1 && g <= 1 && b <= 1;
  if (isNormalized) {
    r = r * 255;
    g = g * 255;
    b = b * 255;
  }
  const toHex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toLowerCase();
}
