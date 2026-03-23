import {
  MutableRefObject,
  ReactNode,
  useEffect,
  useState
} from 'react';

export type GlobalMenuItem = {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

export type GlobalMenuGroup = {
  key: string;
  title?: ReactNode;
  items: GlobalMenuItem[];
  /** 是否在组内 items 之间展示分割线（默认 true） */
  itemDividers?: boolean;
};

interface GlobalMenuProps {
  open: boolean;
  /** 容器元素，用于 click-outside 判断（一般是包裹 button+menu 的 div） */
  containerRef: MutableRefObject<HTMLElement | null>;
  onRequestClose: () => void;
  groups: GlobalMenuGroup[];
  align?: 'right' | 'left';
  topOffsetClassName?: string; // 默认 top-10，可按不同导航高度复用
  ariaLabel?: string;
}

/**
 * 全局可复用的下拉菜单容器：
 * - 只负责：定位、主题兼容样式、click-outside 关闭、分组渲染
 * - 不包含触发按钮（由父级自行实现）
 */
export function GlobalMenu({
  open,
  containerRef,
  onRequestClose,
  groups,
  align = 'right',
  topOffsetClassName = 'top-10',
  ariaLabel = 'menu'
}: GlobalMenuProps) {
  const [visible, setVisible] = useState(open);
  const [leaving, setLeaving] = useState(false);

  /**
   * 根据 `open` 控制内部可见性与离场动画状态。
   */
  useEffect(() => {
    if (open) {
      setVisible(true);
      setLeaving(false);
      return;
    }

    if (!visible) return;

    setLeaving(true);
    const t = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
    }, 160);

    return () => window.clearTimeout(t);
  }, [open, visible]);

  /**
   * 监听全局点击事件，实现点击触发元素区域外自动关闭。
   */
  useEffect(() => {
    if (!visible) return;
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        onRequestClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible, containerRef, onRequestClose]);

  if (!visible) return null;

  const alignClass = align === 'right' ? 'right-0' : 'left-0';
  const animateClass = leaving
    ? 'motion-safe:animate-[vizonMenuOut_160ms_ease-in] motion-reduce:animate-none'
    : 'motion-safe:animate-[vizonMenuIn_160ms_ease-out] motion-reduce:animate-none';

  return (
    <div
      role="menu"
      aria-label={ariaLabel}
      className={[
        'absolute',
        alignClass,
        topOffsetClassName,
        'w-44 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)] shadow-2xl',
        'origin-top-right',
        animateClass,
        'z-[2147483647]'
      ].join(' ')}
    >

      {groups.map((group, groupIdx) => (
        <div key={group.key}>
          {group.title ? (
            <>
              <div className="px-4 py-2 text-[12px] font-semibold tracking-wide text-[var(--text-muted)] text-blol">
                {group.title}
              </div>
              <div className="h-px bg-[var(--border-subtle)]" />
            </>
          ) : null}

          {group.items.map((item, itemIdx) => {
            const disabled = !!item.disabled;
            const showItemDividers = group.itemDividers !== false;
            return (
              <div key={item.key}>
                <button
                  type="button"
                  disabled={disabled}
                  role="menuitem"
                  onClick={() => {
                    if (disabled) return;
                    item.onClick?.();
                  }}
                  className={[
                    'flex w-full items-center px-4 py-3 text-left transition-colors',
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                  ].join(' ')}
                >
                  {item.label}
                </button>
                {showItemDividers && itemIdx < group.items.length - 1 ? (
                  <div className="h-px bg-[var(--border-subtle)]" />
                ) : null}
              </div>
            );
          })}

          {groupIdx < groups.length - 1 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
        </div>
      ))}
    </div>
  );
}

