import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MenuIcon, XIcon } from 'lucide-react';
import { RoleSwitcher } from './RoleSwitcher';
import { SidebarNav } from './SidebarNav';
import { VistaMark } from './VistaMark';
import { cn } from '../../utils/cn';

export function AppShell() {
  const location = useLocation();
  const isStudio = location.pathname.startsWith('/studio');
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        {!isStudio && <RoleSwitcher />}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
              <RoleSwitcher onSwitched={() => setDrawerOpen(false)} />
            </motion.aside>
          </div>
        }
      </AnimatePresence>
    </div>);

}