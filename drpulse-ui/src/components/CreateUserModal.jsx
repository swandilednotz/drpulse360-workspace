// import React, { useEffect, useState } from 'react';
// import { api } from '../lib/api.js';

// const PURPLE = '#5B4FCF';

// const INPUT = {
//   width: '100%',
//   border: '1px solid #e5e5e5',
//   borderRadius: 8,
//   padding: '10px 12px',
//   fontSize: 13,
//   fontFamily: 'inherit',
//   outline: 'none',
//   boxSizing: 'border-box',
//   color: '#111',
//   background: '#fff',
// };

// const LABEL = {
//   display: 'block',
//   fontSize: 11,
//   fontWeight: 600,
//   color: '#777',
//   textTransform: 'uppercase',
//   letterSpacing: '0.06em',
//   marginBottom: 6,
// };

// // Page keys mirror the `permissions` shape already issued in scoped JWTs
// // (see routes/auth.js DEFAULT_PERMISSIONS for srt-manager). Extend this
// // map as more products define their own page sets.
// const APP_PAGES = {
//   'srt-manager': ['dashboard', 'affiliates', 'channels', 'devices', 'ota', 'logs', 'users', 'activity'],
// };

// export default function CreateUserModal({ onClose, onCreated }) {
//   const [form, setForm] = useState({
//     name:          '',
//     email:         '',
//     role:          'viewer',
//     client_app_id: '',
//   });
//   const [permissions, setPermissions] = useState({}); // page_key -> 'none'|'view'|'edit', only used when role === 'custom'
//   const [apps,    setApps]    = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [error,   setError]   = useState('');
//   const [success, setSuccess] = useState(null);

//   // Load all available client apps for the tenant
//   useEffect(() => {
//     api.clientApps.all()
//       .then(data => {
//         setApps(data);
//         if (data.length > 0) setForm(f => ({ ...f, client_app_id: data[0].id }));
//       })
//       .catch(() => {});
//   }, []);

//   const selectedApp = apps.find(a => a.id === form.client_app_id);
//   const pageKeys = APP_PAGES[selectedApp?.app_slug] || [];

//   function set(key, val) {
//     setForm(f => ({ ...f, [key]: val }));
//     setError('');
//   }

//   function setPagePermission(pageKey, level) {
//     setPermissions(p => ({ ...p, [pageKey]: level }));
//   }

//   function resetForm() {
//     setForm({ name: '', email: '', role: 'viewer', client_app_id: apps[0]?.id || '' });
//     setPermissions({});
//   }

//   async function handleSubmit(e) {
//     e.preventDefault();
//     if (!form.name.trim())         return setError('Name is required');
//     if (!form.email.trim())        return setError('Email is required');
//     if (!form.client_app_id)       return setError('Select an app');

//     setLoading(true);
//     setError('');

//     try {
//       const result = await api.users.create({
//         name:          form.name.trim(),
//         email:         form.email.trim().toLowerCase(),
//         role_name:     form.role,
//         client_app_id: form.client_app_id,
//         // Only send explicit per-page overrides for a custom role — other
//         // roles use their existing role_permissions defaults.
//         permissions:   form.role === 'custom' ? permissions : undefined,
//       });

//       setSuccess({
//         email: form.email,
//         name:  form.name,
//       });

//       if (onCreated) onCreated(result);
//     } catch (e) {
//       setError(e.message);
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <>
//       {/* Backdrop */}
//       <div
//         onClick={onClose}
//         style={{
//           position: 'fixed', inset: 0,
//           background: 'rgba(0,0,0,0.3)',
//           zIndex: 1000,
//         }}
//       />

//       {/* Modal */}
//       <div style={{
//         position:     'fixed',
//         top:          '50%',
//         left:         '50%',
//         transform:    'translate(-50%, -50%)',
//         zIndex:       1001,
//         background:   'white',
//         border:       '1px solid #e5e5e5',
//         borderRadius: 16,
//         padding:      '36px 36px 32px',
//         width:        460,
//         maxWidth:     '92vw',
//         maxHeight:    '86vh',
//         overflowY:    'auto',
//         boxShadow:    '0 8px 32px rgba(0,0,0,0.12)',
//       }}>

//         {/* Header */}
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
//           <div>
//             <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Create user</h2>
//             <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
//               A temporary password will be sent by email
//             </p>
//           </div>
//           <button onClick={onClose} style={{
//             background: 'none', border: 'none', fontSize: 20,
//             color: '#999', cursor: 'pointer', lineHeight: 1, padding: 0,
//           }}>×</button>
//         </div>

//         {/* Success state */}
//         {success ? (
//           <div style={{ textAlign: 'center', padding: '16px 0' }}>
//             <div style={{ fontSize: 40, marginBottom: 16 }}>✉️</div>
//             <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>User created!</h3>
//             <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>
//               A welcome email with login credentials has been sent to{' '}
//               <strong>{success.email}</strong>.
//             </p>
//             <div style={{ display: 'flex', gap: 10 }}>
//               <button
//                 onClick={() => { setSuccess(null); resetForm(); }}
//                 style={{
//                   flex: 1, background: '#f5f5f7', border: '1px solid #e5e5e5',
//                   borderRadius: 8, padding: '10px', fontSize: 13,
//                   fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
//                 }}>
//                 Add another
//               </button>
//               <button
//                 onClick={onClose}
//                 style={{
//                   flex: 1, background: PURPLE, color: 'white',
//                   border: 'none', borderRadius: 8, padding: '10px',
//                   fontSize: 13, fontWeight: 600, cursor: 'pointer',
//                   fontFamily: 'inherit',
//                 }}>
//                 Done
//               </button>
//             </div>
//           </div>
//         ) : (
//           <form onSubmit={handleSubmit}>
//             {/* Error */}
//             {error && (
//               <div style={{
//                 background: '#fef2f2', border: '1px solid #fecaca',
//                 borderRadius: 8, padding: '10px 12px',
//                 fontSize: 12, color: '#dc2626', marginBottom: 16,
//               }}>
//                 {error}
//               </div>
//             )}

//             {/* Name */}
//             <div style={{ marginBottom: 16 }}>
//               <label style={LABEL}>Full name</label>
//               <input
//                 type="text" value={form.name} placeholder="Jane Smith"
//                 onChange={e => set('name', e.target.value)}
//                 style={INPUT} autoFocus
//               />
//             </div>

//             {/* Email */}
//             <div style={{ marginBottom: 16 }}>
//               <label style={LABEL}>Email address</label>
//               <input
//                 type="email" value={form.email} placeholder="jane@company.com"
//                 onChange={e => set('email', e.target.value)}
//                 style={INPUT}
//               />
//             </div>

//             {/* App */}
//             <div style={{ marginBottom: 16 }}>
//               <label style={LABEL}>App access</label>
//               <select
//                 value={form.client_app_id}
//                 onChange={e => set('client_app_id', e.target.value)}
//                 style={{ ...INPUT, appearance: 'auto' }}
//               >
//                 {apps.map(app => (
//                   <option key={app.id} value={app.id}>{app.app_name}</option>
//                 ))}
//               </select>
//             </div>

//             {/* Role */}
//             <div style={{ marginBottom: form.role === 'custom' ? 16 : 28 }}>
//               <label style={LABEL}>Role</label>
//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
//                 {['superuser', 'admin', 'viewer', 'custom'].map(r => (
//                   <label key={r} style={{
//                     display: 'flex', alignItems: 'center', gap: 8,
//                     padding: '10px 12px',
//                     border: `1.5px solid ${form.role === r ? PURPLE : '#e5e5e5'}`,
//                     borderRadius: 8, cursor: 'pointer',
//                     background: form.role === r ? '#f0eeff' : 'white',
//                     transition: 'all 0.1s',
//                   }}>
//                     <input
//                       type="radio" name="role" value={r}
//                       checked={form.role === r}
//                       onChange={() => set('role', r)}
//                       style={{ accentColor: PURPLE }}
//                     />
//                     <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize', color: form.role === r ? PURPLE : '#333' }}>
//                       {r}
//                     </span>
//                   </label>
//                 ))}
//               </div>
//             </div>

//             {/* Custom role → per-page permissions, same page set the app's scoped
//                 token already carries (dashboard/affiliates/channels/devices/...). */}
//             {form.role === 'custom' && pageKeys.length > 0 && (
//               <div style={{ marginBottom: 28 }}>
//                 <label style={LABEL}>Page permissions</label>
//                 <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
//                   {pageKeys.map((pageKey, i) => (
//                     <div key={pageKey} style={{
//                       display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//                       padding: '8px 12px',
//                       borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
//                     }}>
//                       <span style={{ fontSize: 12.5, color: '#333', textTransform: 'capitalize' }}>{pageKey}</span>
//                       <div style={{ display: 'flex', gap: 4 }}>
//                         {['none', 'view', 'edit'].map(level => {
//                           const active = (permissions[pageKey] || 'none') === level;
//                           return (
//                             <button
//                               key={level}
//                               type="button"
//                               onClick={() => setPagePermission(pageKey, level)}
//                               style={{
//                                 fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
//                                 padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
//                                 border: `1px solid ${active ? PURPLE : '#e5e5e5'}`,
//                                 background: active ? PURPLE : 'white',
//                                 color: active ? 'white' : '#666',
//                                 fontFamily: 'inherit',
//                               }}
//                             >
//                               {level}
//                             </button>
//                           );
//                         })}
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {/* Submit */}
//             <button
//               type="submit"
//               disabled={loading}
//               style={{
//                 width: '100%', background: loading ? '#9b8ee8' : PURPLE,
//                 color: 'white', border: 'none', borderRadius: 8,
//                 padding: '12px', fontSize: 14, fontWeight: 600,
//                 cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
//               }}>
//               {loading ? 'Creating user…' : 'Create user & send email →'}
//             </button>
//           </form>
//         )}
//       </div>
//     </>
//   );
// }

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const PURPLE = '#5B4FCF';

const INPUT = {
  width: '100%',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#111',
  background: '#fff',
};

const LABEL = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#777',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

// Page keys mirror the `permissions` shape already issued in scoped JWTs
// (see routes/auth.js DEFAULT_PERMISSIONS for srt-manager). Extend this
// map as more products define their own page sets.
const APP_PAGES = {
  'srt-manager': ['dashboard', 'affiliates', 'channels', 'devices', 'ota', 'logs', 'users', 'activity'],
};

export default function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name:          '',
    email:         '',
    role:          'viewer',
    client_app_id: '',
  });
  const [permissions, setPermissions] = useState({}); // page_key -> 'none'|'view'|'edit', only used when role === 'custom'
  const [apps,    setApps]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(null);

  // Load all available client apps for the tenant
  useEffect(() => {
    api.clientApps.all()
      .then(data => {
        setApps(data);
        if (data.length > 0) setForm(f => ({ ...f, client_app_id: data[0].id }));
      })
      .catch(() => {});
  }, []);

  const selectedApp = apps.find(a => a.id === form.client_app_id);
  const pageKeys = APP_PAGES[selectedApp?.app_slug] || [];

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setError('');
  }

  function setPagePermission(pageKey, level) {
    setPermissions(p => ({ ...p, [pageKey]: level }));
  }

  function resetForm() {
    setForm({ name: '', email: '', role: 'viewer', client_app_id: apps[0]?.id || '' });
    setPermissions({});
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim())         return setError('Name is required');
    if (!form.email.trim())        return setError('Email is required');
    if (!form.client_app_id)       return setError('Select an app');

    setLoading(true);
    setError('');

    try {
      const result = await api.users.create({
        name:          form.name.trim(),
        email:         form.email.trim().toLowerCase(),
        role_name:     form.role,
        client_app_id: form.client_app_id,
        // Only send explicit per-page overrides for a custom role — other
        // roles use their existing role_permissions defaults.
        permissions:   form.role === 'custom' ? permissions : undefined,
      });

      setSuccess({ email: form.email, name: form.name });

      if (onCreated) onCreated(result);
    } catch (e) {
      if (e.status === 409) {
        setError('already_exists');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div style={{
        position:     'fixed',
        top:          '50%',
        left:         '50%',
        transform:    'translate(-50%, -50%)',
        zIndex:       1001,
        background:   'white',
        border:       '1px solid #e5e5e5',
        borderRadius: 16,
        padding:      '36px 36px 32px',
        width:        460,
        maxWidth:     '92vw',
        maxHeight:    '86vh',
        overflowY:    'auto',
        boxShadow:    '0 8px 32px rgba(0,0,0,0.12)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Create user</h2>
            <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
              A temporary password will be sent by email
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20,
            color: '#999', cursor: 'pointer', lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        {/* Success state */}
        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✉️</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>User created!</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>
              A welcome email with login credentials has been sent to{' '}
              <strong>{success.email}</strong>.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setSuccess(null); resetForm(); }}
                style={{
                  flex: 1, background: '#f5f5f7', border: '1px solid #e5e5e5',
                  borderRadius: 8, padding: '10px', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                Add another
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1, background: PURPLE, color: 'white',
                  border: 'none', borderRadius: 8, padding: '10px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Error */}
            {error === 'already_exists' ? (
              <div style={{
                background: '#fff8e6', border: '1px solid #f5d98a',
                borderRadius: 8, padding: '10px 12px',
                fontSize: 12.5, color: '#8a6a00', marginBottom: 16,
              }}>
                A user with this email already exists.{' '}
                <Link to="/manage-users" style={{ color: PURPLE, fontWeight: 600 }}>
                  Manage their access from Manage Users
                </Link> instead.
              </div>
            ) : error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '10px 12px',
                fontSize: 12, color: '#dc2626', marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={LABEL}>Full name</label>
              <input
                type="text" value={form.name} placeholder="Jane Smith"
                onChange={e => set('name', e.target.value)}
                style={INPUT} autoFocus
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={LABEL}>Email address</label>
              <input
                type="email" value={form.email} placeholder="jane@company.com"
                onChange={e => set('email', e.target.value)}
                style={INPUT}
              />
            </div>

            {/* App */}
            <div style={{ marginBottom: 16 }}>
              <label style={LABEL}>App access</label>
              <select
                value={form.client_app_id}
                onChange={e => set('client_app_id', e.target.value)}
                style={{ ...INPUT, appearance: 'auto' }}
              >
                {apps.map(app => (
                  <option key={app.id} value={app.id}>{app.app_name}</option>
                ))}
              </select>
            </div>

            {/* Role */}
            <div style={{ marginBottom: form.role === 'custom' ? 16 : 28 }}>
              <label style={LABEL}>Role</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['superuser', 'admin', 'viewer', 'custom'].map(r => (
                  <label key={r} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px',
                    border: `1.5px solid ${form.role === r ? PURPLE : '#e5e5e5'}`,
                    borderRadius: 8, cursor: 'pointer',
                    background: form.role === r ? '#f0eeff' : 'white',
                    transition: 'all 0.1s',
                  }}>
                    <input
                      type="radio" name="role" value={r}
                      checked={form.role === r}
                      onChange={() => set('role', r)}
                      style={{ accentColor: PURPLE }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize', color: form.role === r ? PURPLE : '#333' }}>
                      {r}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom role → per-page permissions, same page set the app's scoped
                token already carries (dashboard/affiliates/channels/devices/...). */}
            {form.role === 'custom' && pageKeys.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <label style={LABEL}>Page permissions</label>
                <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
                  {pageKeys.map((pageKey, i) => (
                    <div key={pageKey} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
                    }}>
                      <span style={{ fontSize: 12.5, color: '#333', textTransform: 'capitalize' }}>{pageKey}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['none', 'view', 'edit'].map(level => {
                          const active = (permissions[pageKey] || 'none') === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setPagePermission(pageKey, level)}
                              style={{
                                fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
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
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', background: loading ? '#9b8ee8' : PURPLE,
                color: 'white', border: 'none', borderRadius: 8,
                padding: '12px', fontSize: 14, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}>
              {loading ? 'Creating user…' : 'Create user & send email →'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}