import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
import { AssignmentDetail } from './pages/AssignmentDetail';
import { Studio } from './pages/Studio';
import { Practice } from './pages/Practice';
import { RobotLab } from './pages/RobotLab';
import { TeacherOverview } from './pages/teacher/TeacherOverview';
import { TeacherCourses } from './pages/teacher/TeacherCourses';
import { TeacherAssignments } from './pages/teacher/TeacherAssignments';
import { TeacherAssignmentEditor } from './pages/teacher/TeacherAssignmentEditor';
import { TeacherSubmissions } from './pages/teacher/TeacherSubmissions';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminRobots } from './pages/admin/AdminRobots';
import { AdminSettings } from './pages/admin/AdminSettings';
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
import { RoleHome } from './components/auth/RoleHome';
import { AccountSettings } from './pages/AccountSettings';
import { WebSettings } from './pages/WebSettings';
import { SchoolImportUsers } from './pages/school/SchoolImportUsers';
import { SchoolQueryProvider } from './queries/SchoolQueryProvider';
import { StudentAssignmentDetail } from './pages/StudentAssignmentDetail';
import { TeacherSubmissionReview } from './pages/teacher/TeacherSubmissionReview';

// Homepage V2 preview, a public page outside RequireSession. Registered only in development builds, or in a
// build that sets VITE_HOME_V2_PREVIEW=true; a default production build does not include the route.
const HomeV2 = import.meta.env.DEV || import.meta.env.VITE_HOME_V2_PREVIEW === 'true' ? React.lazy(() => import('./pages/home-v2/HomeV2')) : null;

export function App() {
  return (
    <SupabaseSessionProvider><SchoolQueryProvider><BrowserRouter>
      <RoleProvider>
        <AdminProvider>
          <LearningProvider>
            <ProgramsProvider>
              <Routes>
                <Route path="login" element={<Login />} />
                {HomeV2 && <Route path="home-v2" element={<React.Suspense fallback={null}><HomeV2 /></React.Suspense>} />}
                <Route element={<RequireSession><AppShell /></RequireSession>}>
                  <Route index element={<RoleHome />} />
                  <Route path="account" element={<AccountSettings />} />
                  <Route path="settings" element={<WebSettings />} />
                  <Route path="courses" element={<Courses />} />
                  <Route path="courses/:courseId" element={<CourseDetail />} />
                  <Route path="courses/:courseId/lessons/:lessonId" element={<LessonViewer />} />
                  <Route path="assignments" element={<LearningLoop />} />
                  <Route path="my-learning" element={<MyLearning />} />
                  <Route path="my-learning/:classroomAssignmentId" element={<StudentAssignmentDetail />} />
                  <Route path="learning-loop" element={<LearningLoop />} />
                  <Route path="assignments/:assignmentId" element={<AssignmentDetail />} />
                  <Route path="studio" element={<Studio />} />
                  <Route path="studio/:programId" element={<Studio />} />
                  <Route path="practice/:attemptId" element={<Practice mode="physical-enabled" />} />
                  <Route path="lab" element={<RobotLab />} />
                  <Route path="teacher" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherOverview /></RequireRole>} />
                  <Route path="teacher/classes" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherClasses /></RequireRole>} />
                  <Route path="teacher/classes/:classroomId" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherClassDetail /></RequireRole>} />
                  <Route path="teacher/classes/:classroomId/submissions/:submissionId" element={<RequireRole roles={['teacher', 'teaching_assistant']}><TeacherSubmissionReview /></RequireRole>} />
                  <Route path="teacher/courses" element={<RequireRole roles={['teacher']}><TeacherCourses /></RequireRole>} />
                  <Route path="teacher/assignments" element={<RequireRole roles={['teacher']}><TeacherAssignments /></RequireRole>} />
                  <Route path="teacher/assignments/new" element={<RequireRole roles={['teacher']}><TeacherAssignmentEditor /></RequireRole>} />
                  <Route path="teacher/assignments/:assignmentId/edit" element={<RequireRole roles={['teacher']}><TeacherAssignmentEditor /></RequireRole>} />
                  <Route path="teacher/submissions" element={<RequireRole roles={['teacher']}><TeacherSubmissions /></RequireRole>} />
                  <Route path="admin/users" element={<RequireRole roles={['admin']}><AdminUsers /></RequireRole>} />
                  <Route path="admin/robots" element={<RequireRole roles={['admin']}><AdminRobots /></RequireRole>} />
                  <Route path="admin/settings" element={<RequireRole roles={['admin']}><AdminSettings /></RequireRole>} />
                  <Route path="school" element={<RequireRole roles={['school_admin']}><SchoolManagement /></RequireRole>} />
                  <Route path="school/users" element={<RequireRole roles={['school_admin']}><SchoolManagement initialTab="users" /></RequireRole>} />
                  <Route path="school/classrooms" element={<RequireRole roles={['school_admin']}><SchoolManagement initialTab="classrooms" /></RequireRole>} />
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
