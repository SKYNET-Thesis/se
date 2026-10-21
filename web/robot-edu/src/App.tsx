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
import { SupabaseSessionProvider } from './contexts/SupabaseSessionContext';
import { RequireSession } from './components/auth/RequireSession';

export function App() {
  return (
    <SupabaseSessionProvider><BrowserRouter>
      <RoleProvider>
        <AdminProvider>
          <LearningProvider>
            <ProgramsProvider>
              <Routes>
                <Route path="login" element={<Login />} />
                <Route element={<RequireSession><AppShell /></RequireSession>}>
                  <Route index element={<Dashboard />} />
                  <Route path="courses" element={<Courses />} />
                  <Route path="courses/:courseId" element={<CourseDetail />} />
                  <Route path="courses/:courseId/lessons/:lessonId" element={<LessonViewer />} />
                  <Route path="assignments" element={<LearningLoop />} />
                  <Route path="learning-loop" element={<LearningLoop />} />
                  <Route path="assignments/:assignmentId" element={<AssignmentDetail />} />
                  <Route path="studio" element={<Studio />} />
                  <Route path="studio/:programId" element={<Studio />} />
                  <Route path="practice/:attemptId" element={<Practice />} />
                  <Route path="lab" element={<RobotLab />} />
                  <Route path="teacher" element={<TeacherOverview />} />
                  <Route path="teacher/courses" element={<TeacherCourses />} />
                  <Route path="teacher/assignments" element={<TeacherAssignments />} />
                  <Route path="teacher/assignments/new" element={<TeacherAssignmentEditor />} />
                  <Route path="teacher/assignments/:assignmentId/edit" element={<TeacherAssignmentEditor />} />
                  <Route path="teacher/submissions" element={<TeacherSubmissions />} />
                  <Route path="admin/users" element={<AdminUsers />} />
                  <Route path="admin/robots" element={<AdminRobots />} />
                  <Route path="admin/settings" element={<AdminSettings />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
              <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: 'Inter, sans-serif', fontSize: 13 } }} />
            </ProgramsProvider>
          </LearningProvider>
        </AdminProvider>
      </RoleProvider>
    </BrowserRouter></SupabaseSessionProvider>);

}
