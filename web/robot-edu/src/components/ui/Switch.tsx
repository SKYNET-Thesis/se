import React from 'react';
import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}

export function Switch({ checked, onChange, label, description, id }: SwitchProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={id ? `${id}-label` : undefined} className="text-[13px] font-medium text-ink">
          {label}
        </p>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150', checked ? 'bg-accent' : 'bg-line-strong')}>
        
        <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-hairline transition-transform duration-150 ease-out', checked && 'translate-x-4')} />
      </button>
    </div>);

}