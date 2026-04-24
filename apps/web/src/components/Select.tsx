/*
 * @Author: ChrisLam linjinnan1998@sina.com
 * @Date: 2026-03-20 11:55:23
 * @LastEditors: ChrisLam linjinnan1998@sina.com
 * @LastEditTime: 2026-04-24 17:15:15
 * @FilePath: /Vizon/apps/web/src/components/Select.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { ReactNode } from 'react';

/** 下拉选项条目。 */
export type SelectOption<T extends string = string> = {
  /** 选项值（也作为列表 key）。 */
  value: T;
  /** 展示文案，支持 ReactNode。 */
  label: ReactNode;
};

/** Select 组件属性。 */
export type SelectProps<T extends string = string> = {
  /** 当前选中值。 */
  value: T | '';
  /** 选中变化回调。 */
  onChange: (next: T | '') => void;
  options: SelectOption<T>[];
  /** 未选择时展示的占位符选项（禁用，不可选）。 */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 无障碍标签。 */
  ariaLabel?: string;
};

/**
 * 通用下拉选择组件：
 * - 基于原生 `<select>` 实现，样式通过 CSS 变量适配深浅色主题
 * - 支持占位符选项与禁用状态
 */
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

