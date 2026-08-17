import React, { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import { api } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { Navigate } from 'react-router-dom';

const PURPLE = '#5B4FCF';

const APP_PAGES = {
  'srt-manager': ['dashboard', 'affiliates', 'channels', 'devices', 'ota', 'logs', 'users', 'activity'],
};

export default function ManageUsers() {
  const user = auth.getUser();
  const [users, setUsers]   = useState([]);
  const [apps, setApps]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [grantingFor, setGrantingFor] = useState(null); // user id currently in the grant-access panel

  function load() {
    setLoading(true);
    Promise.all([api.users.list(), api.clientApps.all()])
      .then(([u, a]) => { setUsers(u); setApps(a); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  if (user?.platform_role !== 'superuser') {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
      <Header />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Manage users</h1>
          <p style={{ fontSize: 14, color: '#666' }}>
            View everyone in your workspace and grant existing users access to another app.
          </p>
        </div>

        {loading && <div style={{ color: '#888', fontSize: 14 }}>Loading users…</div>}

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px',
            fontSize: 13, color: '#dc2626', marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {!loading && users.length === 0 && (
          <div style={{
            background: 'white', border: '1px solid #e5e5e5',
            borderRadius: 12, padding: '40px 24px',
            textAlign: 'center', color: '#888', fontSize: 14,
          }}>
            No users yet.
          </div>
        )}

        {!loading && users.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
            {users.map((u, i) => (
              <UserRow
                key={u.id}
                user={u}
                apps={apps}
                bordered={i > 0}
                expanded={grantingFor === u.id}
                onToggleGrant={() => setGrantingFor(grantingFor === u.id ? null : u.id)}
                onGranted={() => { setGrantingFor(null); load(); }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function UserRow({ user, apps, bordered, expanded, onToggleGrant, onGranted }) {
  const assignedIds = (user.assignments || []).map(a => a.client_app_id);
  const availableApps = apps.filter(a => !assignedIds.includes(a.id));

  return (
    <div style={{ borderTop: bordered ? '1px solid #f0f0f0' : 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
            {user.name || user.email}
            {!user.is_active && <span style={{ color: '#dc2626', fontWeight: 500 }}> · deactivated</span>}
          </div>
          <div style={{ fontSize: 12.5, color: '#666' }}>{user.email}</div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
            {(user.assignments || []).length === 0
              ? 'No app access yet'
              : user.assignments.map(a => a.role).join(', ') + ' access'}
          </div>
        </div>

        {availableApps.length > 0 && (
          <button
            onClick={onToggleGrant}
            style={{
              fontSize: 12, fontWeight: 600, padding: '7px 14px',
              borderRadius: 8, cursor: 'pointer', flexShrink: 0,
              border: `1px solid ${PURPLE}`,
              background: expanded ? PURPLE : 'white',
              color: expanded ? 'white' : PURPLE,
              fontFamily: 'inherit',
            }}
          >
            {expanded ? 'Cancel' : '+ Grant app access'}
          </button>
        )}
      </div>

      {expanded && (
        <GrantAccessPanel
          user={user}
          apps={availableApps}
          onGranted={onGranted}
        />
      )}
    </div>
  );
}

function GrantAccessPanel({ user, apps, onGranted }) {
  const [clientAppId, setClientAppId] = useState(apps[0]?.id || '');
  const [role, setRole] = useState('viewer');
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedApp = apps.find(a => a.id === clientAppId);
  const pageKeys = APP_PAGES[selectedApp?.app_slug] || [];

  function setPagePermission(pageKey, level) {
    setPermissions(p => ({ ...p, [pageKey]: level }));
  }

  async function submit() {
    if (!clientAppId) return setError('Select an app');
    setSaving(true);
    setError('');
    try {
      await api.users.grantRole(user.id, {
        client_app_id: clientAppId,
        role_name: role,
        permissions: role === 'custom' ? permissions : undefined,
      });
      onGranted();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 20px 20px', background: '#fafafa' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <select
          value={clientAppId}
          onChange={e => setClientAppId(e.target.value)}
          style={{ flex: 1, fontSize: 12.5, padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e5e5' }}
        >
          {apps.map(a => <option key={a.id} value={a.id}>{a.app_name}</option>)}
        </select>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e5e5' }}
        >
          {['superuser', 'admin', 'viewer', 'custom'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {role === 'custom' && pageKeys.length > 0 && (
        <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 12, background: 'white' }}>
          {pageKeys.map((pageKey, i) => (
            <div key={pageKey} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
            }}>
              <span style={{ fontSize: 12, color: '#333', textTransform: 'capitalize' }}>{pageKey}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {['none', 'view', 'edit'].map(level => {
                  const active = (permissions[pageKey] || 'none') === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setPagePermission(pageKey, level)}
                      style={{
                        fontSize: 10.5, fontWeight: 600, textTransform: 'capitalize',
                        padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                        border: `1px solid ${active ? PURPLE : '#e5e5e5'}`,
                        background: active ? PURPLE : 'white',
                        color: active ? 'white' : '#666',
                        fontFamily: 'inherit',
                      }}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11.5, color: '#dc2626', marginBottom: 10 }}>{error}</div>
      )}

      <button
        onClick={submit}
        disabled={saving}
        style={{
          fontSize: 12.5, fontWeight: 600, padding: '8px 16px',
          borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
          border: 'none', background: PURPLE, color: 'white', fontFamily: 'inherit',
        }}
      >
        {saving ? 'Granting…' : 'Grant access'}
      </button>
    </div>
  );
}
