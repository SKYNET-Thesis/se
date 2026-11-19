import { useEffect, useMemo, useState } from 'react';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { catalogApi } from '../../lib/api';
import { LEVEL_LABEL, type AcademicLevel } from './LevelBadge';

export interface AcademicValue { level: AcademicLevel | ''; tags: string[]; prerequisiteCourseIds: string[] }
export const sameAcademic = (a: AcademicValue, b: AcademicValue) => a.level === b.level && JSON.stringify(a.tags) === JSON.stringify(b.tags) && JSON.stringify([...a.prerequisiteCourseIds].sort()) === JSON.stringify([...b.prerequisiteCourseIds].sort());
const MAX_TAGS = 10; const MAX_PREREQ = 5;

/** Level, tags (chosen from existing/suggested or typed, de-duplicated case-insensitively) and prerequisites for a course. */
export function CourseAcademicFields({ value, onChange, courseId, disabled }: { value: AcademicValue; onChange: (next: AcademicValue) => void; courseId?: string; disabled?: boolean }) {
  const { session } = useSupabaseSession();
  const [vocab, setVocab] = useState<string[]>([]);
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    let active = true;
    void catalogApi.courseTags(token).then((result) => { if (active) setVocab([...result.used.map((entry) => entry.tag), ...result.suggested]); }).catch(() => undefined);
    void catalogApi.courses(token, 1, 100).then((result) => { if (active) setCourses(result.items.filter((course) => course.id !== courseId && course.status !== 'archived').map((course) => ({ id: course.id, title: course.title }))); }).catch(() => undefined);
    return () => { active = false; };
  }, [token, courseId]);
  const suggestions = useMemo(() => vocab.filter((tag) => !value.tags.some((chosen) => chosen.toLowerCase() === tag.toLowerCase())).slice(0, 12), [vocab, value.tags]);

  const addTag = (raw: string) => {
    const tag = raw.replace(/\s+/g, ' ').trim();
    setProblem(null);
    if (!tag) return;
    if (tag.length > 32) { setProblem('A tag can be at most 32 characters.'); return; }
    if (value.tags.some((chosen) => chosen.toLowerCase() === tag.toLowerCase())) { setProblem(`"${tag}" is already added.`); return; }
    if (value.tags.length >= MAX_TAGS) { setProblem(`A course can have at most ${MAX_TAGS} tags.`); return; }
    onChange({ ...value, tags: [...value.tags, tag] });
    setDraft('');
  };
  const togglePrerequisite = (id: string) => {
    const has = value.prerequisiteCourseIds.includes(id);
    if (!has && value.prerequisiteCourseIds.length >= MAX_PREREQ) { setProblem(`At most ${MAX_PREREQ} prerequisites.`); return; }
    setProblem(null);
    onChange({ ...value, prerequisiteCourseIds: has ? value.prerequisiteCourseIds.filter((entry) => entry !== id) : [...value.prerequisiteCourseIds, id] });
  };

  return <fieldset className="space-y-4 rounded-lg border border-line p-4" disabled={disabled} aria-label="Academic classification">
    <legend className="px-1 text-sm font-semibold text-ink">Academic classification</legend>
    <label className="block text-sm"><span className="font-medium text-ink">Course level</span>
      <select aria-label="Course level" value={value.level} onChange={(event) => onChange({ ...value, level: event.target.value as AcademicLevel | '' })} className="mt-1 block w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-2">
        <option value="">Not set</option>
        {(Object.keys(LEVEL_LABEL) as AcademicLevel[]).map((level) => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}
      </select>
    </label>
    <div className="text-sm"><span className="font-medium text-ink">Tags</span>
      <ul aria-label="Selected tags" className="mt-1 flex flex-wrap gap-1.5">{value.tags.map((tag) => <li key={tag} className="inline-flex items-center gap-1 rounded-md border border-line bg-sunken/60 px-2 py-0.5 text-xs">{tag}
        <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange({ ...value, tags: value.tags.filter((entry) => entry !== tag) })} className="text-ink-subtle hover:text-danger">×</button></li>)}</ul>
      <div className="mt-2 flex gap-2">
        <input aria-label="Add tag" list="course-tag-options" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(draft); } }} maxLength={40} placeholder="Type or pick a tag" className="w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-2" />
        <button type="button" onClick={() => addTag(draft)} className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:border-accent">Add tag</button>
      </div>
      <datalist id="course-tag-options">{suggestions.map((tag) => <option key={tag} value={tag} />)}</datalist>
      {suggestions.length > 0 && <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">Suggestions: {suggestions.slice(0, 8).map((tag) => <button type="button" key={tag} onClick={() => addTag(tag)} className="rounded-md border border-line px-1.5 py-0.5 hover:border-accent">{tag}</button>)}</p>}
    </div>
    <div className="text-sm"><span className="font-medium text-ink">Prerequisite courses</span>
      <p className="text-xs text-ink-subtle">Students are guided to finish these first. At most {MAX_PREREQ}.</p>
      {courses.length === 0 ? <p className="mt-1 text-xs text-ink-subtle">No other courses are available to select.</p>
        : <ul className="mt-1 max-h-40 space-y-1 overflow-auto">{courses.map((course) => <li key={course.id}><label className="flex items-center gap-2"><input type="checkbox" checked={value.prerequisiteCourseIds.includes(course.id)} onChange={() => togglePrerequisite(course.id)} />{course.title}</label></li>)}</ul>}
    </div>
    {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
  </fieldset>;
}
