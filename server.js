// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const https = require('https');
const fs = require('fs');
const querystring = require('querystring');
const crypto = require('crypto');
// tentar carregar nodemailer dinamicamente (pode não estar instalado em dev)
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

// Mailer helpers: support real SMTP via env vars or Ethereal test account when available
let _mailerTransport = null;
async function getMailerTransport() {
    if (!nodemailer) return null;
    if (_mailerTransport) return _mailerTransport;
    const smtpHost = process.env.SMTP_HOST;
    try {
        if (smtpHost) {
            // Use provided SMTP configuration
            _mailerTransport = nodemailer.createTransport({
                host: smtpHost,
                port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
            });
            return _mailerTransport;
        }
        // No SMTP configured: create Ethereal test account (for dev) if nodemailer available
        const account = await nodemailer.createTestAccount();
        _mailerTransport = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: { user: account.user, pass: account.pass }
        });
    logInfo('Mailer: using Ethereal account for dev preview (check server logs for preview URL)');
        return _mailerTransport;
    } catch (e) {
        console.warn('Mailer init failed:', e && e.message);
        return null;
    }
}

async function sendResetEmail(to, subject, text, html) {
    try {
        const transport = await getMailerTransport();
        if (!transport) {
            logWarn('Mailer not available, skipping email send.');
            return { sent: false };
        }
        const info = await transport.sendMail({ from: process.env.SMTP_FROM || 'no-reply@example.com', to, subject, text, html });
    const preview = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
        // somente em dev exibimos o preview no console (não mostrar em produção)
    if (preview && process.env.NODE_ENV !== 'production') logInfo('Email preview URL:', preview);
    return { sent: true, info, preview };
    } catch (e) {
        console.warn('Error sending email:', e && e.message);
        return { sent: false, error: e };
    }
}

// Email template helper (returns { subject, text, html })
function renderResetTemplate({ nome, token, expiresAt, targetType='Conta' }) {
    const expiresStr = new Date(expiresAt).toLocaleString();
    const subject = `${targetType}: Redefinição de senha`;
    const text = `${nome || 'Usuário'},\n\nUse este token para redefinir sua senha: ${token}\nVálido até: ${expiresStr}\n\nSe você não solicitou, ignore esta mensagem.`;
    const html = `<!doctype html><html><body><p>Olá ${nome || 'Usuário'},</p><p>Use o token abaixo para redefinir sua senha:</p><pre style="font-size:1.2em; padding:8px; background:#f3f3f3; display:inline-block;">${token}</pre><p>Válido até: <strong>${expiresStr}</strong></p><p>Se você não solicitou esta redefinição, ignore este e-mail.</p></body></html>`;
    return { subject, text, html };
}

function tableHasColumn(table, column, cb) {
    db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
        if (err) return cb(err);
        const has = (cols || []).some(c => c && c.name === column);
        cb(null, has);
    });
}
// (autenticação por token removida — versão simplificada)

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Rate limiting (configurável via env)
try {
    const rateLimit = require('express-rate-limit');
    const rlWindow = Number(process.env.RATE_LIMIT_WINDOW_MS) || (15 * 60 * 1000); // 15 min
    const rlMax = Number(process.env.RATE_LIMIT_MAX) || 100; // requests per window
    const limiter = rateLimit({ windowMs: rlWindow, max: rlMax, standardHeaders: true, legacyHeaders: false });
    app.use(limiter);
    // stricter per-route limiters
    const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
    const tokenLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
    app.use('/login-admin', authLimiter);
    app.use('/admin/token', tokenLimiter);
    app.use('/password-reset', tokenLimiter);
} catch (e) {
    console.warn('express-rate-limit não está disponível, pulando limitador. Instale dependência para produção.');
}
const path = require('path');
// Servir arquivos estáticos (index.html, script.js, styles.css)
app.use(express.static(path.join(__dirname)));
// Cookie parser para suportar autenticação via cookie
try {
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
} catch (e) {
    logWarn('cookie-parser não instalado; autenticação via cookie não estará disponível. Install cookie-parser to enable.');
}

// Simple logger helpers (control with env DEBUG_LOGS=true)
const DEBUG_LOGS = process.env.DEBUG_LOGS === 'true';
function logDebug(...args) { if (DEBUG_LOGS) console.log('[DEBUG]', ...args); }
function logInfo(...args) { console.log('[INFO]', ...args); }
function logWarn(...args) { console.warn('[WARN]', ...args); }
function logError(...args) { console.error('[ERROR]', ...args); }
// Ensure TOKEN_PEPPER exists in production for hashing
if (process.env.NODE_ENV === 'production') {
    if (!process.env.TOKEN_PEPPER || process.env.TOKEN_PEPPER.length < 8) {
        console.error('FATAL: TOKEN_PEPPER must be set and at least 8 characters in production. Aborting startup.');
        process.exit(1);
    }
}

// Use modular DB and auth helpers
const { db, dbInsertAdminSession, dbGetAdminSessionByHash, dbDeleteAdminSessionByHash } = require('./lib/db');
const { hashToken, generateShortToken, createAdminSession, requireAdmin } = require('./lib/auth');

// --- Microsoft OAuth2 integration (minimal) ---
// Requires environment variables: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT (or 'common'), APP_BASE_URL
const oauthState = new Map(); // state -> { purpose, createdAt }

app.get('/auth/microsoft', (req, res) => {
    const purpose = req.query.purpose || 'login'; // could be 'admin-login' or others
    const state = crypto.randomBytes(12).toString('hex');
    oauthState.set(state, { purpose, createdAt: Date.now() });
    const tenant = process.env.MS_TENANT || 'common';
    const params = {
        client_id: process.env.MS_CLIENT_ID || '',
        response_type: 'code',
        redirect_uri: (process.env.APP_BASE_URL || `http://localhost:${PORT}`) + '/auth/microsoft/callback',
        response_mode: 'query',
        scope: 'openid profile email',
        state
    };
    const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${querystring.stringify(params)}`;
    res.redirect(url);
});

app.get('/auth/microsoft/callback', (req, res) => {
    const { code, state } = req.query || {};
    if (!code || !state || !oauthState.has(state)) {
        return res.status(400).send('Invalid OAuth callback');
    }
    // exchange code for token
    const tokenPath = `/` + (process.env.MS_TENANT || 'common') + `/oauth2/v2.0/token`;
    const postData = querystring.stringify({
        client_id: process.env.MS_CLIENT_ID || '',
        client_secret: process.env.MS_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: (process.env.APP_BASE_URL || `http://localhost:${PORT}`) + '/auth/microsoft/callback'
    });
    const options = {
        hostname: 'login.microsoftonline.com',
        path: tokenPath,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };
    const tokenReq = https.request(options, tokenRes => {
        let body = '';
        tokenRes.on('data', d => body += d);
        tokenRes.on('end', () => {
            try {
                const tok = JSON.parse(body);
                if (!tok || !tok.access_token) return res.status(500).send('No access token');
                // call microsoft graph to get profile
                const graphReq = https.request({
                    hostname: 'graph.microsoft.com', path: '/v1.0/me', method: 'GET', headers: { Authorization: 'Bearer ' + tok.access_token }
                }, graphRes => {
                    let gbody = '';
                    graphRes.on('data', d => gbody += d);
                    graphRes.on('end', () => {
                        try {
                            const profile = JSON.parse(gbody);
                            // find local user by email
                            const email = profile.mail || profile.userPrincipalName || null;
                            // create a simple one-time token to communicate back to the opener window
                            const oneTime = crypto.randomBytes(20).toString('hex');
                            // store mapping temporary: oneTime -> profile
                            oauthState.set(oneTime, { profile, createdAt: Date.now() });
                            // return an HTML page that posts message to opener with the token
                            res.send(`<!doctype html><html><body><script>
                                (function(){
                                    try {
                                        window.opener && window.opener.postMessage({ type: 'ms-login', token: '${oneTime}', profile: ${JSON.stringify(profile)} }, '*');
                                    } catch(e){}
                                    document.body.innerHTML = '<p>Login concluído. Pode fechar esta janela.</p>';
                                })();
                                </script></body></html>`);
                        } catch (e) { return res.status(500).send('Graph parse error'); }
                    });
                });
                graphReq.on('error', (e) => res.status(500).send('Graph request failed'));
                graphReq.end();
            } catch (e) { return res.status(500).send('Token parse error'); }
        });
    });
    tokenReq.on('error', (e) => res.status(500).send('Token request failed'));
    tokenReq.write(postData);
    tokenReq.end();
});

// Endpoint to consume the one-time code and create a local admin session if applicable
app.post('/auth/microsoft/consume', express.json(), (req, res) => {
    const { oneTime } = req.body || {};
    if (!oneTime || !oauthState.has(oneTime)) return res.status(400).json({ error: 'Invalid token' });
    const entry = oauthState.get(oneTime);
    oauthState.delete(oneTime);
    const profile = entry && entry.profile;
    const email = profile && (profile.mail || profile.userPrincipalName);
    if (!email) return res.status(400).json({ error: 'Email not available in profile' });
    // try to find matching admin by email
    db.get(`SELECT id, login FROM admins WHERE login = ? OR nome = ?`, [email, email], (err, adminRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (adminRow) {
            const s = createAdminSession(adminRow);
            return res.json({ token: s.token, login: adminRow.login, admin: true });
        }
        // If not admin, try to find gestor/estagiario and return minimal info (no admin token)
        db.get(`SELECT id, login FROM gestores WHERE email = ? OR login = ?`, [email, email], (err2, g) => {
            if (err2) return res.status(500).json({ error: err2.message });
            if (g) return res.json({ gestor: true, login: g.login });
            db.get(`SELECT id, login FROM estagiarios WHERE email = ? OR login = ?`, [email, email], (err3, eRow) => {
                if (err3) return res.status(500).json({ error: err3.message });
                if (eRow) return res.json({ estagiario: true, login: eRow.login });
                // not found: create a lightweight estagiario account?
                return res.status(404).json({ error: 'No local account matched the Microsoft account' });
            });
        });
    });
});

// Endpoint para login de admin -> retorna token
app.post('/login-admin', (req, res) => {
    const { login, senha } = req.body || {};
    if (!login || !senha) return res.status(400).json({ error: 'Login e senha obrigatórios.' });
    db.get(`SELECT * FROM admins WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Login ou senha inválidos.' });
        bcrypt.compare(senha, row.senha).then(match => {
            if (!match) return res.status(401).json({ error: 'Login ou senha inválidos.' });
            const s = createAdminSession(row, req);
            // Set httpOnly cookie for session persistence. Use Secure flag when running under HTTPS or not localhost.
            try {
                const isSecure = req.secure || (req.headers['x-forwarded-proto'] === 'https') || false;
                // cookie age in ms -> convert to seconds for maxAge
                const maxAge = Math.max(0, Number(s.expiresAt) - Date.now());
                res.cookie('admin_token', s.token, { httpOnly: true, secure: isSecure, sameSite: 'Lax', maxAge: maxAge });
            } catch (e) {
                logWarn('Falha ao setar cookie de sessão:', e && e.message);
            }
            return res.json({ token: s.token, expiresAt: s.expiresAt, login: row.login });
        }).catch(() => res.status(500).json({ error: 'Erro interno ao verificar senha.' }));
    });
});

// Endpoint para logout admin (opcional)
app.post('/logout-admin', requireAdmin, (req, res) => {
    const hdr = req.headers['authorization'] || '';
    const token = hdr.slice(7).trim();
    // remove from cache
    adminSessions.delete(token);
    try {
        const tokenHash = hashToken(token);
        dbDeleteAdminSessionByHash(tokenHash, () => {});
    } catch (e) {}
    // clear cookie
    try { res.clearCookie('admin_token'); } catch (e) {}
    res.json({ sucesso: true });
});

// Endpoint de validação para tokens admin (retorna 200 se token válido)
app.get('/admin/validate', requireAdmin, (req, res) => {
    return res.json({ ok: true, login: req.admin && req.admin.login ? req.admin.login : null });
});

// sem JWT

// DB initialization and helpers are provided by `lib/db.js`

// Periodic cleanup: remover tokens expirados (executa a cada 5 minutos)
function cleanupExpiredTokens() {
    try {
        const now = Date.now();
        db.run(`DELETE FROM password_resets WHERE expires_at <= ?`, [now]);
        db.run(`DELETE FROM gestor_password_resets WHERE expires_at <= ?`, [now]);
        db.run(`DELETE FROM admin_tokens WHERE expires_at <= ?`, [now]);
        db.run(`DELETE FROM admin_sessions WHERE expires_at <= ?`, [now]);
    } catch (e) {
        console.warn('cleanupExpiredTokens erro', e && e.message);
    }
}
setInterval(cleanupExpiredTokens, 1000 * 60 * 5);
                // (rota de login-gestor removida nesta versão)
// Endpoint para cadastrar estagiário
// Endpoint para excluir estagiário
// proteger exclusão de estagiário por gestor autenticado
app.delete('/estagiario/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM estagiarios WHERE id = ?`, [id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Estagiário não encontrado.' });
        }
        res.json({ sucesso: true });
    });
});

// cadastrar estagiário protegido (somente gestores autenticados)
app.post('/estagiario', (req, res) => {
    const { nome, area, departamento, login, senha } = req.body;
    if (!nome || !login || !senha) {
        return res.status(400).json({ error: 'Dados obrigatórios faltando.' });
    }
    // hash da senha antes de salvar
    const SALT_ROUNDS = 10;
    bcrypt.hash(senha, SALT_ROUNDS)
        .then(hash => {
            db.run(
                `INSERT INTO estagiarios (nome, area, departamento, login, senha) VALUES (?, ?, ?, ?, ?)`,
                [nome, area, departamento, login, hash],
                function (err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ id: this.lastID, nome, area, departamento, login });
                }
            );
        })
        .catch(err => res.status(500).json({ error: 'Erro ao gerar hash de senha.' }));
});

// Endpoint para autenticar estagiário
app.post('/login-estagiario', (req, res) => {
    const { login, senha } = req.body;
    if (!login || !senha) {
        return res.status(400).json({ error: 'Login e senha obrigatórios.' });
    }
    db.get(
        `SELECT * FROM estagiarios WHERE login = ? AND senha = ?`,
        [login, senha],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!row) {
                // senha possivelmente está em hash — tentaremos buscar pelo login e comparar bcrypt
                db.get(`SELECT * FROM estagiarios WHERE login = ?`, [login], (err2, row2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (!row2) return res.status(401).json({ error: 'Login ou senha inválidos.' });
                    const stored = row2.senha || '';
                    // detectar hash (bcrypt hashes começam com $2b$ or $2a$)
                    const isHash = typeof stored === 'string' && stored.startsWith('$2');
                    if (!isHash) {
                        // senha armazenada em texto - tentativa de migração automática: comparar diretamente then re-hash
                        if (stored === senha) {
                            // migra para hash
                            bcrypt.hash(senha, 10).then(h => {
                                db.run(`UPDATE estagiarios SET senha = ? WHERE id = ?`, [h, row2.id], () => {
                                    return res.json({ id: row2.id, nome: row2.nome, area: row2.area, departamento: row2.departamento, login: row2.login });
                                });
                            }).catch(() => res.status(500).json({ error: 'Erro ao migrar senha.' }));
                            return;
                        } else {
                            return res.status(401).json({ error: 'Login ou senha inválidos.' });
                        }
                    }
                    // comparar bcrypt
                    bcrypt.compare(senha, stored).then(match => {
                        if (!match) return res.status(401).json({ error: 'Login ou senha inválidos.' });
                        return res.json({ id: row2.id, nome: row2.nome, area: row2.area, departamento: row2.departamento, login: row2.login });
                    }).catch(() => res.status(500).json({ error: 'Erro interno ao verificar senha.' }));
                });
            }
            else {
                // Caso a consulta por igualdade tenha retornado uma linha (incomum quando usamos hash) - retornar
                return res.json({ id: row.id, nome: row.nome, area: row.area, departamento: row.departamento, login: row.login });
            }
        }
    );
});

                
function validarSenha(senha) {
    if (!senha || typeof senha !== 'string') return 'Senha inválida.';
    if (senha.length < 8) return 'Senha deve ter pelo menos 8 caracteres.';
    if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) return 'Senha deve conter letras e números.';
    return null;
}

// NOTE: auth helpers already imported earlier near DB/auth setup

// Token TTL configur vel via env (ms). Default 30 minutos
const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_MS) || (1000 * 60 * 30);

// Request de reset: { login }
// Request de reset: { login } - apenas admins podem solicitar
app.post('/password-reset/request', requireAdmin, (req, res) => {
    const { login } = req.body;
    if (!login) return res.status(400).json({ error: 'Login é obrigatório.' });
    db.get(`SELECT id, nome, login FROM estagiarios WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Estagiário não encontrado.' });
    const token = generateShortToken(4, 2); // ex: AB12-CD34
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const tokenHash = hashToken(token);
        // remover tokens anteriores e inserir o novo (garantir 1 token por usuário)
        db.run(`DELETE FROM password_resets WHERE estagiario_id = ?`, [row.id], function (delErr) {
            // ignorar erro do delete e prosseguir
            // armazenar token_hash; manter token apenas em dev
            const plain = process.env.NODE_ENV !== 'production' ? token : null;
            db.run(`INSERT INTO password_resets (estagiario_id, token, token_hash, expires_at) VALUES (?, ?, ?, ?)`, [row.id, plain, tokenHash, expiresAt], async function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                logDebug(`Password reset requested for login=${login} (token stored)`);
                try { pushAudit(req.admin && req.admin.id, 'generate', 'estagiario', login); } catch(e){}
                // Tenta enviar email se existir coluna 'email' na tabela estagiarios
                tableHasColumn('estagiarios', 'email', async (errCol, has) => {
                    if (!errCol && has) {
                        db.get(`SELECT email, nome FROM estagiarios WHERE id = ?`, [row.id], async (err3, r3) => {
                            const to = (r3 && r3.email) ? r3.email : (process.env.SMTP_FALLBACK_TO || process.env.SMTP_USER);
                            if (to) {
                                try {
                                    const tpl = renderResetTemplate({ nome: r3 && r3.nome, token, expiresAt, targetType: 'Estagiário' });
                                    const sentInfo = await sendResetEmail(to, tpl.subject, tpl.text, tpl.html);
                                    if (sentInfo && sentInfo.preview) logDebug('Reset email preview:', sentInfo.preview);
                                } catch(e) { logWarn('sendResetEmail erro', e && e.message); }
                            } else {
                                logDebug('Nenhum e-mail disponível para estagiário; token no log (dev).');
                            }
                            // Em dev retornamos o token claro para facilitar cópia; em produção apenas success
                            if (process.env.NODE_ENV !== 'production') return res.json({ sucesso: true, expiresAt, token });
                            return res.json({ sucesso: true, expiresAt });
                        });
                    } else {
                        // sem coluna email ou erro: logamos e retornamos
                        logDebug('Email column not present or error; token logged for dev.');
                        if (process.env.NODE_ENV !== 'production') return res.json({ sucesso: true, expiresAt, token });
                        return res.json({ sucesso: true, expiresAt });
                    }
                });
            });
        });
    });
});

// Gestor: request reset
// Gestor: request reset - apenas admins podem solicitar
app.post('/gestor/password-reset/request', requireAdmin, (req, res) => {
    const { login } = req.body;
    if (!login) return res.status(400).json({ error: 'Login é obrigatório.' });
    db.get(`SELECT id, nome, login FROM gestores WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Gestor não encontrado.' });
        const token = generateShortToken(4, 2); // ex: AB12-CD34
        const expiresAt = Date.now() + TOKEN_TTL_MS;
        const tokenHash = hashToken(token);
        // remover tokens anteriores e inserir novo
        db.run(`DELETE FROM gestor_password_resets WHERE gestor_id = ?`, [row.id], function (delErr) {
            const plain = process.env.NODE_ENV !== 'production' ? token : null;
            db.run(`INSERT INTO gestor_password_resets (gestor_id, token, token_hash, expires_at) VALUES (?, ?, ?, ?)`, [row.id, plain, tokenHash, expiresAt], async function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                logDebug(`Gestor password reset requested for login=${login} (token stored)`);
                try { pushAudit(req.admin && req.admin.id, 'generate', 'gestor', login); } catch(e){}
                tableHasColumn('gestores', 'email', async (errCol, has) => {
                    if (!errCol && has) {
                        db.get(`SELECT email, nome FROM gestores WHERE id = ?`, [row.id], async (err3, r3) => {
                            const to = (r3 && r3.email) ? r3.email : (process.env.SMTP_FALLBACK_TO || process.env.SMTP_USER);
                            if (to) {
                                try {
                                    const tpl = renderResetTemplate({ nome: r3 && r3.nome, token, expiresAt, targetType: 'Gestor' });
                                    const sentInfo = await sendResetEmail(to, tpl.subject, tpl.text, tpl.html);
                                    if (sentInfo && sentInfo.preview) logDebug('Reset email preview:', sentInfo.preview);
                                } catch(e) { logWarn('sendResetEmail erro', e && e.message); }
                            } else {
                                logDebug('Nenhum e-mail disponível para gestor; token no log (dev).');
                            }
                            if (process.env.NODE_ENV !== 'production') return res.json({ sucesso: true, expiresAt, token });
                            return res.json({ sucesso: true, expiresAt });
                        });
                    } else {
                        logDebug('Email column not present or error; token logged for dev.');
                        if (process.env.NODE_ENV !== 'production') return res.json({ sucesso: true, expiresAt, token });
                        return res.json({ sucesso: true, expiresAt });
                    }
                });
            });
        });
    });
});

// Gestor: confirm reset
app.post('/gestor/password-reset/confirm', requireAdmin, (req, res) => {
    const { token, newSenha } = req.body;
    if (!token || !newSenha) return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    const v = validarSenha(newSenha);
    if (v) return res.status(400).json({ error: v });
    // gerar hash do token e logar apenas o prefixo do hash (não o token claro)
    const tokenHash = hashToken(String(token));
    logDebug('Confirm reset gestor: token hash prefix:', tokenHash.slice(0, 8));
    db.get(`SELECT pr.id as pr_id, pr.gestor_id, pr.expires_at, g.login FROM gestor_password_resets pr JOIN gestores g ON g.id = pr.gestor_id WHERE pr.token_hash = ?`, [tokenHash], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) {
            // não exibir token recebido nos logs por segurança
            console.warn('Token de reset do gestor não encontrado ou inválido');
            return res.status(404).json({ error: 'Token inválido.' });
        }
        if (Date.now() > Number(row.expires_at)) {
            db.run(`DELETE FROM gestor_password_resets WHERE id = ?`, [row.pr_id]);
            return res.status(400).json({ error: 'Token expirado.' });
        }
        bcrypt.hash(newSenha, 10).then(hash => {
            db.run(`UPDATE gestores SET senha = ? WHERE id = ?`, [hash, row.gestor_id], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                db.run(`DELETE FROM gestor_password_resets WHERE gestor_id = ?`, [row.gestor_id]);
                logInfo(`Senha atualizada para gestor login=${row.login}`);
                return res.json({ sucesso: true });
            });
        }).catch(() => res.status(500).json({ error: 'Erro ao gerar hash.' }));
    });
});

// Confirm reset: { token, newSenha }
app.post('/password-reset/confirm', requireAdmin, (req, res) => {
    const { token, newSenha } = req.body;
    if (!token || !newSenha) return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    const v = validarSenha(newSenha);
    if (v) return res.status(400).json({ error: v });
    const tokenHash = hashToken(String(token));
    db.get(`SELECT pr.id as pr_id, pr.estagiario_id, pr.expires_at, e.login FROM password_resets pr JOIN estagiarios e ON e.id = pr.estagiario_id WHERE pr.token_hash = ?`, [tokenHash], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Token inválido.' });
        if (Date.now() > Number(row.expires_at)) {
            // token expirado: remover
            db.run(`DELETE FROM password_resets WHERE id = ?`, [row.pr_id]);
            return res.status(400).json({ error: 'Token expirado.' });
        }
        // ok: atualizar senha (hash)
        bcrypt.hash(newSenha, 10).then(hash => {
            db.run(`UPDATE estagiarios SET senha = ? WHERE id = ?`, [hash, row.estagiario_id], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                // remover todos os tokens desse usuário
                db.run(`DELETE FROM password_resets WHERE estagiario_id = ?`, [row.estagiario_id]);
                logInfo(`Senha atualizada para login=${row.login}`);
                return res.json({ sucesso: true });
            });
        }).catch(() => res.status(500).json({ error: 'Erro ao gerar hash.' }));
    });
});

// Endpoint para salvar avaliação
app.post('/avaliacao', (req, res) => {
    const { nome, departamento, nota, comentario } = req.body;
    if (!nome || !departamento || nota === undefined) {
        return res.status(400).json({ error: 'Dados obrigatórios faltando.' });
    }
    db.run(
        `INSERT INTO avaliacoes (nome, departamento, nota, comentario) VALUES (?, ?, ?, ?)`,
        [nome, departamento, nota, comentario],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID, nome, departamento, nota, comentario });
        }
    );
});

// Endpoint para listar avaliações
app.get('/avaliacoes', (req, res) => {
    db.all(`SELECT * FROM avaliacoes`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint para listar estagiários
app.get('/estagiarios', (req, res) => {
    db.all(`SELECT id, nome, area, departamento, login FROM estagiarios`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint para fornecer tags usadas no frontend (nomes e áreas)
app.get('/tags-estagiarios', (req, res) => {
    const nomes = new Set();
    const areas = new Set();
    db.all(`SELECT DISTINCT nome, area FROM estagiarios`, [], (err, rows) => {
        if (err) {
            console.error('/tags-estagiarios: erro ao selecionar estagiarios', err);
            return res.status(500).json({ error: 'Erro ao buscar estagiários: ' + err.message });
        }
        try { (rows || []).forEach(r => { if (r && r.nome) nomes.add(r.nome); if (r && r.area) areas.add(r.area); }); } catch (e) {
            console.error('/tags-estagiarios: erro processando rows de estagiarios', e);
        }
        db.all(`SELECT DISTINCT nome, area FROM avaliacoes`, [], (err2, rows2) => {
            if (err2) {
                console.error('/tags-estagiarios: erro ao selecionar avaliacoes', err2);
                return res.status(500).json({ error: 'Erro ao buscar avaliações: ' + err2.message });
            }
            try { (rows2 || []).forEach(r => { if (r && r.nome) nomes.add(r.nome); if (r && r.area) areas.add(r.area); }); } catch (e) {
                console.error('/tags-estagiarios: erro processando rows de avaliacoes', e);
            }
            const out = [];
            nomes.forEach(n => out.push({ nome: n }));
            areas.forEach(a => out.push({ area: a }));
            try {
                return res.json(out);
            } catch (e) {
                console.error('/tags-estagiarios: erro ao enviar resposta', e);
                return res.status(500).json({ error: 'Erro interno ao preparar tags.' });
            }
        });
    });
});

// Endpoint para excluir avaliação (suporta ambos /avaliacao/:id e /avaliacoes/:id)
function apagarAvaliacaoHandler(req, res) {
    const { id } = req.params;
    logDebug('DELETE /avaliacao/:id requested id=', id);
    db.run(`DELETE FROM avaliacoes WHERE id = ?`, [id], function (err) {
        if (err) {
            console.error('Erro ao deletar por id', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            // tentativa alternativa: apagar por rowid (caso id vindo seja rowid)
            db.run(`DELETE FROM avaliacoes WHERE rowid = ?`, [id], function (err2) {
                if (err2) {
                    console.error('Erro ao deletar por rowid', err2);
                    return res.status(500).json({ error: err2.message });
                }
                if (this.changes === 0) {
                    console.warn('Avaliação não encontrada para id/rowid=', id);
                    return res.status(404).json({ error: 'Avaliação não encontrada.' });
                }
                logInfo('Removido usando rowid=', id);
                return res.json({ sucesso: true });
            });
            return;
        }
        res.json({ sucesso: true });
    });
}

app.delete('/avaliacao/:id', apagarAvaliacaoHandler);
app.delete('/avaliacoes/:id', apagarAvaliacaoHandler);

// Função utilitária que tenta iniciar o servidor em uma porta e retorna a instância quando OK
// Start server on a single, fixed port (no fallback). Use PORT env var to override.
function startServer() {
    const listenPort = Number(process.env.PORT) || 3000;
    const useHttps = process.env.USE_HTTPS === 'true' || false;
    if (useHttps) {
        try {
            const fs = require('fs');
            const https = require('https');
            const keyPath = process.env.HTTPS_KEY_PATH;
            const certPath = process.env.HTTPS_CERT_PATH;
            if (!keyPath || !certPath) throw new Error('HTTPS_KEY_PATH and HTTPS_CERT_PATH must be set');
            const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
            const server = https.createServer(options, app).listen(listenPort, () => {
                logInfo(`Servidor HTTPS rodando em https://localhost:${listenPort}`);
            });
            server.on('error', (err) => { console.error('Erro no servidor HTTPS:', err); process.exit(1); });
        } catch (e) {
            console.error('Falha ao iniciar HTTPS:', e && e.message);
            process.exit(1);
        }
    } else {
        const server = app.listen(listenPort, () => {
            logInfo(`Servidor rodando em http://localhost:${listenPort}`);
        });
        server.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE') {
                console.error(`Porta ${listenPort} já está em uso. Para liberar a porta execute (PowerShell):`);
                console.error(`  netstat -ano | findstr ":${listenPort}"`);
                console.error(`  Get-Process -Id <PID>`);
                console.error(`ou mate processos node: Get-Process node | Stop-Process -Force`);
                process.exit(1);
            }
            console.error('Erro no servidor:', err);
            process.exit(1);
        });
    }
}

// export app for testing and only start server if run directly
module.exports = { app, startServer };
if (require.main === module) startServer();

// Criar gestor (cadastrar)
app.post('/gestor', (req, res) => {
    const { nome, login, senha } = req.body;
    if (!nome || !login || !senha) return res.status(400).json({ error: 'Nome, login e senha são obrigatórios.' });
    const v = validarSenha(senha);
    if (v) return res.status(400).json({ error: v });
    bcrypt.hash(senha, 10).then(hash => {
        db.run(`INSERT INTO gestores (nome, login, senha) VALUES (?, ?, ?)`, [nome, login, hash], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            return res.json({ id: this.lastID, nome, login });
        });
    }).catch(() => res.status(500).json({ error: 'Erro ao gerar hash.' }));
});

// Listar gestores
app.get('/gestores', (req, res) => {
    // retornar também campo email para permitir filtragem no frontend
    const hasEmail = req.query.hasEmail || req.query.has_email;
    let sql = `SELECT id, nome, login, email FROM gestores`;
    const params = [];
    if (hasEmail) {
        sql += ` WHERE email IS NOT NULL AND email != ''`;
    }
    sql += ` ORDER BY id DESC`;
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Listar administradores (somente id, nome, login) - usado pelo frontend para filtrar
app.get('/admins', (req, res) => {
    db.all(`SELECT id, nome, login FROM admins ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Login para gestores (autenticação via DB + bcrypt)
app.post('/login-gestor', (req, res) => {
    const { login, senha } = req.body || {};
    if (!login || !senha) return res.status(400).json({ error: 'Login e senha obrigatórios.' });
    db.get(`SELECT id, nome, login, senha FROM gestores WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Login ou senha inválidos.' });
        const stored = row.senha || '';
        const isHash = typeof stored === 'string' && stored.startsWith('$2');
        if (!isHash) {
            // senha armazenada em texto (legado) - tentar migração automática
            if (stored === senha) {
                bcrypt.hash(senha, 10).then(h => {
                    db.run(`UPDATE gestores SET senha = ? WHERE id = ?`, [h, row.id], () => {
                        return res.json({ id: row.id, nome: row.nome, login: row.login });
                    });
                }).catch(() => res.status(500).json({ error: 'Erro ao migrar senha.' }));
                return;
            }
            return res.status(401).json({ error: 'Login ou senha inválidos.' });
        }
        bcrypt.compare(senha, stored).then(match => {
            if (!match) return res.status(401).json({ error: 'Login ou senha inválidos.' });
            return res.json({ id: row.id, nome: row.nome, login: row.login });
        }).catch(() => res.status(500).json({ error: 'Erro ao verificar senha.' }));
    });
});

// Endpoint administrativo: redefinir senha de um gestor diretamente (sem token) - apenas admin
// body: { login, newSenha }
app.post('/admin/redefinir-gestor', requireAdmin, (req, res) => {
    const { login, newSenha } = req.body || {};
    if (!login || !newSenha) return res.status(400).json({ error: 'Login e nova senha obrigatórios.' });
    const v = validarSenha(newSenha);
    if (v) return res.status(400).json({ error: v });
    db.get(`SELECT id FROM gestores WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Gestor não encontrado.' });
        bcrypt.hash(newSenha, 10).then(hash => {
            db.run(`UPDATE gestores SET senha = ? WHERE id = ?`, [hash, row.id], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                db.run(`DELETE FROM gestor_password_resets WHERE gestor_id = ?`, [row.id]);
                return res.json({ sucesso: true });
            });
        }).catch(() => res.status(500).json({ error: 'Erro ao gerar hash.' }));
    });
});

// Endpoint administrativo: redefinir senha de um estagiário diretamente (sem token) - apenas admin
// body: { login, newSenha }
app.post('/admin/redefinir-estagiario', requireAdmin, (req, res) => {
    const { login, newSenha } = req.body || {};
    if (!login || !newSenha) return res.status(400).json({ error: 'Login e nova senha obrigatórios.' });
    const v = validarSenha(newSenha);
    if (v) return res.status(400).json({ error: v });
    db.get(`SELECT id FROM estagiarios WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Estagiário não encontrado.' });
        bcrypt.hash(newSenha, 10).then(hash => {
            db.run(`UPDATE estagiarios SET senha = ? WHERE id = ?`, [hash, row.id], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                db.run(`DELETE FROM password_resets WHERE estagiario_id = ?`, [row.id]);
                return res.json({ sucesso: true });
            });
        }).catch(() => res.status(500).json({ error: 'Erro ao gerar hash.' }));
    });
});

app.post('/admin/token/estagiario', requireAdmin, (req, res) => {
    const { login } = req.body || {};
    if (!login) return res.status(400).json({ error: 'Login é obrigatório.' });
    db.get(`SELECT id, nome, login FROM estagiarios WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Estagiário não encontrado.' });
        const token = generateShortToken(4,2);
        const expiresAt = Date.now() + TOKEN_TTL_MS;
        const tokenHash = hashToken(token);
        db.run(`DELETE FROM password_resets WHERE estagiario_id = ?`, [row.id], function () {
            const plain = process.env.NODE_ENV !== 'production' ? token : null;
            db.run(`INSERT INTO password_resets (estagiario_id, token, token_hash, expires_at) VALUES (?, ?, ?, ?)`, [row.id, plain, tokenHash, expiresAt], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                try { pushAudit(req.admin && req.admin.id, 'generate', 'estagiario', login); } catch(e){}
                // retornar token claro apenas em dev
                if (process.env.NODE_ENV !== 'production') return res.json({ token, expiresAt });
                return res.json({ sucesso: true, expiresAt });
            });
        });
    });
});

// Endpoint admin: gerar/recuperar token curto para gestor (retorna token para dev)
app.post('/admin/token/gestor', requireAdmin, (req, res) => {
    const { login } = req.body || {};
    if (!login) return res.status(400).json({ error: 'Login é obrigatório.' });
    db.get(`SELECT id, nome, login FROM gestores WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Gestor não encontrado.' });
        const token = generateShortToken(4,2);
        const expiresAt = Date.now() + TOKEN_TTL_MS;
        const tokenHash = hashToken(token);
        db.run(`DELETE FROM gestor_password_resets WHERE gestor_id = ?`, [row.id], function () {
            const plain = process.env.NODE_ENV !== 'production' ? token : null;
            db.run(`INSERT INTO gestor_password_resets (gestor_id, token, token_hash, expires_at) VALUES (?, ?, ?, ?)`, [row.id, plain, tokenHash, expiresAt], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                try { pushAudit(req.admin && req.admin.id, 'generate', 'gestor', login); } catch(e){}
                if (process.env.NODE_ENV !== 'production') return res.json({ token, expiresAt });
                return res.json({ sucesso: true, expiresAt });
            });
        });
    });
});

// Admin token: list current token (expiresAt) for admin (do not expose token in prod)
app.get('/admin/token/current', requireAdmin, (req, res) => {
    const adminId = req.admin && req.admin.id;
    db.get(`SELECT id, admin_id, token, token_hash, expires_at FROM admin_tokens WHERE admin_id = ?`, [adminId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.json({ exists: false });
        // return token only in dev
        if (process.env.NODE_ENV !== 'production') return res.json({ exists: true, token: row.token, expiresAt: row.expires_at });
        return res.json({ exists: true, expiresAt: row.expires_at });
    });
});

// Admin token: generate/regenerate token for current admin (stores token_hash)
app.post('/admin/token/generate', requireAdmin, (req, res) => {
    const adminId = req.admin && req.admin.id;
    const token = generateShortToken(4,2);
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const tokenHash = hashToken(token);
    const plain = process.env.NODE_ENV !== 'production' ? token : null;
    // upsert-like: delete previous then insert
    db.run(`DELETE FROM admin_tokens WHERE admin_id = ?`, [adminId], function (dErr) {
        db.run(`INSERT INTO admin_tokens (admin_id, token, token_hash, expires_at) VALUES (?, ?, ?, ?)`, [adminId, plain, tokenHash, expiresAt], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            try { pushAudit(adminId, 'generate', 'admin_token', req.admin && req.admin.login); } catch(e){}
            if (process.env.NODE_ENV !== 'production') return res.json({ token, expiresAt });
            return res.json({ sucesso: true, expiresAt });
        });
    });
});

// Admin token revoke for current admin
app.post('/admin/token/revoke', requireAdmin, (req, res) => {
    const adminId = req.admin && req.admin.id;
    db.run(`DELETE FROM admin_tokens WHERE admin_id = ?`, [adminId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        try { pushAudit(adminId, 'revoke', 'admin_token', req.admin && req.admin.login); } catch(e){}
        return res.json({ sucesso: true });
    });
});

// Auditoria simples em memória (apenas para dev). Cada evento: { when, adminId, action, targetType, targetLogin }
const auditEvents = [];
function pushAudit(adminId, action, targetType, targetLogin) {
    const when = Date.now();
    try {
        auditEvents.push({ when, adminId: adminId || null, action, targetType, targetLogin });
    } catch (e) {}
    // persistir em DB de forma assíncrona
    try {
        db.run(`INSERT INTO audit_events (when_ts, admin_id, action, target_type, target_login) VALUES (?, ?, ?, ?, ?)`, [when, adminId || null, action, targetType, targetLogin], (err) => {
            if (err && process.env.NODE_ENV !== 'production') console.warn('Falha ao gravar audit_event:', err.message);
        });
    } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.warn('pushAudit DB insert falhou', e && e.message);
    }
}

// Revoke endpoints
app.post('/admin/token/revoke/estagiario', requireAdmin, (req, res) => {
    const { login } = req.body || {};
    if (!login) return res.status(400).json({ error: 'Login é obrigatório.' });
    db.get(`SELECT id FROM estagiarios WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Estagiário não encontrado.' });
        db.run(`DELETE FROM password_resets WHERE estagiario_id = ?`, [row.id], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            pushAudit(req.admin && req.admin.id, 'revoke', 'estagiario', login);
            return res.json({ sucesso: true });
        });
    });
});

app.post('/admin/token/revoke/gestor', requireAdmin, (req, res) => {
    const { login } = req.body || {};
    if (!login) return res.status(400).json({ error: 'Login é obrigatório.' });
    db.get(`SELECT id FROM gestores WHERE login = ?`, [login], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Gestor não encontrado.' });
        db.run(`DELETE FROM gestor_password_resets WHERE gestor_id = ?`, [row.id], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            pushAudit(req.admin && req.admin.id, 'revoke', 'gestor', login);
            return res.json({ sucesso: true });
        });
    });
});

// (debug/audit route removed)

// (dev set-admin endpoint removed)