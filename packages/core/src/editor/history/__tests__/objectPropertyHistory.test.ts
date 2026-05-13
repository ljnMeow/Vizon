/** `runObjectPropertyHistoryStep`。 */
import { describe, expect, it, vi } from 'vitest';

import type { EditorHistoryOperation } from '../HistoryManager';
import { cloneForHistory, isHistoryValueEqual } from '../historyValueUtils';
import { runObjectPropertyHistoryStep } from '../objectPropertyHistory';

describe('runObjectPropertyHistoryStep', () => {
  it('预览模式：写入 pending 基线并应用值', async () => {
    const pending = new Map<string, unknown>();
    const writes: unknown[] = [];
    await runObjectPropertyHistoryStep({
      pending,
      uuid: 'u',
      path: 'position.x',
      options: { recordHistory: false },
      before: 0,
      after: 5,
      cloneForHistory,
      isHistoryValueEqual,
      buildDefaultOperationName: () => '',
      writeValue: (v) => writes.push(v),
      executeHistoryOperation: vi.fn()
    });
    expect(pending.get('u::position.x')).toBe(0);
    expect(writes).toEqual([5]);
  });

  it('提交：相等则不入栈', async () => {
    const exec = vi.fn();
    await runObjectPropertyHistoryStep({
      pending: new Map(),
      uuid: 'u',
      path: 'x',
      options: {},
      before: 1,
      after: 1,
      cloneForHistory,
      isHistoryValueEqual,
      buildDefaultOperationName: () => 'n',
      writeValue: vi.fn(),
      executeHistoryOperation: exec
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('提交：执行历史并带 mergeKey', async () => {
    let captured: EditorHistoryOperation | undefined;
    await runObjectPropertyHistoryStep({
      pending: new Map(),
      uuid: 'id',
      path: 'opacity',
      options: { operationName: 'custom' },
      before: 0.5,
      after: 1,
      cloneForHistory,
      isHistoryValueEqual,
      buildDefaultOperationName: () => 'fallback',
      writeValue: vi.fn(),
      executeHistoryOperation: async (op) => {
        captured = op;
      }
    });
    expect(captured?.name).toBe('custom');
    expect(captured?.mergeKey).toBe('object-prop:id:opacity');
    expect(captured?.mergeWindowMs).toBe(280);
    captured?.do?.();
    captured?.undo?.();
  });

  it('pending 基线在提交后用于 undo 快照', async () => {
    const pending = new Map<string, unknown>();
    pending.set('u::x', 0);
    const writes: unknown[] = [];
    await runObjectPropertyHistoryStep({
      pending,
      uuid: 'u',
      path: 'x',
      options: {},
      before: 99,
      after: 2,
      cloneForHistory,
      isHistoryValueEqual,
      buildDefaultOperationName: () => 'n',
      writeValue: (v) => writes.push(v),
      executeHistoryOperation: async (op) => {
        op.do?.();
        op.undo?.();
      }
    });
    expect(pending.has('u::x')).toBe(false);
    expect(writes).toEqual([2, 0]);
  });
});
