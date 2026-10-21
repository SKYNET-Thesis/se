import React from 'react';
import { CopyIcon, DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { GenerationResult } from '../../types/robotProgram';
import { Button } from '../ui/Button';
import { countCommands } from '../../utils/robotProgram/generator';

interface ProgramOutputProps {
  generation: GenerationResult | null;
  onExport: () => void;
}

export function ProgramOutput({ generation, onExport }: ProgramOutputProps) {
  if (!generation) return <p className="px-4 py-6 text-sm text-ink-muted">Generating structured program…</p>;
  const { program, problems } = generation;
  const errors = problems.filter((p) => p.severity === 'error').length;
  const json = JSON.stringify(program, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast.success('RobotProgram copied');
    } catch {
      toast.error('Clipboard is not available in this browser');
    }
  };

  return (
    <div className="space-y-3 p-4">
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-center">
        {[
        { k: 'Commands', v: countCommands(program.commands) },
        { k: 'Schema', v: program.schemaVersion },
        { k: 'Status', v: errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'Valid' }].
        map((item) =>
        <div key={item.k} className="bg-surface px-2 py-2">
            <dt className="text-2xs text-ink-subtle">{item.k}</dt>
            <dd className={errors && item.k === 'Status' ? 'text-sm font-semibold text-danger' : 'tabular text-sm font-semibold text-ink'}>{item.v}</dd>
          </div>
        )}
      </dl>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={copy} icon={<CopyIcon className="h-3.5 w-3.5" />}>
          Copy JSON
        </Button>
        <Button size="sm" variant="secondary" onClick={onExport} icon={<DownloadIcon className="h-3.5 w-3.5" />}>
          Download
        </Button>
      </div>
      <pre className="max-h-[420px] overflow-auto rounded-md bg-sunken p-3 font-mono text-2xs leading-5 text-ink">{json}</pre>
      <p className="text-2xs text-ink-subtle">Structured, hardware-agnostic instructions. No executable code is generated.</p>
    </div>);

}