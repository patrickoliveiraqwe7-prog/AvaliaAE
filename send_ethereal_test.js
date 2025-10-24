const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const bcrypt = require('bcrypt');

(async ()=>{
  try{
    console.log('Criando conta Ethereal...');
    const account = await nodemailer.createTestAccount();
    console.log('Ethereal account created. user=%s host=%s', account.user, account.smtp.host);

    const transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass }
    });

    const db = new sqlite3.Database('./avaliacoes.db');

    // criar gestor se não existir
    const login = 'gestor_ethereal';
    const nome = 'Gestor Ethereal';
    let gestorId = null;
    await new Promise((resolve,reject)=>{
      db.get('SELECT id FROM gestores WHERE login = ?', [login], async (err,row)=>{
        if (err) return reject(err);
        if (row) { gestorId = row.id; console.log('Gestor já existe id=', gestorId); return resolve(); }
        // inserir gestor
        const senha = 'Ethereal123';
        const hash = await bcrypt.hash(senha,10);
        db.run('INSERT INTO gestores (nome,login,senha) VALUES (?,?,?)', [nome, login, hash], function(err2){
          if (err2) return reject(err2);
          gestorId = this.lastID;
          console.log('Gestor criado id=', gestorId);
          resolve();
        });
      });
    });

    // gerar token e inserir
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 3600000;
    await new Promise((resolve,reject)=>{
      db.run('INSERT INTO gestor_password_resets (gestor_id, token, expires_at) VALUES (?,?,?)', [gestorId, token, expiresAt], function(err){
        if (err) return reject(err);
        console.log('Token inserido id=', this.lastID);
        resolve();
      });
    });

    // enviar e-mail (para account.user para garantir preview)
    const mailOptions = {
      from: 'no-reply@example.com',
      to: account.user,
      subject: 'Teste reset de senha - Ethereal',
      text: `Token: ${token}\nValido até: ${new Date(expiresAt).toISOString()}`
    };
    console.log('Enviando e-mail...');
    const info = await transporter.sendMail(mailOptions);
    const preview = nodemailer.getTestMessageUrl(info);
    console.log('E-mail enviado. Preview URL:', preview);
    console.log('Token:', token);
    db.close();
  }catch(e){
    console.error('Erro:', e);
    process.exit(1);
  }
})();
