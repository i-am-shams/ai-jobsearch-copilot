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

export function StatusPill({ status }: { status: Status }) {
  const inFlight = status === 'Pending' || status === 'Processing';

  return (
    <span className={`pill pill--${status.toLowerCase()}`}>
      {inFlight && <span className="pill__dot" aria-hidden="true" />}
      {LABEL[status]}
    </span>
  );
}
