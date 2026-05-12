/**
 * 历史记录标题与快照比较用到的纯工具（无 THREE 副作用）。
 */

export function cloneForHistory<T>(value: T): T {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

export function isHistoryValueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

export function formatHistoryValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v) return '""';
    return v.length > 32 ? `${v.slice(0, 32)}…` : v;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : String(Number(value.toFixed(4)));
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

/** 按点路径读取嵌套值（不克隆）。 */
export function readNestedPath(source: unknown, path: string): unknown {
  if (!path) return source;
  const keys = path.split('.');
  let cur: any = source;
  for (const key of keys) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** 读取嵌套值并按 `clone` 深拷贝，用于撤销基线。 */
export function readNestedValueCloned<TClone>(
  source: unknown,
  path: string,
  clone: <T>(value: T) => T
): unknown {
  return clone(readNestedPath(source, path) as any);
}
