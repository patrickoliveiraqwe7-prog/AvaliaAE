// Gera e insere um token de reset no banco (gestor ou estagiario)
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const login = process.argv[2] || 'admin';
const db = new sqlite3.Database('./avaliacoes.db');

function makeToken(cb){
  const token = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + (1000 * 60 * 60); // 1 hora
  cb(null, token, expires);
}

console.log('Gerando token para login:', login);

// busca em gestores
db.get('SELECT id, nome, login FROM gestores WHERE login = ?', [login], (err, g) => {
  if (err) { console.error('Erro DB (gestores):', err); db.close(); process.exit(1); }
  if (g) {
    makeToken((er, token, expires) => {
      db.run('INSERT INTO gestor_password_resets (gestor_id, token, expires_at) VALUES (?, ?, ?)', [g.id, token, expires], function(e){
        if (e) { console.error('Erro inserindo token gestor:', e); db.close(); process.exit(1); }
        console.log('TOKEN_FOR_GESTOR', login, token, new Date(expires).toISOString());
        db.close();
      });
    });
    return;
  }
  // busca em estagiarios
  db.get('SELECT id, nome, login FROM estagiarios WHERE login = ?', [login], (err2, s) => {
    if (err2) { console.error('Erro DB (estagiarios):', err2); db.close(); process.exit(1); }
    if (s) {
      makeToken((er, token, expires) => {
        db.run('INSERT INTO password_resets (estagiario_id, token, expires_at) VALUES (?, ?, ?)', [s.id, token, expires], function(e){
          if (e) { console.error('Erro inserindo token estagiario:', e); db.close(); process.exit(1); }
          console.log('TOKEN_FOR_ESTAGIARIO', login, token, new Date(expires).toISOString());
          db.close();
        });
      });
      return;
    }
    console.error('Login não encontrado em gestores nem em estagiarios:', login);
    db.close();
    process.exit(2);
  });
});
