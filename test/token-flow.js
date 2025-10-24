(async ()=>{
  const base='http://localhost:3000';
  const fetch = global.fetch || require('node-fetch');
  try{
    let r = await fetch(base + '/login-admin',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ login:'admin', senha:'NovaSenha123!'})});
    const j = await r.json(); console.log('login', r.status, j);
    const token = j.token; if(!token) return console.error('no admin token');
    const auth = { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + token };
    // create test users if needed
    await fetch(base+'/gestor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'GT Test',login:'gt_test',senha:'Senha1234'})}).catch(()=>{});
    await fetch(base+'/estagiario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'ST Test',login:'st_test',senha:'Senha1234'})}).catch(()=>{});
    const g = await fetch(base + '/admin/token/gestor', { method:'POST', headers: auth, body: JSON.stringify({ login:'gt_test' }) }); console.log('gestor token', g.status, await g.json());
    const e = await fetch(base + '/admin/token/estagiario', { method:'POST', headers: auth, body: JSON.stringify({ login:'st_test' }) }); console.log('estagiario token', e.status, await e.json());
  }catch(e){ console.error('erro test', e); }
})();
