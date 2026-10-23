import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

export function Select({ value, options, onChange, className, ...rest }: SelectProps) {
  return (
    <select
      className={className ? `gat-select ${className}` : 'gat-select'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
