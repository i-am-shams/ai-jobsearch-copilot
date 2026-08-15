import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { LiveStatus } from '../hooks/useLiveMatchUpdates';

const LABEL: Record<LiveStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Live updates unavailable',
};

const ICON: Record<LiveStatus, typeof Wifi> = {
  connecting: Loader2,
  live: Wifi,
  reconnecting: Loader2,
  offline: WifiOff,
};

/**
 * Shows whether push updates are actually working.
 *
 * "Results appear without a refresh" is the entire point of the async pipeline,
 * and its failure used to be completely invisible: a dead connection looked
 * exactly like a quiet one.
 */
export function LiveIndicator({ status }: { status: LiveStatus }) {
  const Icon = ICON[status];
  const spinning = status === 'connecting' || status === 'reconnecting';

  return (
    <span className={`live live--${status}`} role="status">
      <Icon size={13} className={spinning ? 'live__icon live__icon--spin' : 'live__icon'} aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
