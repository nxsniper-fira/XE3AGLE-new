const { verifyToken, getTokenFromHeader } = require('../utils/auth');
const { query } = require('../utils/db');

async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const result = await query(
      'SELECT id, username, email, email_verified FROM users WHERE id = $1',
      [decoded.sub]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = result.rows[0];
    req.tokenPayload = decoded;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { requireAuth };
