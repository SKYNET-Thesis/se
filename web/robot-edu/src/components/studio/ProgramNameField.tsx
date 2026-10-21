import React, { useEffect, useRef, useState } from 'react';
import { PencilIcon } from 'lucide-react';

interface ProgramNameFieldProps {
  name: string;
  onRename: (name: string) => void;
  editSignal?: number;
}

export function ProgramNameField({ name, onRename, editSignal = 0 }: ProgramNameFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editSignal > 0) setEditing(true);
  }, [editSignal]);

  useEffect(() => {
    if (editing) {
      setDraft(name);
      setError(null);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, name]);

  const commit = () => {
    const value = draft.trim();
    if (!value) {
      setError('Name cannot be empty');
      inputRef.current?.focus();
      return;
    }
    if (value.length > 60) {
      setError('Keep it under 60 characters');
      inputRef.current?.focus();
      return;
    }
    if (value !== name) onRename(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label="Program name"
          aria-invalid={Boolean(error)}
          className="h-8 w-56 rounded-md border border-accent bg-surface px-2 text-sm font-semibold text-ink outline-none ring-2 ring-accent/20" />
        
        {error && <p className="absolute left-0 top-9 z-10 whitespace-nowrap rounded bg-danger px-2 py-1 text-2xs text-white">{error}</p>}
      </div>);

  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex h-8 max-w-[260px] items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-ink hover:bg-sunken"
      title="Rename program">
      
      <span className="truncate">{name}</span>
      <PencilIcon className="h-3.5 w-3.5 shrink-0 text-ink-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      <span className="sr-only">Rename</span>
    </button>);

}