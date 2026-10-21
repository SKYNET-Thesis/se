import * as Blockly from 'blockly';
import type { GenerationResult, ProgramRecord } from '../../types/robotProgram';
import { registerVistaBlocks } from '../../components/studio/blocklyConfig';
import { generateProgram } from './generator';

export type AnalysisResult = {ok: true;result: GenerationResult;} | {ok: false;error: string;};

/** Generates the structured program for a saved record in a headless (invisible) workspace. */
export function analyzeRecord(record: ProgramRecord): AnalysisResult {
  registerVistaBlocks();
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(record.workspace, ws);
    return { ok: true, result: generateProgram(ws, { id: record.id, name: record.name }) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'The program could not be read.' };
  } finally {
    ws.dispose();
  }
}