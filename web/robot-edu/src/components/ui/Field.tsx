import React, { useId } from 'react';
import { cn } from '../../utils/cn';

export const inputClasses =
'block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle ' +
'transition-[border-color,box-shadow] duration-150 ease-out focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
'disabled:bg-sunken disabled:text-ink-subtle aria-[invalid=true]:border-danger';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: {id: string;'aria-invalid': boolean;'aria-describedby'?: string;}) => React.ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ?
      <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p> :
      hint ?
      <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p> :
      null}
    </div>);

}