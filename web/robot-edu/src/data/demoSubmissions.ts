import type { Submission } from '../types/learning';
import { daysFromNow } from '../utils/format';

/** DEMO RECORDS — fictional classmates, so the teacher review flow has something to review. */
export const demoSubmissions: Submission[] = [
{
  id: 'sub-seed-1',
  assignmentId: 'asg-wave',
  studentName: 'Leo Martins',
  programName: 'Wave v2',
  commandCount: 7,
  problemCount: 0,
  lastRunOutcome: 'completed',
  note: 'I added a short wait between waves so it looks friendlier.',
  submittedAt: daysFromNow(-1, 14),
  origin: 'seed',
  review: null
},
{
  id: 'sub-seed-2',
  assignmentId: 'asg-sort-red',
  studentName: 'Aisha Rahman',
  programName: 'Red to A',
  commandCount: 12,
  problemCount: 0,
  lastRunOutcome: 'completed',
  note: '',
  submittedAt: daysFromNow(-2, 10),
  origin: 'seed',
  review: {
    score: 14,
    feedback: 'Clean approach and a gentle release. Consider lifting higher before the sideways move.',
    criteriaMet: ['c1', 'c2', 'c3'],
    reviewedAt: daysFromNow(-1, 9),
    reviewer: 'Daniel Reyes'
  }
},
{
  id: 'sub-seed-3',
  assignmentId: 'asg-reach',
  studentName: 'Tom Becker',
  programName: 'reach',
  commandCount: 4,
  problemCount: 2,
  lastRunOutcome: 'failed',
  note: 'Not sure why the second point fails.',
  submittedAt: daysFromNow(0, 9),
  origin: 'seed',
  review: null
}];