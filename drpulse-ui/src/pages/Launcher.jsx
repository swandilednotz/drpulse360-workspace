// import React, { useEffect, useState } from 'react';
// import Header  from '../components/Header.jsx';
// import AppTile from '../components/AppTile.jsx';
// import { api }  from '../lib/api.js';
// import { auth } from '../lib/auth.js';

// export default function Launcher() {
//   const [apps,    setApps]    = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error,   setError]   = useState(null);

//   const user = auth.getUser();
//   const isSuperUser = user?.platform_role === 'superuser';

//   useEffect(() => {
//     // Fetch ALL apps for this tenant so we can show locked tiles too
//     api.clientApps.all()
//       .then(data => { setApps(data); setLoading(false); })
//       .catch(e   => { setError(e.message); setLoading(false); });
//   }, []);

//   const greeting = () => {
//     const h = new Date().getHours();
//     if (h < 12) return 'Good morning';
//     if (h < 17) return 'Good afternoon';
//     return 'Good evening';
//   };

//   const activeApps = apps.filter(a => a.has_access);
//   const lockedApps = apps.filter(a => !a.has_access);

//   return (
//     <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
//       <Header />

//       <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>

//         {/* Welcome */}
//         <div style={{ marginBottom: 40 }}>
//           <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
//             {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
//           </h1>
//           <p style={{ fontSize: 14, color: '#666' }}>
//             Select a product to get started.
//           </p>
//         </div>

//         {/* Loading */}
//         {loading && (
//           <div style={{ color: '#888', fontSize: 14 }}>Loading your apps…</div>
//         )}

//         {/* Error */}
//         {error && (
//           <div style={{
//             background: '#fef2f2', border: '1px solid #fecaca',
//             borderRadius: 8, padding: '12px 16px',
//             fontSize: 13, color: '#dc2626',
//           }}>
//             {error}
//           </div>
//         )}

//         {/* No apps at all */}
//         {!loading && !error && apps.length === 0 && (
//           <div style={{
//             background: 'white', border: '1px solid #e5e5e5',
//             borderRadius: 12, padding: '40px 24px',
//             textAlign: 'center', color: '#888', fontSize: 14,
//           }}>
//             No apps available. Contact your administrator.
//           </div>
//         )}

//         {/* Active apps */}
//         {!loading && activeApps.length > 0 && (
//           <>
//             <div style={{ fontSize: 11, fontWeight: 600, color: '#888',
//               textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
//               Your apps
//             </div>
//             <div style={{
//               display: 'grid',
//               gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
//               gap: 16,
//               marginBottom: lockedApps.length > 0 ? 40 : 0,
//             }}>
//               {activeApps.map(app => <AppTile key={app.id} app={app} locked={false} />)}
//             </div>
//           </>
//         )}

//         {/* Locked apps */}
//         {!loading && lockedApps.length > 0 && (
//           <>
//             <div style={{ fontSize: 11, fontWeight: 600, color: '#bbb',
//               textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
//               Available apps
//             </div>
//             <div style={{
//               display: 'grid',
//               gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
//               gap: 16,
//             }}>
//               {lockedApps.map(app => <AppTile key={app.id} app={app} locked={true} />)}
//             </div>
//           </>
//         )}

//       </main>
//     </div>
//   );
// }




 
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header          from '../components/Header.jsx';
import AppTile         from '../components/AppTile.jsx';
import CreateUserModal from '../components/CreateUserModal.jsx';
import { api }  from '../lib/api.js';
import { auth } from '../lib/auth.js';
 
export default function Launcher() {
  const [apps,           setApps]           = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
 
  const user        = auth.getUser();
  const isSuperUser = user?.platform_role === 'superuser';
 
  function loadApps() {
    api.clientApps.all()
      .then(data => { setApps(data); setLoading(false); })
      .catch(e   => { setError(e.message); setLoading(false); });
  }
 
  useEffect(() => { loadApps(); }, []);
 
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };
 
  const activeApps = apps.filter(a => a.has_access);
  const lockedApps = apps.filter(a => !a.has_access);
 
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
      <Header />
 
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
 
        {/* Welcome + Add User button */}
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', marginBottom: 40,
        }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
              {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h1>
            <p style={{ fontSize: 14, color: '#666' }}>
              Select a product to get started.
            </p>
          </div>
 
          {isSuperUser && (
            <div style={{ display: 'flex', gap: 10, marginTop: 4, flexShrink: 0 }}>
              <Link
                to="/manage-users"
                style={{
                  background:   'white',
                  color:        '#5B4FCF',
                  border:       '1px solid #5B4FCF',
                  borderRadius: 10,
                  padding:      '10px 18px',
                  fontSize:     13,
                  fontWeight:   600,
                  fontFamily:   'inherit',
                  textDecoration: 'none',
                  display:      'flex',
                  alignItems:   'center',
                }}
              >
                Manage users
              </Link>
              <button
                onClick={() => setShowCreateUser(true)}
                style={{
                  background:   '#5B4FCF',
                  color:        'white',
                  border:       'none',
                  borderRadius: 10,
                  padding:      '10px 18px',
                  fontSize:     13,
                  fontWeight:   600,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          7,
                }}
              >
                + Add user
              </button>
            </div>
          )}
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
 
        {/* No apps */}
        {!loading && !error && apps.length === 0 && (
          <div style={{
            background: 'white', border: '1px solid #e5e5e5',
            borderRadius: 12, padding: '40px 24px',
            textAlign: 'center', color: '#888', fontSize: 14,
          }}>
            No apps available. Contact your administrator.
          </div>
        )}
 
        {/* Active apps */}
        {!loading && activeApps.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#888',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16,
            }}>
              Your apps
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 16,
              marginBottom: lockedApps.length > 0 ? 40 : 0,
            }}>
              {activeApps.map(app => (
                <AppTile key={app.id} app={app} locked={false} />
              ))}
            </div>
          </>
        )}
 
        {/* Locked apps */}
        {!loading && lockedApps.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#bbb',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16,
            }}>
              Available apps
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 16,
            }}>
              {lockedApps.map(app => (
                <AppTile key={app.id} app={app} locked={true} />
              ))}
            </div>
          </>
        )}
 
      </main>
 
      {/* Create User Modal */}
      {showCreateUser && (
        <CreateUserModal
          onClose={() => setShowCreateUser(false)}
          onCreated={() => {}}
        />
      )}
    </div>
  );
}