import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiClient } from '../api/client';
import { toErrorMessage } from '../api/errors';
import { credentialsSchema, authResponseSchema, type Credentials } from '../lib/schemas';
import { useAuth } from '../context/AuthContext';

export function LoginForm() {
  const [isRegister, setIsRegister] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    mode: 'onBlur',
  });

  async function onSubmit(values: Credentials) {
    setSubmitError(null);
    try {
      const res = await apiClient.post(isRegister ? '/auth/register' : '/auth/login', values);
      const auth = authResponseSchema.parse(res.data);
      login(auth.token, auth.email);
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, 'Something went wrong.'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="card">
      <h2>{isRegister ? 'Register' : 'Login'}</h2>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p className="field__error" id="email-error" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p className="field__error" id="password-error" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {submitError && (
        <p className="form-error" role="alert">
          {submitError}
        </p>
      )}

      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? 'Working…' : isRegister ? 'Register' : 'Login'}
        </button>
        <button type="button" className="link" onClick={() => { setIsRegister(!isRegister); setSubmitError(null); }}>
          {isRegister ? 'Have an account? Login' : 'Need an account? Register'}
        </button>
      </div>
    </form>
  );
}
