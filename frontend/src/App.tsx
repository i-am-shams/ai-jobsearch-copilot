import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { ApplicationForm } from './components/ApplicationForm';
import { ApplicationList } from './components/ApplicationList';
import { apiClient } from './api/client';
import { createConnection } from './signalr';
import type { ApplicationResponse } from './types/application';

function App() {
  const { token, email, logout } = useAuth();
  const [applications, setApplications] = useState<ApplicationResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ApplicationResponse[]>('/applications');
      setApplications(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchApplications();
  }, [token, fetchApplications]);

  useEffect(() => {
    if (!token) return;
    const connection = createConnection(token);
    connection.on('MatchCompleted', () => fetchApplications());
    connection.start();
    return () => { connection.stop(); };
  }, [token, fetchApplications]);

  if (!token) {
    return <LoginForm />;
  }

  return (
    <div>
      <p>
        Logged in as {email} <button onClick={logout}>Logout</button>
      </p>
      <ApplicationForm onCreated={fetchApplications} />
      <hr />
      <ApplicationList applications={applications} loading={loading} />
    </div>
  );
}

export default App;
