import { isInternalAlias, initialsOf, useDisplayName } from '../../lib/displayName';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOutIcon, MenuIcon, SettingsIcon, UserIcon, XIcon } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { SidebarNav } from './SidebarNav';
import { VistaMark } from './VistaMark';
import { cn } from '../../utils/cn';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { useRole } from '../../contexts/RoleContext';

export function AppShell() {
  const location = useLocation();
  const isStudio = location.pathname.startsWith('/studio');
  const isFocusedLearning = /^\/courses\/[^/]+\/lessons\/[^/]+\/activities\//.test(location.pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false); const { client, session } = useSupabaseSession(); const { role } = useRole(); const navigate = useNavigate();
  const email=isInternalAlias(session?.user.email)?'':(session?.user.email??''); const label=useDisplayName(email||'Account'); const initials=initialsOf(String(label));
  const logout=async()=>{await client?.auth.signOut();navigate('/login',{replace:true});};
  // Mobile navigation drawer: focus moves into it when it opens and returns to the menu button when it is dismissed (Escape, close, backdrop).
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dismissDrawer = () => { setDrawerOpen(false); window.setTimeout(() => menuButtonRef.current?.focus(), 0); };
  useEffect(() => { if (drawerOpen) window.setTimeout(() => closeButtonRef.current?.focus(), 0); }, [drawerOpen]);

  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => { if (!drawerOpen) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismissDrawer(); }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [drawerOpen]);

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
        {!isFocusedLearning && <header className="hidden h-14 shrink-0 items-center justify-end gap-2 border-b border-line bg-surface px-5 lg:flex"><NotificationBell /><Link to="/settings" className="rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink" aria-label="Web settings"><SettingsIcon className="h-5 w-5" /></Link><div className="relative"><button type="button" onClick={()=>setAccountOpen((open)=>!open)} className="grid h-9 w-9 place-items-center rounded-full bg-[#176255] text-xs font-semibold text-white" aria-label="Account menu" aria-expanded={accountOpen}>{initials||'V'}</button>{accountOpen&&<div className="absolute right-0 top-11 z-30 w-64 border border-line bg-surface p-3 shadow-pop"><p className="truncate text-sm font-semibold text-ink">{String(label)}</p><p className="mt-1 truncate text-xs text-ink-muted">{email}</p><p className="mt-2 text-xs capitalize text-ink-muted">{role?.replace('_',' ')}</p><Link to="/account" onClick={()=>setAccountOpen(false)} className="mt-3 block rounded px-2 py-2 text-sm hover:bg-sunken">Account Settings</Link><button type="button" onClick={()=>void logout()} className="mt-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-sunken"><LogOutIcon className="h-4 w-4" />Logout</button></div>}</div></header>}
        <header className={`flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 ${isFocusedLearning ? '' : 'lg:hidden'}`}>
          <Link to="/" aria-label="VISTA home">
            <VistaMark />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}>

              <MenuIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main id="main" tabIndex={isStudio ? undefined : 0} className={cn('min-h-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent', isStudio ? 'overflow-hidden' : 'overflow-y-auto')}>
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
            onClick={dismissDrawer}
            aria-hidden />
          
            <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-surface px-3 py-4 shadow-pop"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
            
              <div className="mb-6 flex items-center justify-between px-2">
                <VistaMark />
                <button ref={closeButtonRef} type="button" onClick={dismissDrawer} className="rounded-md p-1.5 text-ink-muted hover:bg-sunken" aria-label="Close navigation">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidebarNav onNavigate={() => setDrawerOpen(false)} />
              </div>
              <section aria-label="Account" className="mt-3 border-t border-line pt-3">
                <div className="px-2 pb-2">
                  <p className="truncate text-sm font-semibold text-ink">{String(label)}</p>
                  {email && <p className="mt-0.5 truncate text-xs text-ink-muted">{email}</p>}
                  <p className="mt-0.5 text-xs capitalize text-ink-muted">{role?.replace('_', ' ')}</p>
                </div>
                <Link to="/account" onClick={() => setDrawerOpen(false)} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-ink hover:bg-sunken"><UserIcon className="h-4 w-4" aria-hidden />Account Settings</Link>
                <Link to="/settings" onClick={() => setDrawerOpen(false)} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-ink hover:bg-sunken"><SettingsIcon className="h-4 w-4" aria-hidden />Settings</Link>
                <button type="button" onClick={() => { setDrawerOpen(false); void logout(); }} className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-ink hover:bg-sunken"><LogOutIcon className="h-4 w-4" aria-hidden />Logout</button>
              </section>
            </motion.aside>
          </div>
        }
      </AnimatePresence>
    </div>);

}
