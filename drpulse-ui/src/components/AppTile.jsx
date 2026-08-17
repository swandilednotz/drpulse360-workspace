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
  'srt-manager': import.meta.env.VITE_SRT_URL      || 'https://drmonitoring.com',
  'subtitle':    import.meta.env.VITE_SUBTITLE_URL  || 'https://subtitle.drmonitoring.com',
};

export default function AppTile({ app, locked = false }) {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [hovering, setHovering] = useState(false);

  const icon   = ICONS[app.app_slug] || '🔲';
  const appUrl = APP_URLS[app.app_slug];

  // async function handleClick() {
  //   if (locked || loading) return;
  //   setLoading(true);
  //   setError(null);
  //   try {
  //     const { token } = await api.auth.tokenExchange(app.id);
  //     const target = appUrl || 'http://localhost:4000';
  //     window.location.href = `${target}/auth?token=${token}`;
  //   } catch (e) {
  //     setError(e.message);
  //     setLoading(false);
  //   }
  // }

  async function handleClick() {
  if (locked || loading) return;
  setLoading(true);
  setError(null);
  try {
    console.log('[AppTile] starting token exchange for', app.id);
    const result = await api.auth.tokenExchange(app.id);
    console.log('[AppTile] token exchange result:', result);
    const { token } = result;
    const target = appUrl || 'http://localhost:4000';
    console.log('[AppTile] navigating to:', target);
    // window.location.href = `${target}/auth?token=${token}`, '_blank';
    window.open(`${target}/auth?token=${token}`, '_blank');
  } catch (e) {
    console.error('[AppTile] error:', e);
    setError(e.message);
    setLoading(false);
  }
}
  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        background:   'white',
        border:       `1.5px solid ${!locked && hovering ? '#5B4FCF' : '#e5e5e5'}`,
        borderRadius: 12,
        padding:      '24px 20px',
        cursor:       locked ? 'default' : loading ? 'wait' : 'pointer',
        transition:   'all 0.15s',
        display:      'flex',
        flexDirection:'column',
        gap:          12,
        position:     'relative',
        opacity:      locked ? 0.55 : loading ? 0.8 : 1,
        overflow:     'hidden',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: locked ? '#f0f0f0' : '#f5f5f7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        {loading ? (
          <span style={{ fontSize: 14, color: '#5B4FCF' }}>⏳</span>
        ) : locked ? (
          <span style={{ fontSize: 20, filter: 'grayscale(1)' }}>{icon}</span>
        ) : icon}
      </div>

      {/* Info */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3, color: locked ? '#999' : '#111' }}>
          {app.app_name}
        </div>
        {!locked && (
          <div style={{ fontSize: 12, color: '#888' }}>
            Role: <strong style={{ color: '#5B4FCF' }}>{app.role}</strong>
          </div>
        )}
        {locked && (
          <div style={{ fontSize: 12, color: '#bbb' }}>
            No access
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
          {error}
        </div>
      )}

      {/* Opening label */}
      {loading && (
        <div style={{
          position: 'absolute', bottom: 10, right: 14,
          fontSize: 10, color: '#5B4FCF',
        }}>
          Opening…
        </div>
      )}

     
      {locked && (
        <div style={{
          position:       'absolute',
          inset:          0,
          borderRadius:   12,
          background:     'rgba(255,255,255,0.92)',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            8,
          opacity:        hovering ? 1 : 0,
          transition:     'opacity 0.15s',
        }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <button
            onClick={e => { e.stopPropagation(); alert(`Request access to ${app.app_name} — form coming soon`); }}
            style={{
              background:   '#5B4FCF',
              color:        'white',
              border:       'none',
              borderRadius: 8,
              padding:      '8px 16px',
              fontSize:     13,
              fontWeight:   600,
              cursor:       'pointer',
              fontFamily:   'inherit',
            }}
          >
            Request Access
          </button>
        </div>
      )}
    </div>
  );
}
