const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./avaliacoes.db');
const login = process.argv[2] || 'admin';

db.serialize(() => {
  db.get("SELECT id, nome, login, senha FROM gestores WHERE login = ?", [login], (err, row) => {
    console.log('gestor row err', err ? err.message : null);
    console.log('gestor:', row);
    if (!row) { db.close(); process.exit(0); }
    db.all("SELECT id, gestor_id, token, expires_at FROM gestor_password_resets WHERE gestor_id = ? ORDER BY id DESC LIMIT 10", [row.id], (err2, rows2) => {
      console.log('gestor_password_resets err', err2 ? err2.message : null);
      console.log('resets:', rows2 || []);
      db.close();
    });
  });
});
