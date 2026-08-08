import { useState, FormEvent } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRegister, setIsRegister] = useState(false);
  const { login } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const endpoint = isRegister ? '/auth/register' : '/auth/login';

    try {
      const res = await apiClient.post(endpoint, { email, password });
      login(res.data.token, res.data.email);
    } catch (err: any) {
      setError(err.response?.data ?? 'Something went wrong.');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>{isRegister ? 'Register' : 'Login'}</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      {error && <p style={{ color: 'red' }}>{String(error)}</p>}
      <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
      <button type="button" onClick={() => setIsRegister(!isRegister)}>
        {isRegister ? 'Have an account? Login' : 'Need an account? Register'}
      </button>
    </form>
  );
}
