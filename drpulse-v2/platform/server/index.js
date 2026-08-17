require('dotenv').config({ path: '../.env' });

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────────────
const allowed = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',').map(s => s.trim());

app.use(cors({
  origin:      (origin, cb) => (!origin || allowed.includes(origin) ? cb(null, true) : cb(new Error('CORS'))),
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));

// ── Rate limiting on auth routes ──────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30,
  message: { error: 'Too many attempts. Try again later.' } });

app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/2fa',             authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',             require('./routes/auth'));
app.use('/api/auth/dev-login',   require('./routes/dev-login'));  // dev only
app.use('/api/client-apps',      require('./routes/client-apps'));
app.use('/api/users',            require('./routes/users'));
app.use('/api/access-requests',  require('./routes/access-requests'));

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, service: 'drpulse360-platform' }));

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PLATFORM_PORT || 5000;
app.listen(PORT, () => console.log(`DR Pulse 360 Platform running on :${PORT}`));
