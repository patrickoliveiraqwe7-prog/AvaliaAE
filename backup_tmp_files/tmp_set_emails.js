const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./avaliacoes.db');

function ensureColumn(table, column, callback) {
  db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
    if (err) return callback(err);
    const found = (cols || []).some(c => c.name === column);
    if (found) return callback(null, false);
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`, [], (e) => callback(e, true));
  });
}

db.serialize(() => {
  ensureColumn('estagiarios', 'email', (err, addedE) => {
    if (err) console.error('err estagiarios col', err.message);
    else if (addedE) console.log('added email column to estagiarios');
    ensureColumn('gestores', 'email', (err2, addedG) => {
      if (err2) console.error('err gestores col', err2.message);
      else if (addedG) console.log('added email column to gestores');
      // Update specific users
  db.run("UPDATE estagiarios SET email = ? WHERE login = ?", ['patrickoliveiraqwe7@gmail.com', 'Allex'], function(e){ if (e) console.error('update estagiarios', e.message); else console.log('estagiarios updated:', this.changes); });
  db.run("UPDATE gestores SET email = ? WHERE login = ?", ['patrickoliveiraqwe7@gmail.com', 'admin'], function(e){ if (e) console.error('update gestores', e.message); else console.log('gestores updated:', this.changes); });
      db.close();
    });
  });
});
