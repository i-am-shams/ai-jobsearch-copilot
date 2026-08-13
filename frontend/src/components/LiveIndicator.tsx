import type { LiveStatus } from '../hooks/useLiveMatchUpdates';

const LABEL: Record<LiveStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Live updates unavailable',
};

/**
 * Shows whether push updates are actually working.
 *
 * "Results appear without a refresh" is the entire point of the async pipeline,
 * and its failure used to be completely invisible: a dead connection looked
 * exactly like a quiet one.
 */
export function LiveIndicator({ status }: { status: LiveStatus }) {
  return (
    <span className={`live live--${status}`} role="status">
      <span className="live__dot" aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
