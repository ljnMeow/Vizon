type Edge = 'left' | 'right';
type ArrowDirection = 'left' | 'right';

/**
 * 三栏布局左右侧折叠把手：
 * - 根据 edge/arrowDirection 渲染对应的箭头指示
 * - 用于控制左/右侧面板的展开与收起
 */
export function PaneHandle({
  edge,
  arrowDirection,
  onClick,
  ariaLabel
}: {
  edge: Edge;
  arrowDirection: ArrowDirection;
  onClick: () => void;
  ariaLabel: string;
}) {
  const isLeft = edge === 'left';
  const arrowLeft = arrowDirection === 'left';

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={[
        'group absolute inset-y-0 z-20 w-4 cursor-pointer select-none overflow-hidden',
        'hover:w-6 hover:bg-[rgba(255,255,255,0.02)]',
        'flex items-center justify-center',
        'transition-all duration-200 ease-out',
        isLeft ? 'left-0' : 'right-0'
      ].join(' ')}
    >
      {/* 竖线：默认显示；hover 时淡出，形成"变成箭头"的感觉 */}
      <span className="h-16 w-[2px] rounded-full bg-[var(--border-strong)] opacity-70 transition-opacity duration-200 ease-out group-hover:opacity-0" />

      {/* 悬停提示箭头：默认隐藏；hover 时淡入（与竖线的淡出叠加即"变形"效果） */}
      <span
        className={[
          'pointer-events-none absolute inset-0 flex items-center justify-center',
          'opacity-0 scale-95',
          'transition-transform duration-200 ease-out',
          'group-hover:opacity-100 group-hover:scale-100'
        ].join(' ')}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d={arrowLeft ? 'M10 6L16 12L10 18' : 'M14 6L8 12L14 18'}
            stroke="var(--text-muted)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
