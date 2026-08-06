// ── Token storage ─────────────────────────────────────────────────────────
// Master JWT lives in localStorage on the DR Pulse 360 domain only.
// Product apps never see the master token.

const KEY = 'drp.master';

export const auth = {
  getToken:  ()        => localStorage.getItem(KEY),
  setToken:  (token)   => localStorage.setItem(KEY, token),
  clear:     ()        => localStorage.removeItem(KEY),
  isLoggedIn:()        => !!localStorage.getItem(KEY),

  // Decode payload without verifying signature (verification is server-side)
  getUser: () => {
    const token = localStorage.getItem(KEY);
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Check expiry
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(KEY);
        return null;
      }
      return payload;
    } catch { return null; }
  },
};
