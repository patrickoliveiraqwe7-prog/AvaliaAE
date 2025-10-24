const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const DB = path.join(__dirname, 'avaliacoes.db');
const FILE = path.join(__dirname, 'new_passwords.txt');
const SALT_ROUNDS = 10;

if (!fs.existsSync(FILE)) {
  console.error('Arquivo not found:', FILE);
  process.exit(1);
}

const content = fs.readFileSync(FILE, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
// Skip header lines if present
const lines = content.filter(l => l.includes('\t'));

const db = new sqlite3.Database(DB);

async function run() {
  const summary = [];
  for (const ln of lines) {
    const parts = ln.split('\t');
    if (parts.length < 3) continue;
    const table = parts[0].trim();
    const login = parts[1].trim();
    const senha = parts[2].trim();
    if (!['estagiarios','gestores','admins'].includes(table)) {
      console.warn('Skipping unknown table:', table);
      continue;
    }
    try {
      const hash = await bcrypt.hash(senha, SALT_ROUNDS);
      await new Promise((res, rej) => {
        db.get(`SELECT id FROM ${table} WHERE login = ?`, [login], (err, row) => {
          if (err) return rej(err);
          if (!row) return rej(new Error('Login not found: ' + login + ' in ' + table));
          db.run(`UPDATE ${table} SET senha = ? WHERE id = ?`, [hash, row.id], function(err2){ if(err2) rej(err2); else res(); });
        });
      });
      summary.push({ table, login, status: 'updated' });
    } catch (e) {
      summary.push({ table, login, status: 'error', error: e.message });
    }
  }
  console.log('Summary:');
  for (const s of summary) console.log(s.table, s.login, s.status, s.error || '');
  db.close();
}

run().catch(err => { console.error('Fatal:', err); db.close(); process.exit(1); });
