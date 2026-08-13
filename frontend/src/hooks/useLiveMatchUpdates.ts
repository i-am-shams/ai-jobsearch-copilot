import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createConnection } from '../signalr';
import { applyMatchPush, type MatchPush } from '../api/applications';
import { useToast } from '../components/Toaster';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/**
 * Keeps the query cache in sync with the worker over SignalR.
 *
 * Two deliberate changes from what this replaced:
 *
 *  - The push payload is applied to the cache instead of triggering a full
 *    refetch of every application. The server already sent the result; going
 *    back to ask for it was work for nothing.
 *  - The connection state is returned rather than assumed. start()'s promise
 *    used to be dropped entirely, so a failed handshake left the app looking
 *    completely normal while never updating again.
 */
export function useLiveMatchUpdates(token: string | null): LiveStatus {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!token) {
      setStatus('offline');
      return;
    }

    const connection = createConnection(token);

    connection.on('MatchCompleted', (push: MatchPush) => {
      applyMatchPush(queryClient, push);
      // A result arriving is the one thing that happens without the user doing
      // anything, so it is exactly what a toast is for - and what a screen
      // reader would otherwise have no way to learn about.
      if (push.status === 'Failed') {
        toast('A match could not be analysed. Try submitting it again.', 'error');
      } else if (push.status === 'Completed') {
        toast(`Match complete — scored ${push.matchScore}.`, 'success');
      }
    });

    connection.onreconnecting(() => setStatus('reconnecting'));
    connection.onreconnected(() => setStatus('live'));
    connection.onclose(() => setStatus('offline'));

    setStatus('connecting');
    connection
      .start()
      .then(() => setStatus('live'))
      .catch((err: unknown) => {
        setStatus('offline');
        console.error('SignalR connection failed; live updates are unavailable.', err);
      });

    return () => {
      // Rejects if the connection never started; we are tearing down on purpose.
      connection.stop().catch(() => {});
    };
  }, [token, queryClient, toast]);

  return status;
}
