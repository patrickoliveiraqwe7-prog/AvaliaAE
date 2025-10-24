const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB = path.join(__dirname, 'avaliacoes.db');

const db = new sqlite3.Database(DB);

function checkTable(table) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, login, senha FROM ${table}`, [], (err, rows) => {
      if (err) return reject(err);
      const res = rows.map(r => ({
        table,
        id: r.id,
        login: r.login,
        isBcrypt: typeof r.senha === 'string' && (r.senha.startsWith('$2b$') || r.senha.startsWith('$2a$') || r.senha.startsWith('$2y$')),
        senhaSample: (r.senha || '').slice(0, 60)
      }));
      resolve(res);
    });
  });
}

(async () => {
  try {
    const e = await checkTable('estagiarios');
    const g = await checkTable('gestores');
    const a = await checkTable('admins');
    const all = [...e, ...g, ...a];
    console.log('id\ttable\tlogin\tisBcrypt\tsenhaSample');
    for (const r of all) console.log(`${r.id}\t${r.table}\t${r.login}\t${r.isBcrypt}\t${r.senhaSample}`);
    db.close();
  } catch (err) {
    console.error('Erro:', err);
    db.close();
    process.exit(1);
  }
})();
