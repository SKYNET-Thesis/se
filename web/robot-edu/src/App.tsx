import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import { AdminProvider } from './contexts/AdminContext';
import { LearningProvider } from './contexts/LearningContext';
import { ProgramsProvider } from './contexts/ProgramsContext';
import { RoleProvider } from './contexts/RoleContext';
import { Dashboard } from './pages/Dashboard';
import { Courses } from './pages/Courses';
import { CourseDetail } from './pages/CourseDetail';
import { LessonViewer } from './pages/LessonViewer';
import { CourseInfo } from './pages/CourseInfo';
import { ActivityReader } from './pages/ActivityReader';
import { AssignmentDetail } from './pages/AssignmentDetail';
const Studio = lazy(() => import('./pages/Studio').then((module) => ({ default: module.Studio })));
const Practice = lazy(() => import('./pages/Practice').then((module) => ({ default: module.Practice })));
import { SimulationResult } from './pages/SimulationResult';
const RobotLab = lazy(() => import('./pages/RobotLab').then((module) => ({ default: module.RobotLab })));
import { TeacherOverview } from './pages/teacher/TeacherOverview';
import { TeacherCourses } from './pages/teacher/TeacherCourses';
import { TeacherAssignments } from './pages/teacher/TeacherAssignments';
import { TeacherAssignmentEditor } from './pages/teacher/TeacherAssignmentEditor';
import { QuizDeliveries } from './pages/teacher/QuizDeliveries';
import { TeacherSubmissions } from './pages/teacher/TeacherSubmissions';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminRobots } from './pages/admin/AdminRobots';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminCourses } from './pages/admin/AdminCourses';
const CourseBuilder = lazy(() => import('./pages/admin/CourseBuilder').then((module) => ({ default: module.CourseBuilder })));
import { NotFound } from './pages/NotFound';
import { Login } from './pages/Login';
import { LearningLoop } from './pages/LearningLoop';
import { MyLearning } from './pages/MyLearning';
import { TeacherClasses } from './pages/teacher/TeacherClasses';
import { TeacherClassDetail } from './pages/teacher/TeacherClassDetail';
import { SchoolManagement } from './pages/school/SchoolManagement';
import { SupabaseSessionProvider } from './contexts/SupabaseSessionContext';
import { RequireSession } from './components/auth/RequireSession';
import { RequireRole } from './components/auth/RequireRole';
import { PublicEntry } from './components/auth/PublicEntry';
import { AccountSettings } from './pages/AccountSettings';
import { WebSettings } from './pages/WebSettings';
import { SchoolImportUsers } from './pages/school/SchoolImportUsers';
import { SchoolQueryProvider } from './queries/SchoolQueryProvider';
import { StudentAssignmentDetail } from './pages/StudentAssignmentDetail';
import { StudentAssignments } from './pages/StudentAssignments';
import { TeacherSubmissionReview } from './pages/teacher/TeacherSubmissionReview';

/** Heavy routes (Blockly, Three.js, course builder) load on demand so every other page starts from a much smaller bundle. */
const RouteFallback = () => <div role="status" aria-live="polite" className="mx-auto max-w-[1060px] px-4 py-10 text-sm text-ink-muted md:px-8">Loading…</div>;

export function App() {
  return (
    <SupabaseSessionProvider><SchoolQueryProvider><BrowserRouter>
      <RoleProvider>
        <AdminProvider>
          <LearningProvider>
            <ProgramsProvider>
              <Routes>
                <Route path="login" element={<Login />} />
                <Route index element={<PublicEntry />} />
                <Route path="home-v2" element={<Navigate to="/" replace />} />
                {/* Full-page workspace: deliberately outside AppShell so the editor owns the whole viewport. */}
                <Route path="admin/courses/:courseId" element={<RequireSession><RequireRole roles={['admin']}><Suspense fallback={<RouteFallback />}><CourseBuilder /></Suspense></RequireRole></RequireSession>} />
                <Route element={<RequireSession><AppShell /></RequireSession>}>
                  <Route path="account" element={<AccountSettings />} />
                  <Route path="settings" element={<WebSettings />} />
                  <Route path="courses" element={<Courses />} />
                  <Route path="courses/:courseId" element={<CourseDetail />} />
                  <Route path="courses/:courseId/info" element={<CourseInfo />} />
                  <Route path="courses/:courseId/lessons/:lessonId" element={<LessonViewer />} />
                  <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
                  <Route path="assignments" element={<RequireRole roles={['student']}><StudentAssignments /></RequireRole>} />
                  <Route path="my-learning" element={<RequireRole roles={['student']}><MyLearning /></RequireRole>} />
                  <Route path="my-learning/:classroomAssignmentId" element={<RequireRole roles={['student']}><StudentAssignmentDetail /></RequireRole>} />
                  <Route path="learning-loop" element={<LearningLoop />} />
                  <Route path="assignments/:assignmentId" element={<AssignmentDetail />} />
                  <Route path="studio" element={<Suspense fallback={<RouteFallback />}><Studio /></Suspense>} />
                  <Route path="studio/:programId" element={<Suspense fallback={<RouteFallback />}><Studio /></Suspense>} />
                  <Route path="practice/:attemptId" element={<Suspense fallback={<RouteFallback />}><Practice mode="physical-enabled" /></Suspense>} />
                  <Route path="practice/:attemptId/result/:evaluationId" element={<SimulationResult />} />
                  <Route path="lab" element={<Suspense fallback={<RouteFallback />}><RobotLab /></Suspense>} />
                  <Route path="teacher" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherOverview /></RequireRole>} />
                  <Route path="teacher/classes" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherClasses /></RequireRole>} />
                  <Route path="teacher/classes/:classroomId" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherClassDetail /></RequireRole>} />
                  <Route path="teacher/classes/:classroomId/submissions/:submissionId" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherSubmissionReview /></RequireRole>} />
                  <Route path="teacher/courses" element={<RequireRole roles={['teacher']}><TeacherCourses /></RequireRole>} />
                  <Route path="teacher/assignments" element={<RequireRole roles={['teacher']}><TeacherAssignments /></RequireRole>} />
                  <Route path="teacher/assignments/new" element={<RequireRole roles={['teacher']}><TeacherAssignmentEditor /></RequireRole>} />
                  <Route path="teacher/assignments/:classroomId/:assignmentId/edit" element={<RequireRole roles={['teacher']}><TeacherAssignmentEditor /></RequireRole>} />
                  <Route path="teacher/assignments/:classroomId/:assignmentId" element={<RequireRole roles={['teacher']}><TeacherAssignmentEditor /></RequireRole>} />
 <Route path="teacher/quizzes" element={<RequireRole roles={['teacher']}><QuizDeliveries audience="teacher" /></RequireRole>} />
                  <Route path="teacher/submissions" element={<RequireRole roles={['teacher']}><TeacherSubmissions /></RequireRole>} />
                  <Route path="admin/users" element={<RequireRole roles={['admin']}><AdminUsers /></RequireRole>} />
                  <Route path="admin/robots" element={<RequireRole roles={['admin']}><AdminRobots /></RequireRole>} />
                  <Route path="admin/settings" element={<RequireRole roles={['admin']}><AdminSettings /></RequireRole>} />
                  <Route path="admin/courses" element={<RequireRole roles={['admin']}><AdminCourses /></RequireRole>} />
                  <Route path="school" element={<RequireRole roles={['school_admin']}><SchoolManagement /></RequireRole>} />
                  <Route path="school/users" element={<RequireRole roles={['school_admin']}><SchoolManagement initialTab="users" /></RequireRole>} />
                  <Route path="school/classrooms" element={<RequireRole roles={['school_admin']}><SchoolManagement initialTab="classrooms" /></RequireRole>} />
 <Route path="school/quizzes" element={<RequireRole roles={['school_admin']}><QuizDeliveries audience="school" /></RequireRole>} />
                  <Route path="school/import" element={<RequireRole roles={['school_admin']}><SchoolImportUsers /></RequireRole>} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
              <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: 'Inter, sans-serif', fontSize: 13 } }} />
            </ProgramsProvider>
          </LearningProvider>
        </AdminProvider>
      </RoleProvider>
    </BrowserRouter></SchoolQueryProvider></SupabaseSessionProvider>);

}
