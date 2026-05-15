/**
 * 持久化解析/序列化共用的 **小型工具**：`isRecord`、各类 `to*` 强制转换、`nowIso`。
 * 无 THREE 依赖，便于在 Node 测试中与 `vizonPersistParse` 一同使用。
 * 所有函数均为纯函数，输入无效时返回 fallback，不抛出异常（除非调用方明确需要）。
 */
import type { VizonQuat, VizonVec3 } from '../../types/document';
// 从基础工具层引入数字解析函数，避免在持久化层重复实现相同逻辑
import { toFiniteNumber } from '../../infra/utils';

// 透传 toFiniteNumber 供其他持久化文件直接从本模块 import，无需再次依赖 infra/utils
export { toFiniteNumber };

/**
 * 返回当前时刻的 ISO-8601 格式时间字符串，用于文档 meta.createdAt / updatedAt。
 * 格式例：`"2026-05-15T09:30:00.000Z"`
 */
export function nowIso() {
  // new Date() 取当前系统时间，toISOString() 输出 UTC 时间字符串
  return new Date().toISOString();
}

/**
 * 判断 `v` 是否为非 null 的对象（即 `Record<string, unknown>` 形状）。
 * 用于从外部 JSON 安全读取字段之前的类型收窄，避免在 null 上做属性访问。
 * 注意：数组也会返回 true（`typeof [] === 'object'`），调用方如需区分需额外判断。
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  // null 的 typeof 也是 'object'，需要单独排除
  return typeof v === 'object' && v !== null;
}

/**
 * 从外部 JSON 读取字符串字段，非字符串时回退到 `fallback`。
 * 不做任何类型强转（例如不把数字 1 转为 "1"），保持严格的字段类型校验。
 */
export function toString(value: unknown, fallback: string) {
  // 只有 typeof 恰好等于 'string' 才认为有效
  return typeof value === 'string' ? value : fallback;
}

/**
 * 从外部 JSON 读取布尔字段，非布尔时回退到 `fallback`。
 * 不把 truthy/falsy 值（如 1、""、0）当作布尔处理，要求类型严格一致。
 */
export function toBool(value: unknown, fallback: boolean) {
  // typeof 必须严格等于 'boolean'，避免把字符串 "true" 误判为真
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * 从外部 JSON 读取三维向量，缺失或非法字段时逐分量回退到 `fallback` 对应分量。
 * 不要求三个分量都有效——任意分量非法时只替换该分量，其余仍取 JSON 中的值。
 */
export function toVec3(input: unknown, fallback: VizonVec3): VizonVec3 {
  // input 不是对象（null、字符串等）时，整体回退到 fallback
  if (!isRecord(input)) return fallback;
  return {
    // 每个分量独立用 toFiniteNumber 处理，非有限数时取 fallback 对应分量
    x: toFiniteNumber(input.x, fallback.x),
    y: toFiniteNumber(input.y, fallback.y),
    z: toFiniteNumber(input.z, fallback.z),
  };
}

/**
 * 从外部 JSON 读取四元数，缺失或非法字段时逐分量回退到 `fallback` 对应分量。
 * 不在此处做归一化，调用方（如 importParsedDocument）负责检查 lengthSq 并归一化。
 */
export function toQuat(input: unknown, fallback: VizonQuat): VizonQuat {
  // input 不是对象时整体回退
  if (!isRecord(input)) return fallback;
  return {
    x: toFiniteNumber(input.x, fallback.x),
    y: toFiniteNumber(input.y, fallback.y),
    z: toFiniteNumber(input.z, fallback.z),
    // w 分量也单独处理，默认值通常为 1（单位四元数）
    w: toFiniteNumber(input.w, fallback.w),
  };
}
