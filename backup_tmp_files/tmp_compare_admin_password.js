const bcrypt = require('bcrypt');
const hash = '$2b$10$70vyTGYjfoPeqy7j3DSDkuAdAB8CVtTR866ggbxlG.GZAmvYHda6q';
const pass = 'NovaSenha123!';

bcrypt.compare(pass, hash).then(match => {
  console.log('compare result for NovaSenha123! ->', match);
}).catch(err => { console.error('err', err); process.exit(1); });
