const express = require('express');
const { query, withClient } = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const validAccountId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 64 && /^[\w-]+$/.test(id);

router.get('/', requireAuth, async (req, res) => {
  try {
    const accountId = req.query.accountId || 'main';
    if (!validAccountId(accountId)) return res.status(400).json({ error: 'Invalid accountId' });
    const result = await query(
      `SELECT state, version, client_modified_at, server_modified_at
       FROM user_states WHERE user_id = $1 AND account_id = $2`,
      [req.user.id, accountId]
    );
    if (!result.rows.length) return res.json({ state: null, version: 0, clientModifiedAt: null, serverModifiedAt: null, accountId });
    const row = result.rows[0];
    return res.json({ state: row.state, version: row.version, clientModifiedAt: row.client_modified_at, serverModifiedAt: row.server_modified_at, accountId });
  } catch (err) {
    console.error('GET state error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Optimistic concurrency is enforced atomically in SQL. A stale device cannot
// overwrite a newer state merely because two requests arrived simultaneously.
router.put('/', requireAuth, async (req, res) => {
  const { accountId = 'main', state, version, clientModifiedAt, force = false } = req.body || {};
  if (!validAccountId(accountId)) return res.status(400).json({ error: 'Invalid accountId' });
  if (!state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error: 'state object required' });
  if (JSON.stringify(state).length > 1_500_000) return res.status(413).json({ error: 'State is too large' });
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 0)) return res.status(400).json({ error: 'Invalid version' });
  const modified = clientModifiedAt && !Number.isNaN(Date.parse(clientModifiedAt)) ? new Date(clientModifiedAt) : new Date();

  try {
    const outcome = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        // Serialize writes for this user/account, including the first insert.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [req.user.id, accountId]);
        const existing = await client.query(
          'SELECT state, version, client_modified_at FROM user_states WHERE user_id=$1 AND account_id=$2 FOR UPDATE',
          [req.user.id, accountId]
        );
        if (!existing.rows.length) {
          if (version !== undefined && version !== 0 && !force) {
            await client.query('ROLLBACK');
            return { conflict: true, row: null };
          }
          const inserted = await client.query(
            `INSERT INTO user_states(user_id,account_id,state,version,client_modified_at,server_modified_at)
             VALUES($1,$2,$3,1,$4,NOW()) RETURNING version,server_modified_at`,
            [req.user.id, accountId, JSON.stringify(state), modified]
          );
          await client.query('COMMIT');
          return { ok: true, version: inserted.rows[0].version, serverModifiedAt: inserted.rows[0].server_modified_at };
        }
        const row = existing.rows[0];
        if (!force && (version === undefined || version !== row.version)) {
          await client.query('ROLLBACK');
          return { conflict: true, row };
        }
        const updated = await client.query(
          `UPDATE user_states SET state=$1, version=version+1, client_modified_at=$2, server_modified_at=NOW()
           WHERE user_id=$3 AND account_id=$4 RETURNING version,server_modified_at`,
          [JSON.stringify(state), modified, req.user.id, accountId]
        );
        await client.query('COMMIT');
        return { ok: true, version: updated.rows[0].version, serverModifiedAt: updated.rows[0].server_modified_at };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });
    if (outcome.conflict) {
      const row = outcome.row;
      return res.status(409).json({ error: 'Conflict', conflict: true, serverState: row?.state || null, serverVersion: row?.version || 0, serverModifiedAt: row?.client_modified_at || null });
    }
    return res.json({ ...outcome, conflict: false });
  } catch (err) {
    console.error('PUT state error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM user_states WHERE user_id = $1', [req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE state error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = router;
