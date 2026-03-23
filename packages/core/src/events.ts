/**
 * 极小事件总线（Emitter）：用于 core 内部解耦模块与 UI 层。
 *
 * 设计原则：
 * - 不引入 Rx/Redux 等重量依赖
 * - 通过类型参数约束事件表（避免 payload 写错）
 * - unsubscribe 能力让上层在卸载时清理监听，降低内存泄漏风险
 */
export type Unsubscribe = () => void;

export class Emitter<TEvents extends Record<string, any>> {
  private listeners = new Map<keyof TEvents, Set<(payload: any) => void>>();

  /**
   * 订阅事件。
   * @returns 取消订阅函数（调用后会从监听集合中移除）。
   */
  on<TKey extends keyof TEvents>(type: TKey, cb: (payload: TEvents[TKey]) => void): Unsubscribe {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb as any);
    this.listeners.set(type, set);
    return () => {
      set.delete(cb as any);
      if (set.size === 0) this.listeners.delete(type);
    };
  }

  /**
   * 触发事件。payload 类型由事件表约束（TEvents）。
   */
  emit<TKey extends keyof TEvents>(type: TKey, payload: TEvents[TKey]) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const cb of set) (cb as any)(payload);
  }

  /**
   * 清空所有监听器（通常在 ThreeEditor.dispose 时调用）。
   */
  clear() {
    this.listeners.clear();
  }
}

