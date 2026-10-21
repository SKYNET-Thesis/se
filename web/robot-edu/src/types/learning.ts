import type { RobotOp, ZoneId } from './robotProgram';

export type CourseLevel = 'Introductory' | 'Intermediate' | 'Advanced';

export type LessonSection =
{kind: 'text';heading?: string;body: string;} |
{kind: 'callout';tone: 'note' | 'safety';title: string;body: string;} |
{kind: 'steps';heading: string;items: string[];} |
{kind: 'terms';heading: string;items: Array<{term: string;definition: string;}>;};

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  objectives: string[];
  sections: LessonSection[];
}

export interface Course {
  id: string;
  code: string;
  title: string;
  summary: string;
  level: CourseLevel;
  image: string;
  imageAlt: string;
  instructor: string;
  published: boolean;
  lessons: Lesson[];
}

export type CriterionCheck =
{kind: 'manual';} |
{kind: 'no_errors';} |
{kind: 'uses_op';op: RobotOp;} |
{kind: 'run_completes';} |
{kind: 'object_in_zone';objectId: string;zone: ZoneId;};

export interface Criterion {
  id: string;
  text: string;
  check: CriterionCheck;
}

export interface Assignment {
  id: string;
  courseId: string;
  lessonId: string;
  title: string;
  summary: string;
  instructions: string[];
  objectives: string[];
  criteria: Criterion[];
  dueDate: string;
  points: number;
  published: boolean;
  starterId: string | null;
}

export type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted_local' | 'reviewed';

export interface AssignmentProgress {
  assignmentId: string;
  status: AssignmentStatus;
  programId: string | null;
  note: string;
  updatedAt: string;
  submittedAt: string | null;
}

export interface SubmissionReview {
  score: number;
  feedback: string;
  criteriaMet: string[];
  reviewedAt: string;
  reviewer: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentName: string;
  programName: string;
  commandCount: number;
  problemCount: number;
  lastRunOutcome: 'completed' | 'stopped' | 'failed' | 'not_run';
  note: string;
  submittedAt: string;
  origin: 'this_browser' | 'seed';
  review: SubmissionReview | null;
}