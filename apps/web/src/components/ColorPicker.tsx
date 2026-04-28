import { useEffect, useRef } from 'react';

/** 颜色拾取器属性。 */
export type ColorPickerProps = {
  /** 当前颜色值（CSS color 字符串，如 `#ff0000`）。 */
  value: string;
  /** 颜色变化回调，参数为新的颜色值。 */
  onChange: (next: string) => void;
  /** 颜色提交回调，通常用于只记录最终历史。 */
  onCommit?: (next: string) => void;
  /** 是否禁用。 */
  disabled?: boolean;
  className?: string;
  /** 无障碍标签。 */
  ariaLabel?: string;
  /** 是否在色块旁展示十六进制色值文本。 */
  showValue?: boolean;
};

/**
 * 颜色选择器：
 * - 使用原生 `<input type="color">` 实现，保证跨平台一致性
 * - 色块展示覆盖在输入框上方，`opacity-0` 隐藏原生控件，实现自定义外观
 */
export function ColorPicker({
  value,
  onChange,
  onCommit,
  disabled = false,
  className = '',
  ariaLabel,
  showValue = false
}: ColorPickerProps) {
  const latestValueRef = useRef(value);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const commitLatest = () => {
    if (!onCommit) return;
    onCommit(latestValueRef.current);
  };

  return (
    <div
      className={[
        'relative inline-flex items-center gap-2 rounded-md border border-[var(--border-subtle)]',
        'bg-[var(--bg-input)] px-1.5 py-1',
        'transition-colors',
        disabled ? 'opacity-50' : 'hover:border-[var(--border-strong)]',
        className
      ].join(' ')}
    >
      <span
        className="h-4 w-4 rounded-md border border-white/25 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
        style={{ background: value }}
        aria-hidden="true"
      />
      {showValue ? (
        <span className="min-w-[58px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
          {value}
        </span>
      ) : null}

      <input
        type="color"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          latestValueRef.current = next;
          onChange(next);
        }}
        onBlur={commitLatest}
        onPointerUp={commitLatest}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') commitLatest();
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}

