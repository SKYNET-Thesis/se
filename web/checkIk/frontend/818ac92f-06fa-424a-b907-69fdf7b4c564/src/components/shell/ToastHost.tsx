import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { cx } from '../../lib/format';

const toneClass = {
  info: 'border-line',
  success: 'border-ok/40',
  warning: 'border-warn/40',
  danger: 'border-danger/50'
} as const;

export function ToastHost() {
  const { toasts, dismissToast } = useLab();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) =>
        <motion.div
          key={t.id}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className={cx(
            'pointer-events-auto rounded-xl border bg-elev p-3.5 shadow-pop',
            toneClass[t.tone]
          )}
          role="status">
          
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <p className="text-base font-medium text-ink">{t.title}</p>
                {t.detail ? <p className="mt-0.5 text-sm text-ink2">{t.detail}</p> : null}
              </div>
              <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="ml-auto text-faint hover:text-ink">
              
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>);

}