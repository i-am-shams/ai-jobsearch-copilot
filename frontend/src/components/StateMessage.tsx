import { Loader2, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="state state--loading">
      <Loader2 size={15} className="state__icon state__icon--spin" aria-hidden="true" />
      {label}
    </p>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="state state--empty">
      <Inbox size={26} className="state__icon" aria-hidden="true" />
      <p>{title}</p>
      {hint && <p className="state__hint">{hint}</p>}
    </div>
  );
}
