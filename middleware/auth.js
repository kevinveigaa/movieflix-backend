const jwt = require('jsonwebtoken');
const { db } = require('../database');

const JWT_SECRET = 'movieflix_jwt_secret_key_2024';

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ erro: 'Token não informado' });
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, nome, email, is_admin FROM usuarios WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ erro: 'Usuário não encontrado' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ erro: 'Acesso restrito a administradores' });
  }
  next();
}

module.exports = { authRequired, adminRequired, JWT_SECRET };
