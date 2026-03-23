/**
 * 小型数学工具：集中放置纯函数，便于复用与单测（不会依赖 three/浏览器运行时）。
 */
export function clamp(n: number, min: number, max: number) {
  // 将数值限制在 [min, max] 区间内，避免非法参数导致 UI/three 表现异常。
  return Math.min(max, Math.max(min, n));
}

/**
 * 缓动函数：In-Out Cubic
 * - t: 0..1 之间的归一化时间
 * - 返回值：0..1 的缓动进度
 */
export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

