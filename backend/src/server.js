require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const stateRoutes = require('./routes/state');

const app = express();
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet({
  contentSecurityPolicy: false, // API only
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS locked to FRONTEND_ORIGIN
const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Allow no-origin (same-origin proxy, curl, server-to-server)
      if (!origin || origins.includes(origin) || origins.includes('*')) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));

// Rate limit
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const max = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
app.use(
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, try again later' },
  })
);

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'xe3agle-api', ts: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/state', stateRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, _req, res, _next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS blocked' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`XE3AGLE API listening on :${PORT}`);
});

module.exports = app;
