export type EditorHistoryOperation = {
  name: string;
  do: () => void | Promise<void>;
  undo: () => void | Promise<void>;
  redo?: () => void | Promise<void>;
  /** 相同 mergeKey 且在窗口期内时，会覆盖上一条记录以减少高频噪音 */
  mergeKey?: string;
  mergeWindowMs?: number;
};

export type EditorHistoryRecord = {
  id: string;
  name: string;
  timestamp: number;
};

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class HistoryManager {
  private undoStack: Array<{ record: EditorHistoryRecord; operation: EditorHistoryOperation }> = [];
  private redoStack: Array<{ record: EditorHistoryRecord; operation: EditorHistoryOperation }> = [];
  private maxEntries: number;

  constructor(maxEntries = 30) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  getRecords() {
    return this.undoStack.map((x) => x.record).slice().reverse();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  async execute(operation: EditorHistoryOperation) {
    await operation.do();
    const record: EditorHistoryRecord = {
      id: createId(),
      name: operation.name,
      timestamp: Date.now()
    };
    const top = this.undoStack[this.undoStack.length - 1];
    const mergeWindow = operation.mergeWindowMs ?? 280;
    if (
      operation.mergeKey &&
      top?.operation.mergeKey &&
      top.operation.mergeKey === operation.mergeKey &&
      record.timestamp - top.record.timestamp <= mergeWindow
    ) {
      this.undoStack[this.undoStack.length - 1] = { record, operation };
      this.redoStack = [];
      return;
    }
    this.undoStack.push({ record, operation });
    this.redoStack = [];
    this.trimIfNeeded();
  }

  async undo() {
    const item = this.undoStack.pop();
    if (!item) return false;
    await item.operation.undo();
    this.redoStack.push(item);
    return true;
  }

  async redo() {
    const item = this.redoStack.pop();
    if (!item) return false;
    const redoImpl = item.operation.redo ?? item.operation.do;
    await redoImpl();
    this.undoStack.push(item);
    return true;
  }

  private trimIfNeeded() {
    if (this.undoStack.length <= this.maxEntries) return;
    const overflow = this.undoStack.length - this.maxEntries;
    this.undoStack.splice(0, overflow);
  }
}
