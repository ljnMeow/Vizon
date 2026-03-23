import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** 触发器包裹层 className（用于控制宽度/布局） */
  triggerClassName?: string;
  /** 延迟显示时间（毫秒） */
  delay?: number;
  /** tooltip 位置：top / bottom / left / right */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** 是否禁用 */
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  triggerClassName,
  delay = 200,
  placement = 'top',
  disabled = false
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [arrowMain, setArrowMain] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    const GAP_INLINE = 8; // 上下方向的间距
    const GAP_SIDE = 4; // 左右方向的间距（离文本近一点）
    const ARROW_SIZE = 6;
    const PADDING = 8;

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    let top = 0;
    let left = 0;
    let arrow = 0;

    // 先按 placement 计算基础位置
    switch (placement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - GAP_INLINE;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        arrow = tooltipRect.width / 2 - ARROW_SIZE;
        break;
      case 'bottom':
        top = triggerRect.bottom + GAP_INLINE;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        arrow = tooltipRect.width / 2 - ARROW_SIZE;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - GAP_SIDE;
        arrow = tooltipRect.height / 2 - ARROW_SIZE;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + GAP_SIDE;
        arrow = tooltipRect.height / 2 - ARROW_SIZE;
        break;
    }

    // 再做 viewport 边界夹紧，避免 tooltip 超出屏幕
    left = clamp(left, PADDING, window.innerWidth - tooltipRect.width - PADDING);
    top = clamp(top, PADDING, window.innerHeight - tooltipRect.height - PADDING);

    // 计算箭头沿着 tooltip 边缘应该指向 trigger 的位置（基于夹紧后的 top/left）
    if (placement === 'top' || placement === 'bottom') {
      const triggerCenterX = triggerRect.left + triggerRect.width / 2;
      arrow = triggerCenterX - left - ARROW_SIZE;
      const maxArrow = Math.max(PADDING, tooltipRect.width - ARROW_SIZE * 2 - PADDING);
      arrow = clamp(arrow, PADDING, maxArrow);
    }

    setPosition({ top, left });
    setArrowMain(arrow);
  }, [placement]);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, updatePosition, content]);

  useEffect(() => {
    if (!visible) return;

    let rafId: number | null = null;

    const onMove = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);

    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [updatePosition, visible]);

  const show = useCallback(() => {
    if (disabled) return;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setVisible(true), delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  if (disabled) return <>{children}</>;

  return (
    <>
      <div
        ref={triggerRef}
        className={['inline-flex', triggerClassName].filter(Boolean).join(' ')}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>

      {visible && typeof document !== 'undefined' ? createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className={[
            'pointer-events-none fixed z-[9999] max-w-xs rounded-md px-2 py-1 text-xs',
            'text-[var(--text-primary)]',
            'border border-[color-mix(in_srgb,var(--border-subtle)_70%,transparent)]',
            'shadow-[0_12px_28px_rgba(0,0,0,0.25)]',
            'backdrop-blur-sm'
          ].join(' ')}
          style={{
            top: position.top,
            left: position.left,
            animation: 'vizonTooltipFadeIn 100ms ease-out forwards',
            // 让 tooltip 在 light/dark 下都比背景更“浮起来”一点
            backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 90%, var(--text-primary) 10%)',
            // 供箭头复用
            ['--vizon-tooltip-bg' as any]:
              'color-mix(in srgb, var(--bg-elevated) 90%, var(--text-primary) 10%)'
          }}
        >
          {content}

          {/* 箭头 - 始终指向触发元素 */}
          <span
            className="absolute block h-0 w-0"
            style={{
              ...(placement === 'top' && {
                bottom: -6,
                left: arrowMain,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid var(--vizon-tooltip-bg)'
              }),
              ...(placement === 'bottom' && {
                top: -6,
                left: arrowMain,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '6px solid var(--vizon-tooltip-bg)'
              }),
              ...(placement === 'left' && {
                right: -6,
                top: arrowMain,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderLeft: '6px solid var(--vizon-tooltip-bg)'
              }),
              ...(placement === 'right' && {
                left: -6,
                top: arrowMain,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: '6px solid var(--vizon-tooltip-bg)'
              })
            }}
          />
        </div>,
        document.body
      ) : null}
    </>
  );
}
