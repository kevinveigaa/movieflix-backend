const express = require('express');
const { db } = require('../database');
const { authRequired, adminRequired } = require('../middleware/auth');

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
    res.json({ sucesso: true, filmes });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/filmes/:id
router.get('/:id', authRequired, (req, res) => {
  try {
    const filme = db.prepare('SELECT * FROM filmes WHERE id = ?').get(req.params.id);
    if (!filme) return res.status(404).json({ erro: 'Filme não encontrado' });
    res.json({ sucesso: true, filme });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/filmes/:id/video — Returns video URL for streaming
router.get('/:id/video', authRequired, (req, res) => {
  try {
    const filme = db.prepare('SELECT url FROM filmes WHERE id = ?').get(req.params.id);
    if (!filme) return res.status(404).json({ erro: 'Filme não encontrado' });
    res.json({ sucesso: true, videoUrl: filme.url });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── Admin-protected CRUD at /api/filmes (the APK calls these, not /api/admin/filmes) ──

// POST /api/filmes — Adicionar filme (admin)
router.post('/', authRequired, adminRequired, (req, res) => {
  try {
    const { titulo, descricao, categoria, url, thumbnail_url, duracao, ano } = req.body;
    if (!titulo || !url || !categoria) {
      return res.status(400).json({ erro: 'Título, URL de streaming e categoria são obrigatórios' });
    }
    const result = db.prepare(
      'INSERT INTO filmes (titulo, descricao, categoria, url, thumbnail_url, duracao, ano) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      titulo.trim(),
      (descricao || '').trim(),
      categoria.trim(),
      url.trim(),
      (thumbnail_url || '').trim(),
      duracao ? Number(duracao) : null,
      ano ? Number(ano) : null
    );
    res.status(201).json({
      sucesso: true,
      id: result.lastInsertRowid,
      mensagem: 'Filme adicionado com sucesso'
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// PUT /api/filmes/:id — Atualizar filme (admin)
router.put('/:id', authRequired, adminRequired, (req, res) => {
  try {
    const filme = db.prepare('SELECT * FROM filmes WHERE id = ?').get(req.params.id);
    if (!filme) return res.status(404).json({ erro: 'Filme não encontrado' });

    const { titulo, descricao, categoria, url, thumbnail_url, duracao, ano } = req.body;

    db.prepare(`
      UPDATE filmes SET
        titulo = ?, descricao = ?, categoria = ?, url = ?,
        thumbnail_url = ?, duracao = ?, ano = ?
      WHERE id = ?
    `).run(
      titulo ? titulo.trim() : filme.titulo,
      descricao !== undefined ? descricao.trim() : filme.descricao,
      categoria ? categoria.trim() : filme.categoria,
      url ? url.trim() : filme.url,
      thumbnail_url !== undefined ? thumbnail_url.trim() : filme.thumbnail_url,
      duracao !== undefined ? Number(duracao) || null : filme.duracao,
      ano !== undefined ? Number(ano) || null : filme.ano,
      req.params.id
    );

    res.json({ sucesso: true, mensagem: 'Filme atualizado com sucesso' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// DELETE /api/filmes/:id — Remover filme (admin)
router.delete('/:id', authRequired, adminRequired, (req, res) => {
  try {
    const filme = db.prepare('SELECT * FROM filmes WHERE id = ?').get(req.params.id);
    if (!filme) return res.status(404).json({ erro: 'Filme não encontrado' });
    db.prepare('DELETE FROM filmes WHERE id = ?').run(req.params.id);
    res.json({ sucesso: true, mensagem: 'Filme removido com sucesso' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
