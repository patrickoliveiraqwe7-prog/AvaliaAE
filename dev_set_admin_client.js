// REMOVED: dev client. Archived to backup_tmp_files/removed_tests
module.exports = {};

const http = require('http');
const path = require('path');
const fs = require('fs');
const http = require('http');
const path = require('path');
const fs = require('fs');

const host = process.env.DEV_HOST || 'localhost';
const port = process.env.DEV_PORT || 3000;
const login = process.argv[2];
const senha = process.argv[3];

if (!login || !senha) {
  console.error('Uso: node dev_set_admin_client.js <login> <senha>');
  process.exit(1);
}

const data = JSON.stringify({ login, senha });

const options = {
  hostname: host,
  port: port,
  path: '/__dev__/set-admin',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    try { console.log('BODY', JSON.parse(body)); } catch(e) { console.log('BODY', body); }
    process.exit(0);
  });
});
req.on('error', (e) => { console.error('request error', e && e.message); process.exit(2); });
req.write(data);
req.end();
