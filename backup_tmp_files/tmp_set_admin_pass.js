const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./avaliacoes.db');

const newPass = 'NovaSenha123!';
const SALT_ROUNDS = 10;
bcrypt.hash(newPass, SALT_ROUNDS).then(h => {
  db.run(`UPDATE admins SET senha = ? WHERE login = ?`, [h, 'admin'], function(err) {
    if (err) { console.error('Erro ao atualizar admin senha:', err); process.exit(1); }
    console.log('Admin senha atualizada com hash:', h);
    process.exit(0);
  });
}).catch(e => { console.error('Erro ao hash:', e); process.exit(1); });
