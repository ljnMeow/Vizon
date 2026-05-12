/**
 * 单槽 pending：用于「整份 renderer / 整份 scene settings」一类仅一条预览基线的场景。
 */

export type SingleSlotPending<T> = { value: T | null };

export function createSingleSlotPending<T>(): SingleSlotPending<T> {
  return { value: null };
}

/** 进入预览且尚未有基线时，捕获一次基线。 */
export function seedSingleSlotBaselineIfEmpty<T>(slot: SingleSlotPending<T>, baseline: T): void {
  if (slot.value == null) slot.value = baseline;
}

/**
 * 提交时：若有 pending 基线则取出并清空；否则用 `getLive()`（例如当前 document 状态）。
 */
export function takeSingleSlotBaselineOrLive<T>(slot: SingleSlotPending<T>, getLive: () => T): T {
  if (slot.value != null) {
    const v = slot.value;
    slot.value = null;
    return v;
  }
  return getLive();
}
