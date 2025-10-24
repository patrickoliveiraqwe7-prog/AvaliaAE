// REMOVED: dev/test probe script. Archived to backup_tmp_files/removed_tests
module.exports = {};

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const outPath = path.join(__dirname, 'admin_probe.json');
const dbPath = path.join(__dirname, 'avaliacoes.db');

function write(obj){ try { fs.writeFileSync(outPath, JSON.stringify(obj, null, 2), 'utf8'); } catch(e){} }

try {
  const st = fs.statSync(dbPath);
  write({ dbStat: { size: st.size, mtimeMs: st.mtimeMs } });
} catch(e) {
  write({ dbStatError: e && e.message });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) { write({ dbOpenError: err && err.message }); process.exit(0); }
  db.all('SELECT id, nome, login FROM admins ORDER BY id DESC', [], (err, rows) => {
    if (err) { write({ queryError: err && err.message }); process.exit(0); }
    write({ admins: rows || [] });
    process.exit(0);
  });
});
