import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';

/** Signed-out visitors go to the existing /login; a signed-in visitor goes to the existing workspace at /. */
export function useHomeCta() {
  const { session } = useSupabaseSession();
  return session ? { to: '/', label: 'Open workspace' } : { to: '/login', label: 'Sign in' };
}

export function PrimaryCta({ tone = 'light', size = 'lg', className }: { tone?: 'light' | 'dark'; size?: 'md' | 'lg'; className?: string }) {
  const cta = useHomeCta();
  return (
    <Link
      to={cta.to}
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] font-semibold transition-[background-color,transform] duration-150 active:scale-[0.98]',
        size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-11 px-5 text-[14px]',
        tone === 'dark' ? 'bg-[var(--vh-teal-on-deep)] text-[var(--vh-deep)] hover:bg-white' : 'bg-[var(--vh-teal)] text-white hover:bg-[var(--vh-teal-hover)]',
        className
      )}>
      {cta.label}
    </Link>
  );
}
