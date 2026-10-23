import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const classes = ['gat-btn', `gat-btn--${variant}`];
  if (size === 'sm') classes.push('gat-btn--sm');
  if (className) classes.push(className);
  return <button type={type} className={classes.join(' ')} {...rest} />;
}
