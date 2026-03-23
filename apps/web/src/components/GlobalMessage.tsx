import React, {
  Fragment,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

type MessageType = 'success' | 'info' | 'warning' | 'error' | 'loading';

type ShowOptions = {
  type: MessageType;
  text: string;
  durationMs?: number;
  blockInteraction?: boolean;
};

type MessageItem = {
  id: string;
  type: MessageType;
  text: string;
  blockInteraction: boolean;
  leaving: boolean;
};

type ShowResult = {
  id: string;
  done: Promise<void>;
};

type Controller = {
  show(opts: ShowOptions): ShowResult;
  hide(id?: string): void;
};

let controller: Controller | null = null;

type MessageConfig = {
  durationsMs: {
    success: number;
    info: number;
    warning: number;
    error: number;
  };
};

const messageConfig: MessageConfig = {
  durationsMs: {
    success: 1000,
    info: 1000,
    warning: 1000,
    error: 1000
  }
};

export type MessageLoadingHandle = {
  id: string;
  done: Promise<void>;
  hide: () => void;
};

/**
 * 全局消息提示入口：
 * - 支持 success / info / warning / error / loading 五种类型
 * - 默认由 `GlobalMessageProvider` 提供实现
 */
export const message = {
  config(next: Partial<MessageConfig>) {
    if (next.durationsMs) {
      messageConfig.durationsMs = {
        ...messageConfig.durationsMs,
        ...next.durationsMs
      };
    }
  },
  success(text: string, opts?: { durationMs?: number }): Promise<void> {
    return (
      controller?.show({
        type: 'success',
        text,
        durationMs: opts?.durationMs ?? messageConfig.durationsMs.success,
        blockInteraction: false
      }).done ?? Promise.resolve()
    );
  },
  info(text: string, opts?: { durationMs?: number }): Promise<void> {
    return (
      controller?.show({
        type: 'info',
        text,
        durationMs: opts?.durationMs ?? messageConfig.durationsMs.info,
        blockInteraction: false
      }).done ?? Promise.resolve()
    );
  },
  warning(text: string, opts?: { durationMs?: number }): Promise<void> {
    return (
      controller?.show({
        type: 'warning',
        text,
        durationMs: opts?.durationMs ?? messageConfig.durationsMs.warning,
        blockInteraction: false
      }).done ?? Promise.resolve()
    );
  },
  error(text: string, opts?: { durationMs?: number }): Promise<void> {
    return (
      controller?.show({
        type: 'error',
        text,
        durationMs: opts?.durationMs ?? messageConfig.durationsMs.error,
        blockInteraction: false
      }).done ?? Promise.resolve()
    );
  },
  loading(text = '加载中...', opts?: { blockInteraction?: boolean }): MessageLoadingHandle {
    const r =
      controller?.show({
        type: 'loading',
        text,
        durationMs: undefined,
        blockInteraction: opts?.blockInteraction ?? true
      }) ?? { id: 'noop', done: Promise.resolve() };

    return {
      id: r.id,
      done: r.done,
      hide: () => controller?.hide(r.id)
    };
  },
  hide(): void {
    controller?.hide();
  }
};

function Icon({ type }: { type: MessageType }) {
  if (type === 'loading') {
    return (
      <span
        className="h-3.5 w-3.5 rounded-full border-2 border-[rgba(255,255,255,0.22)] border-t-[var(--accent)] animate-spin"
        aria-hidden="true"
      />
    );
  }

  const common = 'h-3.5 w-3.5';
  const stroke =
    type === 'success'
      ? '#22c55e'
      : type === 'warning'
      ? '#f59e0b'
      : type === 'error'
      ? '#ef4444'
      : '#3b82f6';

  const path =
    type === 'success'
      ? 'M20 6L9 17l-5-5'
      : type === 'warning'
      ? 'M12 9v4m0 4h.01M10.29 3.86l-8.5 15A2 2 0 0 0 3.5 22h17a2 2 0 0 0 1.71-3.14l-8.5-15a2 2 0 0 0-3.42 0Z'
      : type === 'error'
      ? 'M18 6 6 18M6 6l12 12'
      : 'M12 8h.01M11 12h1v4h1';

  const viewBox = '0 0 24 24';
  const fill = 'none';

  return (
    <svg viewBox={viewBox} className={common} fill={fill} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={path} stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface GlobalMessageProviderProps {
  children: ReactNode;
}

export function GlobalMessageProvider({ children }: GlobalMessageProviderProps) {
  const [items, setItems] = useState<MessageItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const leaveTimersRef = useRef<Map<string, number>>(new Map());
  const resolversRef = useRef<Map<string, () => void>>(new Map());
  const seqRef = useRef(0);

  const clearTimerFor = (id: string) => {
    const t = timersRef.current.get(id);
    if (t) window.clearTimeout(t);
    timersRef.current.delete(id);
  };

  const scheduleRemove = (id: string) => {
    const existing = leaveTimersRef.current.get(id);
    if (existing) window.clearTimeout(existing);

    const t = window.setTimeout(() => {
      setItems((prev) => prev.filter((m) => m.id !== id));
      leaveTimersRef.current.delete(id);
      const resolve = resolversRef.current.get(id);
      if (resolve) {
        resolversRef.current.delete(id);
        resolve();
      }
    }, 170);

    leaveTimersRef.current.set(id, t);
  };

  const beginLeave = (id: string) => {
    setItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, leaving: true } : m))
    );
    scheduleRemove(id);
  };

  const api = useMemo<Controller>(
    () => ({
      show({ type, text, durationMs, blockInteraction }: ShowOptions): ShowResult {
        const id = `${Date.now()}_${seqRef.current++}`;

        let resolveDone: () => void = () => undefined;
        const done = new Promise<void>((resolve) => {
          resolveDone = resolve;
        });
        resolversRef.current.set(id, resolveDone);

        const item: MessageItem = {
          id,
          type,
          text,
          blockInteraction: blockInteraction ?? type === 'loading',
          leaving: false
        };

        setItems((prev) => [...prev, item]);

        if (durationMs && durationMs > 0 && type !== 'loading') {
          const t = window.setTimeout(() => {
            timersRef.current.delete(id);
            beginLeave(id);
          }, durationMs);
          timersRef.current.set(id, t);
        }

        return { id, done };
      },

      hide(id?: string) {
        if (id) {
          clearTimerFor(id);
          beginLeave(id);
          return;
        }

        // 关闭所有消息（历史行为；常用于“一把清掉”）
        for (const t of timersRef.current.values()) window.clearTimeout(t);
        timersRef.current.clear();

        setItems((prev) => {
          for (const m of prev) scheduleRemove(m.id);
          return prev.map((m) => ({ ...m, leaving: true }));
        });
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    controller = api;
    return () => {
      if (controller === api) controller = null;
    };
  }, [api]);

  useEffect(
    () => () => {
      // 清理所有计时器与未完成的 Promise
      for (const t of timersRef.current.values()) {
        window.clearTimeout(t);
      }
      timersRef.current.clear();

      for (const t of leaveTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      leaveTimersRef.current.clear();

      for (const resolve of resolversRef.current.values()) {
        resolve();
      }
      resolversRef.current.clear();
    },
    []
  );

  const shouldBlock = items.some((m) => m.blockInteraction && !m.leaving);

  return (
    <Fragment>
      {children}
      {typeof document !== 'undefined' && items.length
        ? createPortal(
            <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 2147483647 }}>
              {shouldBlock ? (
                <div className="absolute inset-0 pointer-events-auto" aria-hidden="true" />
              ) : null}
              <div className="pointer-events-none absolute left-1/2 top-2 w-[min(360px,calc(100vw-20px))] -translate-x-1/2">
                <div className="pointer-events-auto flex flex-col gap-2">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      role="status"
                      aria-live="polite"
                      aria-busy={m.type === 'loading'}
                      className={[
                        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 backdrop-blur',
                        'border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)]',
                        'shadow-[0_10px_30px_rgba(0,0,0,0.45),0_0_0_1px_rgba(59,130,246,0.20)]',
                        'bg-[var(--bg-elevated)]',
                        m.leaving ? 'vizon-message-leave' : 'vizon-message-drop'
                      ].join(' ')}
                    >
                      <Icon type={m.type} />
                      <div className="truncate text-[11px] text-[var(--text-primary)]">{m.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </Fragment>
  );
}

