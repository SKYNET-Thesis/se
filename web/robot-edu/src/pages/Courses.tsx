import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { ArrowRightIcon, BookOpenIcon, PlayCircleIcon, RotateCwIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { ApiError, catalogApi, learnerApi, progressionApi, type ApiCourse, type ApiEnrollment } from "../lib/api";
import { useSupabaseSession } from "../contexts/SupabaseSessionContext";
import { useRole } from "../contexts/RoleContext";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Button } from "../components/ui/Button";
import { learningErrorMessage } from "../queries/studentLearningModel";
import { studentLearningKeys } from "../queries/studentLearningQueries";

/** Progress and lesson counts are null when the server could not tell us; they are never shown as 0 instead. */
interface CourseCard extends ApiCourse { lessonCount: number | null; access: "enrolled" | "teacher"; progressPercent: number | null; }

/** Plain messages for the course list. Raw API or database text is never shown to students. */
/** Same wording as My Learning (learningErrorMessage); only the list-level permission answer differs. */
function coursesLoadMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Your account can’t open courses right now. Ask your teacher to check your access.";
  return learningErrorMessage(error, "courses");
}
const canRetryCourses = (error: unknown) => !(error instanceof ApiError && (error.status === 401 || error.status === 403));

/** The authenticated learner's course home; access is determined by Nest. */
export function Courses() {
  const { session, sessionRevision } = useSupabaseSession();
  const { role } = useRole();
  const [query, setQuery] = useState("");
  const token = session?.access_token ?? "";
  const userId = session?.user.id;
  const enabled = Boolean(token) && role !== "admin";
  // The course list and enrollments decide what is shown, so they must load. Progress, lesson counts and practice
  // missions are extras: if they fail, the page says so instead of failing or pretending they are zero. The app query
  // client retries once, and the shared course-path cache keeps the burst of requests small.
  const catalog = useQuery({ queryKey: ["student-courses", "catalog", userId, sessionRevision], queryFn: () => catalogApi.courses(token, 1, 100), enabled });
  const enrollments = useQuery({ queryKey: ["student-courses", "enrollments", userId, sessionRevision], queryFn: () => learnerApi.enrollments(token), enabled });
  const attempts = useQuery({ queryKey: ["student-courses", "attempts", userId, sessionRevision], queryFn: () => learnerApi.attempts(token), enabled: enabled && role === "student" });
  const paths = useQuery({ queryKey: studentLearningKeys.coursePaths(userId, sessionRevision), queryFn: () => progressionApi.coursePaths(token), enabled: enabled && role === "student", staleTime: 30_000 });
  const courseIds = (catalog.data?.items ?? []).map((course) => course.id);
  const lessonCounts = useQuery({
    queryKey: ["student-courses", "lesson-counts", courseIds.join(","), sessionRevision],
    queryFn: async () => {
      const settled = await Promise.allSettled(courseIds.map((id) => catalogApi.lessons(id, token).then((lessons) => lessons.length)));
      return Object.fromEntries(settled.map((result, index) => [courseIds[index], result.status === "fulfilled" ? result.value : null])) as Record<string, number | null>;
    },
    enabled: enabled && catalog.isSuccess && courseIds.length > 0,
  });

  const required = [catalog, enrollments];
  const failed = required.find((item) => item.isError);
  const hasData = Boolean(catalog.data && enrollments.data);
  const loading = !hasData && !failed;
  const courses: CourseCard[] = useMemo(() => {
    if (!catalog.data || !enrollments.data) return [];
    const enrolled = new Set(enrollments.data.filter((entry: ApiEnrollment) => entry.status === "active").map((entry) => entry.course_id));
    const pathByCourse = paths.data ? new Map(paths.data.map((path) => [path.course.id, path])) : null;
    return catalog.data.items.map((course) => ({
      ...course,
      lessonCount: lessonCounts.data?.[course.id] ?? null,
      access: enrolled.has(course.id) ? "enrolled" : "teacher",
      progressPercent: pathByCourse ? pathByCourse.get(course.id)?.progressPercent ?? 0 : null,
    }));
  }, [catalog.data, enrollments.data, paths.data, lessonCounts.data]);
  const retry = () => { for (const item of [catalog, enrollments, attempts, paths]) if (item.isError) void item.refetch(); };

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return courses.filter((course) => !value || `${course.title} ${course.description ?? ""}`.toLowerCase().includes(value));
  }, [courses, query]);
  const inProgress = (attempts.data ?? []).filter((attempt) => attempt.status === "in_progress").length;

  if (role === 'admin') {
    return <Navigate to="/admin/courses" replace />;
  }

  // A07: teachers and school administrators open this page as their course catalogue. They have no enrollment, so they
  // see course details (CourseInfo) instead of the student course path, and no student progress or access badges.
  const staff = Boolean(role) && role !== "student"; // never decided while the role is still loading
  const summary = loading ? "Loading your courses…" : failed && !hasData ? "Course list unavailable" : staff ? `${courses.length} course${courses.length === 1 ? "" : "s"} available to you` : `${courses.length} enrolled course${courses.length === 1 ? "" : "s"}${paths.isError ? ". Progress couldn’t be loaded." : ""}`;

  // For a student, GET /courses returns the enrolled courses; My learning is where they resume, so this page is the list.
  return <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-9">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">Courses</h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">{summary}</p>
      </div>
      {hasData && courses.length > 0 && <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:ring-2 focus-within:ring-accent sm:w-[260px]"><SearchIcon className="h-4 w-4 text-ink-subtle" aria-hidden /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses" aria-label="Search courses" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle" /></label>}
    </header>

    {failed && !hasData && (
      <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
        <span>{coursesLoadMessage(failed.error)}</span>
        {canRetryCourses(failed.error) && <Button size="sm" variant="secondary" onClick={retry} loading={required.some((item) => item.isFetching)} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}
      </div>
    )}
    {hasData && [catalog, enrollments].some((item) => item.isError) && (
      <p role="status" className="mt-5 rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-ink">Your course list couldn’t be refreshed, so it may be out of date. <button type="button" onClick={retry} className="font-semibold text-accent underline underline-offset-4">Try again</button></p>
    )}
    {/* Only when the server reports an unfinished attempt; attempts belong to classroom assignments, so that is where they resume. */}
    {inProgress > 0 && (
      <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <PlayCircleIcon className="h-4 w-4 text-accent" aria-hidden />
        {inProgress === 1 ? "You have a practice mission in progress." : `You have ${inProgress} practice missions in progress.`}
        <Link to="/assignments" className="inline-flex min-h-[32px] items-center font-semibold text-accent underline-offset-4 hover:underline">Open assignments</Link>
      </p>
    )}

    <section aria-label="Enrolled courses">
      {loading ? <CourseSkeletons /> : failed && !hasData ? null : visible.length === 0 ? <div className="mt-6"><EmptyState icon={<SearchXIcon />} title={courses.length ? "No matching courses" : "No courses yet"} description={courses.length ? "Try a different search." : "Ask your teacher to add you to a classroom or course."} /></div> : <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((course) => <CourseTile key={course.id} course={course} staff={staff} />)}</div>}
    </section>
  </main>;
}

function CourseTile({ course, staff }: { course: CourseCard; staff: boolean }) {
  return <article className="flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong">{!staff && course.access !== "enrolled" && <Badge tone="accent" dot>Teacher assigned</Badge>}<h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">{course.title}</h3>{course.description && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{course.description}</p>}{course.lessonCount !== null && <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-muted"><BookOpenIcon className="h-3.5 w-3.5" aria-hidden />{course.lessonCount} lesson{course.lessonCount === 1 ? "" : "s"}</p>}<div className="mt-auto pt-5">{staff ? null : course.progressPercent === null ? <p className="text-xs text-ink-muted">Progress unavailable right now</p> : <><div className="mb-2 flex justify-between text-xs text-ink-muted"><span>{course.progressPercent >= 100 ? "Completed" : course.progressPercent > 0 ? "In progress" : "Ready to start"}</span><span>{course.progressPercent}%</span></div><ProgressBar value={course.progressPercent} label={`${course.title} progress`} /></>}</div><Link to={staff ? `/courses/${course.id}/info` : `/courses/${course.id}`} aria-label={`${staff ? "View course details" : "Open course"}: ${course.title}`} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">{staff ? "View course details" : "Open course"}<ArrowRightIcon className="h-4 w-4" aria-hidden /></Link></article>;
}

function CourseSkeletons() { return <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[260px] animate-pulse rounded-xl border border-line bg-sunken/60" />)}</div>; }
