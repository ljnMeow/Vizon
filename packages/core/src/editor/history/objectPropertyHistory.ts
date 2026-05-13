/**
 * **对象点路径属性的历史提交**：封装 `setObjectPropertyByUuid` 的预览 seed、`take` 基线、相等短路、
 * `mergeKey` 与 do/undo 快照；通过 `writeValue` / `executeHistoryOperation` 注入 `ThreeEditor` 行为。
 */
import type { EditorHistoryOperation } from './HistoryManager';

import { seedObjectPropertyPendingBaseline, takeObjectPropertyHistoryBaseline } from './objectPropertyPending';

export type RunObjectPropertyHistoryParams = {
  pending: Map<string, unknown>;
  uuid: string;
  path: string;
  options?: { operationName?: string; recordHistory?: boolean };
  /** 本次调用开始时从对象读出的「当前值」（已按需克隆） */
  before: unknown;
  /** 目标写入值（已按需克隆） */
  after: unknown;
  cloneForHistory: <T>(value: T) => T;
  isHistoryValueEqual: (a: unknown, b: unknown) => boolean;
  /** 未传 `operationName` 时用于生成记录标题 */
  buildDefaultOperationName: () => string;
  writeValue: (value: unknown) => void;
  executeHistoryOperation: (operation: EditorHistoryOperation) => Promise<void>;
};

/**
 * 对象点路径属性的预览写入或历史提交（与 `ThreeEditor.setObjectPropertyByUuid` 语义一致）。
 */
export async function runObjectPropertyHistoryStep(params: RunObjectPropertyHistoryParams): Promise<boolean> {
  const {
    pending,
    uuid,
    path,
    options,
    before,
    after,
    cloneForHistory,
    isHistoryValueEqual,
    buildDefaultOperationName,
    writeValue,
    executeHistoryOperation
  } = params;

  const pendingKey = `${uuid}::${path}`;
  const recordHistory = options?.recordHistory ?? true;

  if (!recordHistory) {
    seedObjectPropertyPendingBaseline(pending, pendingKey, cloneForHistory(before));
    writeValue(cloneForHistory(after));
    return true;
  }

  const historyBefore = takeObjectPropertyHistoryBaseline(pending, pendingKey, before);
  if (isHistoryValueEqual(historyBefore, after)) return true;

  const afterSnapshot = cloneForHistory(after);
  const beforeSnapshot = cloneForHistory(historyBefore);

  await executeHistoryOperation({
    name: options?.operationName ?? buildDefaultOperationName(),
    mergeKey: `object-prop:${uuid}:${path}`,
    mergeWindowMs: 280,
    do: () => {
      writeValue(afterSnapshot);
    },
    undo: () => {
      writeValue(beforeSnapshot);
    }
  });
  return true;
}
