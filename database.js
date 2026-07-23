const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('movieflix.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    reset_token TEXT,
    reset_expira TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS planos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    preco REAL NOT NULL,
    descricao TEXT,
    recursos TEXT
  );

  CREATE TABLE IF NOT EXISTS filmes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    duracao INTEGER,
    ano INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assinaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    plano_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pendente',
    mp_payment_id TEXT,
    mp_preference_id TEXT,
    qr_code TEXT,
    qr_code_base64 TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (plano_id) REFERENCES planos(id)
  );

  CREATE TABLE IF NOT EXISTS pagamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    assinatura_id INTEGER,
    plano_id INTEGER NOT NULL,
    valor REAL NOT NULL,
    status TEXT DEFAULT 'pendente',
    mp_payment_id TEXT,
    mp_preference_id TEXT,
    qr_code TEXT,
    qr_code_base64 TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (assinatura_id) REFERENCES assinaturas(id),
    FOREIGN KEY (plano_id) REFERENCES planos(id)
  );
`);

// Seed admin user
const adminEmail = 'admin@movieflix.com';
const adminExists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(adminEmail);
if (!adminExists) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO usuarios (nome, email, senha, is_admin) VALUES (?, ?, ?, 1)').run('Admin', adminEmail, hash);
}

// Seed planos
const planosCount = db.prepare('SELECT COUNT(*) as c FROM planos').get();
if (planosCount.c === 0) {
  const insertPlano = db.prepare('INSERT INTO planos (nome, preco, descricao, recursos) VALUES (?, ?, ?, ?)');
  insertPlano.run('Simples', 14.90, 'Acesso básico ao catálogo de filmes', JSON.stringify(['Filmes em SD', '1 tela', 'Anúncios']));
  insertPlano.run('Comum', 29.90, 'Acesso completo e experiência intermediária', JSON.stringify(['Filmes em HD', '2 telas', 'Sem anúncios', 'Download offline']));
  insertPlano.run('Premium', 49.90, 'Experiência premium com qualidade máxima', JSON.stringify(['Filmes em 4K', '4 telas', 'Sem anúncios', 'Download offline', 'Conteúdo exclusivo', 'Suporte prioritário']));
}

// Seed sample movies (streaming URLs)
const filmesCount = db.prepare('SELECT COUNT(*) as c FROM filmes').get();
if (filmesCount.c === 0) {
  const insertFilme = db.prepare('INSERT INTO filmes (titulo, descricao, categoria, url, thumbnail_url, duracao, ano) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const filmes = [
    ['Oppenheimer', 'A história do físico J. Robert Oppenheimer e seu papel no desenvolvimento da bomba atômica.', 'Drama', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', 180, 2023],
    ['Duna: Parte 2', 'Paul Atreides une forças com os Fremen em busca de vingança.', 'Ficção Científica', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', 166, 2024],
    ['John Wick 4', 'John Wick enfrenta seus adversários mais letais até agora.', 'Ação', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg', 169, 2023],
    ['Interestelar', 'Astronautas viajam através de um buraco de minhoca em busca de um novo lar.', 'Ficção Científica', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 169, 2014],
    ['Clube da Luta', 'Um homem descontente e um vendedor de sabão formam um clube de luta clandestino.', 'Drama', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', 139, 1999],
    ['Matrix', 'Um hacker descobre que a realidade é uma simulação criada por máquinas.', 'Ação', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', 136, 1999],
    ['O Cavaleiro das Trevas', 'Batman enfrenta o Coringa, um gênio do crime que mergulha Gotham no caos.', 'Ação', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911B5G9wMEyEIqz.jpg', 152, 2008],
    ['Pulp Fiction', 'Histórias entrelaçadas de criminosos, boxeadores e bandidos.', 'Crime', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', 154, 1994],
    ['Parasita', 'Uma família pobre se infiltra na vida de uma família rica.', 'Drama', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', 132, 2019],
    ['Vingadores: Ultimato', 'Os heróis restantes se unem para reverter as ações de Thanos.', 'Ação', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/q6725aR8Zs4IwGMXzZT8aC8lh1k.jpg', 181, 2019],
    ['Forrest Gump', 'Um homem simples testemunha e influencia eventos históricos nos EUA.', 'Drama', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', 142, 1994],
    ['Mad Max: Estrada da Fúria', 'Em um deserto pós-apocalíptico, Max se une a Furiosa contra um tirano.', 'Ação', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/8tZYTuWezp8JbcsvHYO0O46tFbo.jpg', 120, 2015],
    ['O Lobo de Wall Street', 'A ascensão e queda de Jordan Belfort no mundo das finanças.', 'Comédia', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'https://image.tmdb.org/t/p/w500/34m2tyKAYnVC6B7541ZY9h7nEl.jpg', 180, 2013],
  ];
  const insertMany = db.transaction(() => {
    for (const f of filmes) {
      insertFilme.run(...f);
    }
  });
  insertMany();
}

// Seed categories
const catCount = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
if (catCount.c === 0) {
  const insertCat = db.prepare('INSERT INTO categorias (nome) VALUES (?)');
  for (const cat of ['Ação', 'Comédia', 'Drama', 'Ficção Científica', 'Terror', 'Crime', 'Romance', 'Documentário']) {
    insertCat.run(cat);
  }
}

module.exports = db;
