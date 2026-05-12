/**
 * **`HistoryManager.execute` + UI 通知**：封装「先入栈再 `historyChange`」顺序，避免门面漏发事件。
 */
import type { HistoryManager } from '../HistoryManager';
import type { EditorHistoryOperation } from '../HistoryManager';

/**
 * 执行历史并通知监听方（例如 `ThreeEditor.emitHistoryChange`）。
 * 保证 undo/redo 栈与 UI 订阅的触发点一致。
 */
export async function executeWithHistoryNotify(
  history: HistoryManager,
  operation: EditorHistoryOperation,
  notifyHistoryChange: () => void
): Promise<void> {
  await history.execute(operation);
  notifyHistoryChange();
}
