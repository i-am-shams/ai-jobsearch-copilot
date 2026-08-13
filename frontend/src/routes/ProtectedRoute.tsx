import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Gate for everything that needs a token.
 *
 * The token lives in memory only (a deliberate decision - see the README), so a
 * refresh logs you out. Capturing the attempted location means the user lands
 * back where they were pointing rather than always on the dashboard.
 */
export function ProtectedRoute() {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
