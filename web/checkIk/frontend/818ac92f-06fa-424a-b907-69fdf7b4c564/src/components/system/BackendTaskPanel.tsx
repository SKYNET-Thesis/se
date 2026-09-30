import { SquareIcon, TerminalIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';

export function BackendTaskPanel() {
  const { backendOnline, backendTask, sendTaskInput, stopSession } = useLab();
  return (
    <Card className="technical-console">
      <CardHeader
        title="Hardware task console"
        description="Allow-listed LeRobot commands only — arbitrary shell commands are rejected."
        icon={TerminalIcon}
        actions={<Badge tone={backendOnline ? 'ok' : 'danger'}>{backendOnline ? 'Backend online' : 'Backend offline'}</Badge>}
      />
      <div className="flex flex-wrap gap-2 border-t border-line p-4">
        <Button size="sm" onClick={() => sendTaskInput('')} disabled={!backendTask?.running}>Send Enter</Button>
        <Button size="sm" onClick={() => sendTaskInput('c')} disabled={!backendTask?.running}>Send c + Enter</Button>
        <Button size="sm" variant="danger" icon={SquareIcon} onClick={stopSession} disabled={!backendTask?.running}>Stop task</Button>
      </div>
      <div className="border-t border-line bg-[#070b10] p-4 font-mono text-xs text-slate-300">
        <p className="mb-2 text-slate-500">
          {backendTask ? `${backendTask.kind} · ${backendTask.running ? 'running' : `exit ${backendTask.exitCode}`}` : 'No active task'}
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
          {backendTask?.output.length ? backendTask.output.join('\n') : 'Output will appear here.'}
        </pre>
      </div>
    </Card>
  );
}
