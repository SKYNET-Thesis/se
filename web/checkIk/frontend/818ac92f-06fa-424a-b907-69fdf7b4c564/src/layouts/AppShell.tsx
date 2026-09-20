import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { SidebarNavigation } from '../components/shell/SidebarNavigation';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { ToastHost } from '../components/shell/ToastHost';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="app-shell flex min-h-full w-full bg-bg text-ink">
      <aside className="app-sidebar hidden w-[4.25rem] shrink-0 border-r border-line lg:flex">
        <div className="fixed bottom-0 top-0 w-[4.25rem]">
          <SidebarNavigation />
        </div>
      </aside>

      <AnimatePresence>
        {navOpen ?
        <motion.div
          className="fixed inset-0 z-50 lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}>
          
            <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setNavOpen(false)}
            aria-hidden />
          
            <motion.div
            className="mobile-nav-panel absolute left-0 top-0 h-full w-[16rem] border-r border-line"
            initial={{ x: -24, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            role="dialog"
            aria-label="Navigation">
            
              <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-subtle text-ink2">
              
                <XIcon className="h-4 w-4" />
              </button>
              <SidebarNavigation onNavigate={() => setNavOpen(false)} />
            </motion.div>
          </motion.div> :
        null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader onOpenNav={() => setNavOpen(true)} />
        <main className="app-main flex-1 bg-bg px-4 py-6 lg:px-8 lg:py-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="route-stage h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <ToastHost />
    </div>);

}
