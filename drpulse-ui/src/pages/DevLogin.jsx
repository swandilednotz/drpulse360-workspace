import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api }  from '../lib/api.js';
import { auth } from '../lib/auth.js';
import Logo from "../assets/logo.png";


export default function DevLogin() {
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.auth.devLogin(email.trim());
      auth.setToken(token);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f5f5f7',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', border: '1px solid #e5e5e5',
        borderRadius: 16, padding: 40, width: 360,
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width:30, height:30,  borderRadius:7, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <img style={{ width:30, height:30 }} src={Logo} alt="logo" />
                <span style={{display:"flex", fontSize:12, fontWeight:900}}>DRPL</span>
              </div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>DR Pulse 360</span>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Sign in</h2>


        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#888',
            textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="admin@drpl.com"
            autoFocus
            style={{
              width: '100%', border: '1px solid #e5e5e5', borderRadius: 8,
              padding: '10px 12px', fontSize: 14, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', background: loading ? '#9b8ee8' : '#5B4FCF',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '11px', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {loading ? 'Signing in…' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
