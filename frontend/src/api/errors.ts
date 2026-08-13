import axios from 'axios';

/**
 * Turns anything thrown by an axios call into a string worth showing a user.
 *
 * Both forms previously did `err.response?.data ?? 'Something went wrong.'` and
 * rendered it with String(). That had three distinct failure modes, all of which
 * showed the user something useless or nothing at all:
 *
 *  - **A 429 from the rate limiter shows nothing whatsoever.** ASP.NET Core's
 *    rate limiter returns an empty body, so `data` is `''`. `??` only falls back
 *    on null/undefined, so the empty string won through - and `{error && <p/>}`
 *    then renders nothing, because '' is falsy. Submitting past the limit looked
 *    exactly like the button not working.
 *  - **A validation error renders as "[object Object]".** ASP.NET returns
 *    ProblemDetails as JSON, and String({}) is not a message.
 *  - **A network failure reports the same generic text as a server rejection**,
 *    because there is no `response` at all when the request never arrived.
 */
export function toErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  // No response object at all - the request never reached the server.
  if (!err.response) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  const { status, data } = err.response;

  // Rate limiting is a normal, expected outcome here, not an anomaly: both the
  // auth and applications endpoints are deliberately limited. It deserves a real
  // message rather than the empty body the server sends.
  if (status === 429) {
    return 'Too many requests. Wait a minute and try again.';
  }

  if (typeof data === 'string' && data.trim()) return data;

  if (data && typeof data === 'object') {
    const problem = data as { title?: string; detail?: string; errors?: Record<string, string[]> };
    // ProblemDetails validation errors: surface the actual field messages.
    if (problem.errors) {
      const messages = Object.values(problem.errors).flat().filter(Boolean);
      if (messages.length) return messages.join(' ');
    }
    if (problem.detail) return problem.detail;
    if (problem.title) return problem.title;
  }

  return fallback;
}
