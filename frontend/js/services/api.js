/** API client — same-origin when API_BASE empty (Vercel proxy) */

const API_BASE = window.XE3AGLE_API_BASE || '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  try {
    const auth = JSON.parse(localStorage.getItem('xe3agle_auth') || 'null');
    if (auth?.token) h.Authorization = `Bearer ${auth.token}`;
  } catch (_) {}
  return h;
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'Unknown error' };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),

  signup: (body) =>
    request('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: () => request('/api/auth/me'),

  changePassword: (body) =>
    request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),

  changeEmail: (body) =>
    request('/api/auth/change-email', { method: 'POST', body: JSON.stringify(body) }),

  forgotPassword: (body) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),

  resetPassword: (body) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),

  deleteAccount: (body) =>
    request('/api/auth/account', { method: 'DELETE', body: JSON.stringify(body || {}) }),

  getState: (accountId = 'main') =>
    request(`/api/state?accountId=${encodeURIComponent(accountId)}`),

  putState: (body) =>
    request('/api/state', { method: 'PUT', body: JSON.stringify(body) }),

  deleteState: () => request('/api/state', { method: 'DELETE' }),
};
