import React, { useEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderCogIcon,
  MenuIcon,
  MoonIcon,
  SunIcon,
  UserIcon } from
'lucide-react';
import { Link } from 'react-router-dom';
import { useLab } from '../../contexts/LabContext';
import { cx } from '../../lib/format';
import { EmergencyStopButton } from './EmergencyStopButton';
import { SystemHealthPopover } from './SystemHealthPopover';
import { useSessionClock } from '../../hooks/useLabDerived';
import { formatDuration } from '../../lib/format';

function WorkspaceSelector() {
  const { workspaces, workspace, setWorkspaceId } = useLab();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-9 max-w-[16rem] items-center gap-2 rounded-lg border border-line bg-subtle px-3 text-base text-ink hover:border-faint/50 transition-colors duration-150 ease-smooth">
        
        <FolderCogIcon className="h-4 w-4 text-brand shrink-0" />
        <span className="truncate">{workspace.name}</span>
        {workspace.dirty ? <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label="Unsaved changes" /> : null}
        <ChevronDownIcon className="h-3.5 w-3.5 text-faint shrink-0" />
      </button>
      {open ?
      <div
        role="listbox"
        className="absolute left-0 top-full z-40 mt-2 w-80 rounded-xl border border-line bg-elev p-1.5 shadow-pop">
        
          {workspaces.map((w) =>
        <button
          key={w.id}
          role="option"
          aria-selected={w.id === workspace.id}
          onClick={() => {
            setWorkspaceId(w.id);
            setOpen(false);
          }}
          className={cx(
            'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-smooth',
            w.id === workspace.id ? 'bg-subtle' : 'hover:bg-subtle'
          )}>
          
              <CheckIcon
            className={cx('mt-0.5 h-4 w-4 shrink-0', w.id === workspace.id ? 'text-brand' : 'text-transparent')} />
          
              <span className="min-w-0">
                <span className="block text-base text-ink">{w.name}</span>
                <span className="block text-sm text-ink2 line-clamp-2">{w.description}</span>
              </span>
            </button>
        )}
          <Link
          to="/workspace"
          onClick={() => setOpen(false)}
          className="mt-1 block rounded-lg border-t border-line px-3 py-2 text-sm text-brand hover:bg-subtle">
          
            Manage workspaces →
          </Link>
        </div> :
      null}
    </div>);

}

export function WorkspaceHeader({ onOpenNav }: {onOpenNav: () => void;}) {
  const { theme, toggleTheme, session } = useLab();
  const elapsed = useSessionClock();

  return (
    <header className="workspace-header sticky top-0 z-30 flex h-[4.5rem] items-center gap-3 border-b border-line bg-bg/95 px-4 backdrop-blur lg:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-subtle text-ink2"
        aria-label="Open navigation">
        
        <MenuIcon className="h-4 w-4" />
      </button>

      <WorkspaceSelector />

      <div className="hidden md:flex items-center gap-2 rounded-lg border border-line bg-subtle px-3 h-9">
        <span
          className={cx(
            'h-2 w-2 rounded-full',
            session?.state === 'active' ? 'bg-ok live-dot' : 'bg-faint'
          )}
          aria-hidden />
        
        <span className="text-sm text-ink2">
          {session?.state === 'active' ?
          `${session.mode === 'dual' ? 'Dual-arm' : session.mode === 'vr' ? 'VR' : 'Single-arm'} session` :
          session?.state === 'paused' ?
          'Session paused' :
          'No active session'}
        </span>
        {session ? <span className="font-mono text-sm text-ink">{formatDuration(elapsed)}</span> : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <SystemHealthPopover />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-subtle text-ink2 hover:text-ink transition-colors duration-150 ease-smooth">
          
          {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label="Operator menu"
          className="hidden sm:flex h-9 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5 text-sm text-ink2 hover:text-ink transition-colors duration-150 ease-smooth">
          
          <UserIcon className="h-4 w-4" />
          <span className="hidden lg:inline">m.okafor</span>
        </button>
        <EmergencyStopButton compact />
      </div>
    </header>);

}
