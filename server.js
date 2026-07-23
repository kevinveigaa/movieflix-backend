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

// GET /reset-password — HTML page for password reset
app.get('/reset-password', (req, res) => {
  const token = req.query.token || '';
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Redefinir Senha — MovieFlix</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #0a0a1a; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #1a1a2e; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%; text-align: center; }
  h2 { margin-bottom: 20px; color: #e50914; }
  input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #333; border-radius: 8px; background: #0a0a1a; color: #fff; font-size: 16px; }
  button { width: 100%; padding: 12px; margin-top: 12px; background: #e50914; color: #fff; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
  button:hover { background: #b20710; }
  .msg { margin-top: 15px; padding: 10px; border-radius: 8px; font-size: 14px; }
  .success { background: #0d4a1a; color: #4caf50; }
  .error { background: #4a0d0d; color: #f44336; }
</style>
</head>
<body>
<div class="card">
  <h2>Redefinir Senha</h2>
  <p style="margin-bottom:15px;color:#aaa">Digite sua nova senha:</p>
  <input type="password" id="senha" placeholder="Nova senha (mín. 6 caracteres)" minlength="6">
  <input type="password" id="confirmar" placeholder="Confirmar nova senha">
  <button onclick="resetar()">Salvar Nova Senha</button>
  <div id="msg"></div>
</div>
<script>
  const token = '${token}';
  async function resetar() {
    const senha = document.getElementById('senha').value;
    const confirmar = document.getElementById('confirmar').value;
    const msg = document.getElementById('msg');
    if (!senha || senha.length < 6) { msg.className='msg error'; msg.textContent='Senha deve ter pelo menos 6 caracteres.'; return; }
    if (senha !== confirmar) { msg.className='msg error'; msg.textContent='As senhas não conferem.'; return; }
    try {
      const resp = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token, senha })
      });
      const data = await resp.json();
      if (resp.ok) {
        msg.className='msg success';
        msg.textContent = 'Senha redefinida com sucesso! Volte ao app e faça login.';
      } else {
        msg.className='msg error';
        msg.textContent = data.erro || 'Erro ao redefinir senha.';
      }
    } catch(e) {
      msg.className='msg error';
      msg.textContent = 'Erro de conexão. Tente novamente.';
    }
  }
</script>
</body>
</html>`);
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  MovieFlix API running on port ${PORT}`);
  console.log(`  Admin: admin@movieflix.com / admin123`);
  console.log(`  Planos: Simples R$14,90 | Comum R$29,90 | Premium R$49,90`);
  console.log(`========================================\n`);
});
// trigger redeploy
