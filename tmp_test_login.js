const http = require('http');
const fetch = require('node-fetch');

(async function(){
  try {
    const res = await fetch('http://localhost:3000/login-admin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ login: 'SuporteTV-BA', senha: 'ConteudoTV-BA' }) });
    console.log('login status', res.status);
    const setCookie = res.headers.get('set-cookie');
    console.log('set-cookie header:', setCookie);
    const body = await res.text(); console.log('body:', body);
    // try validate with cookie
    if (setCookie) {
      const r2 = await fetch('http://localhost:3000/admin/validate', { method: 'GET', headers: { 'cookie': setCookie } });
      console.log('validate status', r2.status, await r2.text());
    }
  } catch (e) { console.error('error', e); }
})();