import axios from 'axios';
import { getLang } from '../i18n';

// Empty baseURL => same-origin (works with the dev proxy and single-service prod deploy)
const baseURL = import.meta.env.VITE_API_URL || '';

// No request may hang forever. Without a timeout a connection the host quietly
// stops answering leaves axios waiting for as long as the tab is open, and the
// only thing the user sees is a button that spins and never stops.
const DEFAULT_TIMEOUT = 60000;
// Uploads are a different animal: a 50 MB submission over a phone connection
// legitimately takes minutes, and cutting it off at one would lose the work.
const UPLOAD_TIMEOUT = 300000;

const api = axios.create({ baseURL, timeout: DEFAULT_TIMEOUT });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Tells the backend which language to answer errors and AI feedback in.
  config.headers['Accept-Language'] = getLang();
  const isUpload =
    typeof FormData !== 'undefined' && config.data instanceof FormData;
  if (isUpload && config.timeout === DEFAULT_TIMEOUT) config.timeout = UPLOAD_TIMEOUT;
  return config;
});

// ---- Retry ----------------------------------------------------------------
// The free host sleeps after fifteen idle minutes and the database it talks to
// suspends after five. The request that arrives on a sleeping instance does not
// get an error page — the connection is closed outright (net::ERR_CONNECTION_
// CLOSED), or answered 502/503 by the proxy while the process is still booting.
// One retry a couple of seconds later almost always lands on a woken instance.
//
// So a dropped first request should cost the user a short wait, not a failed
// login on a site that is in fact perfectly healthy.
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1500, 4000, 8000]; // rising: a cold start needs ~30s total

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A request the server never answered can be repeated safely; one it answered
// with 5xx may already have taken effect, so only reads are repeated there.
// `config.retry: true` marks a POST that is safe either way (login is: sending
// it twice signs you in twice, which is the same as once).
function isRetryable(err) {
  const config = err.config || {};
  const method = (config.method || 'get').toLowerCase();
  const safeMethod = method === 'get' || method === 'head';
  const optedIn = config.retry === true;

  // Cancelled by the caller — never retry.
  if (axios.isCancel?.(err)) return false;

  // No response at all: connection closed, DNS failure, or our own timeout.
  if (!err.response) return safeMethod || optedIn;

  // The proxy answered because the app behind it was not ready.
  if ([502, 503, 504].includes(err.response.status)) return safeMethod || optedIn;

  return false;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;

    if (config && isRetryable(err)) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[config.__retryCount] ?? 8000;
        config.__retryCount += 1;
        await sleep(delay);
        return api(config);
      }
    }

    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/** True when the failure was the connection, not something the server said. */
export function isNetworkError(err) {
  return Boolean(err) && !err.response;
}

/**
 * Nudges a sleeping instance awake without blocking anything. Called when the
 * login page opens: by the time credentials are typed the server is usually up,
 * so the login itself answers immediately instead of paying for the cold start.
 */
export function warmUp() {
  // `/api/health`, not `/health`: only the `/api` prefix goes through the Vite
  // dev proxy, so this reaches the real backend in development too.
  return api
    .get('/api/health', { timeout: 30000, retry: true })
    .then(() => true)
    .catch(() => false);
}

export default api;
