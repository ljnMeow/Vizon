import { ReactNode, useRef, useEffect, useState, useCallback } from 'react';
import { Tooltip } from './Tooltip';

export type TabItem<T extends string = string> = {
  key: T;
  label: ReactNode;
};

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  children: (key: T) => ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * 内容区是否允许纵向滚动。
   * - true: Tabs 自身内容区滚动（默认）
   * - false: 内容区不滚动（由业务侧在 children 内部自行决定滚动容器）
   * @default true
   */
  contentScrollable?: boolean;
  /** 是否在 tab 上展示 tooltip（默认展示） */
  showTooltip?: boolean;
  /**
   * 是否保持各 tab 内容常驻（切换不卸载，内部 state 不丢）
   * @default false
   */
  keepAlive?: boolean;
  /**
   * Tab 栏方向：horizontal（横向）或 vertical（纵向）
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * 通用 Tabs 组件：
 * - 横向 Tab 栏 + 内容区
 * - 支持横向滚动（tab 多时自动滚动）
 * - 支持滑动指示器动画
 * - 支持内容区淡入动画
 */
export function Tabs<T extends string = string>({
  tabs,
  activeKey,
  onChange,
  children,
  className = '',
  contentClassName = '',
  contentScrollable = true,
  showTooltip = true,
  keepAlive = false,
  orientation = 'horizontal'
}: TabsProps<T>) {
  const activeIndex = tabs.findIndex((t) => t.key === activeKey);
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const hasTabs = tabs.length > 0;
  const isVertical = orientation === 'vertical';
  // 当内容区不滚动时，为了保证 nav 的 sticky 一定生效，
  // 让 Tabs 根容器成为滚动容器（避免外层滚动导致 sticky 失效）。
  const rootScrollable = !contentScrollable;

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const navRef = useRef<HTMLElement | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, top: 0, height: 0 });

  // 拖拽滚动状态
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const scrollLeftStart = useRef(0);
  const scrollTopStart = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!navRef.current) return;
    isDragging.current = true;
    if (isVertical) {
      startY.current = e.pageY - navRef.current.offsetTop;
      scrollTopStart.current = navRef.current.scrollTop;
    } else {
      startX.current = e.pageX - navRef.current.offsetLeft;
      scrollLeftStart.current = navRef.current.scrollLeft;
    }
    navRef.current.style.cursor = 'grabbing';
  }, [isVertical]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !navRef.current) return;
    e.preventDefault();
    if (isVertical) {
      const y = e.pageY - navRef.current.offsetTop;
      const walk = (y - startY.current) * 1.5;
      navRef.current.scrollTop = scrollTopStart.current - walk;
    } else {
      const x = e.pageX - navRef.current.offsetLeft;
      const walk = (x - startX.current) * 1.5;
      navRef.current.scrollLeft = scrollLeftStart.current - walk;
    }
  }, [isVertical]);

  const handleMouseUp = useCallback(() => {
    if (!navRef.current) return;
    isDragging.current = false;
    navRef.current.style.cursor = 'grab';
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (nav) {
      nav.style.cursor = 'grab';
    }
    return () => {
      if (nav) {
        nav.style.cursor = '';
      }
    };
  }, []);

  useEffect(() => {
    if (hasTabs && tabRefs.current[safeActiveIndex]) {
      const activeTab = tabRefs.current[safeActiveIndex];
      if (activeTab) {
        if (isVertical) {
          setIndicatorStyle({
            left: 0,
            width: 2,
            top: activeTab.offsetTop,
            height: activeTab.offsetHeight
          });
        } else {
          setIndicatorStyle({
            left: activeTab.offsetLeft,
            width: activeTab.offsetWidth,
            top: 0,
            height: 0
          });
        }
        // 自动滚动到选中的 tab
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [safeActiveIndex, hasTabs, tabs, isVertical]);

  return (
    <div
      className={[
        'relative flex min-h-0 min-w-0 h-full',
        isVertical ? 'flex-row' : 'flex-col',
        rootScrollable ? 'overflow-y-auto' : '',
        className
      ].join(' ')}
    >
      {/* Tab 栏 */}
      <nav
        ref={navRef}
        className={[
          'relative flex min-w-0 scrollbar-hide select-none',
          // 让 nav 在滚动容器内保持“悬浮固定”（横向/纵向都适用）。
          // 兼容两种滚动策略：
          // - Tabs 自身内容区滚动：nav 本就不滚
          // - 业务侧外层滚动：sticky 生效，nav 不会被内容带走
          'sticky top-0 z-20 shrink-0',
          isVertical
            ? 'w-20 flex-col overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30'
            : 'overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30'
        ].join(' ')}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {tabs.map((tab, index) => (
          showTooltip ? (
            <Tooltip key={tab.key} content={tab.label} placement={isVertical ? 'right' : 'top'}>
              <button
                ref={(el) => { tabRefs.current[index] = el; }}
                type="button"
                onClick={() => onChange(tab.key)}
                className={[
                  'relative z-10 shrink-0 px-3 py-2 text-xs',
                  'transition-colors duration-150',
                  isVertical ? 'w-full text-left truncate' : 'whitespace-nowrap',
                  activeKey === tab.key
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                ].join(' ')}
              >
                {tab.label}
              </button>
            </Tooltip>
          ) : (
            <button
              key={tab.key}
              ref={(el) => { tabRefs.current[index] = el; }}
              type="button"
              onClick={() => onChange(tab.key)}
              className={[
                'relative z-10 shrink-0 px-3 py-2 text-xs',
                'transition-colors duration-150',
                isVertical ? 'w-full text-left truncate' : 'whitespace-nowrap',
                activeKey === tab.key
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              ].join(' ')}
            >
              {tab.label}
            </button>
          )
        ))}

        {/* Tab 指示器滑动动画 */}
        {hasTabs ? (
          <span
            className={[
              'absolute bg-[var(--accent)] transition-all duration-200 ease-out',
              isVertical ? 'left-0 w-[2px]' : 'bottom-0 h-[2px]'
            ].join(' ')}
            style={isVertical ? {
              top: indicatorStyle.top,
              height: indicatorStyle.height
            } : {
              left: indicatorStyle.left,
              width: indicatorStyle.width
            }}
          />
        ) : null}
      </nav>

      {/* Tab 内容区（带淡入动画） */}
      <div
        className={[
          'relative flex-1 min-h-0',
          contentScrollable ? 'overflow-y-auto' : 'overflow-visible',
          contentClassName
        ].join(' ')}
      >
        {keepAlive ? (
          <div className="relative min-h-0 h-full">
            {tabs.map((tab) => {
              const active = tab.key === activeKey;
              return (
                <div
                  key={tab.key}
                  className="min-h-0 h-full"
                  style={{
                    display: active ? 'block' : 'none',
                    animation: active ? 'vizonTabsFadeIn 150ms ease-out forwards' : undefined
                  }}
                >
                  {children(tab.key)}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            key={activeKey}
            className="min-h-0 h-full"
            style={{ animation: 'vizonTabsFadeIn 150ms ease-out forwards' }}
          >
            {children(activeKey)}
          </div>
        )}
      </div>
    </div>
  );
}
