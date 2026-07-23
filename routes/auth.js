const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../database');
const { authRequired, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/cadastro
router.post('/cadastro', (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
    if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter pelo menos 6 caracteres' });
    const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ erro: 'Email já cadastrado. Use outro email ou faça login.' });
    const hash = bcrypt.hashSync(senha, 10);
    const result = db.prepare('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)').run(nome, email, hash);
    const token = jwt.sign({ id: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ sucesso: true, token, usuario: { id: result.lastInsertRowid, nome, email, is_admin: 0 } });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, senha } = req.body; const password = req.body.password; const senhaFinal = senha || password;
    if (!email || !senhaFinal) return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ erro: 'Email ou senha inválidos' });
    if (!bcrypt.compareSync(senhaFinal, user.senha)) return res.status(401).json({ erro: 'Email ou senha inválidos' });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ sucesso: true, token, usuario: { id: user.id, nome: user.nome, email: user.email, is_admin: user.is_admin } });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/auth/me
router.get('/me', authRequired, (req, res) => {
  try {
    const user = db.prepare('SELECT id, nome, email, is_admin, created_at FROM usuarios WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const assinatura = db.prepare(`
      SELECT a.*, p.nome as plano_nome, p.preco as plano_preco, p.descricao as plano_descricao
      FROM assinaturas a JOIN planos p ON a.plano_id = p.id
      WHERE a.usuario_id = ? AND a.status = 'aprovado'
      ORDER BY a.created_at DESC LIMIT 1
    `).get(req.user.id);
    res.json({ ...user, assinatura: assinatura || null });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/auth/forgot
router.post('/forgot', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'Email é obrigatório' });
    const user = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);

    if (!user) {
      return res.json({
        mensagem: 'Se o email existir, um link de redefinição será enviado.',
        link: null,
        token: null
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 3600000).toISOString();
    db.prepare('UPDATE usuarios SET reset_token = ?, reset_expira = ? WHERE id = ?').run(token, expira, user.id);

    const baseUrl = process.env.FRONTEND_URL || 'https://movieflix-backend-bsuf.onrender.com';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    console.log(`\n🔑 RESET: ${email} → ${resetUrl}\n`);

    // Include link in message so it appears in the app UI
    res.json({
      mensagem: `Link de redefinição gerado com sucesso!\n\nAcesse: ${resetUrl}\n\nO link expira em 1 hora.`,
      link: resetUrl,
      token: token
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/auth/reset
router.post('/reset', (req, res) => {
  try {
    const { token, senha } = req.body;
    if (!token || !senha) return res.status(400).json({ erro: 'Token e senha são obrigatórios' });
    if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter pelo menos 6 caracteres' });
    const user = db.prepare(
      "SELECT * FROM usuarios WHERE reset_token = ? AND reset_expira > datetime('now','localtime')"
    ).get(token);
    if (!user) return res.status(400).json({ erro: 'Token inválido ou expirado. Solicite um novo link.' });
    const hash = bcrypt.hashSync(senha, 10);
    db.prepare('UPDATE usuarios SET senha = ?, reset_token = NULL, reset_expira = NULL WHERE id = ?').run(hash, user.id);
    res.json({ mensagem: 'Senha redefinida com sucesso! Faça login com sua nova senha.' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
