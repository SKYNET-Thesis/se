import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { progressionApi, type QuizPerformanceRating, type QuizResultAnalytics, type QuizResultBucket } from '../../lib/api';
import { Badge, type BadgeTone } from '../ui/Badge';

const RATING_TONE: Record<QuizPerformanceRating, BadgeTone> = { Excellent: 'ok', Good: 'ok', Satisfactory: 'accent', 'Needs Improvement': 'warn', 'Needs Review': 'danger' };
const SEGMENT_CLASS = ['text-accent', 'text-warn', 'text-ink-muted'];
const pct = (value: number | null) => (value === null ? 'N/A' : `${value}%`);
const pts = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Circular weighted-score ring. The number shown is the server's weighted score (earned / possible points). */
export function ScoreRing({ value, label }: { value: number | null; label: string }) {
  const radius = 52; const circumference = 2 * Math.PI * radius;
  const filled = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100 * circumference;
  return <div className="relative h-36 w-36 shrink-0" role="img" aria-label={label}>
    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
      <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="12" className="stroke-current text-line" />
      {filled > 0 && <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`} className="stroke-current text-accent" />}
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold" data-testid="quiz-weighted-score">{pct(value)}</span><span className="text-2xs text-ink-subtle">weighted score</span></div>
  </div>;
}

/** Donut of the question-type distribution; only the types present in the attempt get a segment. */
export function TypeDonut({ buckets }: { buckets: QuizResultBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const radius = 40; const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label={`Question types: ${buckets.map((b) => `${b.label} ${b.total}`).join(', ')}`}>
    <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="16" className="stroke-current text-line" />
    {total > 0 && buckets.map((b, i) => { const length = (b.total / total) * circumference; const el = <circle key={b.key} cx="50" cy="50" r={radius} fill="none" strokeWidth="16" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} className={`stroke-current ${SEGMENT_CLASS[i % SEGMENT_CLASS.length]}`} />; offset += length; return el; })}
  </svg>;
}

function Bars({ buckets, testId }: { buckets: QuizResultBucket[]; testId: string }) {
  return <ul className="space-y-3" data-testid={testId}>{buckets.map((b) => <li key={b.key}>
    <div className="flex flex-wrap justify-between gap-x-3 text-sm"><span className="font-medium">{b.label}</span><span className="text-ink-muted">{b.correct}/{b.total} correct · {pct(b.accuracy)} · {pts(b.earnedPoints)}/{pts(b.possiblePoints)} pts</span></div>
    <div className="mt-1 h-2 rounded-full bg-sunken" role="progressbar" aria-label={`${b.label} accuracy`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={b.accuracy ?? 0}><div className="h-2 rounded-full bg-accent" style={{ width: `${b.accuracy ?? 0}%` }} /></div>
  </li>)}</ul>;
}

export function reviewPath(target: { courseId: string; lessonId: string; activityId: string | null }) {
  return `/courses/${target.courseId}/lessons/${target.lessonId}${target.activityId ? `/activities/${target.activityId}` : ''}`;
}

export function QuizResultView({ data, retakeTo }: { data: QuizResultAnalytics; retakeTo?: string }) {
  const { overall, byType, byDifficulty, byTopic, byObjective, metadata } = data.analytics;
  const rec = data.recommendations;
  return <section aria-label="Quiz performance" className="mt-6 space-y-6 border-t border-line pt-6">
    <h3 className="text-base font-semibold">Quiz performance</h3>
    <div className="flex flex-wrap items-center gap-6">
      <ScoreRing value={overall.weightedScore} label={`Weighted score ${pct(overall.weightedScore)}`} />
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={data.passed ? 'ok' : 'danger'} dot><span data-testid="quiz-pass-fail">{data.passed ? 'PASS' : 'FAIL'}</span></Badge>
          {overall.rating && <Badge tone={RATING_TONE[overall.rating]}><span data-testid="quiz-rating">{overall.rating}</span></Badge>}
        </div>
        <p data-testid="quiz-points-summary"><strong>{pts(data.earnedPoints)}</strong> of <strong>{pts(data.possiblePoints)}</strong> points earned{data.passPercent !== null && <> · pass mark {data.passPercent}%</>}</p>
        <p data-testid="quiz-counts">{overall.correct} correct · {overall.incorrect} incorrect · {overall.unanswered} unanswered ({overall.total} questions)</p>
        <p className="text-ink-muted">Question accuracy: {pct(overall.accuracy)} of questions fully correct. This differs from the weighted score, which counts points.</p>
        <p className="text-2xs text-ink-subtle">{data.gradingPolicy} The rating is informational and does not change PASS/FAIL.</p>
      </div>
    </div>

    <div>
      <h4 className="text-sm font-semibold">Question types</h4>
      <div className="mt-2 flex flex-wrap items-center gap-6" data-testid="quiz-type-analytics">
        <TypeDonut buckets={byType} />
        <ul className="space-y-1 text-sm">{byType.map((b, i) => <li key={b.key} className="flex items-center gap-2"><span className={`inline-block h-3 w-3 rounded-sm bg-current ${SEGMENT_CLASS[i % SEGMENT_CLASS.length]}`} aria-hidden /><span className="font-medium">{b.label}</span><span className="text-ink-muted">{b.correct}/{b.total} correct · accuracy {pct(b.accuracy)}</span></li>)}</ul>
      </div>
    </div>

    <div><h4 className="mb-2 text-sm font-semibold">Difficulty</h4><Bars buckets={byDifficulty} testId="quiz-difficulty-analytics" /></div>

    <div data-testid="quiz-knowledge-performance">
      <h4 className="text-sm font-semibold">Knowledge performance</h4>
      {byObjective.length === 0 && metadata.questionsWithoutObjective === overall.total
        ? <p className="mt-1 text-sm text-ink-muted">Learning objective information is not available for these questions.</p>
        : <div className="mt-2"><Bars buckets={byObjective} testId="quiz-objective-analytics" /></div>}
      {metadata.questionsWithoutObjective > 0 && byObjective.length > 0 && <p className="mt-1 text-2xs text-ink-subtle">{metadata.questionsWithoutObjective} question{metadata.questionsWithoutObjective === 1 ? ' has' : 's have'} no learning objective and are not included above.</p>}
      {(byTopic.length > 1 || byTopic[0]?.key !== 'Unspecified') && <div className="mt-4"><p className="mb-2 text-xs font-medium text-ink-muted">By topic</p><Bars buckets={byTopic} testId="quiz-topic-analytics" /></div>}
    </div>

    <div data-testid="quiz-recommendations">
      <h4 className="text-sm font-semibold">Suggested review</h4>
      {rec.items.length === 0
        ? <p className="mt-1 text-sm text-ink-muted" role="status">{rec.note}</p>
        : <>
          <ul className="mt-2 space-y-3">{rec.items.map((item) => <li key={item.objectiveId} className="rounded-lg border border-line p-3 text-sm" data-testid="quiz-recommendation">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={item.priority === 'High' ? 'danger' : item.priority === 'Medium' ? 'warn' : 'neutral'}>{item.priority} priority</Badge><span className="font-medium">{item.topic}</span>{item.target.lessonTitle !== item.topic && <span className="text-ink-subtle">· {item.target.lessonTitle}</span>}</div>
            <p className="mt-1">{item.reason}</p>
            <Link className="mt-2 inline-block font-medium text-accent-ink underline" to={reviewPath(item.target)}>Review Lesson{item.targetKind === 'section' ? ': ' + item.topic : ''}</Link>
          </li>)}</ul>
          <p className="mt-2 text-2xs text-ink-subtle">{rec.note}</p>
        </>}
    </div>
    {retakeTo && <p className="text-sm"><Link className="font-medium text-accent-ink underline" to={retakeTo}>Retake quiz (if attempts remain) or review attempts</Link></p>}
  </section>;
}

/** Fetches the learner's own released quiz result analytics; the basic result above stays usable if this is unavailable. */
export function QuizResultDashboard({ attemptId, token, retakeTo }: { attemptId: string; token: string; retakeTo?: string }) {
  const query = useQuery({ queryKey: ['quiz-result-analytics', attemptId], queryFn: () => progressionApi.quizResult(attemptId, token), enabled: !!token && !!attemptId, retry: 1, staleTime: Infinity });
  if (query.isPending) return <p className="mt-4 text-sm text-ink-muted" role="status">Loading performance analysis…</p>;
  if (query.isError || !query.data) return <p className="mt-4 text-sm text-ink-muted" role="status">Detailed performance analysis is not available right now.</p>;
  return <QuizResultView data={query.data} retakeTo={retakeTo} />;
}
