import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { ApplicationForm } from './components/ApplicationForm';
import { ApplicationList } from './components/ApplicationList';
import { apiClient } from './api/client';
import { toErrorMessage } from './api/errors';
import { createConnection } from './signalr';
import type { ApplicationResponse } from './types/application';

/** Whether live updates are actually working, so the UI can say so. */
type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

const LIVE_LABEL: Record<LiveStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Live updates unavailable — refresh to see new results',
};

function App() {
  const { token, email, logout } = useAuth();
  const [applications, setApplications] = useState<ApplicationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ApplicationResponse[]>('/applications');
      setApplications(res.data);
      setListError(null);
    } catch (err: unknown) {
      // Previously this had a `finally` but no `catch`: a failed fetch became an
      // unhandled rejection and the table just stayed empty, rendering the cheerful
      // "No applications tracked yet" empty state. A user with a broken API and a
      // user with no applications saw exactly the same screen.
      setListError(toErrorMessage(err, 'Could not load your applications.'));
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

    connection.onreconnecting(() => setLiveStatus('reconnecting'));
    connection.onreconnected(() => setLiveStatus('live'));
    connection.onclose(() => setLiveStatus('offline'));

    // start() returns a promise that was previously ignored entirely. A failed
    // handshake became an unhandled rejection and the app carried on looking
    // completely normal - it simply never updated again, with no way for a user
    // to tell that live updates were dead rather than merely quiet. This is the
    // whole point of the async pipeline, so its failure has to be visible.
    setLiveStatus('connecting');
    connection
      .start()
      .then(() => setLiveStatus('live'))
      .catch((err: unknown) => {
        setLiveStatus('offline');
        console.error('SignalR connection failed; live updates are unavailable.', err);
      });

    return () => {
      // stop() also rejects if the connection never started; swallowing it here
      // is correct because we are tearing down deliberately.
      connection.stop().catch(() => {});
    };
  }, [token, fetchApplications]);

  if (!token) {
    return <LoginForm />;
  }

  return (
    <div>
      <p>
        Logged in as {email} <button onClick={logout}>Logout</button>
        <span className={`live live--${liveStatus}`} role="status">
          <span className="live__dot" aria-hidden="true" />
          {LIVE_LABEL[liveStatus]}
        </span>
      </p>
      <ApplicationForm onCreated={fetchApplications} />
      <hr />
      {listError && <p className="form-error" role="alert">{listError}</p>}
      <ApplicationList applications={applications} loading={loading} />
    </div>
  );
}

export default App;
