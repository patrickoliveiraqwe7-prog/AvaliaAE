const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./avaliacoes.db');

db.all(`SELECT id, login, senha FROM admins`, [], (err, rows) => {
  if (err) { console.error('Erro ao ler admins:', err); process.exit(1); }
  console.log('admins:', rows);
  process.exit(0);
});
