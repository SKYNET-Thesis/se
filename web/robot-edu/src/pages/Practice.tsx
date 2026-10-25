import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as Blockly from 'blockly';
import { BookOpenIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, CircleHelpIcon, CircleIcon, FileQuestionIcon, PauseIcon, PlayIcon, RotateCcwIcon, SparklesIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react';
import { ApiError, assignmentApi, catalogApi, learnerApi, type ApiAttempt, type ApiClassroomAssignment, type ApiProgram, type ApiSymbolicEvaluation } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { BlocklyCanvas } from '../components/studio/BlocklyCanvas';
import { openCloseGripperToolbox, reachTargetToolbox } from '../components/studio/blocklyConfig';
import { generateProgram } from '../utils/robotProgram/generator';
import type { GenerationResult } from '../types/robotProgram';
import { toCanonicalNestRobotProgram, type CanonicalNestStep } from '../utils/robotProgram/toCanonicalNest';
import { createInitialState } from '../utils/robotProgram/simulator';
import type { SimState } from '../types/robotProgram';
import { So101Viewer3D } from '../components/studio/So101Viewer3D';
import { StudioViewerBoundary } from '../components/studio/StudioViewerBoundary';
import { createRobotExecutionClient, type PhysicalExecution, type PhysicalRobotStatus } from '../lib/robotExecution';
import { Dialog } from '../components/ui/Dialog';
import { VrPractice } from './VrPractice';
import { DemonstrationPractice } from './DemonstrationPractice';
import { recoverEvidence, runC1Evidence, type EvidenceStage } from '../lib/c1EvidenceOrchestrator';

interface PracticeState { attempt: ApiAttempt; assignment: ApiClassroomAssignment; program: ApiProgram; }
type LearningTarget = { label: string; frame: 'learning_preview_v1'; arm: 'left' | 'right'; position: { x: number; y: number; z: number } };
const emptyWorkspace = { blocks: { languageVersion: 0, blocks: [] } };
const emptyRobotProgram = { kind: 'robot_program', schemaVersion: 1, steps: [] };

export function Practice({ mode = 'physical-enabled' }: { mode?: 'learning'|'physical-enabled' }) {
  const { attemptId = '' } = useParams();
  const { session } = useSupabaseSession();
  const [data, setData] = useState<PracticeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const saveTimer = useRef<number | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<ApiSymbolicEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const evaluationLock = useRef(false);
  const [evidenceStage, setEvidenceStage] = useState<EvidenceStage>('none');
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<SimState>(createInitialState);
  const [previewSelectedArm, setPreviewSelectedArm] = useState<'left' | 'right'>('left');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewSpeed, setPreviewSpeed] = useState(1);
  const executionClient = useMemo(createRobotExecutionClient, []);
  const [robotStatus, setRobotStatus] = useState<PhysicalRobotStatus | null>(null);
  const [robotExecution, setRobotExecution] = useState<PhysicalExecution | null>(null);
  const [robotError, setRobotError] = useState<string | null>(null);
  const [confirmRobotRun, setConfirmRobotRun] = useState(false);
  const [robotStarting, setRobotStarting] = useState(false);
  const [, setLastProgramVersionId] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [learningTarget, setLearningTarget] = useState<LearningTarget | null>(null);

  const load = useCallback(() => {
    if (!session || !attemptId) return;
    let active = true; setLoading(true); setError(null);
    void (async () => {
      const attempt = await learnerApi.attempt(attemptId, session.access_token);
      const assignment = await assignmentApi.detail(attempt.classroom_assignment_id, session.access_token);
      let program: ApiProgram;
      try { program = await learnerApi.program(attempt.id, session.access_token); }
      catch (requestError) {
        if (!(requestError instanceof ApiError) || requestError.status !== 404) throw requestError;
        program = await learnerApi.createProgram(attempt.id, session.access_token, { title: assignment.title, workspaceJson: emptyWorkspace, robotProgram: emptyRobotProgram });
      }
      const [versions,submissions,experiments,evaluations]=await Promise.all([learnerApi.versions(program.id,session.access_token),learnerApi.submissions(session.access_token),learnerApi.experiments(session.access_token),learnerApi.symbolicEvaluations(session.access_token)]);
      const recovered=recoverEvidence(versions,submissions,experiments.filter(item=>item.input_snapshot?.attemptId===attempt.id),evaluations);
      if(active&&recovered){setLastProgramVersionId(recovered.version.id);setEvaluation(recovered.evaluation);setEvidenceStage('evaluation_persisted');}
      if (assignment.challenge_id) {
        const objects = await catalogApi.challengeObjects(assignment.challenge_id, session.access_token);
        const object = objects.find((item) => item.object_key === 'target-a');
        const pose = object?.target_pose as { frame?: string; arm?: 'left' | 'right'; position?: { x?: number; y?: number; z?: number } } | undefined;
        if (pose?.frame === 'learning_preview_v1' && (pose.arm === 'left' || pose.arm === 'right') && pose.position && Number.isInteger(pose.position.x) && Number.isInteger(pose.position.y) && Number.isInteger(pose.position.z)) setLearningTarget({ label: typeof object?.label === 'string' ? object.label : 'Target A', frame: pose.frame, arm: pose.arm, position: { x: pose.position.x, y: pose.position.y, z: pose.position.z } });
      }
      if (active) setData({ attempt, assignment, program });
    })().catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load this practice workspace.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attemptId, session]);
  const isReachTarget = data?.assignment.title === 'Reach a Target';
  useEffect(() => load(), [load]);
  useEffect(() => () => { if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    if (!session || !attemptId || isReachTarget || mode !== 'physical-enabled') return;
    let active = true;
    void Promise.all([executionClient.getRobotStatus(session.access_token,attemptId),executionClient.restoreExecution({accessToken:session.access_token,attemptId})]).then(([status,execution]) => { if (active) { setRobotStatus(status); setRobotExecution(execution); } }).catch((requestError:unknown) => { if (active) setRobotStatus({ state: 'offline', robotName: 'Robot', message: requestError instanceof Error?requestError.message:'Physical eligibility could not be checked.', isMock: false, eligible:false }); });
    return () => { active = false; };
  }, [attemptId, executionClient, isReachTarget, mode, session]);
  useEffect(() => {
    if (mode !== 'physical-enabled' || !session || !robotExecution || !['pending','queued', 'running'].includes(robotExecution.state)) return undefined;
    const timer = window.setInterval(() => void executionClient.getExecution({ accessToken: session.access_token, executionId: robotExecution.id }).then(setRobotExecution).catch((requestError: unknown) => setRobotError(requestError instanceof Error ? requestError.message : 'Could not read robot execution.')), 700);
    return () => window.clearInterval(timer);
  }, [executionClient, mode, robotExecution, session]);

  const mission = useMemo(() => {
    const commands = generation?.program.commands ?? [];
    const selectedLeft = commands.some((command) => command.op === 'arm_select' && command.arm === 'left');
    const openIndex = commands.findIndex((command) => command.op === 'gripper' && command.action === 'open' && command.arm === 'left');
    const waitIndex = commands.findIndex((command, index) => index > openIndex && command.op === 'wait' && command.seconds >= 1);
    const closeIndex = commands.findIndex((command, index) => index > waitIndex && command.op === 'gripper' && command.action === 'close' && command.arm === 'left');
    const lastLeftGripper = [...commands].reverse().find((command) => command.op === 'gripper' && command.arm === 'left');
    return { selectedLeft, opened: openIndex >= 0, ordered: openIndex >= 0 && waitIndex >= 0 && closeIndex >= 0, waited: waitIndex >= 0, closed: lastLeftGripper?.op === 'gripper' && lastLeftGripper.action === 'close' };
  }, [generation]);

  const previewSteps = useMemo<CanonicalNestStep[]>(() => {
    if (!generation) return [];
    const canonical = toCanonicalNestRobotProgram(generation.program, { allowLearningPreviewMove: isReachTarget });
    return canonical.ok ? canonical.program.steps : [];
  }, [generation, isReachTarget]);

  useEffect(() => {
    if (!previewPlaying || previewIndex >= previewSteps.length) return undefined;
    const step = previewSteps[previewIndex];
    const delay = (step.type === 'wait' ? step.durationMs : 650) / previewSpeed;
    const timer = window.setTimeout(() => {
      if (step.type === 'arm.select') setPreviewSelectedArm(step.arm);
      if (step.type === 'gripper.open' || step.type === 'gripper.close') setPreviewState((previous) => ({ ...previous, arms: { ...previous.arms, [previewSelectedArm]: { ...previous.arms[previewSelectedArm], gripper: step.type === 'gripper.open' ? 'open' : 'closed' } } }));
      if (step.type === 'home') setPreviewState((previous) => {
        const home = createInitialState().arms[step.arm];
        return { ...previous, arms: { ...previous.arms, [step.arm]: { ...home, gripper: previous.arms[step.arm].gripper } } };
      });
      if (step.type === 'preview.move_xyz') setPreviewState((previous) => ({ ...previous, arms: { ...previous.arms, [step.arm]: { ...previous.arms[step.arm], tool: { x: step.position.x, y: step.position.y, z: step.position.z } } } }));
      setPreviewIndex((index) => index + 1);
    }, Math.max(180, delay));
    return () => window.clearTimeout(timer);
  }, [previewIndex, previewPlaying, previewSelectedArm, previewSpeed, previewSteps]);

  useEffect(() => { if (previewIndex >= previewSteps.length && previewSteps.length > 0) setPreviewPlaying(false); }, [previewIndex, previewSteps.length]);

  const refreshGeneration = (workspace: Blockly.WorkspaceSvg) => setGeneration(generateProgram(workspace, { id: data?.program.id ?? 'practice', name: data?.program.title ?? 'Practice program' }));

  const persistWorkspace = (workspace: Blockly.WorkspaceSvg) => {
    if (!session || !data) return;
    const snapshot = Blockly.serialization.workspaces.save(workspace);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setSaveState('saving'); setSaveError(null);
    saveTimer.current = window.setTimeout(() => {
      void learnerApi.updateProgram(data.program.id, session.access_token, { workspaceJson: snapshot })
        .then(() => setSaveState('saved'))
        .catch((requestError: unknown) => { setSaveState('error'); setSaveError(requestError instanceof Error ? requestError.message : 'Could not save your workspace.'); });
    }, 700);
  };

  const validateProgram = () => {
    const workspace = workspaceRef.current;
    if (!workspace || !data) return;
    const result = generateProgram(workspace, { id: data.program.id, name: data.program.title });
    setGeneration(result);
    const errors = result.problems.filter((problem) => problem.severity === 'error');
    const canonical = toCanonicalNestRobotProgram(result.program, { allowLearningPreviewMove: isReachTarget });
    if (errors.length) return setValidationMessage(`Fix ${errors.length} Blockly error${errors.length === 1 ? '' : 's'} before evaluation.`);
    if (!canonical.ok) return setValidationMessage(canonical.issues[0]?.message ?? 'This program cannot be evaluated yet.');
    setValidationMessage('Program is valid and ready for server evaluation.');
  };

  const submitAndEvaluate = async () => {
    const workspace = workspaceRef.current;
    if (!workspace || !session || !data || evaluationLock.current) return;
    evaluationLock.current=true; setEvaluation(null); setLastProgramVersionId(null); setEvaluationError(null); setValidationMessage(null); setEvaluating(true); setEvidenceStage('none');
    try {
      const generated = generateProgram(workspace, { id: data.program.id, name: data.program.title });
      setGeneration(generated);
      const errors = generated.problems.filter((problem) => problem.severity === 'error');
      if (errors.length) throw new Error(`Fix ${errors.length} Blockly error${errors.length === 1 ? '' : 's'} before submitting.`);
      const canonical = toCanonicalNestRobotProgram(generated.program, { allowLearningPreviewMove: isReachTarget });
      if (!canonical.ok) throw new Error(canonical.issues[0]?.message ?? 'This program cannot be evaluated yet.');
      const workspaceJson = Blockly.serialization.workspaces.save(workspace);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      setSaveState('saving');
      const result=await runC1Evidence({saveProgram:async()=>{await learnerApi.updateProgram(data.program.id,session.access_token,{workspaceJson,robotProgram:canonical.program});setSaveState('saved');setEvidenceStage('program_saved');},createVersion:async()=>{const version=await learnerApi.createVersion(data.program.id,session.access_token,'Student lesson evaluation');setLastProgramVersionId(version.id);setEvidenceStage('version_created');return version;},submit:async versionId=>{const submission=await learnerApi.submit(data.attempt.id,session.access_token,versionId);setEvidenceStage('submission_persisted');return submission;},createExperiment:async versionId=>{const experiment=await learnerApi.createSchematic(data.attempt.id,session.access_token,versionId);setEvidenceStage('experiment_created');return experiment;},runExperiment:async experimentId=>{const output=await learnerApi.runSchematic(experimentId,session.access_token);setEvidenceStage('experiment_run');return output;},evaluate:async experimentId=>{const evidence=await learnerApi.evaluateSymbolic(experimentId,session.access_token);setEvidenceStage('evaluation_persisted');return evidence;}});
      setEvaluation(result.evaluation);
    } catch (requestError) { setEvaluationError(requestError instanceof Error ? requestError.message : 'Could not evaluate this program.'); }
    finally { evaluationLock.current=false; setEvaluating(false); }
  };

  const resetPreview = () => { setPreviewPlaying(false); setPreviewIndex(0); setPreviewSelectedArm('left'); setPreviewState(createInitialState()); };
  const togglePreview = () => { if (previewIndex >= previewSteps.length) resetPreview(); setPreviewPlaying((playing) => !playing || previewIndex >= previewSteps.length); };
  const runRobot = async () => {
    if (!session || !attemptId || robotStarting) return;
    setConfirmRobotRun(false); setRobotError(null); setRobotStarting(true);
    try { setRobotExecution(await executionClient.executeProgram({ accessToken: session.access_token, attemptId })); }
    catch (requestError) { setRobotError(requestError instanceof Error ? requestError.message : 'Could not start robot execution.'); }
    finally { setRobotStarting(false); }
  };
  const stopRobot = async () => {
    if (!session || !robotExecution) return;
    try { setRobotExecution(await executionClient.stopExecution({ accessToken: session.access_token, executionId: robotExecution.id })); }
    catch (requestError) { setRobotError(requestError instanceof Error ? requestError.message : 'Could not stop robot execution.'); }
  };

  if (loading) return <div className="mx-auto w-full max-w-[1060px] px-4 py-10 text-sm text-ink-muted md:px-8">Preparing your practice workspace…</div>;
  if (error || !data) return <EmptyState icon={<FileQuestionIcon />} title="Practice workspace unavailable" description={error ?? 'This practice attempt could not be opened.'} action={<div className="flex gap-2"><Button variant="secondary" onClick={load} icon={<RotateCcwIcon className="h-4 w-4" />}>Try again</Button><Link to="/courses" className="inline-flex h-9 items-center rounded-md border border-line-strong px-3.5 text-sm font-medium text-ink hover:bg-sunken">Courses</Link></div>} />;
  if (mode === 'physical-enabled' && data.assignment.title === 'VR Robot Control') return <VrPractice attempt={data.attempt} token={session?.access_token ?? ''} />;
  if (mode === 'physical-enabled' && data.assignment.title === 'Teach by Demonstration') return <DemonstrationPractice attempt={data.attempt} token={session?.access_token ?? ''} />;

  const toolbox = isReachTarget ? reachTargetToolbox : openCloseGripperToolbox;
  return <div className="mx-auto w-full max-w-[1680px] px-4 py-6 md:px-8 md:py-9">
    <Link to="/courses" className="text-[13px] text-ink-muted hover:text-ink">← Courses</Link>
    {isReachTarget && <section className="mt-5 rounded-xl border border-[#b8d9d3] bg-[#effaf7] p-4 text-sm text-ink"><strong>Learn · Predict</strong><p className="mt-1 text-ink-muted">X, Y and Z describe a lesson-only coordinate frame. Predict where Target A is, then build and compare your answer.</p><p className="mt-2 font-medium text-accent-ink">Visual learning preview — not physical robot reachability.</p></section>}
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(640px,1.35fr)_minmax(420px,0.85fr)]">
      <main className="min-w-0 rounded-xl border border-line bg-surface p-4 md:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Practice workspace</p><h1 className="mt-2 text-2xl font-semibold text-ink">{data.assignment.title}</h1><p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{data.assignment.instructions ?? 'Follow the mission instructions, then validate your Blockly program.'}</p></div><div data-tour="actions" className="flex items-center gap-2"><span role="status" className={saveState === 'error' ? 'text-xs text-danger' : 'text-xs text-ink-subtle'}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved to VISTA' : 'Save failed'}</span><Button size="sm" variant="secondary" onClick={validateProgram}>Validate</Button><Button size="sm" variant="primary" loading={evaluating} onClick={() => void submitAndEvaluate()}>Submit &amp; evaluate</Button></div></div>{saveError && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{saveError}</p>}{validationMessage && <p role="status" className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-ink">{validationMessage}</p>}{evaluationError && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{evidenceStage==='submission_persisted'||evidenceStage==='experiment_created'||evidenceStage==='experiment_run'?'Submission persisted · ':''}{evaluationError}</p>}<div data-tour="workspace" className="relative mt-5 h-[min(62vh,680px)] min-h-[460px] overflow-hidden rounded-lg border border-line bg-[#FBFAF8]"><BlocklyCanvas key={data.program.id} initialState={data.program.workspace_json} toolbox={toolbox} onReady={(workspace) => { workspaceRef.current = workspace; refreshGeneration(workspace); }} onChange={() => { if (workspaceRef.current) { refreshGeneration(workspaceRef.current); persistWorkspace(workspaceRef.current); setEvaluation(null); } }} /></div><p className="mt-3 text-xs text-ink-subtle">Your workspace is saved to VISTA. Final mission results always come from server evaluation.</p></main>
      <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:pr-1"><ProgramPreview state={previewState} steps={previewSteps} index={previewIndex} playing={previewPlaying} speed={previewSpeed} onToggle={togglePreview} onReset={resetPreview} onSpeed={setPreviewSpeed} target={isReachTarget ? learningTarget : null} />{isReachTarget ? <ReachTargetPanel target={learningTarget} steps={previewSteps} evaluation={evaluation} /> : <><LessonGuide onStartTour={() => setTourOpen(true)} onOpenGuide={() => setGuideOpen(true)} /><section className="rounded-xl border border-line bg-surface p-5"><p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Mission</p><h2 className="mt-2 text-base font-semibold text-ink">Open &amp; Close Gripper</h2><p className="mt-2 text-[13px] leading-relaxed text-ink-muted">Make the left gripper open, wait, then close.</p><ul className="mt-5 space-y-3"><MissionItem done={mission.selectedLeft}>Select the left arm</MissionItem><MissionItem done={mission.opened}>Open gripper action found</MissionItem><MissionItem done={mission.ordered}>Open → wait → close</MissionItem><MissionItem done={mission.waited}>Wait at least 1 second</MissionItem><MissionItem done={mission.closed}>Finish with the left gripper closed</MissionItem></ul></section></>}{mode==='physical-enabled'&&<PhysicalExecutionPanel status={robotStatus} execution={robotExecution} canRun={Boolean(!isReachTarget&&robotStatus?.eligible)} previewOnly={isReachTarget} onRequestRun={() => setConfirmRobotRun(true)} onStop={() => void stopRobot()} error={robotError} />}{evaluation && <EvaluationResult evaluation={evaluation} />}<p className="px-1 text-xs leading-relaxed text-ink-subtle">{isReachTarget ? 'Visual learning preview — not physical robot reachability.' : mode==='physical-enabled'?'Physical authorization is always verified by VISTA before a run starts.':'This learning workspace creates schematic evidence only; no robot command is sent.'}</p></aside>
    </div>
    <PracticeWalkthrough open={tourOpen} onClose={() => setTourOpen(false)} />
    <QuickGuide open={guideOpen} onClose={() => setGuideOpen(false)} onStartTour={() => { setGuideOpen(false); setTourOpen(true); }} />
    <Dialog open={mode==='physical-enabled'&&confirmRobotRun} onClose={() => setConfirmRobotRun(false)} size="sm" title="Run on Robot?" footer={<><Button variant="secondary" onClick={() => setConfirmRobotRun(false)}>Cancel</Button><Button variant="danger" loading={robotStarting} disabled={!robotStatus?.eligible} onClick={() => void runRobot()}>Confirm run</Button></>}><div className="space-y-3 text-sm text-ink-muted"><p><strong className="text-ink">{robotStatus?.robotName ?? 'Robot'}</strong> will execute the server-approved program.</p><p>ProgramVersion: <span className="font-mono text-xs">{robotStatus?.programVersionId ?? 'Checking…'}</span></p><p>Persisted symbolic evaluation: <strong className="text-ok">PASS</strong></p><p>Confirm only when the workspace is clear and a supervisor has approved execution.</p></div></Dialog>
  </div>;
}

function MissionItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return <li className="flex items-start gap-2 text-[13px] text-ink"><span className="mt-px shrink-0">{done ? <CheckCircle2Icon className="h-4 w-4 text-ok" /> : <CircleIcon className="h-4 w-4 text-line-strong" />}</span><span>{children}</span></li>;
}

function EvaluationResult({ evaluation }: { evaluation: ApiSymbolicEvaluation }) {
  const passed = evaluation.verdict === 'passed';
  return <section className={passed ? 'rounded-xl border border-ok/30 bg-ok-soft p-5' : 'rounded-xl border border-danger/25 bg-danger-soft p-5'}><div className="flex items-start gap-3"><span className={passed ? 'text-ok' : 'text-danger'}>{passed ? <CheckCircle2Icon className="h-5 w-5" /> : <XCircleIcon className="h-5 w-5" />}</span><div><h2 className="font-semibold text-ink">{passed ? 'Mission completed' : 'Almost there!'}</h2><p className="mt-1 text-xs text-ink-muted">{evaluation.metrics.passedRuleCount}/{evaluation.metrics.ruleCount} mission checks passed</p></div></div><ul className="mt-4 space-y-2">{evaluation.ruleResults.map((rule) => <li key={rule.ordinal} className="flex items-start gap-2 text-[13px] text-ink"><span className="mt-px shrink-0">{rule.passed ? <CheckCircle2Icon className="h-4 w-4 text-ok" /> : <TriangleAlertIcon className="h-4 w-4 text-danger" />}</span><span><span className="font-medium">{ruleLabel(rule.type)}</span><span className="block text-xs text-ink-muted">{rule.reason}</span></span></li>)}</ul><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink">{passed ? 'Pass' : 'Needs revision'}</p></section>;
}

function ProgramPreview({ state, steps, index, playing, speed, onToggle, onReset, onSpeed, target }: { state: SimState; steps: CanonicalNestStep[]; index: number; playing: boolean; speed: number; onToggle: () => void; onReset: () => void; onSpeed: (speed: number) => void; target: LearningTarget | null }) {
  const step = steps[Math.min(index, Math.max(steps.length - 1, 0))];
  const label = step ? previewLabel(step) : 'Build a valid program to preview it.';
  return <section data-tour="preview" className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_12px_30px_rgba(24,32,36,0.06)]"><div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3"><div><div className="flex items-center gap-2"><p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Program preview</p><span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-ink">SO-101 3D</span></div><p className="mt-1 text-xs text-ink-muted">Interactive stage · visual behavior may differ from hardware.</p></div><span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-medium text-ink-muted">{steps.length ? `Step ${Math.min(index + 1, steps.length)}/${steps.length}` : 'Ready'}</span></div><div className="relative h-[320px] overflow-hidden border-b border-line bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#f3f1ea_64%,#e9e6dc_100%)] xl:h-[340px]"><div className="absolute left-4 top-4 rounded-full border border-line bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-ink-muted shadow-sm">{target ? `${target.label} · learning_preview_v1` : 'Live local preview'}</div><StudioViewerBoundary key="practice-program-preview"><So101Viewer3D state={state} learningTarget={target?.position ?? null} /></StudioViewerBoundary></div><div className="p-4"><p className="min-h-5 text-sm font-medium text-ink">{index >= steps.length && steps.length ? 'Preview completed' : label}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1 rounded-md bg-sunken p-0.5">{[1, 2, 4].map((option) => <button key={option} type="button" onClick={() => onSpeed(option)} className={speed === option ? 'h-7 rounded bg-surface px-2 text-xs font-medium text-ink shadow-hairline' : 'h-7 rounded px-2 text-xs text-ink-muted hover:text-ink'}>{option}×</button>)}</div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={onReset} icon={<RotateCcwIcon className="h-3.5 w-3.5" />}>Reset</Button><Button size="sm" variant="primary" disabled={!steps.length} onClick={onToggle} icon={playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5 fill-current" />}>{playing ? 'Pause' : index >= steps.length ? 'Preview again' : 'Preview'}</Button></div></div></div></section>;
}

function ReachTargetPanel({ target, steps, evaluation }: { target: LearningTarget | null; steps: CanonicalNestStep[]; evaluation: ApiSymbolicEvaluation | null }) {
  const answer = [...steps].reverse().find((step): step is Extract<CanonicalNestStep, { type: 'preview.move_xyz' }> => step.type === 'preview.move_xyz');
  const p = answer?.position; const t = target?.position;
  const delta = p && t ? { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z } : null;
  return <section className="rounded-xl border border-line bg-surface p-5"><p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Compare · Reflect</p><h2 className="mt-2 text-base font-semibold text-ink">{target?.label ?? 'Target A'}</h2><p className="mt-1 text-xs text-ink-muted">Learning Preview Coordinate Frame · <code>learning_preview_v1</code></p><dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><Coord label="Target" value={t} /><Coord label="Your answer" value={p} /><Coord label="Delta" value={delta} /></dl><p className="mt-4 rounded-md bg-sunken px-3 py-2 text-xs text-ink-muted">{evaluation ? (evaluation.verdict === 'passed' ? 'Your declared preview position matches Target A.' : 'Adjust X, Y and Z, then retry.') : 'Predict first, then validate and compare your result.'}</p><p className="mt-3 text-xs font-medium text-accent-ink">Visual learning preview — not physical robot reachability.</p></section>;
}
function Coord({ label, value }: { label: string; value?: { x: number; y: number; z: number } | null }) { return <div className="rounded-md bg-canvas p-2"><dt className="text-ink-subtle">{label}</dt><dd className="mt-1 font-mono text-[11px] text-ink">{value ? `${value.x}, ${value.y}, ${value.z}` : '—'}</dd></div>; }

function LessonGuide({ onStartTour, onOpenGuide }: { onStartTour: () => void; onOpenGuide: () => void }) {
  return <section className="overflow-hidden rounded-xl border border-[#b8d9d3] bg-[linear-gradient(135deg,#effaf7_0%,#f8fcfa_64%,#fff_100%)] p-5 shadow-[0_10px_24px_rgba(22,128,113,0.08)]"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white"><SparklesIcon className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-ink">New here? Let VISTA show you.</p><p className="mt-1 text-[13px] leading-relaxed text-ink-muted">A short walkthrough highlights exactly where to build, preview, and check your mission.</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><Button size="sm" variant="primary" className="w-full" onClick={onStartTour} icon={<CircleHelpIcon className="h-3.5 w-3.5" />}>Start tour</Button><Button size="sm" variant="secondary" className="w-full" onClick={onOpenGuide} icon={<BookOpenIcon className="h-3.5 w-3.5" />}>Quick guide</Button></div></section>;
}

function QuickGuide({ open, onClose, onStartTour }: { open: boolean; onClose: () => void; onStartTour: () => void }) {
  return <Dialog open={open} onClose={onClose} size="sm" title="Your first robot program"><div className="space-y-5"><div className="rounded-xl border border-line bg-canvas p-4"><div className="flex items-center gap-2 text-xs font-medium text-accent-ink"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Animated walkthrough · about 45 seconds</div><div className="mt-4 flex items-center gap-1.5"><span className="rounded bg-[#8155a3] px-2 py-1 text-xs font-semibold text-white">use left arm</span><span className="text-ink-subtle">→</span><span className="rounded bg-[#bd7908] px-2 py-1 text-xs font-semibold text-white">open</span><span className="text-ink-subtle">→</span><span className="rounded bg-[#687583] px-2 py-1 text-xs font-semibold text-white">wait 1s</span><span className="text-ink-subtle">→</span><span className="rounded bg-[#bd7908] px-2 py-1 text-xs font-semibold text-white">close</span></div></div><ol className="space-y-3 text-sm text-ink"><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">1</span><span><strong>Choose an arm.</strong><br /><span className="text-ink-muted">Drag “use left arm” below the start block.</span></span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">2</span><span><strong>Build the sequence.</strong><br /><span className="text-ink-muted">Open, wait one second, then close the gripper.</span></span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">3</span><span><strong>Preview before submitting.</strong><br /><span className="text-ink-muted">Watch the 3D robot, then validate and evaluate.</span></span></li></ol><Button variant="primary" className="w-full" onClick={onStartTour} icon={<CircleHelpIcon className="h-4 w-4" />}>Show me where</Button></div></Dialog>;
}

const tourSteps = [
  { selector: '', title: 'Welcome to your robot workspace', body: 'We will show you the three places you need for this lesson.' },
  { selector: '[data-tour="workspace"]', title: 'Build with blocks', body: 'Choose a category on the left, then drag blocks into the dotted workspace.' },
  { selector: '[data-tour="preview"]', title: 'Watch it first', body: 'Preview makes the 3D robot follow your block sequence before you submit.' },
  { selector: '[data-tour="actions"]', title: 'Check your work', body: 'Validate catches Blockly mistakes. Submit & evaluate checks whether your robot solved the mission.' },
];

function PracticeWalkthrough({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => { if (!open) { setStep(0); setRect(null); return; } const update = () => { const selector = tourSteps[step].selector; setRect(selector ? document.querySelector(selector)?.getBoundingClientRect() ?? null : null); }; update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true); return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); }; }, [open, step]);
  if (!open) return null;
  const current = tourSteps[step]; const last = step === tourSteps.length - 1;
  const left = rect ? Math.max(16, Math.min(rect.left, window.innerWidth - 340)) : Math.max(16, window.innerWidth / 2 - 160);
  const top = rect ? Math.min(rect.bottom + 16, window.innerHeight - 205) : Math.max(80, window.innerHeight / 2 - 95);
  return <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="VISTA guided tour"><div className="absolute inset-0 bg-[#10211e]/20" />{rect && <div className="pointer-events-none fixed rounded-xl border-2 border-white/90 transition-all duration-500 ease-out" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(11, 24, 22, 0.62)' }} />}{!rect && <div className="absolute inset-0 bg-[#0b1816]/50" />}<div className="fixed w-[min(320px,calc(100vw-32px))] rounded-2xl border border-white/15 bg-[#163c36] p-5 text-white shadow-2xl transition-all duration-500" style={{ left, top }}><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a9e4d9]">Step {step + 1} of {tourSteps.length}</span><button type="button" className="text-xs text-white/65 hover:text-white" onClick={onClose}>Skip tour</button></div><h2 className="mt-3 text-lg font-semibold tracking-tight">{current.title}</h2><p className="mt-2 text-sm leading-relaxed text-white/75">{current.body}</p><div className="mt-5 flex items-center justify-between"><button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)} className="inline-flex items-center gap-1 text-xs font-medium text-white/70 disabled:opacity-30"><ChevronLeftIcon className="h-4 w-4" />Back</button><button type="button" onClick={() => last ? onClose() : setStep((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#163c36] active:scale-[0.98]">{last ? 'Start building' : 'Next'}{!last && <ChevronRightIcon className="h-4 w-4" />}</button></div></div></div>;
}

function PhysicalExecutionPanel({ status, execution, canRun, previewOnly, onRequestRun, onStop, error }: { status: PhysicalRobotStatus | null; execution: PhysicalExecution | null; canRun: boolean; previewOnly?: boolean; onRequestRun: () => void; onStop: () => void; error: string | null }) {
  const running = execution?.state === 'queued' || execution?.state === 'running';
  const ready = status?.state === 'ready';
  if (previewOnly) return <section className="rounded-xl border border-line bg-surface p-5"><p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Physical robot</p><h2 className="mt-2 text-base font-semibold text-ink">Locked</h2><p className="mt-2 text-[13px] leading-relaxed text-ink-muted">Locked — coordinate lesson is preview-only.</p></section>;
  return <section className="rounded-xl border border-line bg-surface p-5"><p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Physical robot</p><div className="mt-2 flex items-center justify-between gap-2"><h2 className="text-base font-semibold text-ink">{status?.robotName ?? 'Checking robot…'}</h2><span className={ready ? 'inline-flex items-center gap-1 text-xs font-medium text-ok' : 'inline-flex items-center gap-1 text-xs font-medium text-ink-subtle'}><span className={ready ? 'h-1.5 w-1.5 rounded-full bg-ok' : 'h-1.5 w-1.5 rounded-full bg-ink-subtle'} />{ready ? 'READY' : status?.state === 'running' ? 'RUNNING' : 'OFFLINE'}</span></div><p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{status?.message ?? 'Checking the VISTA execution service…'}</p>{error && <p role="alert" className="mt-3 rounded bg-danger-soft px-2.5 py-2 text-xs text-danger">{error}</p>}<div className="mt-4">{running ? <Button variant="danger" className="w-full" onClick={onStop}>Stop robot</Button> : <Button variant="primary" className="w-full" disabled={!ready || !canRun} onClick={onRequestRun}>Run on robot</Button>}</div></section>;
}

function previewLabel(step: CanonicalNestStep): string {
  if (step.type === 'arm.select') return `Select ${step.arm} arm`;
  if (step.type === 'home') return `Move ${step.arm} arm home`;
  if (step.type === 'wait') return `Wait ${step.durationMs} ms`;
  if (step.type === 'preview.move_xyz') return `Preview position: ${step.position.x}, ${step.position.y}, ${step.position.z}`;
  return step.type === 'gripper.open' ? 'Open gripper' : 'Close gripper';
}

function ruleLabel(type: string): string {
  return ({ arm_selected: 'Left arm selected', action_present: 'Open gripper action found', ordered_actions: 'Open → wait → close', symbolic_duration: 'Wait duration is at least 1 second', final_gripper_state: 'Final left gripper state is closed' } as Record<string, string>)[type] ?? type;
}
