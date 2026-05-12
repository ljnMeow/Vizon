/**
 * 持久化解析/序列化共用的 **小型工具**：`isRecord`、各类 `to*` 强制转换、`nowIso`。
 * 无 THREE 依赖，便于在 Node 测试中与 `vizonPersistParse` 一同使用。
 */
import type { VizonQuat, VizonVec3 } from '../../types/document';
import { toFiniteNumber } from '../../infra/utils';

export { toFiniteNumber };

export function nowIso() {
  return new Date().toISOString();
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function toString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

export function toBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function toVec3(input: unknown, fallback: VizonVec3): VizonVec3 {
  if (!isRecord(input)) return fallback;
  return {
    x: toFiniteNumber(input.x, fallback.x),
    y: toFiniteNumber(input.y, fallback.y),
    z: toFiniteNumber(input.z, fallback.z),
  };
}

export function toQuat(input: unknown, fallback: VizonQuat): VizonQuat {
  if (!isRecord(input)) return fallback;
  return {
    x: toFiniteNumber(input.x, fallback.x),
    y: toFiniteNumber(input.y, fallback.y),
    z: toFiniteNumber(input.z, fallback.z),
    w: toFiniteNumber(input.w, fallback.w),
  };
}
