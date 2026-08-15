import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { ApplicationResponse } from '../types/application';

type Status = ApplicationResponse['matchStatus'];

// The raw enum values are the API's language, not the user's. "Pending" in
// particular reads like something is stuck, when it actually means "queued and
// waiting for the worker" - which is the normal, healthy path here.
const LABEL: Record<Status, string> = {
  Pending: 'Queued',
  Processing: 'Analysing',
  Completed: 'Completed',
  Failed: 'Failed',
};

const ICON: Record<Status, typeof Clock> = {
  Pending: Clock,
  Processing: Loader2,
  Completed: CheckCircle2,
  Failed: XCircle,
};

export function StatusPill({ status }: { status: Status }) {
  const Icon = ICON[status];
  const spinning = status === 'Processing';

  return (
    <span className={`pill pill--${status.toLowerCase()}`}>
      <Icon size={13} className={spinning ? 'pill__icon pill__icon--spin' : 'pill__icon'} aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
