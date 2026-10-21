import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WorkspaceSvg } from 'blockly';
import { MonitorIcon } from 'lucide-react';
import type { GenerationResult, ProgramRecord } from '../../types/robotProgram';
import { usePrograms } from '../../contexts/ProgramsContext';
import { generateProgram } from '../../utils/robotProgram/generator';
import { formatRelative } from '../../utils/format';
import { BlocklyCanvas } from './BlocklyCanvas';
import { CommandTree } from './CommandTree';

/** Read-only Studio for narrow screens. Editing needs a desktop-sized viewport. */
export function StudioMobile({ record }: {record: ProgramRecord;}) {
  const { programs } = usePrograms();
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const onReady = useCallback((ws: WorkspaceSvg) => setGeneration(generateProgram(ws, { id: record.id, name: record.name })), [record.id, record.name]);
  const errors = generation?.problems.filter((p) => p.severity === 'error').length ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <div className="flex gap-3 rounded-lg border border-line bg-surface p-4">
        <MonitorIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-ink">Read-only on small screens</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">Open the Studio on a laptop or desktop (1024 px or wider) to edit blocks and run the simulation.</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-ink-subtle">Edited {formatRelative(record.updatedAt)}</p>
        <h1 className="text-xl font-semibold text-ink">{record.name}</h1>
      </div>

      <div className="relative h-[52vh] overflow-hidden rounded-lg border border-line">
        <BlocklyCanvas key={record.id} initialState={record.workspace} readOnly onReady={onReady} />
      </div>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">What this program does</h2>
        {errors > 0 && <p className="mb-2 text-[13px] text-danger">{errors} error{errors > 1 ? 's' : ''} need fixing on a larger screen.</p>}
        {generation && generation.program.commands.length ? <CommandTree commands={generation.program.commands} /> : <p className="text-[13px] text-ink-muted">No commands yet.</p>}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Other programs</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {programs.
          filter((p) => p.id !== record.id).
          map((p) =>
          <li key={p.id}>
                <Link to={`/studio/${p.id}`} className="flex items-center justify-between px-4 py-3 text-sm text-ink hover:bg-sunken">
                  {p.name}
                  <span className="text-xs text-ink-subtle">{formatRelative(p.updatedAt)}</span>
                </Link>
              </li>
          )}
        </ul>
      </section>
    </div>);

}