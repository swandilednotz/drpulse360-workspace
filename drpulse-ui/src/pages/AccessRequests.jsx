import React, { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import { api } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { Navigate } from 'react-router-dom';

const PURPLE = '#5B4FCF';

export default function AccessRequests() {
  const user = auth.getUser();
  const [status, setStatus]   = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [actingOn, setActingOn] = useState(null); // request id currently being approved/denied

  function load() {
    setLoading(true);
    api.accessRequests.list(status)
      .then(data => { setRequests(data); setLoading(false); })
      .catch(e   => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [status]);

  // Only Super Users can see this page — everyone else bounces to the launcher.
  if (user?.platform_role !== 'superuser') {
    return <Navigate to="/" replace />;
  }

  async function act(id, action) {
    setActingOn(id);
    try {
      await (action === 'approve' ? api.accessRequests.approve(id) : api.accessRequests.deny(id));
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
      <Header />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Access requests</h1>
          <p style={{ fontSize: 14, color: '#666' }}>
            Review requests from users asking for more page access inside a product.
          </p>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['pending', 'approved', 'denied', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${status === s ? PURPLE : '#e5e5e5'}`,
                background: status === s ? PURPLE : 'white',
                color: status === s ? 'white' : '#555',
                fontFamily: 'inherit',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {loading && <div style={{ color: '#888', fontSize: 14 }}>Loading requests…</div>}

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px',
            fontSize: 13, color: '#dc2626', marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div style={{
            background: 'white', border: '1px solid #e5e5e5',
            borderRadius: 12, padding: '40px 24px',
            textAlign: 'center', color: '#888', fontSize: 14,
          }}>
            No {status !== 'all' ? status : ''} requests.
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
            {requests.map((r, i) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px',
                borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
                    {r.user_name || r.user_email}
                    <span style={{ fontWeight: 400, color: '#888' }}> · {r.app_name}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#666' }}>
                    Requesting <strong style={{ textTransform: 'capitalize' }}>{r.requested_level}</strong> access to{' '}
                    <span style={{ textTransform: 'capitalize' }}>{r.page_key}</span>
                    {r.reason && <span> — "{r.reason}"</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
                    {new Date(r.requested_at).toLocaleString()}
                    {r.status !== 'pending' && ` · ${r.status}`}
                  </div>
                </div>

                {r.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      disabled={actingOn === r.id}
                      onClick={() => act(r.id, 'deny')}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '7px 14px',
                        borderRadius: 8, cursor: actingOn === r.id ? 'wait' : 'pointer',
                        border: '1px solid #e5e5e5', background: 'white', color: '#666',
                        fontFamily: 'inherit',
                      }}
                    >
                      Deny
                    </button>
                    <button
                      disabled={actingOn === r.id}
                      onClick={() => act(r.id, 'approve')}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '7px 14px',
                        borderRadius: 8, cursor: actingOn === r.id ? 'wait' : 'pointer',
                        border: 'none', background: PURPLE, color: 'white',
                        fontFamily: 'inherit',
                      }}
                    >
                      Approve
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
