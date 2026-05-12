/**
 * 对象属性「预览 → 提交」历史：按 `uuid::path` 缓存撤销基线。
 * 与 `ThreeEditor.setObjectPropertyByUuid` 语义一致，便于单测与复用。
 */

/** 首次预览写入时写入基线（若该 key 尚无 pending）。 */
export function seedObjectPropertyPendingBaseline<T>(pending: Map<string, T>, key: string, baseline: T): void {
  if (!pending.has(key)) pending.set(key, baseline);
}

/**
 * 提交时：若存在 pending 基线则取出并删除；否则使用当前内存中的 live 基线。
 */
export function takeObjectPropertyHistoryBaseline<T>(pending: Map<string, T>, key: string, liveBefore: T): T {
  if (pending.has(key)) {
    const v = pending.get(key)!;
    pending.delete(key);
    return v;
  }
  return liveBefore;
}
