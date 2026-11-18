import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOutIcon, MenuIcon, SettingsIcon, UserRoundIcon, XIcon } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { SidebarNav } from './SidebarNav';
import { VistaMark } from './VistaMark';
import { cn } from '../../utils/cn';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { useRole } from '../../contexts/RoleContext';

const ROLE_LABEL: Record<string, string> = { student: 'Student', teacher: 'Teacher', teaching_assistant: 'Teaching assistant', school_admin: 'School administrator', admin: 'System administrator' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside `container` (used by the modal navigation drawer). */
function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export function AppShell() {
  const location = useLocation();
  const isStudio = location.pathname.startsWith('/studio');
  const isFocusedLearning = /^\/courses\/[^/]+\/lessons\/[^/]+\/activities\//.test(location.pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { client, session } = useSupabaseSession();
  const { role } = useRole();
  const navigate = useNavigate();
  const email = session?.user.email ?? '';
  const label = String(session?.user.user_metadata?.full_name ?? email);
  const initials = label.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const roleLabel = role ? ROLE_LABEL[role] ?? role : null;
  const logout = async () => { await client?.auth.signOut(); navigate('/login', { replace: true }); };

  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDivElement>(null);
  const drawerWasOpen = useRef(false);

  useEffect(() => { setDrawerOpen(false); setAccountOpen(false); }, [location.pathname]);

  // Mobile navigation drawer (a modal dialog): Escape closes, focus moves in, Tab stays inside, focus returns on close.
  useEffect(() => {
    if (!drawerOpen) {
      if (drawerWasOpen.current) { drawerWasOpen.current = false; menuButton.current?.focus(); }
      return undefined;
    }
    drawerWasOpen.current = true;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false); else trapTab(event, drawerRef.current); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  // Account menu: Escape or a click outside closes it; Escape returns focus to the avatar button.
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setAccountOpen(false); accountButton.current?.focus(); } };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!accountMenu.current?.contains(target) && !accountButton.current?.contains(target)) setAccountOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointer);
    return () => { window.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onPointer); };
  }, [accountOpen]);

  const iconLink = 'grid h-10 w-10 place-items-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const menuItem = 'flex min-h-[40px] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-ink transition-colors duration-150 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const accountSummary = <div className="min-w-0">
    <p className="truncate text-sm font-semibold text-ink">{label}</p>
    {email && email !== label && <p className="mt-0.5 truncate text-xs text-ink-muted">{email}</p>}
    {roleLabel && <p className="mt-1 text-xs text-ink-muted">{roleLabel}</p>}
  </div>;

  return (
    <div className="flex h-full w-full bg-canvas">
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside
        className={cn(
          'shrink-0 flex-col border-r border-line bg-surface',
          isFocusedLearning ? 'hidden' : isStudio ? 'hidden lg:flex w-[60px] items-stretch px-2 py-4' : 'hidden lg:flex w-[240px] px-3 py-5'
        )}>
        <Link to="/" className={cn('mb-7 flex rounded-md', isStudio ? 'justify-center' : 'px-2')} aria-label="VISTA home">
          <VistaMark compact={isStudio} />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav collapsed={isStudio} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!isFocusedLearning && <header className="hidden h-14 shrink-0 items-center justify-end gap-1 border-b border-line bg-surface px-5 lg:flex">
          <NotificationBell />
          <Link to="/settings" className={iconLink} aria-label="Web settings"><SettingsIcon className="h-5 w-5" aria-hidden /></Link>
          <div className="relative ml-1">
            <button ref={accountButton} type="button" onClick={() => setAccountOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2" aria-label="Account menu" aria-expanded={accountOpen} aria-haspopup="menu">{initials || 'V'}</button>
            {accountOpen && <div ref={accountMenu} className="absolute right-0 top-11 z-30 w-64 rounded-lg border border-line bg-surface p-3 shadow-pop">
              {accountSummary}
              <div className="mt-3 border-t border-line pt-2">
                <Link to="/account" onClick={() => setAccountOpen(false)} className={menuItem}><UserRoundIcon className="h-4 w-4 text-ink-muted" aria-hidden />Account settings</Link>
                <button type="button" onClick={() => void logout()} className={menuItem}><LogOutIcon className="h-4 w-4 text-ink-muted" aria-hidden />Sign out</button>
              </div>
            </div>}
          </div>
        </header>}
        <header className={`flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 ${isFocusedLearning ? '' : 'lg:hidden'}`}>
          <Link to="/" aria-label="VISTA home">
            <VistaMark />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              ref={menuButton}
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={iconLink}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-haspopup="dialog">
              <MenuIcon className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>

        <main id="main" className={cn('min-h-0 flex-1', isStudio ? 'overflow-hidden' : 'overflow-y-auto')}>
          <Outlet />
        </main>
      </div>

      <AnimatePresence>
        {drawerOpen &&
        <div className={`fixed inset-0 z-40 ${isFocusedLearning ? '' : 'lg:hidden'}`}>
            <motion.div
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setDrawerOpen(false)}
            aria-hidden />

            <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[min(300px,88vw)] flex-col bg-surface px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-pop"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
              <div className="mb-6 flex items-center justify-between px-2">
                <VistaMark />
                {/* autoFocus: the dialog opens with focus on its first control. */}
                <button ref={closeButton} autoFocus type="button" onClick={() => setDrawerOpen(false)} className={iconLink} aria-label="Close navigation">
                  <XIcon className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidebarNav onNavigate={() => setDrawerOpen(false)} />
              </div>
              {/* Phones have no header account menu, so the drawer carries the account controls. */}
              <div className="mt-4 border-t border-line px-1 pt-4">
                <div className="px-1.5">{accountSummary}</div>
                <div className="mt-3 space-y-0.5">
                  <Link to="/account" className={menuItem}><UserRoundIcon className="h-4 w-4 text-ink-muted" aria-hidden />Account settings</Link>
                  <Link to="/settings" className={menuItem}><SettingsIcon className="h-4 w-4 text-ink-muted" aria-hidden />Web settings</Link>
                  <button type="button" onClick={() => void logout()} className={menuItem}><LogOutIcon className="h-4 w-4 text-ink-muted" aria-hidden />Sign out</button>
                </div>
              </div>
            </motion.aside>
          </div>
        }
      </AnimatePresence>
    </div>);
}
