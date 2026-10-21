import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon, BellIcon, BookOpenIcon, Clock3Icon, GraduationCapIcon, SearchIcon, SearchXIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { catalogApi, learnerApi, type ApiAttempt, type ApiCourse, type ApiEnrollment } from "../lib/api";
import { useSupabaseSession } from "../contexts/SupabaseSessionContext";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { ProgressBar } from "../components/ui/ProgressBar";

interface CourseCard extends ApiCourse { lessonCount: number; access: "enrolled" | "teacher"; }

/** The authenticated learner's course home; access is determined by Nest. */
export function Courses() {
  const { session } = useSupabaseSession();
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [attempts, setAttempts] = useState<ApiAttempt[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void (async () => {
      const [result, enrollments, ownAttempts] = await Promise.all([
        catalogApi.courses(session.access_token, 1, 100), learnerApi.enrollments(session.access_token), learnerApi.attempts(session.access_token),
      ]);
      const enrolled = new Set(enrollments.filter((entry: ApiEnrollment) => entry.status === "active").map((entry) => entry.course_id));
      const lessonCounts = await Promise.all(result.items.map((course) => catalogApi.lessons(course.id, session.access_token).then((lessons) => lessons.length)));
      if (!active) return;
      setCourses(result.items.map((course, index) => ({ ...course, lessonCount: lessonCounts[index], access: enrolled.has(course.id) ? "enrolled" : "teacher" })));
      setAttempts(ownAttempts);
    })().catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : "Could not load your learning space."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return courses.filter((course) => !value || `${course.title} ${course.description ?? ""}`.toLowerCase().includes(value));
  }, [courses, query]);
  const inProgress = attempts.filter((attempt) => attempt.status === "in_progress").length;
  const name = session?.user.email?.split("@")[0] ?? "Learner";

  return <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-9">
    <header className="grid gap-6 border-b border-line pb-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
      <div><div className="flex items-center gap-2 text-sm font-medium text-accent-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-white"><GraduationCapIcon className="h-4 w-4" /></span>My learning</div><h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-ink md:text-4xl">Welcome back, {name}.</h1><p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">Everything your teacher has assigned is here. Pick up a course, complete a mission, and watch your robot skills grow.</p></div>
      <div className="rounded-xl border border-[#b8d9d3] bg-[linear-gradient(135deg,#effaf7_0%,#f8fcfa_70%,#fff_100%)] p-4"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white"><BellIcon className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-ink">Learning updates</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">{inProgress ? `${inProgress} practice ${inProgress === 1 ? "mission is" : "missions are"} ready to continue.` : "Your next robot mission is ready when you are."}</p></div></div></div>
    </header>

    {error && <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="courses-heading"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="courses-heading" className="text-xl font-semibold tracking-[-0.02em] text-ink">Your courses</h2><p className="mt-1 text-sm text-ink-muted">{loading ? "Loading your course access…" : `${courses.length} course${courses.length === 1 ? "" : "s"} available to you`}</p></div><label className="flex h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 sm:w-[230px]"><SearchIcon className="h-4 w-4 text-ink-subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search my courses" aria-label="Search my courses" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle" /></label></div>
      {loading ? <CourseSkeletons /> : visible.length === 0 ? <EmptyState icon={<SearchXIcon />} title={courses.length ? "No matching courses" : "No courses yet"} description={courses.length ? "Try a different search." : "Ask your teacher to add you to a classroom or course."} /> : <div className="mt-5 grid gap-4 md:grid-cols-2">{visible.map((course) => <CourseTile key={course.id} course={course} />)}</div>}</section>
      <aside className="space-y-5 xl:sticky xl:top-7 xl:self-start"><section className="rounded-xl border border-line bg-surface p-5"><div className="flex items-center gap-2"><SparklesIcon className="h-4 w-4 text-accent" /><h2 className="text-sm font-semibold text-ink">Keep going</h2></div><p className="mt-3 text-sm leading-relaxed text-ink-muted">{inProgress ? "You have an unfinished practice mission. Continue from the course where you left off." : "Start with the first lesson in one of your assigned courses. Every mission has a guided robot preview."}</p>{courses[0] && <Link to={`/courses/${courses[0].id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:text-accent">{inProgress ? "Continue learning" : "Begin a course"} <ArrowRightIcon className="h-4 w-4" /></Link>}</section>
      <section className="rounded-xl border border-line bg-surface p-5"><div className="flex items-center gap-2"><UsersIcon className="h-4 w-4 text-accent" /><h2 className="text-sm font-semibold text-ink">How course access works</h2></div><ol className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted"><li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink">1</span>Your teacher adds you to a class or course.</li><li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink">2</span>The course appears here automatically.</li><li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink">3</span>New missions show as updates when your teacher publishes them.</li></ol><p className="mt-4 rounded-md bg-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted">Want a different course? Ask your teacher for an enrollment or classroom invite.</p></section></aside>
    </div>
  </main>;
}

function CourseTile({ course }: { course: CourseCard }) {
  return <article className="group relative overflow-hidden rounded-xl border border-line bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9acdc3] hover:shadow-[0_14px_28px_rgba(21,97,86,0.09)]"><div className="absolute inset-x-0 top-0 h-1 bg-accent opacity-0 transition-opacity group-hover:opacity-100" /><div className="flex items-start justify-between gap-3"><Badge tone={course.access === "enrolled" ? "ok" : "accent"} dot>{course.access === "enrolled" ? "Enrolled" : "Teacher assigned"}</Badge><span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{course.status}</span></div><h3 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-ink">{course.title}</h3><p className="mt-2 min-h-10 text-sm leading-relaxed text-ink-muted">{course.description ?? "A guided VISTA robotics course."}</p><div className="mt-5 flex items-center justify-between text-xs text-ink-muted"><span className="inline-flex items-center gap-1.5"><BookOpenIcon className="h-3.5 w-3.5" />{course.lessonCount} lesson{course.lessonCount === 1 ? "" : "s"}</span><span className="inline-flex items-center gap-1.5"><Clock3Icon className="h-3.5 w-3.5" />Self-paced</span></div><div className="mt-5"><div className="mb-2 flex justify-between text-xs text-ink-muted"><span>Ready to start</span><span>0%</span></div><ProgressBar value={0} label={`${course.title} progress`} /></div><Link to={`/courses/${course.id}`} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[0.98]">Open course<ArrowRightIcon className="h-4 w-4" /></Link></article>;
}

function CourseSkeletons() { return <div className="mt-5 grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[260px] animate-pulse rounded-xl border border-line bg-sunken/60" />)}</div>; }
