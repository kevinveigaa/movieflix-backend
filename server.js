const express = require('express');
const cors = require('cors');
const db = require('./database');
const { authRequired } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const filmesRoutes = require('./routes/filmes');
const pagamentosRoutes = require('./routes/pagamentos');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/filmes', filmesRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/admin', adminRoutes);

// GET /api/categorias
app.get('/api/categorias', authRequired, (req, res) => {
  try {
    const cats = db.prepare('SELECT * FROM categorias ORDER BY nome').all();
    res.json(cats);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/perfil
app.get('/api/perfil', authRequired, (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  MovieFlix API running on port ${PORT}`);
  console.log(`  Admin: admin@movieflix.com / admin123`);
  console.log(`  Planos: Simples R$14,90 | Comum R$29,90 | Premium R$49,90`);
  console.log(`========================================\n`);
});
