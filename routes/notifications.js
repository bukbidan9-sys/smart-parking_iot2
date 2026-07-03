const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL
    ORDER BY created_at DESC LIMIT 30
  `).all(req.user.id);
  res.json({ notifications: rows });
});

router.post('/:id/baca', authRequired, (req, res) => {
  db.prepare('UPDATE notifications SET dibaca = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
