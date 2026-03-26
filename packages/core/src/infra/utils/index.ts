import * as THREE from 'three';

/**
 * `infra/utils` 统一工具入口（单文件管理）。
 *
 * 目标：
 * - 把常用的 clamp/数值解析/颜色解析/three Vector3 转换等聚合到一个入口文件；
 * - 避免 controller/settings 里散落多个“看似工具但分别存放”的小文件。
 */

/**
 * 将标量 n 钳制在闭区间 [min, max]。
 * @param n 输入值（可小于 min 或大于 max）
 * @param min 允许的最小值
 * @param max 允许的最大值（若 max < min，结果仍按 Math 语义：先 max 再 min）
 * @returns 钳制后的数，用于 FOV、曝光、归一化时间等 UI 绑定
 */
export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * 标准 In-Out Cubic 缓动：两端缓、中间快，适合视角切换动画。
 * @param t 归一化时间，期望在 [0, 1]；超出时按公式仍给出连续性结果
 * @returns 缓动后的插值因子，用于 `lerp(a, b, easeInOutCubic(t))`
 */
export function easeInOutCubic(t: number) {
  // 分段三次曲线：t 较小时用 4t³，较大时用对称多项式保证在 t=0.5 处一阶连续
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * 把任意输入尽可能解析成有限数字（finite number）。
 * @param value 输入值（可能是 number / string / 其他类型）
 * @param fallback 在解析失败或结果不是有限数时使用的兜底值
 */
export function toFiniteNumber(value: unknown, fallback: number) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * 把任意可解析的颜色字符串转换为 THREE.Color，
 * 然后在外部再导回统一的 `#rrggbb` hex 字符串（用于 normalize）。
 *
 * @param input 输入的颜色字符串（例如 '#fff'、'#ff00aa'、'rgb(...)' 等 three 支持的格式）
 * @param fallbackHex 解析失败时回退到的 fallback 颜色（hex 字符串）
 */
export function parseHexColor(input: string, fallbackHex: string): THREE.Color {
  // 防御式解析：UI 或外部输入非法颜色时回退，避免 normalize 抛错导致应用中断。
  try {
    return new THREE.Color(input);
  } catch {
    return new THREE.Color(fallbackHex);
  }
}

/** 最小的三维坐标结构（与 {x,y,z} 结构等价）。 */
export type XYZ = { x: number; y: number; z: number };

/**
 * 把 {x,y,z} 转成 THREE.Vector3（只接收一个参数）。
 * @param p 输入点
 */
export function toVec3(p: XYZ): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}

/**
 * 把 {x,y,z} 写入指定的 THREE.Vector3（复用 out 以减少分配）。
 * @param p 输入点
 * @param out 复用目标向量（必传）
 */
export function toVec3Into(p: XYZ, out: THREE.Vector3): THREE.Vector3 {
  out.set(p.x, p.y, p.z);
  return out;
}

/**
 * 把 THREE.Vector3 转为 {x,y,z}。
 * @param v 输入向量
 */
export function fromVec3(v: THREE.Vector3): XYZ {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * 计算一组点的平均中心（average center）。
 * - 当 points 为空时返回 (0,0,0)。
 * - out 可选，用于复用向量减少分配。
 *
 * 该函数适用于“局部空间点集求中心”，即：输入点坐标体系必须与期望输出一致。
 */
export function computeAverageCenterVec3(points: XYZ[], out?: THREE.Vector3): THREE.Vector3 {
  const v = out ?? new THREE.Vector3();
  if (points.length === 0) {
    v.set(0, 0, 0);
    return v;
  }

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }

  const inv = 1 / points.length;
  v.set(sx * inv, sy * inv, sz * inv);
  return v;
}

