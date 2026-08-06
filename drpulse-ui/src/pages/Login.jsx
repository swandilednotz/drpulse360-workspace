import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api }  from '../lib/api.js';
import { auth } from '../lib/auth.js';
import Logo1 from "../assets/logo.png";

// ─────────────────────────────────────────────────────────────────────────────
// Login — handles all authentication steps in sequence:
//   email_password  → totp_verify (or totp_setup on first login)
//   email_password  → change_password → totp_setup  (first login)
//   forgot          → confirmation message
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_API = import.meta.env.VITE_PLATFORM_API_URL || '';

// ── Brand colours ─────────────────────────────────────────────────────────────
const PURPLE = '#5B4FCF';
const PURPLE_DIM = '#4338a8';

// ── Shared input style ────────────────────────────────────────────────────────
const INPUT = {
  width: '100%',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '11px 13px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#111',
  background: '#fff',
};

const BTN_PRIMARY = {
  width: '100%',
  background: PURPLE,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '12px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
};

const BTN_OUTLINE = {
  width: '100%',
  background: '#fff',
  color: '#333',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '11px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  transition: 'border-color 0.15s',
};

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
              <div style={{ width:30, height:30,  borderRadius:7, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <img style={{ width:30, height:30 }} src={Logo1} alt="logo" />
                    <span style={{display:"flex", fontSize:12, fontWeight:900}}>DRPL</span>
                  </div>
              <span style={{ fontWeight: 700, fontSize: 16 }}>DR Pulse 360</span>
            </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
      padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
      {msg}
    </div>
  );
}

// ── Label ─────────────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#777',
      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
      {children}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
      <span style={{ fontSize: 12, color: '#999' }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
    </div>
  );
}

// ── Google icon ───────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

// ── Microsoft icon ────────────────────────────────────────────────────────────
function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21">
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP: Email + Password
// ─────────────────────────────────────────────────────────────────────────────
function StepCredentials({ onNext, onForgot }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [params]               = useSearchParams();

  // Show errors from OAuth redirects
  useEffect(() => {
    const e = params.get('error');
    if (e === 'not_registered') setError('Your account is not set up yet. Contact your administrator.');
    if (e === 'google_failed')  setError('Google sign-in failed. Please try again.');
    if (e === 'microsoft_failed') setError('Microsoft sign-in failed. Please try again.');
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true); setError('');
    try {
      const res = await api.auth.login(email.trim(), password);
      onNext(res, email.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: '#111' }}>
        Sign in
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 28 }}>
        Sign in to your DR Pulse 360 account
      </p>

      <ErrorBanner msg={error} />

      {/* Google */}
      <button style={BTN_OUTLINE}
        onClick={() => { window.location.href = `${PLATFORM_API}/api/auth/google`; }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#aaa'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e5e5'}
      >
        <GoogleIcon /> Continue with Google
      </button>

      <div style={{ height: 10 }} />

      {/* Microsoft */}
      <button style={BTN_OUTLINE}
        onClick={() => { window.location.href = `${PLATFORM_API}/api/auth/microsoft`; }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#aaa'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e5e5'}
      >
        <MicrosoftIcon /> Continue with Microsoft
      </button>

      <Divider />

      {/* Email + Password form */}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <Label>Email</Label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com" autoFocus style={INPUT} />
        </div>

        <div style={{ marginBottom: 6 }}>
          <Label>Password</Label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" style={INPUT} />
        </div>

        <div style={{ textAlign: 'right', marginBottom: 20 }}>
          <button type="button" onClick={onForgot}
            style={{ background: 'none', border: 'none', fontSize: 12,
              color: PURPLE, cursor: 'pointer', padding: 0 }}>
            Forgot password?
          </button>
        </div>

        <button type="submit" disabled={loading}
          style={{ ...BTN_PRIMARY, background: loading ? '#9b8ee8' : PURPLE }}>
          {loading ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP: Change Password (first login)
// ─────────────────────────────────────────────────────────────────────────────
function StepChangePassword({ tempToken, onNext }) {
  const [pw,      setPw]      = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (pw.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (pw !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      const res = await api.auth.changePassword(tempToken, pw);
      onNext(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: '#111' }}>
        Set your password
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        You're using a temporary password. Please set a new one to continue.
      </p>
      <ErrorBanner msg={error} />
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <Label>New password</Label>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)}
            placeholder="Min 8 characters" autoFocus style={INPUT} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <Label>Confirm password</Label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password" style={INPUT} />
        </div>
        <button type="submit" disabled={loading}
          style={{ ...BTN_PRIMARY, background: loading ? '#9b8ee8' : PURPLE }}>
          {loading ? 'Saving…' : 'Set password →'}
        </button>
      </form>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP: TOTP Setup (first login — scan QR code)
// ─────────────────────────────────────────────────────────────────────────────
function StepTotpSetup({ tempToken, onSuccess }) {
  const [qr,      setQr]      = useState(null);
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [backupCodes, setBackupCodes] = useState(null);

  useEffect(() => {
    api.auth.totpSetup(tempToken)
      .then(d => setQr(d.qrDataUrl))
      .catch(e => setError(e.message));
  }, [tempToken]);

  async function handleVerify(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api.auth.verifyTotpSetup(tempToken, code.replace(/\s/g, ''));
      if (res.backupCodes) setBackupCodes(res.backupCodes);
      else onSuccess(res.token);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  if (backupCodes) {
    return (
      <>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: '#111' }}>
          Save your backup codes
        </h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          Store these somewhere safe. Each code can only be used once if you lose access to your authenticator.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {backupCodes.map(c => (
            <div key={c} style={{ background: '#f5f5f7', borderRadius: 6, padding: '8px 12px',
              fontFamily: 'monospace', fontSize: 13, color: '#333', textAlign: 'center' }}>
              {c}
            </div>
          ))}
        </div>
        <button style={{ ...BTN_PRIMARY, background: PURPLE }}
          onClick={() => onSuccess()}>
          I've saved my codes — Continue →
        </button>
      </>
    );
  }

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: '#111' }}>
        Set up 2-factor authentication
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Scan this QR code with any authenticator app (Google Authenticator, Microsoft Authenticator, Authy etc.)
      </p>
      <ErrorBanner msg={error} />

      {qr ? (
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={qr} alt="TOTP QR Code" style={{ width: 180, height: 180, borderRadius: 8 }} />
        </div>
      ) : (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#aaa', fontSize: 13, marginBottom: 20 }}>
          Loading QR code…
        </div>
      )}

      <form onSubmit={handleVerify}>
        <div style={{ marginBottom: 20 }}>
          <Label>Enter the 6-digit code from your app</Label>
          <input type="text" value={code} onChange={e => setCode(e.target.value)}
            placeholder="000 000" maxLength={7} autoFocus
            style={{ ...INPUT, textAlign: 'center', letterSpacing: '0.3em', fontSize: 20 }} />
        </div>
        <button type="submit" disabled={loading || !qr}
          style={{ ...BTN_PRIMARY, background: loading ? '#9b8ee8' : PURPLE }}>
          {loading ? 'Verifying…' : 'Verify and activate →'}
        </button>
      </form>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP: TOTP Verify (subsequent logins)
// ─────────────────────────────────────────────────────────────────────────────
function StepTotpVerify({ tempToken, email, onSuccess, onBack }) {
  const [code,     setCode]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [useBackup]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = useBackup
        ? await api.auth.verifyBackupCode(tempToken, code.trim())
        : await api.auth.verifyTotp(tempToken, code.replace(/\s/g, ''));
      onSuccess(res.token);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: '#111' }}>
        {useBackup ? 'Enter backup code' : 'Two-factor authentication'}
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        {useBackup
          ? 'Enter one of your saved backup codes.'
          : `Enter the 6-digit code from your authenticator app for ${email}.`}
      </p>

      <ErrorBanner msg={error} />

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <input ref={inputRef} type="text" value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={useBackup ? 'XXXX-XXXX' : '000 000'}
            maxLength={useBackup ? 9 : 7}
            style={{ ...INPUT, textAlign: 'center',
              letterSpacing: useBackup ? '0.1em' : '0.3em',
              fontSize: 22 }} />
        </div>

        <button type="submit" disabled={loading}
          style={{ ...BTN_PRIMARY, background: loading ? '#9b8ee8' : PURPLE }}>
          {loading ? 'Verifying…' : 'Verify →'}
        </button>
      </form>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', fontSize: 12,
            color: '#888', cursor: 'pointer', padding: 0 }}>
          ← Back
        </button>
        <button onClick={() => { setUseBackup(b => !b); setCode(''); setError(''); }}
          style={{ background: 'none', border: 'none', fontSize: 12,
            color: PURPLE, cursor: 'pointer', padding: 0 }}>
          {useBackup ? 'Use authenticator app' : 'Use a backup code'}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP: Forgot Password
// ─────────────────────────────────────────────────────────────────────────────
function StepForgotPassword({ onBack }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.auth.forgotPassword(email.trim());
      setSent(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  if (sent) {
    return (
      <>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#111' }}>Check your inbox</h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
          If <strong>{email}</strong> is registered, you'll receive a reset link shortly.
        </p>
        <button onClick={onBack} style={{ ...BTN_PRIMARY, background: PURPLE }}>
          Back to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: '#111' }}>
        Reset your password
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        Enter your email and we'll send you a reset link.
      </p>
      <ErrorBanner msg={error} />
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <Label>Email</Label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com" autoFocus style={INPUT} />
        </div>
        <button type="submit" disabled={loading}
          style={{ ...BTN_PRIMARY, background: loading ? '#9b8ee8' : PURPLE }}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', fontSize: 12,
            color: '#888', cursor: 'pointer' }}>
          ← Back to sign in
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Login page — orchestrates all steps
// ─────────────────────────────────────────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isLoggedIn()) navigate('/', { replace: true });
  }, []);
  
  const [step,      setStep]      = useState('credentials'); // credentials | change_password | totp_setup | totp_verify | forgot
  const [tempToken, setTempToken] = useState(null);
  const [email,     setEmail]     = useState('');

  // After successful login — save master token and go to launcher
  function onLoginSuccess(token) {
    auth.setToken(token);
    navigate('/', { replace: true });
  }

  // Handle response from POST /api/auth/login
  function handleLoginResponse(res, emailUsed) {
    setEmail(emailUsed);
    if (res.requires_password_change) {
      setTempToken(res.tempToken);
      setStep('change_password');
    } else if (res.requires_2fa_setup) {
      setTempToken(res.tempToken);
      setStep('totp_setup');
    } else if (res.requires_2fa) {
      setTempToken(res.tempToken);
      setStep('totp_verify');
    }
  }

  // After password change — move to TOTP setup
  function handlePasswordChanged(res) {
    setTempToken(res.tempToken);
    setStep('totp_setup');
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f0f8 0%, #f5f5f7 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #e8e8e8',
        borderRadius: 16,
        padding: '40px 40px 36px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      }}>
        <Logo />

        {step === 'credentials' && (
          <StepCredentials
            onNext={handleLoginResponse}
            onForgot={() => setStep('forgot')}
          />
        )}

        {step === 'change_password' && (
          <StepChangePassword
            tempToken={tempToken}
            onNext={handlePasswordChanged}
          />
        )}

        {step === 'totp_setup' && (
          <StepTotpSetup
            tempToken={tempToken}
            onSuccess={(token) => token ? onLoginSuccess(token) : onLoginSuccess(null)}
          />
        )}

        {step === 'totp_verify' && (
          <StepTotpVerify
            tempToken={tempToken}
            email={email}
            onSuccess={onLoginSuccess}
            onBack={() => setStep('credentials')}
          />
        )}

        {step === 'forgot' && (
          <StepForgotPassword onBack={() => setStep('credentials')} />
        )}
      </div>
    </div>
  );
}
