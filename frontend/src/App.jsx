import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Loading from './components/Loading';
import DashboardLayout from './layouts/DashboardLayout';

// Every page is code-split with React.lazy so the browser only downloads the
// chunk for the page it needs — this is what keeps first paint fast and stops
// the app from hanging on a cold free-tier host.
//
// A redeploy renames every chunk, so a tab left open on the previous build asks
// for files that no longer exist and the page would simply stop working. When
// an import fails, reload once (guarded by a session flag, so a genuinely
// broken build cannot put the browser in a reload loop) — the fresh index.html
// then points at the chunks that do exist.
const RELOADED_KEY = 'chunk-reloaded';
function lazyPage(importer) {
  return lazy(() =>
    importer()
      .then((mod) => {
        sessionStorage.removeItem(RELOADED_KEY);
        return mod;
      })
      .catch((err) => {
        if (!sessionStorage.getItem(RELOADED_KEY)) {
          sessionStorage.setItem(RELOADED_KEY, '1');
          window.location.reload();
          // Never resolves — the reload takes over before React can render.
          return new Promise(() => {});
        }
        throw err;
      })
  );
}

const Login = lazyPage(() => import('./pages/Login'));
const NotFound = lazyPage(() => import('./pages/NotFound'));
const Profile = lazyPage(() => import('./pages/Profile'));
const Help = lazyPage(() => import('./pages/Help'));
const NewsFeed = lazyPage(() => import('./pages/NewsFeed'));

const StudentDashboard = lazyPage(() => import('./pages/student/Dashboard'));
const StudentSubjects = lazyPage(() => import('./pages/student/Subjects'));
const SubjectAssignments = lazyPage(() => import('./pages/student/SubjectAssignments'));
const StudentAssignments = lazyPage(() => import('./pages/student/Assignments'));
const SubmitAssignment = lazyPage(() => import('./pages/student/SubmitAssignment'));
const MySubmissions = lazyPage(() => import('./pages/student/MySubmissions'));
const SubmissionDetail = lazyPage(() => import('./pages/SubmissionDetail'));
const Ratings = lazyPage(() => import('./pages/student/Ratings'));
const Criteria = lazyPage(() => import('./pages/student/Criteria'));
const MyGroups = lazyPage(() => import('./pages/student/MyGroups'));
const Notifications = lazyPage(() => import('./pages/student/Notifications'));
const StudentLiterature = lazyPage(() => import('./pages/student/Literature'));
const StudentLiveSessions = lazyPage(() => import('./pages/student/LiveSessions'));

const TeacherDashboard = lazyPage(() => import('./pages/teacher/Dashboard'));
const TeacherAssignments = lazyPage(() => import('./pages/teacher/Assignments'));
const AssignmentSubmissions = lazyPage(() => import('./pages/teacher/AssignmentSubmissions'));
const TeacherGroups = lazyPage(() => import('./pages/teacher/Groups'));
const TeacherStudents = lazyPage(() => import('./pages/teacher/Students'));
const TeacherCriteria = lazyPage(() => import('./pages/teacher/Criteria'));
const TeacherLiterature = lazyPage(() => import('./pages/teacher/Literature'));
const TeacherLiveSessions = lazyPage(() => import('./pages/teacher/LiveSessions'));

const AdminDashboard = lazyPage(() => import('./pages/admin/Dashboard'));
const AdminUsers = lazyPage(() => import('./pages/admin/Users'));
const AdminGroups = lazyPage(() => import('./pages/admin/Groups'));
const AdminSubjects = lazyPage(() => import('./pages/admin/Subjects'));
const AdminLeaderboard = lazyPage(() => import('./pages/admin/Leaderboard'));
const AdminNews = lazyPage(() => import('./pages/admin/News'));
const AdminLogs = lazyPage(() => import('./pages/admin/Logs'));
const AdminSettings = lazyPage(() => import('./pages/admin/Settings'));
const AdminTeachers = lazyPage(() => import('./pages/admin/Teachers'));
const AdminNotifications = lazyPage(() => import('./pages/admin/Notifications'));

function RoleHome() {
  const { role } = useAuth();
  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (role === 'teacher') return <Navigate to="/teacher" replace />;
  if (role === 'student') return <Navigate to="/student" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  const { loadUser, initialized } = useAuth();
  useEffect(() => { loadUser(); }, [loadUser]);

  if (!initialized) return <Loading />;

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />

        {/* Student */}
        <Route path="/student" element={<ProtectedRoute roles={['student']}><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<StudentDashboard />} />
          <Route path="subjects" element={<StudentSubjects />} />
          <Route path="subjects/:subjectId" element={<SubjectAssignments />} />
          <Route path="assignments" element={<StudentAssignments />} />
          <Route path="submit/:assignmentId" element={<SubmitAssignment />} />
          <Route path="submissions" element={<MySubmissions />} />
          <Route path="submissions/:id" element={<SubmissionDetail />} />
          <Route path="ratings" element={<Ratings />} />
          <Route path="criteria" element={<Criteria />} />
          <Route path="groups" element={<MyGroups />} />
          <Route path="live-sessions" element={<StudentLiveSessions />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="news" element={<NewsFeed />} />
          <Route path="literature" element={<StudentLiterature />} />
          <Route path="help" element={<Help />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Teacher */}
        <Route path="/teacher" element={<ProtectedRoute roles={['teacher']}><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<TeacherDashboard />} />
          <Route path="assignments" element={<TeacherAssignments />} />
          <Route path="assignments/:id/submissions" element={<AssignmentSubmissions />} />
          <Route path="submissions/:id" element={<SubmissionDetail />} />
          
          <Route path="groups" element={<TeacherGroups />} />
          <Route path="live-sessions" element={<TeacherLiveSessions />} />
          <Route path="students" element={<TeacherStudents />} />
          <Route path="criteria" element={<TeacherCriteria />} />
          <Route path="news" element={<NewsFeed />} />
          <Route path="literature" element={<TeacherLiterature />} />
          <Route path="help" element={<Help />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={<ProtectedRoute roles={['admin']}><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="groups" element={<AdminGroups />} />
          <Route path="subjects" element={<AdminSubjects />} />
          <Route path="leaderboard" element={<AdminLeaderboard />} />
          <Route path="news" element={<AdminNews />} />
          <Route path="teachers" element={<AdminTeachers />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="help" element={<Help />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
