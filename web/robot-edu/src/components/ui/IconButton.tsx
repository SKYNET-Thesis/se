import React from 'react';
import { cn } from '../../utils/cn';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
{ label, size = 'md', className, children, type = 'button', ...rest },
ref)
{
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-ink-muted transition-[background-color,color] duration-150 hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7 [&_svg]:h-3.5 [&_svg]:w-3.5' : 'h-8 w-8 [&_svg]:h-4 [&_svg]:w-4',
        className
      )}
      {...rest}>
      
      {children}
    </button>);

});