

// import { auth } from './auth.js';
 
// const BASE = '/api';
 
// async function request(method, path, body) {
//   const token = auth.getToken();
//   const res   = await fetch(`${BASE}${path}`, {
//     method,
//     headers: {
//       'Content-Type': 'application/json',
//       ...(token ? { Authorization: `Bearer ${token}` } : {}),
//     },
//     ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
//   });
 
//   if (res.status === 401) {
//     auth.clear();
//     window.location.href = '/login';
//     return;
//   }
 
//   const data = await res.json();
//   if (!res.ok) throw new Error(data.error || 'Request failed');
//   return data;
// }
 
// export const api = {
//   auth: {
//     // ── Step 1: email + password ─────────────────────────────────────
//     login: (email, password) =>
//       request('POST', '/auth/login', { email, password }),
 
//     // ── Step 2a: verify TOTP code (subsequent logins) ────────────────
//     verifyTotp: (tempToken, code) =>
//       request('POST', '/auth/2fa/verify', { tempToken, code }),
 
//     // ── Step 2b: use backup code instead of TOTP ─────────────────────
//     verifyBackupCode: (tempToken, backupCode) =>
//       request('POST', '/auth/2fa/verify-backup', { tempToken, backupCode }),
 
//     // ── First login: forced password change ──────────────────────────
//     changePassword: (tempToken, newPassword) =>
//       request('POST', '/auth/change-password', { tempToken, newPassword }),
 
//     // ── First login: TOTP setup ───────────────────────────────────────
//     totpSetup: (tempToken) =>
//       request('POST', '/auth/2fa/setup', { tempToken }),
 
//     verifyTotpSetup: (tempToken, code) =>
//       request('POST', '/auth/2fa/verify-setup', { tempToken, code }),
 
//     // ── Password reset ────────────────────────────────────────────────
//     forgotPassword: (email) =>
//       request('POST', '/auth/forgot-password', { email }),
 
//     resetPassword: (token, password) =>
//       request('POST', '/auth/reset-password', { token, password }),
 
//     // ── Token exchange (master → scoped) ─────────────────────────────
//     tokenExchange: (client_app_id) =>
//       request('POST', '/auth/token-exchange', { client_app_id }),
 
//     // ── Sign out ──────────────────────────────────────────────────────
//     logout: () => request('POST', '/auth/logout'),
 
//     // ── Dev only ──────────────────────────────────────────────────────
//     devLogin: (email) => request('POST', '/auth/dev-login', { email }),
//   },
 
//   clientApps: {
//     mine: () => request('GET', '/client-apps/mine'),
//     all:  () => request('GET', '/client-apps/all'),
//   },
//   users: {
//     create: (data) => request('POST', '/users', data),
//     list:   ()      => request('GET',  '/users'),
//   },
//   accessRequests: {
//     // status: 'pending' (default) | 'approved' | 'denied' | 'all'
//     list:    (status = 'pending') => request('GET', `/access-requests?status=${status}`),
//     approve: (id)                 => request('PATCH', `/access-requests/${id}/approve`),
//     deny:    (id)                 => request('PATCH', `/access-requests/${id}/deny`),
//   },
// };
 

import { auth } from './auth.js';

const BASE = '/api';

async function request(method, path, body) {
  const token = auth.getToken();
  const res   = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    auth.clear();
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) {
    // Status is attached so callers can branch on specific codes
    // (e.g. 409 = user already exists) instead of matching error text.
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  auth: {
    login:            (email, password)        => request('POST', '/auth/login', { email, password }),
    verifyTotp:       (tempToken, code)         => request('POST', '/auth/2fa/verify', { tempToken, code }),
    verifyBackupCode: (tempToken, backupCode)   => request('POST', '/auth/2fa/verify-backup', { tempToken, backupCode }),
    changePassword:   (tempToken, newPassword)  => request('POST', '/auth/change-password', { tempToken, newPassword }),
    totpSetup:        (tempToken)               => request('POST', '/auth/2fa/setup', { tempToken }),
    verifyTotpSetup:  (tempToken, code)         => request('POST', '/auth/2fa/verify-setup', { tempToken, code }),
    forgotPassword:   (email)                   => request('POST', '/auth/forgot-password', { email }),
    resetPassword:    (token, password)         => request('POST', '/auth/reset-password', { token, password }),
    tokenExchange:    (client_app_id)           => request('POST', '/auth/token-exchange', { client_app_id }),
    logout:           ()                        => request('POST', '/auth/logout'),
    devLogin:         (email)                   => request('POST', '/auth/dev-login', { email }),
  },

  clientApps: {
    mine: () => request('GET', '/client-apps/mine'),
    all:  () => request('GET', '/client-apps/all'),
  },

  users: {
    // Creates a brand-new user only — backend returns 409 if the email
    // already exists in this tenant (see err.status above).
    create: (data) => request('POST', '/users', data),

    // Lists every user in the tenant, with their app assignments.
    list: () => request('GET', '/users'),

    // Grants an existing user access to another app (or updates their
    // role/permissions in one they already have). Optional `permissions`
    // = { page_key: 'none'|'view'|'edit' }, only meaningful for role 'custom'.
    grantRole: (id, { client_app_id, role_name, permissions }) =>
      request('PATCH', `/users/${id}/role`, { client_app_id, role_name, permissions }),
  },
};