/**
 * **撤销 / 重做栈**（`HistoryManager`）
 *
 * 维护 undo/redo 双栈、最大条数裁剪、以及基于 `mergeKey` + `mergeWindowMs` 的连续操作合并（减少滑条等高频噪音）。
 * `ThreeEditor` 通过 `executeHistoryOperation` → `executeWithHistoryNotify` 调用；**不**依赖 React。
 */

/**
 * 单条历史操作的定义。
 * - do: 执行操作
 * - undo: 撤销操作
 * - redo: 重做操作（可选，未提供时回退到 do）
 */
export type EditorHistoryOperation = {
  /** 用于在历史面板展示的人类可读名称 */
  name: string;
  /** 执行当前操作 */
  do: () => void | Promise<void>;
  /** 撤销当前操作 */
  undo: () => void | Promise<void>;
  /** 重做当前操作（可选） */
  redo?: () => void | Promise<void>;
  /** 相同 mergeKey 且在窗口期内时，会覆盖上一条记录以减少高频噪音 */
  mergeKey?: string;
  /** 合并窗口时长（毫秒），默认 280ms */
  mergeWindowMs?: number;
};

/**
 * 历史记录元信息（用于展示与追踪）。
 */
export type EditorHistoryRecord = {
  /** 记录唯一 ID */
  id: string;
  /** 操作名称 */
  name: string;
  /** 创建时间戳（毫秒） */
  timestamp: number;
};

/**
 * 生成一个轻量级唯一 ID（时间戳 + 随机串）。
 */
function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 编辑器历史管理器。
 * 维护 undo/redo 双栈，并控制最大历史条数。
 */
export class HistoryManager {
  /** 撤销栈：栈顶为最近一次已执行的操作 */
  private undoStack: Array<{ record: EditorHistoryRecord; operation: EditorHistoryOperation }> = [];
  /** 重做栈：栈顶为最近一次被撤销、可被重做的操作 */
  private redoStack: Array<{ record: EditorHistoryRecord; operation: EditorHistoryOperation }> = [];
  /** 历史最大保留条数 */
  private maxEntries: number;

  /**
   * @param maxEntries 最大历史条数，最小强制为 1
   */
  constructor(maxEntries = 30) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  /** 是否存在可撤销操作 */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /** 是否存在可重做操作 */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * 获取历史记录列表（按“新 -> 旧”顺序返回）。
   */
  getRecords() {
    return this.undoStack.map((x) => x.record).slice().reverse();
  }

  /** 清空撤销栈与重做栈 */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * 执行操作并写入历史。
   * 当满足 mergeKey + mergeWindow 条件时，会用新记录覆盖上一条，避免高频操作产生过多历史噪音。
   */
  async execute(operation: EditorHistoryOperation) {
    // 先执行真正的业务操作
    await operation.do();

    // 为本次操作创建历史记录元信息
    const record: EditorHistoryRecord = {
      id: createId(),
      name: operation.name,
      timestamp: Date.now()
    };

    // 读取当前撤销栈栈顶，用于判断是否可与上一条合并
    const top = this.undoStack[this.undoStack.length - 1];
    const mergeWindow = operation.mergeWindowMs ?? 280;

    // 合并条件：双方都声明 mergeKey、key 相同、且发生在窗口期内
    if (
      operation.mergeKey &&
      top?.operation.mergeKey &&
      top.operation.mergeKey === operation.mergeKey &&
      record.timestamp - top.record.timestamp <= mergeWindow
    ) {
      // 覆盖上一条历史，保留“最近状态”
      this.undoStack[this.undoStack.length - 1] = { record, operation };
      // 一旦有新执行，重做栈必须失效
      this.redoStack = [];
      return;
    }

    // 常规入栈
    this.undoStack.push({ record, operation });
    // 一旦有新执行，重做栈必须清空
    this.redoStack = [];
    // 控制历史上限
    this.trimIfNeeded();
  }

  /**
   * 撤销：弹出 undo 栈顶，执行其 undo，并压入 redo 栈。
   * @returns 是否撤销成功（无可撤销项时返回 false）
   */
  async undo() {
    const item = this.undoStack.pop();
    if (!item) return false;
    await item.operation.undo();
    this.redoStack.push(item);
    return true;
  }

  /**
   * 重做：弹出 redo 栈顶并执行。
   * 若 operation.redo 未提供，则回退使用 operation.do。
   * @returns 是否重做成功（无可重做项时返回 false）
   */
  async redo() {
    const item = this.redoStack.pop();
    if (!item) return false;
    const redoImpl = item.operation.redo ?? item.operation.do;
    await redoImpl();
    this.undoStack.push(item);
    return true;
  }

  /**
   * 当撤销栈超过上限时，从最旧记录开始裁剪。
   */
  private trimIfNeeded() {
    if (this.undoStack.length <= this.maxEntries) return;
    const overflow = this.undoStack.length - this.maxEntries;
    this.undoStack.splice(0, overflow);
  }
}
