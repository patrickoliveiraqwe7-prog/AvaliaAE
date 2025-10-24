const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'avaliacoes.db');
const db = new sqlite3.Database(dbPath);

db.all(`SELECT id, nome, login FROM admins ORDER BY id DESC`, [], (err, rows) => {
  if (err) { console.error('Erro ao ler admins:', err.message); process.exit(1); }
  console.log('Admins:');
  (rows || []).forEach(r => console.log(r));
  process.exit(0);
});
