import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MenuIcon, XIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useHomeCta } from '../home/HomeCta';
import { NAV } from './content';

/**
 * Tracks which chapter crosses the middle band of the viewport, for `aria-current`. Every chapter is
 * observed, linked or not (the hero, the finale), so reaching one without a link clears the mark
 * instead of leaving the previous chapter lit (H6.8).
 */
function useCurrentChapter(): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const targets = [...document.querySelectorAll<HTMLElement>('main > section')];
    const linked = new Set<string>(NAV.map((n) => n.id));
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(linked.has(e.target.id) ? e.target.id : null);
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach((t) => observer.observe(t));
    const onTop = () => { if (scrollY < innerHeight * 0.4) setCurrent(null); };
    addEventListener('scroll', onTop, { passive: true });
    return () => { observer.disconnect(); removeEventListener('scroll', onTop); };
  }, []);
  return current;
}

/** S0: wordmark, the chapters, and the real workspace action. A solid bar once the hero scrolls away. */
export function V2Header() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const current = useCurrentChapter();
  const cta = useHomeCta();
  const menuId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setSolid(scrollY > 24);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={cn('fixed inset-x-0 top-0 z-40 transition-colors duration-300', solid || open ? 'bg-[var(--v2-void)]' : 'bg-transparent')}>
      <div className="flex h-[var(--v2-header)] items-center justify-between gap-6 px-[var(--v2-margin)]">
        <a href="#top" aria-label="VISTA, back to top" className="v2-display text-[19px] font-semibold tracking-[0.04em]">VISTA</a>
        <nav aria-label="Homepage chapters" className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {NAV.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} aria-current={current === item.id ? 'location' : undefined}
                  className={cn('group relative inline-flex h-11 items-center text-[14px] font-medium transition-colors duration-200', current === item.id ? 'text-[var(--v2-text)]' : 'text-[var(--v2-muted)] hover:text-[var(--v2-text)]')}>
                  {item.label}
                  <span aria-hidden className={cn('absolute inset-x-0 bottom-2 h-[2px] origin-left bg-[var(--v2-teal)] transition-transform duration-300 ease-out', current === item.id ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100')} />
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link to={cta.to} className="inline-flex h-11 items-center rounded-[4px] bg-[var(--v2-text)] px-5 text-[14px] font-semibold text-[var(--v2-void)] transition-[background-color,transform] duration-150 hover:bg-[var(--v2-teal)] active:scale-[0.98]">{cta.label}</Link>
          <button ref={toggle} type="button" aria-expanded={open} aria-controls={menuId} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[4px] border border-[var(--v2-line-strong)] lg:hidden">
            {open ? <XIcon className="h-5 w-5" aria-hidden /> : <MenuIcon className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>
      <div ref={menu} id={menuId} hidden={!open} className="max-h-[calc(100svh-var(--v2-header))] overflow-y-auto bg-[var(--v2-void)] px-[var(--v2-margin)] pb-8 lg:hidden">
        <nav aria-label="Homepage chapters">
          <ul>
            {NAV.map((item) => (
              <li key={item.id}><a href={`#${item.id}`} onClick={() => setOpen(false)} aria-current={current === item.id ? 'location' : undefined} className="v2-display flex min-h-14 items-center text-[32px] font-medium">{item.label}</a></li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
