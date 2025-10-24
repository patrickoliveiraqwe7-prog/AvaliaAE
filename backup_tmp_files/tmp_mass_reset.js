// Script temporário para gerar novas senhas, atualizar DB e imprimir pares login->senha
// Uso: node tmp_mass_reset.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const DB = path.join(__dirname, 'avaliacoes.db');
const SALT_ROUNDS = 10;

function genPassword(len = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.<>?';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

(async () => {
  const db = new sqlite3.Database(DB);

  function allAsync(sql, params=[]) { return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r))); }
  function runAsync(sql, params=[]) { return new Promise((res, rej) => db.run(sql, params, function(err){ if(err) rej(err); else res(this); })); }

  try {
    const results = [];

    // Fetch users
    const estagiarios = await allAsync("SELECT id,login FROM estagiarios");
    const gestores = await allAsync("SELECT id,login FROM gestores");
    const admins = await allAsync("SELECT id,login FROM admins");

    const now = new Date().toISOString();

    // Helper to update
    async function updateBatch(rows, table) {
      for (const r of rows) {
        const pwd = genPassword(16);
        const hash = await bcrypt.hash(pwd, SALT_ROUNDS);
        await runAsync(`UPDATE ${table} SET senha = ? WHERE id = ?`, [hash, r.id]);
        results.push({ table, id: r.id, login: r.login, senha: pwd });
      }
    }

    await updateBatch(estagiarios, 'estagiarios');
    await updateBatch(gestores, 'gestores');
    await updateBatch(admins, 'admins');

    const outPath = path.join(__dirname, 'new_passwords.txt');
    const header = `Generated at: ${now}\nTables: estagiarios, gestores, admins\n\n`;
    const lines = results.map(r => `${r.table}\t${r.login}\t${r.senha}`);
    fs.writeFileSync(outPath, header + lines.join('\n'));

    console.log('Done. Wrote', results.length, 'passwords to', outPath);
    console.log('---BEGIN COPIABLE LIST---');
    for (const r of results) console.log(`${r.table}\t${r.login}\t${r.senha}`);
    console.log('---END COPIABLE LIST---');

    db.close();
  } catch (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
})();
