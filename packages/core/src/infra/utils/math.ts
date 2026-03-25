/**
 * 与 WebGL/three 无关的纯数学小函数，放在 `infra/utils` 便于：
 * - 单元测试不启 canvas；
 * - 避免 controller 之间复制粘贴 clamp/缓动实现。
 */

/**
 * 将标量 n 钳制在闭区间 [min, max]。
 * @param n 输入值（可小于 min 或大于 max）
 * @param min 允许的最小值
 * @param max 允许的最大值（若 max &lt; min，结果仍按 Math 语义：先 max 再 min）
 * @returns 钳制后的数，用于 FOV、曝光、归一化时间等 UI 绑定
 */
export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n)); // 先与 max 取小再与 min 取大，落在闭区间内
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
