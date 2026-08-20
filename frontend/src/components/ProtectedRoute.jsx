import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import Loading from './Loading';

// Guards a route: requires auth, and optionally a specific set of roles.
export default function ProtectedRoute({ children, roles }) {
  const { token, user, initialized, role } = useAuth();
  const location = useLocation();

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!initialized && !user) return <Loading />;
  if (roles && role && !roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}
