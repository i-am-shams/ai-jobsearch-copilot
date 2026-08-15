import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { LiveIndicator } from './components/LiveIndicator';
import { useLiveMatchUpdates } from './hooks/useLiveMatchUpdates';
import { Dashboard } from './routes/Dashboard';
import { ApplicationDetail } from './routes/ApplicationDetail';
import { ProtectedRoute } from './routes/ProtectedRoute';

function App() {
  const { token, email, logout } = useAuth();
  const location = useLocation();

  // Lives at the app shell, not per-route, so navigating between the dashboard
  // and a detail page does not tear down and rebuild the SignalR connection.
  const liveStatus = useLiveMatchUpdates(token);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__brand">Job-Search Copilot</h1>
        {token && (
          <div className="app__session">
            <LiveIndicator status={liveStatus} />
            <span className="muted">{email}</span>
            <button type="button" className="btn btn--ghost" onClick={logout}>Logout</button>
          </div>
        )}
      </header>

      <main>
        <Routes>
          <Route
            path="/login"
            element={token ? <Navigate to={locationFrom(location)} replace /> : <LoginForm />}
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/applications/:id" element={<ApplicationDetail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

/** Sends a just-logged-in user back to wherever they were originally headed. */
function locationFrom(location: ReturnType<typeof useLocation>): string {
  const state = location.state as { from?: { pathname?: string } } | null;
  return state?.from?.pathname ?? '/';
}

function NotFound() {
  return (
    <div>
      <h2>Page not found</h2>
      <p>
        <a href="/">Back to all applications</a>
      </p>
    </div>
  );
}

export default App;
