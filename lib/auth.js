const crypto = require('crypto');
const { dbInsertAdminSession, dbGetAdminSessionByHash, dbDeleteAdminSessionByHash } = require('./db');

// Leitura direta do env para manter compatibilidade (pode ser sobrescrito em callers)
const TOKEN_PEPPER = process.env.TOKEN_PEPPER || '';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '') + TOKEN_PEPPER).digest('hex');
}

function generateShortToken(groupLen = 4, groups = 2) {
  const total = groupLen * groups;
  const raw = crypto.randomBytes(Math.ceil(total * 0.6)).toString('hex');
  let alnum = raw.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (alnum.length < total) {
    alnum = (alnum + crypto.randomBytes(16).toString('hex').toUpperCase()).slice(0, total);
  } else if (alnum.length > total) {
    alnum = alnum.slice(0, total);
  }
  const parts = [];
  for (let i = 0; i < groups; i++) parts.push(alnum.slice(i * groupLen, (i + 1) * groupLen));
  return parts.join('-');
}

// In-memory cache mapping token cleartext -> { id, login, expiresAt }
const adminSessions = new Map();

function createAdminSession(adminRow, req) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + (1000 * 60 * 60 * 4); // 4 horas como antes
  const tokenHash = hashToken(token);
  const ip = req && (req.ip || req.headers['x-forwarded-for'] || (req.connection && req.connection.remoteAddress));
  const ua = req && (req.headers && req.headers['user-agent']) || null;
  dbInsertAdminSession(adminRow.id, tokenHash, expiresAt, ip, ua, (err) => {
    if (err) console.warn('Falha ao persistir admin_session', err && err.message);
  });
  adminSessions.set(token, { id: adminRow.id, login: adminRow.login, expiresAt });
  return { token, expiresAt };
}

function requireAdmin(req, res, next) {
  const hdr = req.headers['authorization'] || '';
  let token = null;
  if (hdr && hdr.startsWith('Bearer ')) token = hdr.slice(7).trim();
  else if (req.cookies && req.cookies.admin_token) token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: 'Admin Authorization required.' });
  const cached = adminSessions.get(token);
  if (cached) {
    if (Date.now() > cached.expiresAt) { adminSessions.delete(token); return res.status(401).json({ error: 'Admin token expired.' }); }
    req.admin = { id: cached.id, login: cached.login };
    return next();
  }
  const tokenHash = hashToken(token);
  dbGetAdminSessionByHash(tokenHash, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid or expired admin token.' });
    if (Date.now() > Number(row.expires_at)) {
      dbDeleteAdminSessionByHash(tokenHash, () => {});
      return res.status(401).json({ error: 'Admin token expired.' });
    }
    adminSessions.set(token, { id: row.admin_id, login: row.login, expiresAt: Number(row.expires_at) });
    req.admin = { id: row.admin_id, login: row.login };
    return next();
  });
}

module.exports = { hashToken, generateShortToken, createAdminSession, requireAdmin };
