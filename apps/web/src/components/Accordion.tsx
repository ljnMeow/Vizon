import { ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type AccordionItem<T extends string = string> = {
  key: T;
  header: ReactNode;
  content: ReactNode;
  disabled?: boolean;
};

export interface AccordionProps<T extends string = string> {
  items: AccordionItem<T>[];
  /** 是否允许同时展开多个（默认 false） */
  allowMultiple?: boolean;
  /** 非受控：默认展开的 key（支持单个或多个） */
  defaultOpenKeys?: T | T[];
  /** 受控：当前展开的 key（支持单个或多个） */
  openKeys?: T | T[];
  /** 受控回调：展开项变化 */
  onOpenKeysChange?: (next: T[]) => void;
  className?: string;
  itemClassName?: string;
}

function normalizeKeys<T extends string>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function Accordion<T extends string = string>({
  items,
  allowMultiple = false,
  defaultOpenKeys,
  openKeys,
  onOpenKeysChange,
  className = '',
  itemClassName = ''
}: AccordionProps<T>) {
  const controlled = openKeys !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState<T[]>(() => normalizeKeys(defaultOpenKeys));

  const openSet = useMemo(() => {
    const keys = controlled ? normalizeKeys(openKeys) : uncontrolledOpen;
    return new Set(keys);
  }, [controlled, openKeys, uncontrolledOpen]);

  const setOpenKeys = useCallback((next: T[]) => {
    onOpenKeysChange?.(next);
    if (!controlled) setUncontrolledOpen(next);
  }, [controlled, onOpenKeysChange]);

  const headerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [panelMaxHeights, setPanelMaxHeights] = useState<number[]>([]);
  const panelMaxHeightsRef = useRef<number[]>([]);

  // 用于监听内容高度变化（例如 Fog 展开后内容变长）
  // 这样可以避免 max-height 只在首次打开时测量导致的“裁切/遮挡”问题
  const contentMeasureRefs = useRef<Array<HTMLDivElement | null>>([]);

  const itemKeysSignature = useMemo(() => items.map((i) => String(i.key)).join('|'), [items]);
  const openKeysSignature = useMemo(() => Array.from(openSet).sort().join('|'), [openSet]);

  useLayoutEffect(() => {
    const measureAll = () => items.map((_, i) => panelRefs.current[i]?.scrollHeight ?? 0);

    const arraysEqual = (a: number[], b: number[]) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    };

    // 初始测量（避免首次展开时 max-height 不准确）
    const initial = measureAll();
    if (!arraysEqual(panelMaxHeightsRef.current, initial)) {
      panelMaxHeightsRef.current = initial;
      setPanelMaxHeights(initial);
    }

    if (typeof MutationObserver === 'undefined') return;

    const indexByEl = new Map<Element, number>();
    contentMeasureRefs.current.forEach((el, i) => {
      if (el) indexByEl.set(el, i);
    });

    const findIndexForNode = (node: Node | null): number | undefined => {
      let cur: Element | null =
        node instanceof Element ? node : node?.parentElement ?? null;
      while (cur) {
        const idx = indexByEl.get(cur);
        if (idx !== undefined) return idx;
        cur = cur.parentElement;
      }
      return undefined;
    };

    let raf = 0;
    const pending = new Set<number>();

    const observer = new MutationObserver((mutationList) => {
      for (const m of mutationList) {
        const idx = findIndexForNode(m.target);
        if (idx === undefined) continue;
        // 只在当前展开面板触发高度更新，减少无意义 setState
        const panelKey = items[idx]?.key;
        if (panelKey && openSet.has(panelKey)) pending.add(idx);
      }

      if (pending.size === 0) return;

      cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const next = panelMaxHeightsRef.current.slice();
        let changed = false;

        for (const idx of pending) {
          const h = panelRefs.current[idx]?.scrollHeight ?? 0;
          if (next[idx] !== h) {
            next[idx] = h;
            changed = true;
          }
        }

        pending.clear();

        if (changed) {
          panelMaxHeightsRef.current = next;
          setPanelMaxHeights(next);
        }
      });
    });

    contentMeasureRefs.current.forEach((el) => {
      if (!el) return;
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [itemKeysSignature, openKeysSignature]);

  useLayoutEffect(() => {
    // 兜底：Accordion 面板打开时，确保该面板高度是准确的
    const next = panelMaxHeightsRef.current.slice();
    let changed = false;

    items.forEach((item, i) => {
      if (!openSet.has(item.key)) return;
      const h = panelRefs.current[i]?.scrollHeight ?? 0;
      if (next[i] !== h) {
        next[i] = h;
        changed = true;
      }
    });

    if (changed) {
      panelMaxHeightsRef.current = next;
      setPanelMaxHeights(next);
    }
  }, [items, openSet]);

  const toggle = useCallback((key: T) => {
    const isOpen = openSet.has(key);
    if (!allowMultiple) {
      setOpenKeys(isOpen ? [] : [key]);
      return;
    }
    const next = new Set(openSet);
    if (isOpen) next.delete(key);
    else next.add(key);
    setOpenKeys(Array.from(next));
  }, [allowMultiple, openSet, setOpenKeys]);

  return (
    <div className={['space-y-2', className].join(' ')}>
      {items.map((item, index) => {
        const expanded = openSet.has(item.key);
        const headerId = `accordion-header-${item.key}`;
        const panelId = `accordion-panel-${item.key}`;

        return (
          <div
            key={item.key}
            className={[
              'rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60',
              'overflow-hidden',
              item.disabled ? 'opacity-60' : '',
              itemClassName
            ].join(' ')}
          >
            <button
              ref={(el) => { headerRefs.current[index] = el; }}
              id={headerId}
              type="button"
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => toggle(item.key)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
                e.preventDefault();
                const max = items.length - 1;
                const nextIndex = (() => {
                  if (e.key === 'ArrowDown') return Math.min(index + 1, max);
                  if (e.key === 'ArrowUp') return Math.max(index - 1, 0);
                  if (e.key === 'Home') return 0;
                  return max;
                })();
                headerRefs.current[nextIndex]?.focus();
              }}
              className={[
                'w-full select-none px-3 py-2 text-left text-sm',
                'flex items-center justify-between gap-3',
                'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                'transition-colors'
              ].join(' ')}
            >
              <span className="min-w-0 flex-1">{item.header}</span>
              <span
                className={[
                  'shrink-0 text-[11px] text-[var(--text-muted)]',
                  'transition-transform duration-150',
                  expanded ? 'rotate-180' : 'rotate-0'
                ].join(' ')}
                aria-hidden="true"
              >
                ▼
              </span>
            </button>

            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              aria-hidden={!expanded}
              ref={(el) => { panelRefs.current[index] = el; }}
              style={{
                // 在首次测量前给展开面板一个较大的 maxHeight，避免测量时被裁切为 0
                maxHeight: expanded ? (panelMaxHeights[index] ?? 10000) : 0,
                opacity: expanded ? 1 : 0,
                transform: expanded ? 'translateY(0)' : 'translateY(-2px)',
                transition: 'max-height 180ms ease, opacity 150ms ease, transform 150ms ease'
              }}
              className="overflow-hidden px-3 pb-3 text-sm text-[var(--text-muted)]"
            >
              <div ref={(el) => { contentMeasureRefs.current[index] = el; }}>
                {item.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

