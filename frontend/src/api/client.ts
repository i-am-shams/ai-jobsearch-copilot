import axios from 'axios';

const API_BASE = 'http://localhost:5220/api';

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
