import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

const TONE_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

/**
 * Minimal toast system - deliberately hand-rolled rather than pulled in as a
 * dependency, since the whole requirement is "announce a transient message".
 *
 * The live region is the point. Toasts are the only feedback for events the user
 * did not trigger themselves (a match finishing while they are reading something
 * else), so a screen reader has to hear them: aria-live="polite" announces them
 * without interrupting, and role="status" gives the container an implicit one for
 * older assistive tech.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((t) => {
          const ToneIcon = TONE_ICON[t.tone];
          return (
            <div key={t.id} className={`toast toast--${t.tone}`}>
              <ToneIcon size={16} aria-hidden="true" className="toast__icon" />
              <span>{t.message}</span>
              <button
                type="button"
                className="toast__close"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
