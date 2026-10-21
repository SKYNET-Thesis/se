import React, { useRef } from 'react';
import { cn } from '../../utils/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  tone?: 'danger' | 'warn';
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function Tabs<T extends string>({ items, value, onChange, label, className, size = 'md' }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next].id);
  };
  return (
    <div role="tablist" aria-label={label} className={cn('flex items-end gap-1 border-b border-line', className)}>
      {items.map((item, i) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => refs.current[i] = el}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors duration-150',
              size === 'sm' ? 'px-2 pb-2 pt-2.5 text-[13px]' : 'px-3 pb-2.5 pt-2 text-sm',
              selected ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            )}>
            
            {item.label}
            {item.count !== undefined && item.count > 0 &&
            <span
              className={cn(
                'tabular rounded px-1.5 text-2xs font-semibold',
                item.tone === 'danger' ? 'bg-danger-soft text-danger' : item.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-sunken text-ink-muted'
              )}>
              
                {item.count}
              </span>
            }
          </button>);

      })}
    </div>);

}