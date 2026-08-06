import React from 'react';
import { auth }  from '../lib/auth.js';
import { api }   from '../lib/api.js';
import Logo from "../assets/logo.png";

export default function Header() {
  const user = auth.getUser();

  const initials = (user?.name || user?.email || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  async function handleLogout() {
    await api.auth.logout().catch(() => {});
    auth.clear();
    window.location.href = '/login';
  }

  return (
    <header style={{
      background: 'white',
      borderBottom: '1px solid #e5e5e5',
      padding: '0 32px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width:30, height:30,  borderRadius:7, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <img style={{ width:30, height:30 }} src={Logo} alt="logo" />
                        <span style={{display:"flex", fontSize:12, fontWeight:900}}>DRPL</span>
                      </div>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
          DR Pulse 360
        </span>
      </div>

      {/* User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: '#555' }}>{user?.email}</span>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#1706fe', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600, cursor: 'default',
        }}>
          {initials}
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'none', border: '1px solid #e5e5e5',
            borderRadius: 6, padding: '5px 12px',
            fontSize: 12, color: '#555', cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
