const express = require('express');
const { db } = require('../database');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

// All admin routes require auth + admin
router.use(authRequired, adminRequired);

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c;
    const totalFilmes = db.prepare('SELECT COUNT(*) as c FROM filmes').get().c;
    const totalAssinaturas = db.prepare("SELECT COUNT(*) as c FROM assinaturas WHERE status = 'aprovado'").get().c;
    const receitaTotal = db.prepare("SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE status = 'aprovado'").get().total;
    const categorias = db.prepare('SELECT COUNT(*) as c FROM categorias').get().c;
    const pagamentosPendentes = db.prepare("SELECT COUNT(*) as c FROM pagamentos WHERE status = 'pendente'").get().c;
    res.json({ totalUsers, totalFilmes, totalAssinaturas, receitaTotal, categorias, pagamentosPendentes });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/admin/usuarios
router.get('/usuarios', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.nome, u.email, u.is_admin, u.created_at,
        (SELECT pl.nome FROM assinaturas a JOIN planos pl ON a.plano_id = pl.id WHERE a.usuario_id = u.id AND a.status = 'aprovado' ORDER BY a.created_at DESC LIMIT 1) as plano_ativo
      FROM usuarios u ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/admin/assinaturas
router.get('/assinaturas', (req, res) => {
  try {
    const assinaturas = db.prepare(`
      SELECT a.*, u.nome as usuario_nome, u.email as usuario_email, pl.nome as plano_nome, pl.preco as plano_preco
      FROM assinaturas a
      JOIN usuarios u ON a.usuario_id = u.id
      JOIN planos pl ON a.plano_id = pl.id
      ORDER BY a.created_at DESC
    `).all();
    res.json(assinaturas);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/admin/pagamentos
router.get('/pagamentos', (req, res) => {
  try {
    const pagamentos = db.prepare(`
      SELECT p.*, u.nome as usuario_nome, u.email as usuario_email, pl.nome as plano_nome
      FROM pagamentos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN planos pl ON p.plano_id = pl.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(pagamentos);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── CRUD de Filmes (Admin) ──

// GET /api/admin/filmes — Lista todos os filmes para gerenciamento
router.get('/filmes', (req, res) => {
  try {
    const filmes = db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM assinaturas a WHERE a.usuario_id IN (SELECT id FROM usuarios) AND a.status = 'aprovado') as total_assinantes
      FROM filmes f
      ORDER BY f.created_at DESC
    `).all();
    res.json(filmes);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/admin/filmes — Adicionar filme via URL
router.post('/filmes', (req, res) => {
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
      id: result.lastInsertRowid,
      mensagem: 'Filme adicionado com sucesso'
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/admin/filmes/:id — Busca um filme específico (admin)
router.get('/filmes/:id', (req, res) => {
  try {
    const filme = db.prepare('SELECT * FROM filmes WHERE id = ?').get(req.params.id);
    if (!filme) return res.status(404).json({ erro: 'Filme não encontrado' });
    res.json(filme);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// PUT /api/admin/filmes/:id — Atualizar filme
router.put('/filmes/:id', (req, res) => {
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

    res.json({ mensagem: 'Filme atualizado com sucesso' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// DELETE /api/admin/filmes/:id — Remover filme
router.delete('/filmes/:id', (req, res) => {
  try {
    const filme = db.prepare('SELECT * FROM filmes WHERE id = ?').get(req.params.id);
    if (!filme) return res.status(404).json({ erro: 'Filme não encontrado' });
    db.prepare('DELETE FROM filmes WHERE id = ?').run(req.params.id);
    res.json({ mensagem: 'Filme removido com sucesso' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
