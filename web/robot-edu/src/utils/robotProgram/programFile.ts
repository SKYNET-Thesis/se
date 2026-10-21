import type { ProgramRecord } from '../../types/robotProgram';
import { isRecord } from '../storage';

export interface VistaProgramFile {
  format: 'vista.program';
  version: 1;
  name: string;
  exportedAt: string;
  workspace: Record<string, unknown>;
}

export function toProgramFile(record: ProgramRecord): VistaProgramFile {
  return { format: 'vista.program', version: 1, name: record.name, exportedAt: new Date().toISOString(), workspace: record.workspace };
}

export type ParseResult = {ok: true;file: VistaProgramFile;} | {ok: false;error: string;};

export function parseProgramFile(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (!isRecord(data) || data.format !== 'vista.program') {
    return { ok: false, error: 'This is not a VISTA program file (.vista.json).' };
  }
  if (data.version !== 1) return { ok: false, error: `Unsupported program file version: ${String(data.version)}.` };
  if (typeof data.name !== 'string' || !isRecord(data.workspace)) {
    return { ok: false, error: 'The program file is missing its name or workspace.' };
  }
  return { ok: true, file: data as unknown as VistaProgramFile };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'program';
}

export function isProgramRecord(value: unknown): value is ProgramRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    isRecord(value.workspace));

}