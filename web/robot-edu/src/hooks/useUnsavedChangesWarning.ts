import { useEffect } from 'react';

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave this page and discard them?';

/**
 * Warns before unsaved work is lost: browser reload/close (beforeunload) and in-app link clicks (the app uses
 * BrowserRouter, which has no navigation blocker, so same-origin anchor clicks are confirmed in the capture phase).
 */
export function useUnsavedChangesWarning(dirty: boolean, confirmLeave: (message: string) => boolean = (message) => window.confirm(message)) {
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname && anchor.search === window.location.search) return;
      if (!confirmLeave(UNSAVED_MESSAGE)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', onBeforeUnload); document.removeEventListener('click', onClick, true); };
  }, [dirty, confirmLeave]);
}
