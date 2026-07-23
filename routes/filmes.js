const express = require('express');
const { db } = require('../database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// GET /api/filmes
router.get('/', authRequired, (req, res) => {
  try {
    const { categoria, busca } = req.query;
    let query = 'SELECT * FROM filmes';
    const params = [];
    const conditions = [];
    if (categoria) { conditions.push('categoria = ?'); params.push(categoria); }
    if (busca) { conditions.push('titulo LIKE ?'); params.push(`%${busca}%`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';
    const filmes = db.prepare(query).all(...params);
    res.json(filmes);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/filmes/:id
router.get('/:id', authRequired, (req, res) => {
  try {
    const filme = db.prepare('SELECT * FROM filmes WHERE id = ?').get(req.params.id);
    if (!filme) return res.status(404).json({ erro: 'Filme não encontrado' });
    res.json(filme);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
