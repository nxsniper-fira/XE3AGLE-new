const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../utils/db');
const {
  hashPassword,
  comparePassword,
  signToken,
} = require('../utils/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(pw) {
  return typeof pw === 'string' && pw.length >= 8;
}

function validateUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,32}$/.test(u);
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-32 alphanumeric/underscore' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or username already registered' });
    }

    const password_hash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email.toLowerCase(), password_hash]
    );
    const user = result.rows[0];

    // Seed default state for main account
    const defaultState = getDefaultState();
    await query(
      `INSERT INTO user_states (user_id, account_id, state, version, client_modified_at)
       VALUES ($1, 'main', $2, 1, NOW())
       ON CONFLICT (user_id, account_id) DO NOTHING`,
      [user.id, JSON.stringify(defaultState)]
    );

    const { token } = signToken({ sub: user.id, username: user.username });
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    if (!login || !password) {
      return res.status(400).json({ error: 'Login and password required' });
    }

    const result = await query(
      `SELECT id, username, email, password_hash FROM users
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)`,
      [String(login).toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { token } = signToken({ sub: user.id, username: user.username });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    const ok = await comparePassword(currentPassword, result.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    const password_hash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      password_hash,
      req.user.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-email
router.post('/change-email', requireAuth, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    const ok = await comparePassword(password, result.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Password incorrect' });
    }
    const exists = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
      email.toLowerCase(),
      req.user.id,
    ]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    await query('UPDATE users SET email = $1 WHERE id = $2', [
      email.toLowerCase(),
      req.user.id,
    ]);
    res.json({ ok: true, email: email.toLowerCase() });
  } catch (err) {
    console.error('Change email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const result = await query('SELECT id FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    // Always return ok to avoid enumeration
    if (result.rows.length === 0) {
      return res.json({ ok: true, message: 'If account exists, reset instructions sent' });
    }
    const token = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, result.rows[0].id]
    );
    // SMTP optional: log link in development
    const resetUrl = `${process.env.FRONTEND_ORIGIN?.split(',')[0] || 'http://localhost:3000'}/reset.html?token=${token}`;
    if (process.env.SMTP_HOST) {
      // Wire real SMTP here if configured; for free-tier we log
      console.log('[RESET LINK]', resetUrl);
    } else {
      console.log('[RESET LINK]', resetUrl);
    }
    res.json({ ok: true, message: 'If account exists, reset instructions sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !validatePassword(newPassword)) {
      return res.status(400).json({ error: 'Valid token and password required' });
    }
    const result = await query(
      `SELECT id FROM users
       WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    const password_hash = await hashPassword(newPassword);
    await query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL
       WHERE id = $2`,
      [password_hash, result.rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/auth/account
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    if (password) {
      const ok = await comparePassword(password, result.rows[0].password_hash);
      if (!ok) {
        return res.status(401).json({ error: 'Password incorrect' });
      }
    }
    await query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function getDefaultState() {
  const bal = 10000;
  return {
    accounts: {
      main: {
        id: 'main',
        name: 'Main',
        type: 'MAIN',
        startingBalance: bal,
        currency: 'USD',
        brokerLabel: '',
        archived: false,
        createdAt: new Date().toISOString(),
        risk: {
          startingBalance: bal,
          riskPerTradePct: 0.5,
          dailyMaxLossPct: 1,
          dailyTargetR: 2,
          maxTradesPerDay: 3,
          maxConsecutiveLosses: 2,
          minRR: 2,
          timeWindowEnabled: false,
          timeWindowStart: '00:00',
          timeWindowEnd: '23:59',
        },
        equity: bal,
        peakEquity: bal,
        preparation: null,
        analysis: null,
        activeTrade: null,
        pendingReview: null,
        trades: [],
        psychology: { reflections: [], eodReviews: [] },
        lastPrepDate: null,
        stage: 'home',
      },
    },
    activeAccountId: 'main',
    hideBalance: false,
    theme: 'black',
    timezone: 'UTC',
    sessions: {
      london: { start: '07:00', end: '16:00' },
      ny: { start: '12:00', end: '21:00' },
      asia: { start: '00:00', end: '09:00' },
    },
    version: 1,
  };
}

module.exports = router;
