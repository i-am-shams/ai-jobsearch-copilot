import { createContext, useContext, useState, type ReactNode } from 'react';
import { setAuthToken } from '../api/client';

interface AuthContextType {
  token: string | null;
  email: string | null;
  login: (token: string, email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  function login(newToken: string, userEmail: string) {
    setToken(newToken);
    setEmail(userEmail);
    setAuthToken(newToken);
  }

  function logout() {
    setToken(null);
    setEmail(null);
    setAuthToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, email, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
