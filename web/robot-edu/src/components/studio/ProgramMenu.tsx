import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon, FileJsonIcon, FolderOpenIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import type { ProgramRecord } from '../../types/robotProgram';
import { cn } from '../../utils/cn';
import { formatRelative } from '../../utils/format';

interface ProgramMenuProps {
  programs: ProgramRecord[];
  currentId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onImport: () => void;
  onExportFile: () => void;
  onExportProgram: () => void;
}

export function ProgramMenu(props: ProgramMenuProps) {
  const { programs, currentId, onOpen } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = [...programs].
  sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).
  filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const actions = [
  { label: 'New program…', icon: PlusIcon, fn: props.onNew },
  { label: 'Rename', icon: PencilIcon, fn: props.onRename },
  { label: 'Duplicate', icon: CopyIcon, fn: props.onDuplicate },
  { label: 'Import program file…', icon: UploadIcon, fn: props.onImport },
  { label: 'Export program file', icon: DownloadIcon, fn: props.onExportFile },
  { label: 'Export RobotProgram JSON', icon: FileJsonIcon, fn: props.onExportProgram }];


  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-muted hover:bg-sunken hover:text-ink">
        
        <FolderOpenIcon className="h-4 w-4" aria-hidden />
        Programs
        <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden />
      </button>
      <AnimatePresence>
        {open &&
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          style={{ transformOrigin: 'top left' }}
          className="absolute left-[128px] top-10 z-50 w-[320px] overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          
            <div className="border-b border-line p-2">
              <label className="flex h-8 items-center gap-2 rounded-md bg-sunken px-2">
                <SearchIcon className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />
                <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your programs"
                aria-label="Search programs"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
                autoFocus />
              
              </label>
            </div>
            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-ink-muted">No programs match “{query}”.</li>}
              {filtered.map((p) =>
            <li key={p.id}>
                  <button
                type="button"
                role="menuitem"
                onClick={act(() => onOpen(p.id))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sunken">
                
                    <span className="w-4 shrink-0">{p.id === currentId && <CheckIcon className="h-4 w-4 text-accent" aria-label="Current" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                      <span className="block text-2xs text-ink-subtle">Edited {formatRelative(p.updatedAt)}</span>
                    </span>
                  </button>
                </li>
            )}
            </ul>
            <div className="border-t border-line py-1">
              {actions.map((a) =>
            <button key={a.label} type="button" role="menuitem" onClick={act(a.fn)} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-ink hover:bg-sunken">
                  <a.icon className="h-4 w-4 text-ink-muted" aria-hidden />
                  {a.label}
                </button>
            )}
              <button
              type="button"
              role="menuitem"
              onClick={act(props.onDelete)}
              className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-danger hover:bg-danger-soft')}>
              
                <Trash2Icon className="h-4 w-4" aria-hidden />
                Delete program…
              </button>
            </div>
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}
