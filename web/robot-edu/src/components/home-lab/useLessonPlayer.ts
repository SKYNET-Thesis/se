import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { BLOCKS, INITIAL_STATE, simulate, type BlockKind, type PreviewState } from './lessonProgram';
import { JAW } from './jaw';
import type { RobotScene } from './robotScene';

const STEP_MS = 1500;

/**
 * Plays a block program on the 3D preview: index −1 is the initial state, i is "after block i".
 * The scene follows the preview state only (jaw, and a glow while "use left arm" is active).
 */
export function useLessonPlayer(program: BlockKind[], scene: MutableRefObject<RobotScene | null>, ready: boolean) {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const states = useMemo(() => simulate(program), [program]);
  const last = program.length - 1;
  const state: PreviewState = index >= 0 ? states[index] ?? INITIAL_STATE : INITIAL_STATE;
  const block = index >= 0 ? BLOCKS[program[index]] : null;

  useEffect(() => { if (index > last) setIndex(last); }, [index, last]);

  useEffect(() => {
    if (!ready) return;
    scene.current?.setPose({ Jaw: state.jaw === 'open' ? JAW.open : JAW.closed });
    scene.current?.setGlow(block?.kind === 'select' ? 1 : 0);
  }, [ready, state.jaw, block?.kind, scene]);

  useEffect(() => {
    if (!playing) return undefined;
    if (index >= last) { setPlaying(false); return undefined; }
    const timer = window.setTimeout(() => setIndex((i) => i + 1), index < 0 ? 400 : STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, last]);

  const go = useCallback((next: number) => { setPlaying(false); setIndex(Math.max(-1, Math.min(last, next))); }, [last]);
  const play = useCallback(() => { if (index >= last) setIndex(-1); setPlaying(true); }, [index, last]);
  const pause = useCallback(() => setPlaying(false), []);
  const reset = useCallback(() => { setPlaying(false); setIndex(-1); }, []);

  return { index, playing, state, block, states, last, go, play, pause, reset };
}
