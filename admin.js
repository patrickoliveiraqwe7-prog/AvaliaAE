// admin.js - UI and fetch handlers for admin-only reset actions
const qs = id => document.getElementById(id);

const msg = (el, text, isError=false) => {
  el.textContent = text || '';
  el.style.color = isError ? 'crimson' : 'green';
}

const setAuthUI = (token) => {
  const logged = !!token;
  qs('btnLoginAdmin').disabled = logged;
  qs('btnLogoutAdmin').disabled = !logged;
  // Sempre mostrar os campos (login do admin e formulários de ação)
  // Mas desabilitar botões de ação quando não autenticado
  try { qs('login-section').style.display = ''; } catch(e) {}
  try { qs('actions-section').style.display = ''; } catch(e) {}
  // Lista de botões de ação que exigem autenticação
  const actionButtonIds = [
    'btnRequestGestor', 'btnConfirmGestor', 'btnRedefinirGestorDirect',
    'btnRequestEstagiario', 'btnConfirmEstagiario', 'btnRedefinirEstagiarioDirect'
  ];
  actionButtonIds.forEach(id => { try { const b = qs(id); if (b) b.disabled = !logged; } catch(e){} });
}

// Badge de estado discreto
function setConnectedBadge(logged, loginName) {
  try {
    let badge = document.getElementById('admin-connected-badge');
    if (!badge) {
      const container = document.createElement('div');
      container.style.display='flex'; container.style.alignItems='center'; container.style.gap='8px';
      badge = document.createElement('div'); badge.id='admin-connected-badge';
      badge.style.padding='6px 10px'; badge.style.borderRadius='999px'; badge.style.fontSize='13px'; badge.style.fontWeight='600'; badge.style.color='#fff'; badge.style.background='rgba(0,0,0,0.08)';
      container.appendChild(badge);
      const header = document.querySelector('header'); if (header) header.appendChild(container);
    }
    if (logged) {
      badge.textContent = 'Admin: ' + (loginName || 'conectado');
      badge.style.background = '#2b9f4b'; badge.style.color='#fff';
    } else {
      badge.textContent = 'Admin: não conectado';
      badge.style.background = '#b0b6bd'; badge.style.color='#fff';
    }
  } catch(e){}
}

const adminTokenKey = 'adminToken';
const getAdminToken = () => localStorage.getItem(adminTokenKey);
const setAdminToken = (t) => { if (t) localStorage.setItem(adminTokenKey, t); else localStorage.removeItem(adminTokenKey); };

const authHeaders = () => {
  const t = getAdminToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}

// Login admin (robusto: checar existência de elementos antes de usar)
if (qs('btnLoginAdmin')) {
  qs('btnLoginAdmin').addEventListener('click', async () => {
    const loginEl = qs('admin-login');
    const senhaEl = qs('admin-senha');
    const rmsg = qs('admin-msg');
    if (!loginEl || !senhaEl || !rmsg) {
      console.warn('Elementos de login admin ausentes:', { loginEl: !!loginEl, senhaEl: !!senhaEl, rmsg: !!rmsg });
      return;
    }
    const login = loginEl.value.trim();
    const senha = senhaEl.value;
    msg(rmsg, 'Entrando...');
    try {
      const res = await fetch('/login-admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, senha })
      });
      const j = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(j.error || 'Erro ao logar');
      setAdminToken(j.token);
      msg(rmsg, 'Logado como ' + (j.login || login));
      setAuthUI(j.token);
  setConnectedBadge(true, j.login || login);
    } catch(err) {
      console.error('login-admin falhou', err);
      msg(rmsg, err.message || String(err), true);
    }
  });
} else {
  console.warn('btnLoginAdmin não encontrado no DOM ao inicializar admin.js');
}

if (qs('btnLogoutAdmin')) {
  qs('btnLogoutAdmin').addEventListener('click', async () => {
    const rmsg = qs('admin-msg') || { textContent: '' };
    try {
      await fetch('/logout-admin', { method: 'POST', headers: { ...authHeaders() } });
    } catch(e){}
    setAdminToken(null);
    setAuthUI(null);
    msg(rmsg, 'Sessão encerrada');
  setConnectedBadge(false, null);
  });
} else {
  console.warn('btnLogoutAdmin não encontrado no DOM ao inicializar admin.js');
}

// Atualizar badge ao mudar UI
setConnectedBadge(false, null);

// Helper to call an endpoint and show result
const postJson = async (url, body) => {
  const headers = { 'Content-Type': 'application/json', ...authHeaders() };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(j.error || JSON.stringify(j) || 'Erro');
  return j;
}

// Gestor: request
if (qs('btnRequestGestor')) {
  qs('btnRequestGestor').addEventListener('click', async () => {
  const login = qs('gestor-login').value.trim();
  const result = qs('gestor-request-result');
  if (!login) { msg(result, 'Login do gestor é obrigatório.', true); return; }
  msg(result, 'Solicitando...');
  try {
    // Preferir endpoint admin que retorna token curto para facilitar cópia em dev
    const j = await postJson('/admin/token/gestor', { login }).catch(async (e) => {
      // fallback para fluxo anterior
      return await postJson('/gestor/password-reset/request', { login });
    });
    if (j && j.token) {
      // mostrar token com botão copiar
      result.innerHTML = '';
      const p = document.createElement('div');
      p.style.display = 'flex'; p.style.gap = '8px'; p.style.alignItems = 'center';
      const tspan = document.createElement('code'); tspan.textContent = j.token; tspan.style.fontSize='16px'; tspan.style.padding='6px 8px'; tspan.style.background='#f4f4f4'; tspan.style.borderRadius='6px';
      const copyBtn = document.createElement('button'); copyBtn.textContent='Copiar'; copyBtn.style.padding='6px 8px'; copyBtn.style.cursor='pointer';
      copyBtn.addEventListener('click', async ()=>{ try { await navigator.clipboard.writeText(j.token); msg(result, 'Token copiado para área de transferência'); } catch(e){ msg(result, 'Copiar falhou, selecione manualmente.', true); } });
      p.appendChild(tspan); p.appendChild(copyBtn);
      result.appendChild(p);
      const info = document.createElement('div'); info.textContent = 'Válido até: ' + (j.expiresAt ? new Date(j.expiresAt).toLocaleString() : '—'); result.appendChild(info);
    } else if (j && j.expiresAt) {
      msg(result, 'Solicitação registrada. Token criado (ver console do servidor em dev).');
    } else {
      msg(result, 'Solicitação registrada. Verifique seu e-mail ou administração.');
    }
  } catch(err) { console.error('gestor request erro', err); msg(result, err.message || String(err), true); }
  });
} else { console.warn('btnRequestGestor ausente'); }

// Regenerar token gestor
if (qs('btnRegenGestor')) {
  qs('btnRegenGestor').addEventListener('click', async () => {
    const login = qs('gestor-login').value.trim(); const result = qs('gestor-request-result');
    if (!login) { msg(result, 'Login do gestor obrigatório.', true); return; }
    msg(result, 'Gerando token...');
    try {
      const j = await postJson('/admin/token/gestor', { login });
      if (j && j.token) {
        result.innerHTML=''; const p = document.createElement('div'); p.style.display='flex'; p.style.gap='8px'; const tspan=document.createElement('code'); tspan.textContent=j.token; const copy=document.createElement('button'); copy.textContent='Copiar'; copy.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(j.token); msg(result,'Token copiado'); }catch(e){ msg(result,'Falha copiar',true);}}); p.appendChild(tspan); p.appendChild(copy); result.appendChild(p); const info=document.createElement('div'); info.textContent='Válido até: '+(j.expiresAt?new Date(j.expiresAt).toLocaleString():'—'); result.appendChild(info);
      }
    } catch(e){ msg(result, e.message||String(e), true); }
  });
}

// Revogar token gestor
if (qs('btnRevokeGestor')) {
  qs('btnRevokeGestor').addEventListener('click', async ()=>{
    const login = qs('gestor-login').value.trim(); const result = qs('gestor-request-result');
    if (!login) { msg(result, 'Login do gestor obrigatório.', true); return; }
    msg(result, 'Revogando...');
    try { await postJson('/admin/token/revoke/gestor', { login }); msg(result, 'Tokens revogados'); } catch(e){ msg(result, e.message||String(e), true); }
  });
}

// Gestor: confirm
if (qs('btnConfirmGestor')) {
  qs('btnConfirmGestor').addEventListener('click', async () => {
  const login = qs('gestor-login-confirm').value.trim();
  const token = qs('gestor-token-confirm').value.trim();
  const nova = qs('gestor-nova-senha').value;
  const result = qs('gestor-confirm-result');
  if (!login || !token || !nova) { msg(result, 'Login, token e nova senha são obrigatórios.', true); return; }
  msg(result, 'Confirmando...');
  try {
    const j = await postJson('/gestor/password-reset/confirm', { login, token, newSenha: nova });
    msg(result, 'Senha atualizada com sucesso');
  } catch(err) { console.error('gestor confirm erro', err); msg(result, err.message || String(err), true); }
  });
} else { console.warn('btnConfirmGestor ausente'); }

// Gestor: direct reset
if (qs('btnRedefinirGestorDirect')) {
  qs('btnRedefinirGestorDirect').addEventListener('click', async () => {
  const login = qs('gestor-login-direct').value.trim();
  const nova = qs('gestor-nova-senha-direct').value;
  const result = qs('gestor-direct-result');
  if (!login || !nova) { msg(result, 'Login e nova senha são obrigatórios.', true); return; }
  msg(result, 'Redefinindo...');
  try {
    console.log('POST /admin/redefinir-gestor', { login, newSenha: nova });
    const j = await postJson('/admin/redefinir-gestor', { login, newSenha: nova });
    msg(result, j.sucesso || j.success ? 'Senha redefinida' : JSON.stringify(j));
  } catch(err) {
    console.error('admin.redefinir-gestor erro ->', err);
    msg(result, err.message || String(err), true);
  }
  });
} else { console.warn('btnRedefinirGestorDirect ausente'); }

// Estagiário: request
if (qs('btnRequestEstagiario')) {
  qs('btnRequestEstagiario').addEventListener('click', async () => {
    const login = qs('estagiario-login').value.trim();
    const result = qs('estagiario-request-result');
    msg(result, 'Solicitando...');
    try {
      const j = await postJson('/admin/token/estagiario', { login }).catch(async (e) => {
        return await postJson('/password-reset/request', { login });
      });
      if (j && j.token) {
        result.innerHTML = '';
        const p = document.createElement('div');
        p.style.display = 'flex'; p.style.gap = '8px'; p.style.alignItems = 'center';
        const tspan = document.createElement('code'); tspan.textContent = j.token; tspan.style.fontSize='16px'; tspan.style.padding='6px 8px'; tspan.style.background='#f4f4f4'; tspan.style.borderRadius='6px';
        const copyBtn = document.createElement('button'); copyBtn.textContent='Copiar'; copyBtn.style.padding='6px 8px'; copyBtn.style.cursor='pointer';
        copyBtn.addEventListener('click', async ()=>{ try { await navigator.clipboard.writeText(j.token); msg(result, 'Token copiado para área de transferência'); } catch(e){ msg(result, 'Copiar falhou, selecione manualmente.', true); } });
        p.appendChild(tspan); p.appendChild(copyBtn);
        result.appendChild(p);
        const info = document.createElement('div'); info.textContent = 'Válido até: ' + (j.expiresAt ? new Date(j.expiresAt).toLocaleString() : '—'); result.appendChild(info);
      } else if (j && j.expiresAt) {
        msg(result, 'Solicitação registrada. Token criado (ver console do servidor em dev).');
      } else {
        msg(result, 'Solicitação registrada. Verifique seu e-mail ou administração.');
      }
    } catch(err) { msg(result, err.message || String(err), true); }
  });
} else { console.warn('btnRequestEstagiario ausente'); }

// Regenerar estagiario
if (qs('btnRegenEstagiario')) {
  qs('btnRegenEstagiario').addEventListener('click', async ()=>{
    const login = qs('estagiario-login').value.trim(); const result = qs('estagiario-request-result');
    if (!login) { msg(result, 'Login do estagiário obrigatório.', true); return; }
    msg(result, 'Gerando token...');
    try { const j = await postJson('/admin/token/estagiario', { login }); if (j && j.token) { result.innerHTML=''; const p=document.createElement('div'); p.style.display='flex'; p.style.gap='8px'; const t=document.createElement('code'); t.textContent=j.token; const c=document.createElement('button'); c.textContent='Copiar'; c.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(j.token); msg(result,'Token copiado'); }catch(e){ msg(result,'Falha copiar',true);}}); p.appendChild(t); p.appendChild(c); result.appendChild(p); const info=document.createElement('div'); info.textContent='Válido até: '+(j.expiresAt?new Date(j.expiresAt).toLocaleString():'—'); result.appendChild(info); } } catch(e){ msg(result, e.message||String(e), true); }
  });
}

// Revogar estagiario
if (qs('btnRevokeEstagiario')) {
  qs('btnRevokeEstagiario').addEventListener('click', async ()=>{
    const login = qs('estagiario-login').value.trim(); const result = qs('estagiario-request-result');
    if (!login) { msg(result, 'Login do estagiário obrigatório.', true); return; }
    msg(result, 'Revogando...');
    try { await postJson('/admin/token/revoke/estagiario', { login }); msg(result, 'Tokens revogados'); } catch(e){ msg(result, e.message||String(e), true); }
  });
}

// Estagiário: confirm
if (qs('btnConfirmEstagiario')) {
  qs('btnConfirmEstagiario').addEventListener('click', async () => {
    const login = qs('estagiario-login-confirm').value.trim();
    const token = qs('estagiario-token-confirm').value.trim();
    const nova = qs('estagiario-nova-senha').value;
    const result = qs('estagiario-confirm-result');
    msg(result, 'Confirmando...');
    try {
      const j = await postJson('/password-reset/confirm', { login, token, newSenha: nova });
      msg(result, 'Senha atualizada com sucesso');
    } catch(err) { msg(result, err.message || String(err), true); }
  });
} else { console.warn('btnConfirmEstagiario ausente'); }

// Estagiário: direct reset
if (qs('btnRedefinirEstagiarioDirect')) {
  qs('btnRedefinirEstagiarioDirect').addEventListener('click', async () => {
    const login = qs('estagiario-login-direct').value.trim();
    const nova = qs('estagiario-nova-senha-direct').value;
    const result = qs('estagiario-direct-result');
    if (!login || !nova) { msg(result, 'Login e nova senha são obrigatórios.', true); return; }
    msg(result, 'Redefinindo...');
    try {
      console.log('POST /admin/redefinir-estagiario', { login, newSenha: nova });
      const j = await postJson('/admin/redefinir-estagiario', { login, newSenha: nova });
      msg(result, j.sucesso || j.success ? 'Senha redefinida' : JSON.stringify(j));
    } catch(err) { console.error('admin.redefinir-estagiario erro ->', err); msg(result, err.message || String(err), true); }
  });
} else { console.warn('btnRedefinirEstagiarioDirect ausente'); }

// Init UI state: for segurança visual, não presumimos que um token armazenado deva ocultar os campos
setAuthUI(null);

// Diagnóstico: logar presença de elementos e estado do token
(async function validateStoredToken(){
  try {
    // First try cookie-based validation (server may set httpOnly cookie)
    try {
      const rc = await fetch('/admin/validate', { method: 'GET', credentials: 'same-origin' });
      if (rc.ok) {
        const jc = await rc.json().catch(()=>({}));
        setAuthUI(true);
        setConnectedBadge(true, jc && jc.login);
        if (jc && jc.login) msg(qs('admin-msg'), 'Logado como ' + jc.login);
        return;
      }
    } catch(e) {}
    // Fallback: check token stored in localStorage and validate via header
    const t = (function(){ try { return localStorage.getItem('adminToken'); } catch(e){ return null; } })();
    if (!t) { console.log('validateStoredToken: nenhum token armazenado'); return; }
    console.log('validateStoredToken: validando token com /admin/validate...');
    const r = await fetch('/admin/validate', { method: 'GET', headers: { 'Authorization': 'Bearer ' + t } });
    if (!r.ok) {
      console.warn('validateStoredToken: token inválido ou expirado, status', r.status);
      try { localStorage.removeItem('adminToken'); } catch(e){}
      setAuthUI(null);
      return;
    }
    const j = await r.json().catch(()=>({}));
    console.log('validateStoredToken: token válido para login', j && j.login);
    // habilitar botões de ação
    setAuthUI(t);
    setConnectedBadge(true, j && j.login);
    if (j && j.login) msg(qs('admin-msg'), 'Logado como ' + j.login);
  } catch(e) { console.error('validateStoredToken falhou', e); }
})();
