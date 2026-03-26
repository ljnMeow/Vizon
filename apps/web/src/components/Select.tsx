import { ReactNode } from 'react';

export type SelectOption<T extends string = string> = {
  value: T;
  label: ReactNode;
};

export type SelectProps<T extends string = string> = {
  value: T | '';
  onChange: (next: T | '') => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = '',
  ariaLabel
}: SelectProps<T>) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T | '')}
      aria-label={ariaLabel}
      className={[
        'w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none',
        'transition-colors',
        'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
        'disabled:opacity-50',
        className
      ].join(' ')}
    >
      {placeholder ? <option value="" disabled>{placeholder}</option> : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

