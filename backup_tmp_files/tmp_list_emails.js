const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./avaliacoes.db');

db.all("SELECT id,login,email FROM estagiarios WHERE email IS NOT NULL AND email != ''", [], (err, rows) => {
  if (err) console.error('ERR', err);
  else console.log(JSON.stringify(rows, null, 2));
  db.close();
});
