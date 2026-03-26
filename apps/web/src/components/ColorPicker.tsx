export type ColorPickerProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  showValue?: boolean;
};

export function ColorPicker({
  value,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
  showValue = false
}: ColorPickerProps) {
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
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}

