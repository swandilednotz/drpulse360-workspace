import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const PURPLE = '#5B4FCF';
const INPUT = {
  width: '100%', border: '1px solid #e5e5e5', borderRadius: 8,
  padding: '11px 13px', fontSize: 14, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};

export default function ResetPassword() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const token      = params.get('token');
  const [pw,       setPw]      = useState('');
  const [confirm,  setConfirm] = useState('');
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');
  const [done,     setDone]    = useState(false);

  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (pw.length < 8) { setError('Min 8 characters'); return; }
    if (pw !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await api.auth.resetPassword(token, pw);
      setDone(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 16,
        padding: '40px', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: PURPLE,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="white" strokeWidth="1.5"/>
              <circle cx="7" cy="7" r="2.5" fill="white"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>DR Pulse 360</span>
        </div>

        {done ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Password reset</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
              Your password has been updated. You can now sign in.
            </p>
            <button onClick={() => navigate('/login')}
              style={{ width: '100%', background: PURPLE, color: '#fff', border: 'none',
                borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Sign in →
            </button>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Set new password</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
              Choose a strong password for your account.
            </p>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#777', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 6 }}>New password</div>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                  placeholder="Min 8 characters" autoFocus style={INPUT} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#777', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 6 }}>Confirm password</div>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password" style={INPUT} />
              </div>
              <button type="submit" disabled={loading}
                style={{ width: '100%', background: loading ? '#9b8ee8' : PURPLE, color: '#fff',
                  border: 'none', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {loading ? 'Saving…' : 'Reset password →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
