const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const crypto = require('crypto');

(async ()=>{
  try {
    const db = new sqlite3.Database('./avaliacoes.db');
    const login = process.argv[2] || 'admin';
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + (1000 * 60 * 60); // 1h

    // find gestor
    db.get(`SELECT id, login, email FROM gestores WHERE login = ?`, [login], async (err, row) => {
      if (err) { console.error('DB error:', err); process.exit(1); }
      if (!row) { console.error('Gestor not found for login=', login); process.exit(2); }
      const gestorId = row.id;
      const toEmail = row.email || 'patrickoliveiraqwe7@gmail.com';

      db.run(`INSERT INTO gestor_password_resets (gestor_id, token, expires_at) VALUES (?, ?, ?)`, [gestorId, token, expiresAt], async function(err2) {
        if (err2) { console.error('Insert error:', err2); process.exit(1); }
        console.log('Inserted token for gestor id=', gestorId, 'token=', token, 'expiresAt=', new Date(expiresAt).toISOString());

        // create ethereal test account and send mail
        const account = await nodemailer.createTestAccount();
        const transport = nodemailer.createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.secure,
          auth: { user: account.user, pass: account.pass }
        });

        const mail = {
          from: process.env.SMTP_FROM || 'no-reply@example.com',
          to: toEmail,
          subject: 'Redefinição de senha (teste Ethereal)',
          text: `Token: ${token}\nVálido até: ${new Date(expiresAt).toISOString()}`
        };
        const info = await transport.sendMail(mail);
        const preview = nodemailer.getTestMessageUrl(info);
        console.log('Email sent. Preview URL:', preview);
        process.exit(0);
      });
    });
  } catch (e) { console.error('Unexpected error:', e); process.exit(1); }
})();
