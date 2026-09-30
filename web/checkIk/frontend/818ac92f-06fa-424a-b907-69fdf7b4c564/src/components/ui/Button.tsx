import React from 'react';
import { cx } from '../../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent-left' | 'accent-right';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ComponentType<{className?: string;}>;
}

const variants: Record<Variant, string> = {
  primary:
  'bg-brand text-[#1a0d05] hover:bg-brand-hover border border-transparent font-semibold shadow-[0_1px_0_rgb(255_255_255_/_0.12)_inset]',
  secondary:
  'bg-subtle text-ink border border-line hover:bg-elev hover:border-faint/50',
  ghost: 'bg-transparent text-ink2 border border-transparent hover:bg-subtle hover:text-ink',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
  'accent-left': 'bg-armleft/15 text-armleft border border-armleft/40 hover:bg-armleft/25',
  'accent-right': 'bg-armright/15 text-armright border border-armright/40 hover:bg-armright/25'
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-smooth active:scale-[0.98]',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-base',
        variants[variant],
        className
      )}>
      
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      {children}
    </button>);

}
