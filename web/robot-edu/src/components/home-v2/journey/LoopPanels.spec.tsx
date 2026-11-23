import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JOURNEY } from '../content';
import { EvaluatePanel, LearnPanel, ProgramPanel, ReflectPanel } from './LoopPanels';

const html = {
  learn: renderToStaticMarkup(<LearnPanel />), program: renderToStaticMarkup(<ProgramPanel />),
  evaluate: renderToStaticMarkup(<EvaluatePanel />), reflect: renderToStaticMarkup(<ReflectPanel />),
};

describe('lesson loop panels', () => {
  it('names the five stages in the order Learn, Program, Preview, Evaluate, Reflect', () => {
    expect(JOURNEY.map((s) => s.name)).toEqual(['Learn', 'Program', 'Preview', 'Evaluate', 'Reflect']);
  });
  it('Learn is a mission briefing with objectives', () => {
    expect(html.learn).toContain('Mission briefing');
    expect(html.learn).toContain('Open &amp; Close Gripper');
    expect(html.learn).toContain('End with the gripper closed');
  });
  it('Program shows lesson one’s own blocks and the canonical steps they compile to', () => {
    for (const label of ['use left arm', 'open gripper', 'wait 1 second', 'close gripper']) expect(html.program).toContain(label);
    expect(html.program).toContain('arm.select');
    expect(html.program).toContain('gripper.close');
  });
  it('Evaluate is a rule checklist read from the preview trace, and says it is not a grade', () => {
    expect(html.evaluate).toContain('Validation checklist');
    expect(html.evaluate).toContain('Left gripper ends closed');
    expect(html.evaluate).toMatch(/not a grade/i);
  });
  it('Reflect invents no teacher feedback, grade or score', () => {
    expect(html.reflect).toContain('Appears here after your teacher reviews the submission');
    for (const panel of Object.values(html)) expect(panel).not.toMatch(/\b\d{1,3}\s?\/\s?100\b|great job|well done|score:|grade:|download the installer/i);
  });
});
