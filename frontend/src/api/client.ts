import axios from 'axios';

// Configurable at build time via VITE_API_URL. Defaults to the local dev API
// (different port, needs CORS). Production build sets VITE_API_URL=/api —
// a relative path, since nginx serves the frontend and proxies /api on the
// SAME origin, meaning no CORS is even needed in production.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5220/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
});

// This gets set by the auth context once a user logs in — see AuthContext next
export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}
