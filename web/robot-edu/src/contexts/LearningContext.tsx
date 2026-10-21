import React, { createContext, useCallback, useContext, useMemo } from 'react';
import type { Assignment, AssignmentProgress, Course, Lesson, Submission, SubmissionReview } from '../types/learning';
import { demoAssignments } from '../data/assignments';
import { demoCourses } from '../data/courses';
import { demoSubmissions } from '../data/demoSubmissions';
import { demoPersonas } from '../data/demoPersonas';
import { usePersistentState } from '../hooks/usePersistentState';
import { createId } from '../utils/id';
import { isRecord, STORAGE_KEYS } from '../utils/storage';
import { daysFromNow } from '../utils/format';

interface Catalog {
  courses: Course[];
  assignments: Assignment[];
}

interface LearnerState {
  completedLessons: string[];
  lastLesson: {courseId: string;lessonId: string;} | null;
  progress: Record<string, AssignmentProgress>;
}

export interface SubmitInput {
  programName: string;
  programId: string | null;
  commandCount: number;
  problemCount: number;
  lastRunOutcome: Submission['lastRunOutcome'];
  note: string;
}

interface LearningContextValue extends Catalog, LearnerState {
  submissions: Submission[];
  getCourse: (id: string) => Course | undefined;
  getAssignment: (id: string) => Assignment | undefined;
  findLesson: (lessonId: string) => {course: Course;lesson: Lesson;} | undefined;
  courseProgress: (course: Course) => {done: number;total: number;pct: number;};
  setLessonComplete: (courseId: string, lessonId: string, done: boolean) => void;
  visitLesson: (courseId: string, lessonId: string) => void;
  getProgress: (assignmentId: string) => AssignmentProgress;
  updateProgress: (assignmentId: string, patch: Partial<AssignmentProgress>) => void;
  submitAssignment: (assignmentId: string, input: SubmitInput) => void;
  withdrawSubmission: (assignmentId: string) => void;
  upsertCourse: (course: Course) => void;
  deleteCourse: (id: string) => void;
  upsertLesson: (courseId: string, lesson: Lesson) => void;
  deleteLesson: (courseId: string, lessonId: string) => void;
  upsertAssignment: (assignment: Assignment) => void;
  deleteAssignment: (id: string) => void;
  reviewSubmission: (id: string, review: SubmissionReview) => void;
}

const LearningContext = createContext<LearningContextValue | null>(null);

const isCatalog = (v: unknown): v is Catalog => isRecord(v) && Array.isArray(v.courses) && Array.isArray(v.assignments);
const isLearner = (v: unknown): v is LearnerState => isRecord(v) && Array.isArray(v.completedLessons) && isRecord(v.progress);
const isSubmissions = (v: unknown): v is Submission[] => Array.isArray(v) && v.every((s) => isRecord(s) && typeof s.id === 'string');

const seedLearner = (): LearnerState => ({
  completedLessons: ['motion-frames', 'motion-reach'],
  lastLesson: { courseId: 'rob-101', lessonId: 'motion-first-program' },
  progress: {
    'asg-reach': { assignmentId: 'asg-reach', status: 'in_progress', programId: 'prog_reach', note: '', updatedAt: daysFromNow(0, 8), submittedAt: null },
    'asg-sort-red': { assignmentId: 'asg-sort-red', status: 'in_progress', programId: 'prog_pick_red', note: '', updatedAt: daysFromNow(-1, 16), submittedAt: null }
  }
});

const emptyProgress = (assignmentId: string): AssignmentProgress => ({
  assignmentId,
  status: 'not_started',
  programId: null,
  note: '',
  updatedAt: new Date().toISOString(),
  submittedAt: null
});

export function LearningProvider({ children }: {children: React.ReactNode;}) {
  const [catalog, setCatalog] = usePersistentState<Catalog>(STORAGE_KEYS.catalog, 1, () => ({ courses: demoCourses, assignments: demoAssignments }), isCatalog);
  const [learner, setLearner] = usePersistentState<LearnerState>(STORAGE_KEYS.learning, 1, seedLearner, isLearner);
  const [submissions, setSubmissions] = usePersistentState<Submission[]>(STORAGE_KEYS.submissions, 1, () => demoSubmissions, isSubmissions);

  const getCourse = useCallback((id: string) => catalog.courses.find((c) => c.id === id), [catalog.courses]);
  const getAssignment = useCallback((id: string) => catalog.assignments.find((a) => a.id === id), [catalog.assignments]);
  const findLesson = useCallback(
    (lessonId: string) => {
      for (const course of catalog.courses) {
        const lesson = course.lessons.find((l) => l.id === lessonId);
        if (lesson) return { course, lesson };
      }
      return undefined;
    },
    [catalog.courses]
  );

  const courseProgress = useCallback(
    (course: Course) => {
      const total = course.lessons.length;
      const done = course.lessons.filter((l) => learner.completedLessons.includes(l.id)).length;
      return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
    },
    [learner.completedLessons]
  );

  const setLessonComplete = useCallback(
    (courseId: string, lessonId: string, done: boolean) =>
    setLearner((prev) => ({
      ...prev,
      lastLesson: { courseId, lessonId },
      completedLessons: done ? Array.from(new Set([...prev.completedLessons, lessonId])) : prev.completedLessons.filter((id) => id !== lessonId)
    })),
    [setLearner]
  );

  const visitLesson = useCallback(
    (courseId: string, lessonId: string) =>
    setLearner((prev) => prev.lastLesson?.lessonId === lessonId ? prev : { ...prev, lastLesson: { courseId, lessonId } }),
    [setLearner]
  );

  const getProgress = useCallback((id: string) => learner.progress[id] ?? emptyProgress(id), [learner.progress]);

  const updateProgress = useCallback(
    (id: string, patch: Partial<AssignmentProgress>) =>
    setLearner((prev) => ({
      ...prev,
      progress: { ...prev.progress, [id]: { ...(prev.progress[id] ?? emptyProgress(id)), ...patch, updatedAt: new Date().toISOString() } }
    })),
    [setLearner]
  );

  const submitAssignment = useCallback(
    (assignmentId: string, input: SubmitInput) => {
      const now = new Date().toISOString();
      updateProgress(assignmentId, { status: 'submitted_local', submittedAt: now, programId: input.programId, note: input.note });
      setSubmissions((prev) => [
      {
        id: createId('sub'),
        assignmentId,
        studentName: demoPersonas.student.name,
        programName: input.programName,
        commandCount: input.commandCount,
        problemCount: input.problemCount,
        lastRunOutcome: input.lastRunOutcome,
        note: input.note,
        submittedAt: now,
        origin: 'this_browser',
        review: null
      },
      ...prev.filter((s) => !(s.assignmentId === assignmentId && s.origin === 'this_browser'))]
      );
    },
    [setSubmissions, updateProgress]
  );

  const withdrawSubmission = useCallback(
    (assignmentId: string) => {
      updateProgress(assignmentId, { status: 'in_progress', submittedAt: null });
      setSubmissions((prev) => prev.filter((s) => !(s.assignmentId === assignmentId && s.origin === 'this_browser')));
    },
    [setSubmissions, updateProgress]
  );

  const upsertCourse = useCallback(
    (course: Course) =>
    setCatalog((prev) => ({
      ...prev,
      courses: prev.courses.some((c) => c.id === course.id) ? prev.courses.map((c) => c.id === course.id ? course : c) : [...prev.courses, course]
    })),
    [setCatalog]
  );
  const deleteCourse = useCallback(
    (id: string) => setCatalog((prev) => ({ courses: prev.courses.filter((c) => c.id !== id), assignments: prev.assignments.filter((a) => a.courseId !== id) })),
    [setCatalog]
  );
  const upsertLesson = useCallback(
    (courseId: string, lesson: Lesson) =>
    setCatalog((prev) => ({
      ...prev,
      courses: prev.courses.map((c) =>
      c.id !== courseId ? c : { ...c, lessons: c.lessons.some((l) => l.id === lesson.id) ? c.lessons.map((l) => l.id === lesson.id ? lesson : l) : [...c.lessons, lesson] }
      )
    })),
    [setCatalog]
  );
  const deleteLesson = useCallback(
    (courseId: string, lessonId: string) =>
    setCatalog((prev) => ({ ...prev, courses: prev.courses.map((c) => c.id !== courseId ? c : { ...c, lessons: c.lessons.filter((l) => l.id !== lessonId) }) })),
    [setCatalog]
  );
  const upsertAssignment = useCallback(
    (a: Assignment) =>
    setCatalog((prev) => ({
      ...prev,
      assignments: prev.assignments.some((x) => x.id === a.id) ? prev.assignments.map((x) => x.id === a.id ? a : x) : [...prev.assignments, a]
    })),
    [setCatalog]
  );
  const deleteAssignment = useCallback((id: string) => setCatalog((prev) => ({ ...prev, assignments: prev.assignments.filter((a) => a.id !== id) })), [setCatalog]);

  const reviewSubmission = useCallback(
    (id: string, review: SubmissionReview) => {
      const target = submissions.find((s) => s.id === id);
      setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, review } : s));
      if (target && target.origin === 'this_browser') updateProgress(target.assignmentId, { status: 'reviewed' });
    },
    [submissions, setSubmissions, updateProgress]
  );

  const value = useMemo<LearningContextValue>(
    () => ({
      ...catalog,
      ...learner,
      submissions,
      getCourse,
      getAssignment,
      findLesson,
      courseProgress,
      setLessonComplete,
      visitLesson,
      getProgress,
      updateProgress,
      submitAssignment,
      withdrawSubmission,
      upsertCourse,
      deleteCourse,
      upsertLesson,
      deleteLesson,
      upsertAssignment,
      deleteAssignment,
      reviewSubmission
    }),
    [catalog, learner, submissions, getCourse, getAssignment, findLesson, courseProgress, setLessonComplete, visitLesson, getProgress, updateProgress, submitAssignment, withdrawSubmission, upsertCourse, deleteCourse, upsertLesson, deleteLesson, upsertAssignment, deleteAssignment, reviewSubmission]
  );

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning(): LearningContextValue {
  const ctx = useContext(LearningContext);
  if (!ctx) throw new Error('useLearning must be used within LearningProvider');
  return ctx;
}