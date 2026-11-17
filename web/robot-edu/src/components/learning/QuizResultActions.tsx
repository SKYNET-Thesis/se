import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, RotateCcwIcon } from 'lucide-react';
import { learnerApi, type ApiClassroomAssignment, type KnowledgeCheckSubmissionResult } from '../../lib/api';
import { quizAction, quizErrorMessage, quizWindow } from '../../queries/quizAttemptModel';
import { studentLearningKeys } from '../../queries/studentLearningQueries';
import { Button } from '../ui/Button';
import { LinkButton } from '../ui/LinkButton';
import { PassedEarlierNote } from './assessment';

/**
 * Next steps under a quiz result. Whether another attempt is possible comes from the delivery and the server's attempt
 * history; a retake is only started when the student presses Try again (the server returns the open attempt instead of
 * creating a second one).
 */
export function QuizResultActions({ result, assignment, token, courseId }: { result: KnowledgeCheckSubmissionResult; assignment: ApiClassroomAssignment; token: string; courseId?: string | null }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const lock = useRef(false);
  const history = useQuery({ queryKey: studentLearningKeys.history(assignment.id), queryFn: () => learnerApi.attemptHistory(assignment.id, token), enabled: Boolean(token) && !result.passed });
  // A failed attempt after an earlier pass: the quiz stays passed (server keeps any passing attempt).
  const earlierPass = !result.passed ? history.data?.find((attempt) => attempt.passed && attempt.id !== result.attemptId) : undefined;
  const retake = useMutation({
    mutationFn: () => learnerApi.createAttempt(assignment.id, token),
    onSuccess: (attempt) => { void client.invalidateQueries({ queryKey: studentLearningKeys.all }); navigate(`/practice/${attempt.id}`); },
    onSettled: () => { lock.current = false; },
  });
  const overview = `/my-learning/${assignment.id}`;
  const action = history.data ? quizAction({ window: quizWindow(assignment), attempts: history.data, maxAttempts: assignment.max_attempts, lessonQuiz: false }) : null;

  if (result.passed) {
    return <>
      {courseId && <LinkButton to={`/courses/${courseId}`} variant="primary" className="h-11 px-5">Continue course <ArrowRightIcon className="h-4 w-4" aria-hidden /></LinkButton>}
      <LinkButton to={overview} variant="secondary" className="h-11">Back to quiz</LinkButton>
    </>;
  }
  if (earlierPass) {
    return <>
      <div className="basis-full border-t border-line pt-4 text-[15px] text-ink"><PassedEarlierNote attempt={earlierPass.attempt_number} /></div>
      {courseId && <LinkButton to={`/courses/${courseId}`} variant="primary" className="h-11 px-5">Continue course <ArrowRightIcon className="h-4 w-4" aria-hidden /></LinkButton>}
      {action?.kind === 'start'
        ? <Button variant="secondary" className="h-11" loading={retake.isPending} icon={<RotateCcwIcon className="h-4 w-4" aria-hidden />}
          onClick={() => { if (lock.current) return; lock.current = true; retake.mutate(); }}>Practice again</Button>
        : <LinkButton to={overview} variant="secondary" className="h-11">Back to quiz</LinkButton>}
      {retake.error && <p role="alert" className="basis-full rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{quizErrorMessage(retake.error, 'start')}</p>}
    </>;
  }
  // One primary action: try again while the delivery allows it; otherwise go back to the course and keep learning.
  return <>
    {action?.kind === 'blocked' && <p className="basis-full text-[15px] text-ink">{action.reason} Review your answers below, then keep going with the course.</p>}
    {action?.kind === 'start' && <Button variant="primary" className="h-11 px-5" loading={retake.isPending} icon={<RotateCcwIcon className="h-4 w-4" aria-hidden />}
      onClick={() => { if (lock.current) return; lock.current = true; retake.mutate(); }}>Try again</Button>}
    {action?.kind === 'continue' && <LinkButton to={`/practice/${action.attemptId}`} variant="primary" className="h-11 px-5">Continue your open attempt</LinkButton>}
    {action?.kind === 'blocked' && courseId && <LinkButton to={`/courses/${courseId}`} variant="primary" className="h-11 px-5">Back to course <ArrowRightIcon className="h-4 w-4" aria-hidden /></LinkButton>}
    <LinkButton to={overview} variant="secondary" className="h-11">Back to quiz</LinkButton>
    {retake.error && <p role="alert" className="basis-full rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{quizErrorMessage(retake.error, 'start')}</p>}
  </>;
}
