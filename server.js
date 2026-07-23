const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

// Remove old incompatible database on startup
const dbFile = path.join(__dirname, 'database.sqlite');
if (fs.existsSync(dbFile)) {
  try {
    const buf = fs.readFileSync(dbFile);
    // Check SQLite magic header
    if (buf.slice(0, 16).toString() !== 'SQLite format 3\u0000') {
      fs.unlinkSync(dbFile);
      console.log('Removed incompatible database');
    }
  } catch(e) {
    fs.unlinkSync(dbFile);
    console.log('Removed corrupted database');
  }
}

const { initDatabase, db } = require('./database');
const { authRequired } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const filmesRoutes = require('./routes/filmes');
const pagamentosRoutes = require('./routes/pagamentos');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.json({ type: '*/*' }));

app.use('/api/auth', authRoutes);
app.use('/api/filmes', filmesRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/categorias', authRequired, (req, res) => {
  try {
    const cats = db.prepare('SELECT * FROM categorias ORDER BY nome').all();
    res.json(cats);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/perfil', authRequired, (req, res) => {
  try {
    const user = db.prepare('SELECT id, nome, email, is_admin, created_at FROM usuarios WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const ass = db.prepare("SELECT a.*, p.nome as plano_nome, p.preco as plano_preco FROM assinaturas a JOIN planos p ON a.plano_id = p.id WHERE a.usuario_id = ? AND a.status = 'aprovado' ORDER BY a.created_at DESC LIMIT 1").get(req.user.id);
    res.json({ ...user, assinatura: ass || null });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/reset-password', (req, res) => {
  const token = req.query.token || '';
  res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redefinir Senha - MovieFlix</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial;background:#0a0a1a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}.card{background:#1a1a2e;padding:30px;border-radius:12px;max-width:400px;width:90%;text-align:center}h2{color:#e50914;margin-bottom:20px}input{width:100%;padding:12px;margin:8px 0;border:1px solid #333;border-radius:8px;background:#0a0a1a;color:#fff;font-size:16px}button{width:100%;padding:12px;margin-top:12px;background:#e50914;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer}button:hover{background:#b20710}.msg{margin-top:15px;padding:10px;border-radius:8px;font-size:14px}.s{background:#0d4a1a;color:#4caf50}.e{background:#4a0d0d;color:#f44336}</style></head>
<body><div class="card"><h2>Redefinir Senha</h2>
<p style="color:#aaa;margin-bottom:15px">Digite sua nova senha:</p>
<input type="password" id="s" placeholder="Nova senha (mín. 6)" minlength="6">
<input type="password" id="c" placeholder="Confirmar nova senha">
<button onclick="r()">Salvar Nova Senha</button><div id="m"></div></div>
<script>const t='${token}';async function r(){const s=document.getElementById('s').value,c=document.getElementById('c').value,m=document.getElementById('m');if(!s||s.length<6){m.className='msg e';m.textContent='Mínimo 6 caracteres.';return}if(s!==c){m.className='msg e';m.textContent='Senhas não conferem.';return}try{const r=await fetch('/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,senha:s})});const d=await r.json();if(r.ok){m.className='msg s';m.textContent='Senha redefinida! Volte ao app.'}else{m.className='msg e';m.textContent=d.erro||'Erro.'}}catch(e){m.className='msg e';m.textContent='Erro de conexão.'}}</script>
</body></html>`);
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MovieFlix API rodando na porta ${PORT}`);
  });
}).catch(err => {
  console.error('Falha ao iniciar banco:', err);
  process.exit(1);
});

// DEBUG: echo body for testing
app.post('/api/debug', (req, res) => {
  res.json({ body: req.body, headers: req.headers['content-type'] });
});
