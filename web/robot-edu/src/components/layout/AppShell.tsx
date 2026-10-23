import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOutIcon, MenuIcon, SettingsIcon, XIcon } from 'lucide-react';
import { SidebarNav } from './SidebarNav';
import { VistaMark } from './VistaMark';
import { cn } from '../../utils/cn';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { useRole } from '../../contexts/RoleContext';

export function AppShell() {
  const location = useLocation();
  const isStudio = location.pathname.startsWith('/studio');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false); const { client, session } = useSupabaseSession(); const { role } = useRole(); const navigate = useNavigate();
  const email=session?.user.email??''; const label=session?.user.user_metadata?.full_name ?? email; const initials=String(label).split(/\s+|@/).filter(Boolean).slice(0,2).map((part)=>part[0]).join('').toUpperCase();
  const logout=async()=>{await client?.auth.signOut();navigate('/login',{replace:true});};

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="flex h-full w-full bg-canvas">
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-line bg-surface lg:flex',
          isStudio ? 'w-[60px] items-stretch px-2 py-4' : 'w-[240px] px-3 py-5'
        )}>
        
        <Link to="/" className={cn('mb-7 flex rounded-md', isStudio ? 'justify-center' : 'px-2')} aria-label="VISTA home">
          <VistaMark compact={isStudio} />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav collapsed={isStudio} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden h-14 shrink-0 items-center justify-end gap-2 border-b border-line bg-surface px-5 lg:flex"><Link to="/settings" className="rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink" aria-label="Web settings"><SettingsIcon className="h-5 w-5" /></Link><div className="relative"><button type="button" onClick={()=>setAccountOpen((open)=>!open)} className="grid h-9 w-9 place-items-center rounded-full bg-[#176255] text-xs font-semibold text-white" aria-label="Account menu" aria-expanded={accountOpen}>{initials||'V'}</button>{accountOpen&&<div className="absolute right-0 top-11 z-30 w-64 border border-line bg-surface p-3 shadow-pop"><p className="truncate text-sm font-semibold text-ink">{String(label)}</p><p className="mt-1 truncate text-xs text-ink-muted">{email}</p><p className="mt-2 text-xs capitalize text-ink-muted">{role?.replace('_',' ')}</p><Link to="/account" onClick={()=>setAccountOpen(false)} className="mt-3 block rounded px-2 py-2 text-sm hover:bg-sunken">Account Settings</Link><button type="button" onClick={()=>void logout()} className="mt-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-sunken"><LogOutIcon className="h-4 w-4" />Logout</button></div>}</div></header>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
          <Link to="/" aria-label="VISTA home">
            <VistaMark />
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}>
            
            <MenuIcon className="h-5 w-5" />
          </button>
        </header>

        <main id="main" className={cn('min-h-0 flex-1', isStudio ? 'overflow-hidden' : 'overflow-y-auto')}>
          <Outlet />
        </main>
      </div>

      <AnimatePresence>
        {drawerOpen &&
        <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setDrawerOpen(false)}
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
                <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-md p-1.5 text-ink-muted hover:bg-sunken" aria-label="Close navigation">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidebarNav onNavigate={() => setDrawerOpen(false)} />
              </div>
            </motion.aside>
          </div>
        }
      </AnimatePresence>
    </div>);

}
