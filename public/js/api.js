// Fetch wrapper: adds the session token, turns API errors into readable messages.
const KEY = 'timber-erp-token';
let token = null;
try { token = localStorage.getItem(KEY); } catch { /* storage blocked */ }

export function setToken(t) { token = t; try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* ignore */ } }
export function hasToken() { return !!token; }

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    setToken(null);
    window.dispatchEvent(new Event('erp:logout'));
  }
  if (!res.ok) { const e = new Error((data && data.error) || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}
export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
