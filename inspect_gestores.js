const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const db = new sqlite3.Database('./avaliacoes.db', sqlite3.OPEN_READONLY, (err)=>{
  if(err){ console.error('DB ERR', err.message); process.exit(1); }
});
const out = {};
db.serialize(()=>{
  db.all('SELECT id,nome,login FROM gestores ORDER BY id DESC',[],(err,rows)=>{
    if(err) out.gestores_error = err.message; else out.gestores = rows || [];
    db.all('SELECT id,gestor_id,token,expires_at FROM gestor_password_resets ORDER BY id DESC LIMIT 200',[],(err2,rows2)=>{
      if(err2) out.resets_error = err2.message; else out.gestor_password_resets = rows2 || [];
      fs.writeFileSync('inspect_gestores.json', JSON.stringify(out, null, 2));
      console.log('WROTE inspect_gestores.json');
      db.close();
    });
  });
});