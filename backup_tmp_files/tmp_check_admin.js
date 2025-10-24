const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./avaliacoes.db');

db.serialize(() => {
  db.get("SELECT id,login,senha FROM gestores WHERE login='admin'", (e, r) => {
    console.log('/gestores admin err', e ? e.message : null);
    console.log(r);
  });
  db.get("SELECT id,login,senha FROM estagiarios WHERE login='admin'", (e, r) => {
    console.log('/estagiarios admin err', e ? e.message : null);
    console.log(r);
  });
});

db.close();
