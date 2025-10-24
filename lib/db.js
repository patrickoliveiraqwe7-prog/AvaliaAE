const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'avaliacoes.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco:', err && err.message);
    return;
  }
  // creare tables (idempotente)
  db.run(`CREATE TABLE IF NOT EXISTS avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    area TEXT,
    departamento TEXT NOT NULL,
    nota INTEGER NOT NULL,
    comentario TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS estagiarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    area TEXT,
    departamento TEXT,
    login TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estagiario_id INTEGER NOT NULL,
    token TEXT,
    token_hash TEXT,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(estagiario_id) REFERENCES estagiarios(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS gestores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    login TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    email TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    login TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS gestor_password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gestor_id INTEGER NOT NULL,
    token TEXT,
    token_hash TEXT,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(gestor_id) REFERENCES gestores(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL UNIQUE,
    token TEXT,
    token_hash TEXT,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(admin_id) REFERENCES admins(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    when_ts INTEGER NOT NULL,
    admin_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT,
    target_login TEXT
  )`);

  // lightweight migration: ensure columns that might be missing
  function ensureColumn(table, column, definition) {
    db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
      if (err) return console.warn(`PRAGMA table_info ${table} falhou:`, err && err.message);
      const found = (cols || []).some(c => c && c.name === column);
      if (!found) {
        try {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, [], (err2) => {
            if (err2) console.warn(`Falha ao adicionar coluna ${column} em ${table}:`, err2 && err2.message);
            else console.info(`Coluna ${column} adicionada em ${table}`);
          });
        } catch (e) { console.warn(`Erro ao garantir coluna ${column} em ${table}:`, e && e.message); }
      }
    });
  }

  ensureColumn('avaliacoes', 'area', 'TEXT');
  ensureColumn('estagiarios', 'email', 'TEXT');
  ensureColumn('gestores', 'email', 'TEXT');
  ensureColumn('password_resets', 'token_hash', 'TEXT');
  ensureColumn('gestor_password_resets', 'token_hash', 'TEXT');
  ensureColumn('admin_tokens', 'token_hash', 'TEXT');

  // ensure at least one admin exists (dev default)
  db.get(`SELECT COUNT(*) as c FROM admins`, [], (err, row) => {
    if (err) return console.warn('Erro ao checar admins:', err && err.message);
    if (row && row.c === 0) {
      const bcrypt = require('bcrypt');
      const defaultPass = 'NovaSenha123!';
      bcrypt.hash(defaultPass, 10).then(h => {
        db.run(`INSERT OR IGNORE INTO admins (nome, login, senha) VALUES (?, ?, ?)`, ['Administrator', 'admin', h], (e) => {
          if (e) console.warn('Falha ao criar admin default:', e && e.message);
          else console.info('Admin default criado: login=admin senha=NovaSenha123! (troque em produ\u00e7\u00e3o)');
        });
      }).catch(() => console.warn('Erro ao criar hash para admin default'));
    }
  });
});

// Helpers usados por auth
function dbInsertAdminSession(adminId, tokenHash, expiresAt, ip, userAgent, cb) {
  const createdAt = Date.now();
  db.run(`INSERT INTO admin_sessions (admin_id, token_hash, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`, [adminId, tokenHash, createdAt, expiresAt, ip || null, userAgent || null], function (err) {
    cb && cb(err, this && this.lastID);
  });
}

function dbDeleteAdminSessionByHash(tokenHash, cb) {
  db.run(`DELETE FROM admin_sessions WHERE token_hash = ?`, [tokenHash], function (err) { cb && cb(err, this && this.changes); });
}

function dbGetAdminSessionByHash(tokenHash, cb) {
  db.get(`SELECT s.id as sid, s.admin_id, s.expires_at, a.login FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`, [tokenHash], (err, row) => {
    cb && cb(err, row);
  });
}

module.exports = { db, dbInsertAdminSession, dbDeleteAdminSessionByHash, dbGetAdminSessionByHash };
