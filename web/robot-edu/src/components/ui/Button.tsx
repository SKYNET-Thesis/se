import React from 'react';
import { Loader2Icon } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md';

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
    'transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-45',
    size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm',
    variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
    variant === 'secondary' && 'border border-line-strong bg-surface text-ink hover:bg-sunken',
    variant === 'ghost' && 'text-ink-muted hover:bg-sunken hover:text-ink',
    variant === 'subtle' && 'bg-sunken text-ink hover:bg-line',
    variant === 'danger' && 'bg-danger text-white hover:bg-danger/90',
    className
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
{ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest },
ref)
{
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonClasses(variant, size, className)} {...rest}>
      {loading ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>);

});