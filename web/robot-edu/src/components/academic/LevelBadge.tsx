import type { ReactNode } from 'react';

export type AcademicLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export const LEVEL_LABEL: Record<AcademicLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };
const LEVEL_STYLE: Record<AcademicLevel, string> = {
  BEGINNER: 'border-[#b8d9d3] bg-[#effaf7] text-[#116a5b]',
  INTERMEDIATE: 'border-[#e6d3a3] bg-[#fdf6e3] text-[#8a5a00]',
  ADVANCED: 'border-[#d9b8d3] bg-[#faf0f8] text-[#7a2d6d]',
};
export const isAcademicLevel = (value: unknown): value is AcademicLevel => value === 'BEGINNER' || value === 'INTERMEDIATE' || value === 'ADVANCED';

/** Consistent difficulty badge for courses (course level) and assignments (assignment difficulty). Renders nothing for unknown values. */
export function LevelBadge({ level, prefix }: { level: unknown; prefix?: string }): ReactNode {
  if (!isAcademicLevel(level)) return null;
  return <span data-testid="level-badge" data-level={level} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[level]}`}>{prefix ? `${prefix} · ` : ''}{LEVEL_LABEL[level]}</span>;
}

export function TagChips({ tags, onSelect }: { tags?: string[] | null; onSelect?: (tag: string) => void }): ReactNode {
  if (!tags?.length) return null;
  return <ul aria-label="Course tags" className="flex flex-wrap gap-1.5">{tags.map((tag) => <li key={tag}>
    {onSelect
      ? <button type="button" onClick={() => onSelect(tag)} className="rounded-md border border-line bg-sunken/60 px-2 py-0.5 text-xs text-ink hover:border-accent">{tag}</button>
      : <span className="rounded-md border border-line bg-sunken/60 px-2 py-0.5 text-xs text-ink">{tag}</span>}
  </li>)}</ul>;
}
