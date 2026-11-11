import { useEffect, useRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { SidebarNav } from './SidebarNav';
import { VistaMark } from './VistaMark';

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called when a link inside the drawer is clicked, before React Router handles it.
   * Return `false` to cancel the navigation (used to guard unsaved authoring work).
   */
  onNavigateRequest?: (href: string) => boolean | void;
}

/**
 * The main navigation as an overlay drawer, for full-page workspaces (Course Builder) that give the
 * whole viewport to the editor. It overlays the page, so the workspace underneath stays mounted.
 */
export function NavDrawer({ open, onClose, onNavigateRequest }: NavDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const guardLinks = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href || !onNavigateRequest) return;
    if (onNavigateRequest(href) === false) event.preventDefault();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface px-3 py-4 shadow-pop"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            onClickCapture={guardLinks}
          >
            <div className="mb-6 flex items-center justify-between px-2">
              <Link to="/" aria-label="VISTA home" className="rounded-md">
                <VistaMark />
              </Link>
              <button ref={closeRef} type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-muted hover:bg-sunken" aria-label="Close navigation">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav onNavigate={onClose} />
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
