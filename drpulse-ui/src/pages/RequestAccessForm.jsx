// import React, { useEffect, useState } from 'react';
// import { useParams, useNavigate, Link } from 'react-router-dom';
// import Header from '../components/Header.jsx';
// import { api } from '../lib/api.js';

// const PURPLE = '#5B4FCF';

// const APP_PAGES = {
//   'srt-manager': ['dashboard', 'affiliates', 'channels', 'devices', 'ota', 'logs', 'users', 'activity'],
// };

// export default function RequestAccessForm() {
//   const { clientAppId } = useParams();
//   const navigate = useNavigate();

//   const [app, setApp]             = useState(null);
//   const [permissions, setPermissions] = useState({});
//   const [reason, setReason]       = useState('');
//   const [loading, setLoading]     = useState(true);
//   const [notFound, setNotFound]   = useState(false);
//   const [submitting, setSubmitting] = useState(false);
//   const [error, setError]         = useState('');
//   const [submitted, setSubmitted] = useState(false);

//   useEffect(() => {
//     api.clientApps.all()
//       .then(data => {
//         const match = data.find(a => a.id === clientAppId);
//         if (!match) { setNotFound(true); setLoading(false); return; }
//         setApp(match);
//         setLoading(false);
//       })
//       .catch(() => { setNotFound(true); setLoading(false); });
//   }, [clientAppId]);

//   const pageKeys = APP_PAGES[app?.app_slug] || [];

//   function setPagePermission(pageKey, level) {
//     setPermissions(p => ({ ...p, [pageKey]: level }));
//   }

//   async function handleSubmit(e) {
//     e.preventDefault();
//     const hasAnySelection = Object.values(permissions).some(l => l && l !== 'none');
//     if (!hasAnySelection) return setError('Select at least one page you need access to.');

//     setSubmitting(true);
//     setError('');
//     try {
//       await api.accessRequests.create({
//         client_app_id: clientAppId,
//         requested_permissions: permissions,
//         reason: reason.trim() || undefined,
//       });
//       setSubmitted(true);
//     } catch (e) {
//       setError(e.message);
//     } finally {
//       setSubmitting(false);
//     }
//   }

//   return (
//     <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
//       <Header />

//       <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
//         {loading ? (
//           <div style={{ color: '#888', fontSize: 14 }}>Loading…</div>
//         ) : notFound ? (
//           <div style={{
//             background: 'white', border: '1px solid #e5e5e5',
//             borderRadius: 12, padding: '32px 24px', textAlign: 'center',
//           }}>
//             <p style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
//               That app doesn't exist, or isn't set up for this workspace.
//             </p>
//             <Link to="/" style={{ fontSize: 13, fontWeight: 600, color: PURPLE }}>
//               ← Back to launcher
//             </Link>
//           </div>
//         ) : submitted ? (
//           <div style={{
//             background: 'white', border: '1px solid #e5e5e5',
//             borderRadius: 12, padding: '40px 32px', textAlign: 'center',
//           }}>
//             <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
//             <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Request sent</h2>
//             <p style={{ fontSize: 13.5, color: '#666', marginBottom: 20 }}>
//               A workspace admin will review your request for <strong>{app.app_name}</strong>.
//               You'll get an email once it's approved or denied — and if approved, the access
//               is ready the next time you log in.
//             </p>
//             <Link to="/" style={{ fontSize: 13, fontWeight: 600, color: PURPLE }}>
//               ← Back to launcher
//             </Link>
//           </div>
//         ) : (
//           <>
//             <div style={{ marginBottom: 28 }}>
//               <button
//                 onClick={() => navigate('/')}
//                 style={{
//                   background: 'none', border: 'none', color: '#888', fontSize: 12.5,
//                   cursor: 'pointer', padding: 0, marginBottom: 12, fontFamily: 'inherit',
//                 }}
//               >
//                 ← Back to launcher
//               </button>
//               <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
//                 Request access to {app.app_name}
//               </h1>
//               <p style={{ fontSize: 14, color: '#666' }}>
//                 Pick what you need below and a workspace admin will review it.
//               </p>
//             </div>

//             <form onSubmit={handleSubmit} style={{
//               background: 'white', border: '1px solid #e5e5e5',
//               borderRadius: 12, padding: 28,
//             }}>
//               {error && (
//                 <div style={{
//                   background: '#fef2f2', border: '1px solid #fecaca',
//                   borderRadius: 8, padding: '10px 12px',
//                   fontSize: 12.5, color: '#dc2626', marginBottom: 18,
//                 }}>
//                   {error}
//                 </div>
//               )}

//               {pageKeys.length > 0 ? (
//                 <div style={{ marginBottom: 20 }}>
//                   <label style={{
//                     display: 'block', fontSize: 11, fontWeight: 600, color: '#777',
//                     textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
//                   }}>
//                     Pages you need
//                   </label>
//                   <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
//                     {pageKeys.map((pageKey, i) => (
//                       <div key={pageKey} style={{
//                         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//                         padding: '10px 14px',
//                         borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
//                       }}>
//                         <span style={{ fontSize: 13, color: '#333', textTransform: 'capitalize' }}>{pageKey}</span>
//                         <div style={{ display: 'flex', gap: 5 }}>
//                           {['none', 'view', 'edit'].map(level => {
//                             const active = (permissions[pageKey] || 'none') === level;
//                             return (
//                               <button
//                                 key={level}
//                                 type="button"
//                                 onClick={() => setPagePermission(pageKey, level)}
//                                 style={{
//                                   fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize',
//                                   padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
//                                   border: `1px solid ${active ? PURPLE : '#e5e5e5'}`,
//                                   background: active ? PURPLE : 'white',
//                                   color: active ? 'white' : '#666',
//                                   fontFamily: 'inherit',
//                                 }}
//                               >
//                                 {level}
//                               </button>
//                             );
//                           })}
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               ) : (
//                 <div style={{ fontSize: 12.5, color: '#888', marginBottom: 20 }}>
//                   This app doesn't have a defined page list yet — describe what you need in
//                   the note below instead.
//                 </div>
//               )}

//               <div style={{ marginBottom: 24 }}>
//                 <label style={{
//                   display: 'block', fontSize: 11, fontWeight: 600, color: '#777',
//                   textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
//                 }}>
//                   Why do you need this? (optional)
//                 </label>
//                 <textarea
//                   value={reason}
//                   onChange={e => setReason(e.target.value)}
//                   rows={3}
//                   placeholder="A short note helps your admin review faster."
//                   style={{
//                     width: '100%', border: '1px solid #e5e5e5', borderRadius: 8,
//                     padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
//                   }}
//                 />
//               </div>

//               <button
//                 type="submit"
//                 disabled={submitting}
//                 style={{
//                   width: '100%', background: submitting ? '#9b8ee8' : PURPLE,
//                   color: 'white', border: 'none', borderRadius: 8,
//                   padding: '12px', fontSize: 14, fontWeight: 600,
//                   cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
//                 }}
//               >
//                 {submitting ? 'Sending…' : 'Submit request'}
//               </button>
//             </form>
//           </>
//         )}
//       </main>
//     </div>
//   );
// }



import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { api } from '../lib/api.js';

const PURPLE = '#5B4FCF';

const APP_PAGES = {
  'srt-manager': ['dashboard', 'affiliates', 'channels', 'devices', 'ota', 'logs', 'users', 'activity'],
};

export default function RequestAccessForm() {
  const { clientAppId } = useParams();
  const navigate = useNavigate();

  const [app, setApp]             = useState(null);
  const [permissions, setPermissions] = useState({});
  const [reason, setReason]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.clientApps.all()
      .then(data => {
        const match = data.find(a => a.id === clientAppId);
        if (!match) { setNotFound(true); setLoading(false); return; }
        setApp(match);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [clientAppId]);

  const pageKeys = APP_PAGES[app?.app_slug] || [];

  function setPagePermission(pageKey, level) {
    setPermissions(p => ({ ...p, [pageKey]: level }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const hasAnySelection = Object.values(permissions).some(l => l && l !== 'none');

    if (pageKeys.length > 0 && !hasAnySelection) {
      return setError('Select at least one page you need access to.');
    }
    if (pageKeys.length === 0 && !reason.trim()) {
      return setError('Describe what access you need — this app has no defined page list yet.');
    }

    setSubmitting(true);
    setError('');
    try {
      await api.accessRequests.create({
        client_app_id: clientAppId,
        requested_permissions: hasAnySelection ? permissions : undefined,
        reason: reason.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
      <Header />

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
        {loading ? (
          <div style={{ color: '#888', fontSize: 14 }}>Loading…</div>
        ) : notFound ? (
          <div style={{
            background: 'white', border: '1px solid #e5e5e5',
            borderRadius: 12, padding: '32px 24px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
              That app doesn't exist, or isn't set up for this workspace.
            </p>
            <Link to="/" style={{ fontSize: 13, fontWeight: 600, color: PURPLE }}>
              ← Back to launcher
            </Link>
          </div>
        ) : submitted ? (
          <div style={{
            background: 'white', border: '1px solid #e5e5e5',
            borderRadius: 12, padding: '40px 32px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Request sent</h2>
            <p style={{ fontSize: 13.5, color: '#666', marginBottom: 20 }}>
              A workspace admin will review your request for <strong>{app.app_name}</strong>.
              You'll get an email once it's approved or denied — and if approved, the access
              is ready the next time you log in.
            </p>
            <Link to="/" style={{ fontSize: 13, fontWeight: 600, color: PURPLE }}>
              ← Back to launcher
            </Link>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 28 }}>
              <button
                onClick={() => navigate('/')}
                style={{
                  background: 'none', border: 'none', color: '#888', fontSize: 12.5,
                  cursor: 'pointer', padding: 0, marginBottom: 12, fontFamily: 'inherit',
                }}
              >
                ← Back to launcher
              </button>
              <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
                Request access to {app.app_name}
              </h1>
              <p style={{ fontSize: 14, color: '#666' }}>
                Pick what you need below and a workspace admin will review it.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{
              background: 'white', border: '1px solid #e5e5e5',
              borderRadius: 12, padding: 28,
            }}>
              {error && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, padding: '10px 12px',
                  fontSize: 12.5, color: '#dc2626', marginBottom: 18,
                }}>
                  {error}
                </div>
              )}

              {pageKeys.length > 0 ? (
                <div style={{ marginBottom: 20 }}>
                  <label style={{
                    display: 'block', fontSize: 11, fontWeight: 600, color: '#777',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
                  }}>
                    Pages you need
                  </label>
                  <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
                    {pageKeys.map((pageKey, i) => (
                      <div key={pageKey} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
                      }}>
                        <span style={{ fontSize: 13, color: '#333', textTransform: 'capitalize' }}>{pageKey}</span>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {['none', 'view', 'edit'].map(level => {
                            const active = (permissions[pageKey] || 'none') === level;
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => setPagePermission(pageKey, level)}
                                style={{
                                  fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize',
                                  padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                                  border: `1px solid ${active ? PURPLE : '#e5e5e5'}`,
                                  background: active ? PURPLE : 'white',
                                  color: active ? 'white' : '#666',
                                  fontFamily: 'inherit',
                                }}
                              >
                                {level}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: '#888', marginBottom: 20 }}>
                  This app doesn't have a defined page list yet — describe what you need in
                  the note below instead.
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block', fontSize: 11, fontWeight: 600, color: '#777',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
                }}>
                  Why do you need this?{pageKeys.length > 0 ? ' (optional)' : ''}
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  placeholder="A short note helps your admin review faster."
                  style={{
                    width: '100%', border: '1px solid #e5e5e5', borderRadius: 8,
                    padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%', background: submitting ? '#9b8ee8' : PURPLE,
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '12px', fontSize: 14, fontWeight: 600,
                  cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {submitting ? 'Sending…' : 'Submit request'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}