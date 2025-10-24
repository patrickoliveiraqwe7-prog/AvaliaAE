const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'avaliacoes.db');
const db = new sqlite3.Database(dbPath);

const login = process.argv[2];
const senha = process.argv[3];

if (!login || !senha) {
  console.error('Uso: node set_admin_now.js <login> <senha>');
  process.exit(1);
}

(async () => {
  try {
    const hash = await bcrypt.hash(senha, 10);
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        login TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL
      )`);
      db.get(`SELECT id FROM admins WHERE login = ?`, [login], (err, row) => {
        if (err) { console.error('Erro DB:', err.message); process.exit(1); }
        if (row) {
          db.run(`UPDATE admins SET senha = ? WHERE id = ?`, [hash, row.id], function(e) {
            if (e) { console.error('Erro ao atualizar admin:', e.message); process.exit(1); }
            console.log('Admin atualizado com sucesso:', login);
            process.exit(0);
          });
        } else {
          db.run(`INSERT INTO admins (nome, login, senha) VALUES (?, ?, ?)`, [login, login, hash], function(e) {
            if (e) { console.error('Erro ao inserir admin:', e.message); process.exit(1); }
            console.log('Admin criado com sucesso:', login);
            process.exit(0);
          });
        }
      });
    });
  } catch (e) { console.error('Erro:', e && e.message); process.exit(1); }
})();
