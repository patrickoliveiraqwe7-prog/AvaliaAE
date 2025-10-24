const http = require('http');
const postData = JSON.stringify({ login: 'SuporteTV-BA', senha: 'ConteudoTV-BA' });
const options = { hostname: 'localhost', port: 3000, path: '/login-admin', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } };
const req = http.request(options, res => {
  console.log('login status', res.statusCode);
  console.log('set-cookie', res.headers['set-cookie']);
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('body', body);
    const cookie = (res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
    const opts2 = { hostname: 'localhost', port: 3000, path: '/admin/validate', method: 'GET', headers: { 'Cookie': cookie } };
    const r2 = http.request(opts2, rres => {
      console.log('validate status', rres.statusCode);
      let b2 = '';
      rres.on('data', d=>b2+=d);
      rres.on('end', ()=>{ console.log('validate body', b2); process.exit(0); });
    });
    r2.on('error', e=>{ console.error('validate error', e); process.exit(1); });
    r2.end();
  });
});
req.on('error', e=>{ console.error('login error', e); process.exit(1); });
req.write(postData);
req.end();
