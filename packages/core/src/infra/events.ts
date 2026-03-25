/**
 * 极小事件总线（Emitter）：用于 core 内部向 UI 发布「选中变化 / 场景树变化」等信号。
 *
 * 设计原则：
 * - 不引入 Rx/Redux 等重量依赖，保持包体积小；
 * - 通过泛型 `TEvents` 约束事件名与 payload，减少拼写错误；
 * - 返回 `Unsubscribe` 便于 React `useEffect` 里清理监听，避免泄漏。
 */
/** 调用后从 Emitter 中移除对应回调；可多次调用，第二次起无副作用 */
export type Unsubscribe = () => void;

/**
 * 类型参数 `TEvents`：键为事件名字符串，值为该事件的 payload 类型。
 * 例：`{ select: { object: THREE.Object3D | null } }`。
 */
export class Emitter<TEvents extends Record<string, any>> {
  /** 每个事件类型对应一组回调；用 Set 避免重复注册了难以调试的重复通知（若需可改为允许多次） */
  private listeners = new Map<keyof TEvents, Set<(payload: any) => void>>();

  /**
   * 订阅指定类型事件；同一 (type, cb) 若重复 on 会注册多次（当前由调用方约束）。
   * @param type 事件键，必须存在于 TEvents
   * @param cb 收到 payload 时同步调用
   * @returns 取消订阅函数：从 Set 中 delete 该 cb，若该类型无监听则移除 Map 项
   */
  on<TKey extends keyof TEvents>(type: TKey, cb: (payload: TEvents[TKey]) => void): Unsubscribe {
    const set = this.listeners.get(type) ?? new Set(); // 取已有集合或新建
    set.add(cb as any); // 存入回调；as any：Set 泛型与 TEvents 联合类型推导过严
    this.listeners.set(type, set); // 写回 Map
    return () => {
      // 返回的闭包在组件卸载时执行
      set.delete(cb as any); // 移除此订阅
      if (set.size === 0) this.listeners.delete(type); // 没有监听则删掉该事件键，省内存
    };
  }

  /**
   * 同步广播：按注册顺序遍历回调（Set 迭代顺序即插入顺序）。
   * @param type 要触发的事件类型
   * @param payload 必须符合 TEvents[type]
   */
  emit<TKey extends keyof TEvents>(type: TKey, payload: TEvents[TKey]) {
    const set = this.listeners.get(type); // 无人监听则直接返回
    if (!set) return;
    for (const cb of set) (cb as any)(payload); // 逐个调用；任一回调抛错会中断后续（由上层 try/catch 或保证回调不抛）
  }

  /**
   * 释放所有监听：通常在编辑器 `dispose` 时调用，防止单例 Emitter 长期持有闭包。
   */
  clear() {
    this.listeners.clear();
  }
}
