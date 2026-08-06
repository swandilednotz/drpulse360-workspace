import React, { useEffect, useState } from 'react';
import Header  from '../components/Header.jsx';
import AppTile from '../components/AppTile.jsx';
import { api }  from '../lib/api.js';
import { auth } from '../lib/auth.js';

export default function Launcher() {
  const [apps,    setApps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const user = auth.getUser();

  useEffect(() => {
    api.clientApps.mine()
      .then(data => { setApps(data); setLoading(false); })
      .catch(e   => { setError(e.message); setLoading(false); });
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
      <Header />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>

        {/* Welcome */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
            {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p style={{ fontSize: 14, color: '#666' }}>
            Select a product to get started.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ color: '#888', fontSize: 14 }}>Loading your apps…</div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px',
            fontSize: 13, color: '#dc2626',
          }}>
            {error}
          </div>
        )}

        {/* App grid */}
        {!loading && !error && apps.length === 0 && (
          <div style={{
            background: 'white', border: '1px solid #e5e5e5',
            borderRadius: 12, padding: '40px 24px',
            textAlign: 'center', color: '#888', fontSize: 14,
          }}>
            No apps assigned yet. Contact your administrator.
          </div>
        )}

        {!loading && apps.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
              Your apps
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 16,
            }}>
              {apps.map(app => <AppTile key={app.id} app={app} />)}
            </div>
          </>
        )}

      </main>
    </div>
  );
}
