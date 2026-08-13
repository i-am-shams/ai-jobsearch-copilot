import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { toErrorMessage } from './errors';

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const err = new AxiosError('Request failed');
  const headers = new AxiosHeaders();
  err.response = { status, data, statusText: '', headers, config: { headers } };
  return err;
}

/**
 * The old expression was `err.response?.data ?? fallback`, rendered with
 * String(). Each test here is a case where that produced something useless.
 */
describe('toErrorMessage', () => {
  it('gives a rate-limited user an actual message', () => {
    // The real bug: ASP.NET's rate limiter returns an empty body, '' is not
    // null so ?? passed it straight through, and `{error && <p/>}` renders
    // nothing for ''. Hitting the limit was indistinguishable from a dead button.
    expect(toErrorMessage(axiosErrorWith(429, ''), 'fallback')).toMatch(/too many requests/i);
  });

  it('never returns an empty string, whatever the body is', () => {
    for (const body of ['', '   ', null, undefined, {}]) {
      expect(toErrorMessage(axiosErrorWith(500, body), 'fallback').trim()).not.toBe('');
    }
  });

  it('surfaces validation messages instead of "[object Object]"', () => {
    const problem = {
      title: 'One or more validation errors occurred.',
      errors: { Email: ['The Email field is not a valid e-mail address.'] },
    };
    const message = toErrorMessage(axiosErrorWith(400, problem), 'fallback');

    expect(message).toContain('not a valid e-mail address');
    expect(message).not.toContain('[object Object]');
  });

  it('prefers ProblemDetails detail, then title', () => {
    expect(toErrorMessage(axiosErrorWith(400, { detail: 'Detailed reason.', title: 'Title' }), 'fb'))
      .toBe('Detailed reason.');
    expect(toErrorMessage(axiosErrorWith(400, { title: 'Just a title.' }), 'fb'))
      .toBe('Just a title.');
  });

  it('passes through the plain-string bodies the API actually sends', () => {
    // AuthController returns bare strings: Conflict("Email already registered.")
    expect(toErrorMessage(axiosErrorWith(409, 'Email already registered.'), 'fb'))
      .toBe('Email already registered.');
  });

  it('distinguishes an unreachable server from a server that said no', () => {
    const networkError = new AxiosError('Network Error');
    // No response at all - the request never arrived.
    expect(toErrorMessage(networkError, 'fallback')).toMatch(/could not reach the server/i);
  });

  it('falls back for non-axios throws', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(toErrorMessage('a bare string', 'fallback')).toBe('fallback');
  });
});
