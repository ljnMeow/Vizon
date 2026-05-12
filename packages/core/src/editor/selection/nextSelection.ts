/**
 * 纯函数：从「上一帧选中集合 + 本次拾取」推导下一帧集合与 Gizmo 附着目标。
 *
 * 与 `ThreeEditor.select` 中的分支保持一致，便于单测与后续把副作用编排迁出门面。
 */
export function computeNextSelectedObjects<T>(
  prevObjects: readonly T[],
  picked: T | null,
  options: { toggle?: boolean }
): T[] {
  const toggle = Boolean(options.toggle);
  if (toggle) {
    if (picked == null) {
      return [...prevObjects];
    }
    const exists = prevObjects.includes(picked);
    return exists ? prevObjects.filter((item) => item !== picked) : [...prevObjects, picked];
  }
  return picked != null ? [picked] : [];
}

export function computeNextPrimary<T>(nextObjects: readonly T[]): T | null {
  return nextObjects.length > 0 ? nextObjects[nextObjects.length - 1]! : null;
}

/**
 * 非 toggle 单选且仅一个对象时，允许拾取路径指定 `targetHandle`（例如点到子 mesh 把手）。
 * 多选 / toggle 路径下始终使用集合中的 primary（最后一个）。
 */
export function computeTransformAttachTarget<T>(
  nextPrimary: T | null,
  nextObjects: readonly T[],
  options?: { toggle?: boolean; targetHandle?: T | null }
): T | null {
  const handle = options?.targetHandle;
  if (!options?.toggle && nextObjects.length === 1 && handle != null) {
    return handle;
  }
  return nextPrimary;
}
