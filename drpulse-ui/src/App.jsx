// import React from 'react';
// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// import { auth } from './lib/auth.js';
// import Launcher    from './pages/Launcher.jsx';
// import DevLogin    from './pages/DevLogin.jsx';
// import AuthComplete from './pages/AuthComplete.jsx';

// function PrivateRoute({ children }) {
//   return auth.isLoggedIn() ? children : <Navigate to="/login" replace />;
// }

// export default function App() {
//   return (
//     <BrowserRouter>
//       <Routes>
//         {/* After OAuth callback — saves token then redirects */}
//         <Route path="/auth/complete" element={<AuthComplete />} />

//         {/* Dev login — replace with real login page later */}
//         <Route path="/login" element={<DevLogin />} />

//         {/* Main launcher */}
//         <Route path="/" element={
//           <PrivateRoute><Launcher /></PrivateRoute>
//         }/>

//         <Route path="*" element={<Navigate to="/" replace />} />
//       </Routes>
//     </BrowserRouter>
//   );
// }


import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth }        from './lib/auth.js';
import Launcher        from './pages/Launcher.jsx';
import Login           from './pages/Login.jsx';
import AuthComplete    from './pages/AuthComplete.jsx';
import ResetPassword   from './pages/ResetPassword.jsx';

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
