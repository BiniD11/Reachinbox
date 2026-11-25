import axios from 'axios';
import { getStoredToken, removeToken } from './auth';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use(config => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  getSlackAuthUrl: () => api.get('/auth/slack'),
  disconnectSlack: () => api.delete('/auth/slack'),
};

// Emails
export const emailsApi = {
  schedule: (data: FormData) => api.post('/emails/schedule', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getScheduled: (page = 1, limit = 20) => api.get(`/emails/scheduled?page=${page}&limit=${limit}`),
  getSent: (page = 1, limit = 20) => api.get(`/emails/sent?page=${page}&limit=${limit}`),
  getJob: (id: string) => api.get(`/emails/jobs/${id}`),
  cancelJob: (id: string) => api.delete(`/emails/jobs/${id}`),
  search: (q: string, status?: string) => api.get(`/emails/search?q=${encodeURIComponent(q)}&status=${status || ''}`),
  recover: () => api.post('/emails/recover'),
};

// Senders
export const sendersApi = {
  list: () => api.get('/senders'),
  createEthereal: (name: string) => api.post('/senders/ethereal', { name }),
  create: (data: any) => api.post('/senders', data),
  delete: (id: string) => api.delete(`/senders/${id}`),
};
