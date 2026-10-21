import React, { useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import type { GenerationResult } from '../../types/robotProgram';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Tabs } from '../ui/Tabs';
import { CommandTree } from './CommandTree';
import { countCommands } from '../../utils/robotProgram/generator';

interface PreviewDialogProps {
  open: boolean;
  onClose: () => void;
  generation: GenerationResult | null;
  onSelectBlock: (blockId: string) => void;
}

export function PreviewDialog({ open, onClose, generation, onSelectBlock }: PreviewDialogProps) {
  const [view, setView] = useState<'outline' | 'json'>('outline');
  const errors = generation?.problems.filter((p) => p.severity === 'error').length ?? 0;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Program preview"
      description="What the robot will be asked to do, in order. Select a step to find its block."
      footer={<Button onClick={onClose}>Close</Button>}>
      
      {!generation ?
      <p className="text-sm text-ink-muted">The program has not been generated yet.</p> :

      <div className="space-y-4">
          {errors > 0 &&
        <div className="flex gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {errors} error{errors > 1 ? 's' : ''}: blocks with errors are left out of this preview and the program cannot run yet.
            </div>
        }
          <Tabs
          label="Preview format"
          size="sm"
          value={view}
          onChange={setView}
          items={[
          { id: 'outline', label: 'Outline' },
          { id: 'json', label: 'RobotProgram JSON' }]
          } />
        
          <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
            {view === 'outline' ?
          generation.program.commands.length ?
          <>
                  <p className="mb-2 text-xs text-ink-subtle">{countCommands(generation.program.commands)} commands</p>
                  <CommandTree
              commands={generation.program.commands}
              onSelect={(id) => {
                onClose();
                onSelectBlock(id);
              }} />
            
                </> :

          <p className="text-sm text-ink-muted">No commands yet.</p> :


          <pre className="max-h-[50vh] overflow-auto rounded-md bg-sunken p-3 font-mono text-xs leading-5 text-ink">{JSON.stringify(generation.program, null, 2)}</pre>
          }
          </div>
        </div>
      }
    </Dialog>);

}