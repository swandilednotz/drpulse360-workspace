// import React from 'react';
// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// import { auth }        from './lib/auth.js';
// import Launcher        from './pages/Launcher.jsx';
// import Login           from './pages/Login.jsx';
// import AuthComplete    from './pages/AuthComplete.jsx';
// import ResetPassword   from './pages/ResetPassword.jsx';

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth }         from './lib/auth.js';
import Launcher         from './pages/Launcher.jsx';
import Login            from './pages/Login.jsx';
import AuthComplete     from './pages/AuthComplete.jsx';
import ResetPassword    from './pages/ResetPassword.jsx';
import AccessRequests   from './pages/AccessRequests.jsx';
import ManageUsers      from './pages/ManageUsers.jsx';
import RequestAccessForm from './pages/RequestAccessForm.jsx';

function PrivateRoute({ children }) {
  return auth.isLoggedIn() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* OAuth callback — saves master token, redirects to launcher */}
        <Route path="/auth/complete" element={<AuthComplete />} />

        {/* Password reset link from email */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Login — all steps (credentials, TOTP, setup, forgot password) */}
        <Route path="/login" element={<Login />} />

        {/* App launcher */}
        <Route path="/" element={
          <PrivateRoute><Launcher /></PrivateRoute>
        }/>

        {/* Any logged-in user clicks "Request Access" on a locked app
            tile to land here, tailored to that specific app's pages */}
        <Route path="/request-access/:clientAppId" element={
          <PrivateRoute><RequestAccessForm /></PrivateRoute>
        }/>

        {/* Super User only — enforced inside each page, which redirects
            non-superusers back to "/" */}
        <Route path="/access-requests" element={
          <PrivateRoute><AccessRequests /></PrivateRoute>
        }/>

        <Route path="/manage-users" element={
          <PrivateRoute><ManageUsers /></PrivateRoute>
        }/>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}