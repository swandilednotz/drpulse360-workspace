import React, { useState } from 'react';
import { api }  from '../lib/api.js';
import { auth } from '../lib/auth.js';

// Icon map — extend as new products are added
const ICONS = {
  'srt-manager': '📡',
  'analytics':   '📊',
  'cms':         '📝',
  'ad-replace':  '📺',
  'music-cue':   '🎵',
  'subtitle':    '💬',
};

// Where each product app lives
const APP_URLS = {
  'srt-manager': import.meta.env.VITE_SRT_URL || 'http://localhost:4000',
  'analytics':   import.meta.env.VITE_ANALYTICS_URL || 'http://localhost:4001',
};

export default function AppTile({ app }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const icon    = ICONS[app.app_slug]  || '🔲';
  const appUrl  = APP_URLS[app.app_slug];

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Exchange master JWT for a scoped token for this specific app
      const { token } = await api.auth.tokenExchange(app.id);

      // 2. Navigate to the product app, passing the scoped token in the URL hash.
      //    The hash is never sent to the server — it stays in the browser.
      //    The product app reads it on load, stores it in memory, then clears the hash.
      const target = appUrl || `http://localhost:4000`;
      window.location.href = `${target}/auth?token=${token}`;

    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'white',
        border: `1.5px solid ${loading ? '#5B4FCF' : '#e5e5e5'}`,
        borderRadius: 12,
        padding: '24px 20px',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        opacity: loading ? 0.8 : 1,
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = '#5B4FCF'; }}
      onMouseLeave={e => { if (!loading) e.currentTarget.style.borderColor = '#e5e5e5'; }}
    >
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: '#f5f5f7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        {loading ? (
          <span style={{ fontSize: 14, color: '#5B4FCF', animation: 'spin 1s linear infinite' }}>⏳</span>
        ) : icon}
      </div>

      {/* Info */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>
          {app.app_name}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          Role: <strong style={{ color: '#5B4FCF' }}>{app.role}</strong>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
          {error}
        </div>
      )}

      {/* Loading overlay label */}
      {loading && (
        <div style={{
          position: 'absolute', bottom: 10, right: 14,
          fontSize: 10, color: '#5B4FCF',
        }}>
          Opening…
        </div>
      )}
    </div>
  );
}
