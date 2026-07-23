const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let rawDb = null;

// Wrapper that matches better-sqlite3 API using sql.js
const db = {
  prepare: function(sql) {
    const stmt = { sql, rawDb };
    return {
      run: function(...params) {
        try {
          rawDb.run(sql, params);
          const result = rawDb.exec('SELECT last_insert_rowid() as id');
          const lastId = result.length > 0 ? result[0].values[0][0] : 0;
          saveToDisk();
          return { changes: 1, lastInsertRowid: lastId };
        } catch (e) {
          console.error('SQL run error:', e.message);
          throw e;
        }
      },
      get: function(...params) {
        try {
          const result = rawDb.exec(sql, params);
          if (result.length === 0 || result[0].values.length === 0) return undefined;
          const cols = result[0].columns;
          const vals = result[0].values[0];
          const obj = {};
          cols.forEach((c, i) => { obj[c] = vals[i]; });
          return obj;
        } catch (e) {
          console.error('SQL get error:', e.message);
          throw e;
        }
      },
      all: function(...params) {
        try {
          const result = rawDb.exec(sql, params);
          if (result.length === 0) return [];
          const cols = result[0].columns;
          return result[0].values.map(vals => {
            const obj = {};
            cols.forEach((c, i) => { obj[c] = vals[i]; });
            return obj;
          });
        } catch (e) {
          console.error('SQL all error:', e.message);
          throw e;
        }
      }
    };
  },
  exec: function(sql) {
    rawDb.run(sql);
    saveToDisk();
  }
};

function saveToDisk() {
  if (rawDb) {
    const data = rawDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function seedDatabase() {
  const bcrypt = require('bcryptjs');

  // Planos
  const planosCount = db.prepare('SELECT COUNT(*) as c FROM planos').get();
  if (!planosCount || planosCount.c === 0) {
    db.prepare(`INSERT INTO planos (nome, preco, descricao, recursos) VALUES (?,?,?,?)`).run('Simples', 14.90, 'Acesso básico', 'Filmes em HD, 1 tela');
    db.prepare(`INSERT INTO planos (nome, preco, descricao, recursos) VALUES (?,?,?,?)`).run('Comum', 29.90, 'Acesso intermediário', 'Filmes em Full HD, 2 telas, Download');
    db.prepare(`INSERT INTO planos (nome, preco, descricao, recursos) VALUES (?,?,?,?)`).run('Premium', 49.90, 'Acesso completo', 'Filmes em 4K, 4 telas, Download, Sem anúncios');
    console.log('Planos seeded');
  }

  // Admin
  const adminExists = db.prepare("SELECT id FROM usuarios WHERE email = ?").get('admin@movieflix.com');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO usuarios (nome, email, senha, is_admin) VALUES (?,?,?,1)').run('Admin', 'admin@movieflix.com', hash);
    console.log('Admin seeded');
  }

  // Categorias
  const catsCount = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
  if (!catsCount || catsCount.c === 0) {
    const cats = ['Ação', 'Comédia', 'Drama', 'Ficção Científica', 'Terror', 'Romance', 'Documentário', 'Animação', 'Suspense', 'Aventura'];
    for (const cat of cats) {
      db.prepare('INSERT OR IGNORE INTO categorias (nome) VALUES (?)').run(cat);
    }
    console.log('Categorias seeded');
  }

  // Filmes
  const filmesCount = db.prepare('SELECT COUNT(*) as c FROM filmes').get();
  if (!filmesCount || filmesCount.c === 0) {
    const filmes = [
      ['Oppenheimer', 'A história do físico J. Robert Oppenheimer e a criação da bomba atômica.', 'Drama', 'https://www.youtube.com/watch?v=uYPbbksJxIg', '', 180, 2023],
      ['Duna 2', 'Paul Atreides une-se aos Fremen para vingar sua família.', 'Ficção Científica', 'https://www.youtube.com/watch?v=Way9Dexny3w', '', 166, 2024],
      ['Matrix', 'Um hacker descobre que a realidade é uma simulação.', 'Ficção Científica', 'https://www.youtube.com/watch?v=m8e-FF8MsqU', '', 136, 1999],
      ['Vingadores: Ultimato', 'Os heróis se reúnem para desfazer as ações de Thanos.', 'Ação', 'https://www.youtube.com/watch?v=TcMBFSGVi1c', '', 181, 2019],
      ['O Poderoso Chefão', 'A saga da família Corleone no mundo do crime.', 'Drama', 'https://www.youtube.com/watch?v=sY1S34973zA', '', 175, 1972],
      ['Interestelar', 'Astronautas viajam por um buraco de minhoca em busca de um novo lar.', 'Ficção Científica', 'https://www.youtube.com/watch?v=zSWdZVtXT7E', '', 169, 2014],
      ['Parasita', 'Uma família pobre se infiltra na vida de uma família rica.', 'Suspense', 'https://www.youtube.com/watch?v=5xH0HfJHsaY', '', 132, 2019],
      ['Toy Story', 'Brinquedos ganham vida quando ninguém está olhando.', 'Animação', 'https://www.youtube.com/watch?v=v-PjgYDrg70', '', 81, 1995],
      ['O Senhor dos Anéis', 'Um hobbit embarca em uma jornada para destruir um anel mágico.', 'Aventura', 'https://www.youtube.com/watch?v=V75dMMIW2B4', '', 178, 2001],
      ['Coringa', 'A origem do vilão Coringa em Gotham City.', 'Drama', 'https://www.youtube.com/watch?v=zAGVQLHvwOY', '', 122, 2019],
      ['Clube da Luta', 'Um homem insone cria um clube de luta clandestino.', 'Drama', 'https://www.youtube.com/watch?v=SUXWAEX2jlg', '', 139, 1999],
      ['A Origem', 'Um ladrão invade sonhos para plantar ou roubar ideias.', 'Ficção Científica', 'https://www.youtube.com/watch?v=YoHD9XEInc0', '', 148, 2010],
      ['Forrest Gump', 'A vida extraordinária de um homem simples.', 'Drama', 'https://www.youtube.com/watch?v=bLvqoHBptjg', '', 142, 1994]
    ];
    for (const f of filmes) {
      db.prepare('INSERT INTO filmes (titulo, descricao, categoria, url, thumbnail_url, duracao, ano) VALUES (?,?,?,?,?,?,?)').run(...f);
    }
    console.log('Filmes seeded');
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    rawDb = new SQL.Database(buffer);
  } else {
    rawDb = new SQL.Database();
  }

  rawDb.run('PRAGMA journal_mode=WAL');
  rawDb.run('PRAGMA foreign_keys=ON');

  rawDb.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, is_admin INTEGER DEFAULT 0, reset_token TEXT, reset_expira TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))`);
  rawDb.run(`CREATE TABLE IF NOT EXISTS planos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, preco REAL NOT NULL, descricao TEXT, recursos TEXT)`);
  rawDb.run(`CREATE TABLE IF NOT EXISTS filmes (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descricao TEXT DEFAULT '', categoria TEXT, url TEXT NOT NULL, thumbnail_url TEXT DEFAULT '', duracao INTEGER, ano INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')))`);
  rawDb.run(`CREATE TABLE IF NOT EXISTS assinaturas (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, plano_id INTEGER NOT NULL, status TEXT DEFAULT 'pendente', mp_payment_id TEXT, qr_code TEXT, qr_code_base64 TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (usuario_id) REFERENCES usuarios(id), FOREIGN KEY (plano_id) REFERENCES planos(id))`);
  rawDb.run(`CREATE TABLE IF NOT EXISTS pagamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, plano_id INTEGER NOT NULL, valor REAL NOT NULL, status TEXT DEFAULT 'pendente', mp_payment_id TEXT, qr_code TEXT, qr_code_base64 TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (usuario_id) REFERENCES usuarios(id), FOREIGN KEY (plano_id) REFERENCES planos(id))`);
  rawDb.run(`CREATE TABLE IF NOT EXISTS categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE)`);

  saveToDisk();

  seedDatabase();
  console.log('Database ready');

  // Auto-save every 30s
  setInterval(saveToDisk, 30000);

  return db;
}

module.exports = { initDatabase, db };
