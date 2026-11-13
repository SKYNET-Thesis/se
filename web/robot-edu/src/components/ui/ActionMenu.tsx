import { MoreHorizontalIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

export type ActionMenuItem =
  | { kind: 'link'; label: string; to: string; icon?: ReactNode }
  | { kind: 'button'; label: string; onSelect: () => void; icon?: ReactNode; disabled?: boolean; tone?: 'default' | 'danger' };

/**
 * Row action menu following the WAI-ARIA menu-button pattern: Enter/Space/ArrowDown opens, Arrow keys/Home/End move,
 * Escape closes and returns focus to the trigger, Tab or an outside click closes.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const entries = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) triggerRef.current?.focus(); };

  useEffect(() => { if (open) entries()[0]?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const list = entries();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') setOpen(false);
  };

  const itemClass = 'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink hover:bg-sunken focus:bg-sunken focus:outline-none aria-disabled:opacity-45';
  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        ref={triggerRef} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <MoreHorizontalIcon className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKeyDown} className="absolute right-0 top-9 z-30 min-w-[190px] rounded-md border border-line bg-surface p-1 shadow-pop">
          {items.map((item) => item.kind === 'link' ? (
            <Link key={item.label} role="menuitem" tabIndex={-1} to={item.to} onClick={() => setOpen(false)} className={itemClass}>{item.icon}{item.label}</Link>
          ) : (
            <button key={item.label} type="button" role="menuitem" tabIndex={-1} aria-disabled={item.disabled || undefined}
              onClick={() => { if (item.disabled) return; setOpen(false); item.onSelect(); }}
              className={cn(itemClass, item.tone === 'danger' && 'text-danger')}>{item.icon}{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
