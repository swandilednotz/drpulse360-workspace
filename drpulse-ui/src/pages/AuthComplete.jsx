import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/auth.js';

// Called after Google/Microsoft OAuth redirects back with ?token=xxx
// Saves the token and sends the user to the launcher.
export default function AuthComplete() {
  const navigate = useNavigate();

  

  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');
  const error  = params.get('error');
  
  console.log('[AuthComplete] token:', !!token, 'error:', error);
  console.log('[AuthComplete] full URL:', window.location.href);

    if (error) {
      navigate(`/login?error=${error}`, { replace: true });
      return;
    }

    if (token) {
      auth.setToken(token);
      // Remove token from URL immediately
      window.history.replaceState({}, '', '/');
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#888', fontSize: 14 }}>
      Signing you in…
    </div>
  );
}
