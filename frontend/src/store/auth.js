import { create } from 'zustand';
import { authApi } from '../api';

export const useAuth = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  role: localStorage.getItem('role') || null,
  loading: false,
  initialized: false,

  async login(username, password) {
    const data = await authApi.login({ username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', data.role);
    set({ token: data.token, role: data.role });
    const me = await authApi.me();
    set({ user: me });
    return data;
  },

  async loadUser() {
    if (!get().token) {
      set({ initialized: true });
      return;
    }
    set({ loading: true });
    try {
      const me = await authApi.me();
      set({ user: me, role: me.role });
    } catch (e) {
      // Only a server that actually rejected the token ends the session.
      //
      // Treating every failure as "logged out" is what put returning users back
      // on the login page: the free host sleeps, their first request is dropped
      // before it reaches the server, and a perfectly valid token was thrown
      // away for a problem that had nothing to do with it. Signing in again did
      // not help either — the same cold instance dropped that request too.
      //
      // The client already retried this request; if it still could not reach
      // the server, keep the session and let the next screen retry. A 5xx is
      // the server having a bad moment, which says nothing about the token
      // either — only 401/403 is an answer about this session.
      const status = e.response?.status;
      const rejected = status === 401 || status === 403;
      if (rejected) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        set({ user: null, token: null, role: null });
      } else {
        set({ user: null });
      }
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  async logout() {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    set({ user: null, token: null, role: null });
  },
}));
