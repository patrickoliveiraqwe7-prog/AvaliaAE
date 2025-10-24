    // Autocomplete dinâmico para nome/área
    function carregarTagsEstagiarios() {
        fetch('/tags-estagiarios')
            .then(response => {
                if (!response.ok) {
                    return response.text().then(t => { throw new Error(`HTTP ${response.status} ${response.statusText} - ${t}`); });
                }
                return response.json().catch(() => null);
            })
            .then(tags => {
                if (!Array.isArray(tags)) {
                    console.warn('Resposta /tags-estagiarios inesperada, esperava array. Ignorando. Resp:', tags);
                    return;
                }
                const tagsNome = document.getElementById('tagsNome');
                const tagsArea = document.getElementById('tagsArea');
                if (tagsNome) tagsNome.innerHTML = '';
                if (tagsArea) tagsArea.innerHTML = '';
                tags.forEach(tag => {
                    if (tag && tag.nome && tagsNome) {
                        const opt = document.createElement('option');
                        opt.value = tag.nome;
                        tagsNome.appendChild(opt);
                    }
                    if (tag && tag.area && tagsArea) {
                        const opt = document.createElement('option');
                        opt.value = tag.area;
                        tagsArea.appendChild(opt);
                    }
                });
            })
            .catch(err => { console.warn('Não foi possível carregar tags:', err); });
    }

    // Modal de confirmação (criado dinamicamente)
    function criarModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card" role="dialog" aria-modal="true">
                <h3 class="modal-title"></h3>
                <div class="modal-text"></div>
                <div class="modal-actions">
                    <button class="modal-btn cancel">Cancelar</button>
                    <button class="modal-btn confirm">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        // handlers
        const btnCancel = overlay.querySelector('.modal-btn.cancel');
        const btnConfirm = overlay.querySelector('.modal-btn.confirm');
        const title = overlay.querySelector('.modal-title');
        const text = overlay.querySelector('.modal-text');
        btnCancel.addEventListener('click', () => { overlay.classList.remove('active'); overlay.dataset.result = 'cancel'; });
        btnConfirm.addEventListener('click', () => { overlay.classList.remove('active'); overlay.dataset.result = 'confirm'; });
        // close on overlay click
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.classList.remove('active'); overlay.dataset.result = 'cancel'; } });
        return { overlay, title, text, btnCancel, btnConfirm };
    }

    let modalSingleton = null;
    function abrirModalConfirmacao(opts) {
        return new Promise((resolve) => {
            if (!modalSingleton) modalSingleton = criarModal();
            const { overlay, title, text } = modalSingleton;
            title.textContent = opts.title || 'Confirmar';
            text.textContent = opts.text || '';
            overlay.querySelector('.modal-btn.confirm').textContent = opts.confirmText || 'OK';
            overlay.querySelector('.modal-btn.cancel').textContent = opts.cancelText || 'Cancelar';
            overlay.dataset.result = '';
            overlay.classList.add('active');
            // focus accessibility
            overlay.querySelector('.modal-btn.confirm').focus();
            // poll para resultado (simples)
            const interval = setInterval(() => {
                if (overlay.dataset.result) {
                    const r = overlay.dataset.result === 'confirm';
                    overlay.dataset.result = '';
                    clearInterval(interval);
                    resolve(r);
                }
            }, 80);
            // timeout fallback (segurança)
            setTimeout(() => { if (overlay.dataset.result === '') { overlay.classList.remove('active'); resolve(false); } }, 120000);
        });
    }
    carregarTagsEstagiarios();

    // Listar estagiários e permitir redefinir senha
    function carregarEstagiarios(filtroNome = '', filtroDepartamento = '') {
        fetch('http://localhost:3000/estagiarios')
            .then(response => response.json())
            .then(estagiarios => {
                const lista = document.getElementById('listaEstagiarios');
                lista.innerHTML = '';
                    let filtrados = estagiarios.filter(est => est.nome.toLowerCase().includes(filtroNome.toLowerCase()));
                    if (filtroDepartamento) {
                        filtrados = filtrados.filter(est => est.departamento.toLowerCase().includes(filtroDepartamento.toLowerCase()));
                    }
                if (filtrados.length === 0) {
                    lista.innerHTML = '<p>Nenhum estagiário encontrado.</p>';
                    return;
                }
                filtrados.forEach(est => {
                    const div = document.createElement('div');
                    div.className = 'estagiario-card';
                    div.innerHTML = `
                        <strong>${est.nome}</strong> <span style="color:#005baa">(${est.departamento || 'Sem departamento'})</span>
                    `;
                    lista.appendChild(div);
                });
                // Garante que a lista fique visível mesmo se não houver estagiários
                lista.style.display = 'block';
                // Evento para redefinir senha
                document.querySelectorAll('.btnRedefinir').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const login = this.getAttribute('data-login');
                        // if no admin token, prompt to open admin panel instead of sending request that will 401
                        if (!getAdminToken()) {
                            if (confirm('É necessário estar autenticado como administrador para solicitar tokens de gestor. Deseja abrir o painel admin para fazer login?')) {
                                window.location.href = 'admin.html';
                            }
                            return;
                        }
                        const novaSenha = prompt('Digite a nova senha para o estagiário:');
                        if (novaSenha) {
                            fetch('http://localhost:3000/redefinir-senha', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ login, novaSenha })
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.sucesso) {
                                    alert('Senha redefinida com sucesso!');
                                } else {
                                    alert(data.error || 'Erro ao redefinir senha.');
                                }
                            });
                        }
                    });
                });
                // Evento para excluir estagiário
                document.querySelectorAll('.btnExcluir').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const id = this.getAttribute('data-id');
                        if (confirm('Tem certeza que deseja excluir este estagiário?')) {
                            fetch(`http://localhost:3000/estagiario/${id}`, {
                                method: 'DELETE'
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.sucesso) {
                                    carregarEstagiarios(document.getElementById('filtroBusca').value, document.getElementById('filtroDepartamentoEstagiario').value);
                                } else {
                                    alert(data.error || 'Erro ao excluir estagiário.');
                                }
                            });
                        }
                    });
                });
            });
    }
    // Adiciona filtro de departamento na área de estagiários cadastrados
    // Exibe todos os estagiários cadastrados (nome e departamento)
    // (Handler será registrado após DOMContentLoaded)
    // Garante que os estagiários sejam carregados ao acessar a tela dos gestores
    function mostrarEstagiariosCadastrados() {
        carregarEstagiarios();
    }
    // Chama ao abrir a tela dos gestores
    // Removido evento duplicado do botão Gestores
    // Também chama ao cadastrar novo estagiário
    // Removido evento duplicado do cadastro de estagiário
    // Carrega inicialmente
    // Removido carregamento duplicado
    // Função para carregar avaliações na área do admin
    function carregarComentarios() {
        fetch('http://localhost:3000/avaliacoes')
            .then(response => response.json())
            .then(avaliacoes => {
                const listaComentariosEl = document.getElementById('listaComentarios');
                listaComentariosEl.innerHTML = '';
                if (!avaliacoes || !avaliacoes.length) {
                    const empty = document.createElement('div');
                    empty.className = 'comentario-empty';
                    empty.textContent = 'Nenhuma avaliação cadastrada ainda.';
                    listaComentariosEl.appendChild(empty);
                    return;
                }
                const grid = document.createElement('div');
                grid.className = 'comentarios-grid';
                avaliacoes.forEach((avaliacao, idx) => {
                    const card = document.createElement('div');
                    card.className = 'comentario-card';
                    const initials = (avaliacao.nome || 'E').split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase();
                    const realId = (avaliacao.id !== undefined && avaliacao.id !== null) ? avaliacao.id : (avaliacao._id !== undefined ? avaliacao._id : '');
                    card.innerHTML = `
                        <div class="comentario-header">
                            <div class="comentario-avatar">${initials}</div>
                            <div class="comentario-meta">
                                <strong>${avaliacao.nome}</strong>
                                <span class="departamento">${avaliacao.departamento || 'Sem dept.'}</span>
                            </div>
                            <div class="rating-badge">${Number(avaliacao.nota).toFixed(1)}</div>
                        </div>
                        <div class="comentario-body">${avaliacao.comentario ? avaliacao.comentario : '<em>Sem comentário.</em>'}</div>
                        <div class="comentario-actions">
                            <button class="btnRemover" data-id="${realId}" data-idx="${idx}">Remover</button>
                        </div>
                    `;
                    grid.appendChild(card);
                });
                listaComentariosEl.appendChild(grid);
                // Garante que, ao recarregar comentários (ex: após remoção), a área de comentários permaneça visível
                const comentariosSec = document.getElementById('comentariosSection');
                const avaliacaoSec = document.getElementById('avaliacaoSection');
                if (comentariosSec) comentariosSec.style.display = 'block';
                if (avaliacaoSec) avaliacaoSec.style.display = 'none';
                // utilitário para manter a visualização do gestor ativa (usado após remoções)
                function showGestorView() {
                    const dashboard = document.getElementById('dashboardGestor');
                    if (comentariosSec) comentariosSec.style.display = 'block';
                    if (avaliacaoSec) avaliacaoSec.style.display = 'none';
                    if (loginSection) loginSection.style.display = 'none';
                    if (dashboard) dashboard.style.display = 'block';
                    document.body.classList.remove('estagiario-ativo');
                    document.body.classList.add('gestor-ativo');
                }
                // Hooks para remoção com modal de confirmação
                grid.querySelectorAll('.btnRemover').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const id = this.getAttribute('data-id');
                        const idx = this.getAttribute('data-idx');
                        if (!id) {
                            alert('Esta avaliação não possui um identificador único (id). Não é possível remover via API.');
                            console.warn('Remover abortado: id ausente para avaliação index', idx);
                            return;
                        }
                        abrirModalConfirmacao({
                            title: 'Remover avaliação',
                            text: 'Tem certeza que deseja remover esta avaliação? Esta ação não poderá ser desfeita.',
                            confirmText: 'Remover',
                            cancelText: 'Cancelar'
                        }).then(confirmou => {
                            if (!confirmou) return;
                            const tryEndpoints = [`http://localhost:3000/avaliacoes/${id}`, `http://localhost:3000/avaliacao/${id}`];
                                (function tryNext(i) {
                                if (i >= tryEndpoints.length) {
                                    // todas as tentativas falharam
                                    const details = (window.__removalErrors && window.__removalErrors.join(' | ')) || 'Sem detalhes';
                                    const wantLocal = confirm('Erro ao remover avaliação no servidor.\n\nDetalhes: ' + details + '\n\nDeseja remover o card localmente mesmo assim (não afeta o servidor)?');
                                    if (wantLocal) {
                                        // remover o card correspondente ao botão clicado (índice idx)
                                        const allCards = grid.querySelectorAll('.comentario-card');
                                        const card = allCards[Number(idx)];
                                        if (card && card.parentNode) card.parentNode.removeChild(card);
                                        // garante que a tela do gestor permaneça visível mesmo após remoção local
                                        try { showGestorView(); } catch (e) { /* no-op */ }
                                    }
                                    // limpa erros coletados
                                    window.__removalErrors = [];
                                    return;
                                }
                                const url = tryEndpoints[i];
                                console.log('Tentando DELETE em', url);
                                fetch(url, { method: 'DELETE' })
                                    .then(response => {
                                        if (!response.ok) {
                                            // tenta extrair corpo para debug
                                            return response.text().then(text => {
                                                const msg = `status:${response.status} ${response.statusText} body:${text}`;
                                                window.__removalErrors = window.__removalErrors || [];
                                                window.__removalErrors.push(msg);
                                                console.warn('DELETE falhou em', url, msg);
                                                tryNext(i + 1);
                                                return null;
                                            }).catch(err => {
                                                window.__removalErrors = window.__removalErrors || [];
                                                window.__removalErrors.push(`status:${response.status} ${response.statusText} (body parse failed)`);
                                                console.warn('DELETE falhou em', url, 'status', response.status, 'e não foi possível ler o corpo');
                                                tryNext(i + 1);
                                                return null;
                                            });
                                        }
                                        return response.json().catch(() => ({}));
                                    })
                                    .then(res => {
                                        if (res === null) return; // já tentou próximo
                                        if (res.sucesso || Object.keys(res).length === 0) {
                                            console.log('Removido com sucesso via', url);
                                            // anima e remove apenas o card clicado
                                            const allCards = grid.querySelectorAll('.comentario-card');
                                            const card = allCards[Number(idx)];
                                            if (card) {
                                                card.classList.add('removing');
                                                setTimeout(() => {
                                                    if (card && card.parentNode) card.parentNode.removeChild(card);
                                                    // se ficar vazio, recarrega para mostrar a mensagem vazia
                                                    if ((grid.querySelectorAll('.comentario-card') || []).length === 0) carregarComentarios();
                                                        // mantém gestor visível após remoção
                                                        try { showGestorView(); } catch (e) { /* no-op */ }
                                                }, 300);
                                            } else {
                                                // fallback: recarrega
                                                carregarComentarios();
                                            }
                                        } else if (res.error) {
                                            // coletar erro também
                                            window.__removalErrors = window.__removalErrors || [];
                                            window.__removalErrors.push(String(res.error));
                                            alert(res.error);
                                        } else {
                                            carregarComentarios();
                                        }
                                    })
                                    .catch(err => {
                                        window.__removalErrors = window.__removalErrors || [];
                                        window.__removalErrors.push(String(err));
                                        console.error('Erro no DELETE em', url, err);
                                        tryNext(i + 1);
                                    });
                            })(0);
                        });
                    });
                });
            })
            .catch(() => {
                const listaComentariosEl = document.getElementById('listaComentarios');
                listaComentariosEl.innerHTML = '<p>Erro ao carregar avaliações.</p>';
            });
    }
    // Login do admin (handler será registrado após DOMContentLoaded)
document.addEventListener('DOMContentLoaded', function () {
    // Depuração: log para saber se o JS está rodando
    console.log('Script carregado e DOM pronto');
    // Declarar e inicializar variáveis DOM no início do carregamento
    const loginEstagiarioSection = document.getElementById('loginEstagiarioSection');
    const formLoginEstagiario = document.getElementById('formLoginEstagiario');
    const mensagemLoginEstagiario = document.getElementById('mensagemLoginEstagiario');
    const btnVoltarFormularioEstagiario = document.getElementById('btnVoltarFormularioEstagiario') || null;
    const infoEstagiarioSection = document.getElementById('infoEstagiarioSection');
    const loginSection = document.getElementById('loginSection');
    const comentariosSection = document.getElementById('comentariosSection');
    const formLogin = document.getElementById('formLogin');
    const mensagemLogin = document.getElementById('mensagemLogin');
    const btnAdminLogin = document.getElementById('btnAdminLogin');
    const btnEstagiarioLogin = document.getElementById('btnEstagiarioLogin');
    const btnLogout = document.getElementById('btnLogout');
    const btnOpenAdminPanel = document.getElementById('btnOpenAdminPanel');
    const btnLoginMenu = document.getElementById('btnLoginMenu');
    const loginMenu = document.getElementById('loginMenu');
    const menuGestor = document.getElementById('menu-gestor');
    const menuEstagiario = document.getElementById('menu-estagiario');
    const menuAdmin = document.getElementById('menu-administrador');
    const avaliacaoSection = document.getElementById('avaliacaoSection');
    const form = document.getElementById('formAvaliacao');
    const mensagem = document.getElementById('mensagem');
    const listaComentarios = document.getElementById('listaComentarios');
    const btnVoltarPrincipal = document.getElementById('btnVoltarPrincipal') || null;
    const btnVoltarPrincipalEstagiario = document.getElementById('btnVoltarPrincipalEstagiario') || null;
    // Funções de persistência da sessão do gestor
    function setGestorLogged(val) {
        try {
            if (val) localStorage.setItem('gestorLogged', '1');
            else localStorage.removeItem('gestorLogged');
        } catch (e) { console.warn('localStorage indisponível', e); }
    }
    function isGestorLogged() {
        try { return localStorage.getItem('gestorLogged') === '1'; } catch (e) { return false; }
    }
    // Função global para ativar view do gestor
    function showGestorViewGlobal() {
        if (loginSection) loginSection.style.display = 'none';
        if (avaliacaoSection) avaliacaoSection.style.display = 'none';
        if (comentariosSection) comentariosSection.style.display = 'block';
        const dashboard = document.getElementById('dashboardGestor');
        if (dashboard) dashboard.style.display = 'block';
        document.body.classList.remove('estagiario-ativo');
        document.body.classList.add('gestor-ativo');
        if (btnLogout) btnLogout.style.display = 'inline-block';
        // carrega comentários se necessário
        try { carregarComentarios(); } catch (e) { /* no-op */ }
    }
    // Se já estiver logado, restaura a view de gestor automaticamente
    if (isGestorLogged()) {
        showGestorViewGlobal();
    } else {
        if (btnLogout) btnLogout.style.display = 'none';
    }

    // Voltar para a página principal a partir do painel de login
    if (btnVoltarPrincipal) {
        btnVoltarPrincipal.addEventListener('click', () => {
            try { if (loginSection) loginSection.style.display = 'none'; } catch(e){}
            try { if (avaliacaoSection) avaliacaoSection.style.display = 'block'; } catch(e){}
            // garantir que o sobre volte a aparecer
            try { showSobre(); } catch(e){}
            document.body.classList.remove('gestor-ativo');
            // restaurar ambos os cards de login
            try { document.querySelectorAll('.login-card').forEach(c=>c.style.display='block'); } catch(e){}
        });
    }

    if (btnVoltarPrincipalEstagiario) {
        btnVoltarPrincipalEstagiario.addEventListener('click', () => {
            try { if (loginSection) loginSection.style.display = 'none'; } catch(e){}
            try { if (avaliacaoSection) avaliacaoSection.style.display = 'block'; } catch(e){}
            try { showSobre(); } catch(e){}
            document.body.classList.remove('gestor-ativo');
            try { document.querySelectorAll('.login-card').forEach(c=>c.style.display='block'); } catch(e){}
        });
    }

    // --- Admin token utilities ---
    function getAdminToken() { try { return localStorage.getItem('adminToken'); } catch(e){ return null; } }
    function setAdminToken(t) { try { if (t) localStorage.setItem('adminToken', t); else localStorage.removeItem('adminToken'); } catch(e){} }
    function authHeaders() { const t = getAdminToken(); return t ? { 'Authorization': 'Bearer ' + t } : {}; }
    // Verifica se o token admin é válido chamando /admin/validate.
    async function ensureAdminAuth() {
        // Prefer cookie-based validation (httpOnly cookie set by server) so session persists
        try {
            const r = await fetch('/admin/validate', { method: 'GET', credentials: 'same-origin' });
            if (r.ok) return true;
        } catch (e) {
            // ignore and try header fallback
        }
        const t = getAdminToken();
        if (!t) return false;
        try {
            const r = await fetch('/admin/validate', { method: 'GET', headers: { 'Authorization': 'Bearer ' + t } });
            if (!r.ok) { try { setAdminToken(null); } catch(_){}; return false; }
            return true;
        } catch (e) { try { setAdminToken(null); } catch(_){}; return false; }
    }
    
    // Esconde todas as seções principais (main views) — usar antes de mostrar apenas a desejada
    function hideAllMainSections() {
        try {
            if (avaliacaoSection) avaliacaoSection.style.display = 'none';
            if (loginEstagiarioSection) loginEstagiarioSection.style.display = 'none';
            if (loginSection) loginSection.style.display = 'none';
            if (comentariosSection) comentariosSection.style.display = 'none';
            if (infoEstagiarioSection) infoEstagiarioSection.style.display = 'none';
            if (document.getElementById('dashboardGestor')) document.getElementById('dashboardGestor').style.display = 'none';
            // always show 'sobre' by default unless explicitly hidden
            showSobre();
        } catch(e) { console.warn('hideAllMainSections erro', e); }
    }
    // (Admin login removed from index; admin authentication happens on admin.html via admin.js)
    // Ao clicar em 'Painel Admin' exigimos autenticação: se já tiver adminToken redireciona, senão mostra tela de login (área de gestores)
    if (btnOpenAdminPanel) {
        btnOpenAdminPanel.addEventListener('click', async function () {
            console.log('btnOpenAdminPanel click handler start');
            const ok = await ensureAdminAuth();
            if (ok) {
                window.location.href = 'admin.html';
                return;
            }
            // não autenticado -> mostrar tela de login de gestores para consumir credenciais do admin
            if (loginSection) {
                try { hideSobre(); } catch(e) {}
                loginSection.style.display = 'block';
                console.log('loginSection set to block by btnOpenAdminPanel');
                setTimeout(()=>{ console.log('post-show check: loginSection.style.display=', loginSection ? loginSection.style.display : 'no-el', 'computed=', loginSection ? window.getComputedStyle(loginSection).display : 'no-el'); }, 220);
                avaliacaoSection.style.display = 'none';
                comentariosSection.style.display = 'none';
                const adminLoginInput = document.getElementById('adminLogin') || document.getElementById('usuario');
                if (adminLoginInput) setTimeout(()=>{ try{ adminLoginInput.focus(); }catch(e){} }, 120);
                console.log('btnOpenAdminPanel click handler end');
            } else {
                window.location.href = 'admin.html';
            }
        });
    }

    // Menu de login (header) - abrir/fechar
    if (btnLoginMenu && loginMenu) {
        btnLoginMenu.addEventListener('click', (e) => {
            const open = loginMenu.style.display !== 'block';
            loginMenu.style.display = open ? 'block' : 'none';
            btnLoginMenu.setAttribute('aria-expanded', open ? 'true' : 'false');
            try {
                const mainEl = document.querySelector('main');
                if (open && loginMenu) {
                    const h = loginMenu.getBoundingClientRect().height + 16; // gap
                    if (mainEl) mainEl.style.marginTop = h + 'px';
                } else {
                    if (mainEl) mainEl.style.marginTop = '';
                }
            } catch (e) { /* no-op */ }
        });
        // fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!loginMenu) return;
            if (!btnLoginMenu.contains(e.target) && !loginMenu.contains(e.target)) {
                loginMenu.style.display = 'none'; btnLoginMenu.setAttribute('aria-expanded','false');
                try { const mainEl = document.querySelector('main'); if (mainEl) mainEl.style.marginTop = ''; } catch(e){}
            }
        });
    }

    // menu handlers: mostrar as seções correspondentes sem ocultá-las em seguida
    if (menuGestor) menuGestor.addEventListener('click', ()=>{
        try { hideAllMainSections(); } catch(e){}
        if (loginSection) loginSection.style.display = 'block';
        // mostrar somente o card de gestor
        try { document.querySelectorAll('.login-card').forEach(c=>c.style.display='none'); } catch(e){}
        try { const gestorCard = document.querySelector('.gestor-card'); if (gestorCard) gestorCard.style.display = 'block'; } catch(e){}
        try { loginMenu.style.display='none'; btnLoginMenu.setAttribute('aria-expanded','false'); } catch(e){}
    });
    if (menuEstagiario) menuEstagiario.addEventListener('click', ()=>{
        try { hideAllMainSections(); } catch(e){}
        // explicitly hide the evaluation form to avoid overlap
        try { if (avaliacaoSection) avaliacaoSection.style.display = 'none'; } catch(e){}
        if (loginEstagiarioSection) {
            loginEstagiarioSection.style.display = 'block';
            // hide other login cards and show estagiario card explicitly
            try { document.querySelectorAll('.login-card').forEach(c=>c.style.display='none'); } catch(e){}
            try { const estCard = document.querySelector('.estagiario-card'); if (estCard) estCard.style.display = 'block'; } catch(e){}
            // ensure it is visible in viewport and doesn't overlay other content
            setTimeout(()=>{
                try { loginEstagiarioSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e){}
            }, 120);
            try { document.body.classList.add('estagiario-ativo'); document.body.classList.remove('gestor-ativo'); } catch(e){}
        }
        try { loginMenu.style.display='none'; btnLoginMenu.setAttribute('aria-expanded','false'); } catch(e){}
    });
    if (menuAdmin) menuAdmin.addEventListener('click', ()=>{
        try { hideAllMainSections(); } catch(e){}
        if (loginSection) loginSection.style.display = 'block';
        // mostrar somente o card admin
        try { document.querySelectorAll('.login-card').forEach(c=>c.style.display='none'); } catch(e){}
        try { const adminCard = document.querySelector('.admin-card'); if (adminCard) adminCard.style.display = 'block'; } catch(e){}
        try { const adminLoginInput = document.getElementById('adminLogin'); if (adminLoginInput) setTimeout(()=>adminLoginInput.focus(),140); } catch(e){}
        try { loginMenu.style.display='none'; btnLoginMenu.setAttribute('aria-expanded','false'); } catch(e){}
    });

    // Observador: detectar quem oculta a seção de login (para debugar comportamento de desaparecer)
    try {
        const loginElObs = document.getElementById('loginSection') || document.getElementById('loginSection') || document.getElementById('loginSection');
        const targetForObserver = loginElObs || document.getElementById('loginSection') || document.getElementById('loginSection');
        const obsEl = targetForObserver || document.getElementById('loginSection') || document.getElementById('loginSection');
        if (obsEl) {
            const mo = new MutationObserver((mutations)=>{
                mutations.forEach(m => {
                    if (m.attributeName === 'style') {
                        console.log('MutationObserver: loginSection style changed ->', obsEl.style.display, 'computed=', window.getComputedStyle(obsEl).display);
                        console.trace('Trace: who changed loginSection.style?');
                    }
                });
            });
            mo.observe(obsEl, { attributes: true, attributeFilter: ['style'] });
            console.log('MutationObserver ativo para #loginSection');
        } else {
            console.log('MutationObserver: elemento #loginSection não encontrado no DOM');
        }
    } catch(e) { console.warn('Não foi possível inicializar MutationObserver para loginSection', e); }

    // Handler para o login admin inline (index.html)
    const inlineAdminBtn = document.getElementById('btnLoginAdmin');
    if (inlineAdminBtn) {
        inlineAdminBtn.addEventListener('click', async () => {
            const aLogin = document.getElementById('adminLogin');
            const aSenha = document.getElementById('adminSenha');
            const aMsg = document.getElementById('adminLoginMsg');
            if (!aLogin || !aSenha) return;
            aMsg.textContent = 'Entrando...';
            try {
                const res = await fetch('/login-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: aLogin.value.trim(), senha: aSenha.value }) });
                const j = await res.json().catch(()=>({}));
                if (!res.ok) { aMsg.style.color = 'crimson'; aMsg.textContent = j.error || 'Falha no login'; return; }
                if (j.token) {
                    try { localStorage.setItem('adminToken', j.token); } catch(e){}
                }
                aMsg.style.color = '#0a7'; aMsg.textContent = 'Login ok. Redirecionando...';
                setTimeout(()=> window.location.href = 'admin.html', 300);
            } catch (e) {
                aMsg.style.color = 'crimson'; aMsg.textContent = 'Erro de rede';
            }
        });
    }
    // Ao carregar, exibe apenas a seção de avaliação e oculta todas as outras
    if (avaliacaoSection) avaliacaoSection.style.display = 'block';
    if (loginSection) loginSection.style.display = 'none';
    if (comentariosSection) comentariosSection.style.display = 'none';
    if (loginEstagiarioSection) loginEstagiarioSection.style.display = 'none';
    if (infoEstagiarioSection) infoEstagiarioSection.style.display = 'none';
    if (document.getElementById('dashboardGestor')) document.getElementById('dashboardGestor').style.display = 'none';
    // Remove qualquer inicialização duplicada que possa conflitar
    // DASHBOARD INTERATIVO PARA GESTOR
    function renderizarDashboardGestor(avaliacoes) {
        // guarda último conjunto de avaliações para redraw em resize
        try { window.__lastAvaliacoes = avaliacoes; } catch(e) {}
        const container = document.getElementById('graficoDashboardGestorDom');
        const info = document.getElementById('infoDashboardGestor');
        if (!container || !avaliacoes) return;
        // Filtros (normalizados)
        const filtroDepartamento = (document.getElementById('filtroDashDepartamento') || { value: '' }).value.trim().toLowerCase();
        const filtroEstagiario = (document.getElementById('filtroDashEstagiario') || { value: '' }).value.trim().toLowerCase();
        let filtradas = avaliacoes.slice();
        if (filtroDepartamento) filtradas = filtradas.filter(a => (a.departamento || '').toLowerCase() === filtroDepartamento);
        if (filtroEstagiario) filtradas = filtradas.filter(a => (a.nome || '').toLowerCase().includes(filtroEstagiario));
        // Agrupa por estagiário e calcula média
        const agrupado = {};
        filtradas.forEach(a => {
            const nome = (a.nome || 'Sem nome').trim();
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(Number(a.nota) || 0);
        });
        // transforme em array para ordenar por média ou nome
        let estagiarios = Object.keys(agrupado).map(nome => ({
            nome,
            notas: agrupado[nome],
            media: (agrupado[nome].reduce((s,n)=>s+n,0) / agrupado[nome].length) || 0
        }));
        // ordenação baseada no controle
    const sortOpt = 'media_desc';
        if (sortOpt === 'media_desc') estagiarios.sort((a,b)=> b.media - a.media || a.nome.localeCompare(b.nome));
        else if (sortOpt === 'nome_asc') estagiarios.sort((a,b)=> a.nome.localeCompare(b.nome));
        const nomes = estagiarios.map(e=>e.nome);
        // Métricas
        const todasNotas = filtradas.map(a => Number(a.nota) || 0);
        const mediaGeral = todasNotas.length ? (todasNotas.reduce((s, n) => s + n, 0) / todasNotas.length) : 0;
        const maxNota = todasNotas.length ? Math.max(...todasNotas) : 0;
        const minNota = todasNotas.length ? Math.min(...todasNotas) : 0;
        function setMetricValue(cardId, value, color) {
            const card = document.getElementById(cardId);
            if (!card) return;
            const span = card.querySelector('.metric-value');
            if (span) { span.textContent = value; if (color) span.style.color = color; else span.style.color = ''; }
            else { card.textContent = String(value); }
        }
        setMetricValue('mMedia', todasNotas.length ? mediaGeral.toFixed(2) : '-');
        setMetricValue('mMax', todasNotas.length ? maxNota.toFixed(1) : '-');
        setMetricValue('mMin', todasNotas.length ? minNota.toFixed(1) : '-');
        // tendência (reutiliza média móvel + slope)
        function movingAverage(arr, windowSize) { if (!arr.length) return []; const res=[]; for (let i=0;i<arr.length;i++){ const start=Math.max(0,i-windowSize+1); const slice=arr.slice(start,i+1); res.push(slice.reduce((s,n)=>s+n,0)/slice.length);} return res; }
        function linearRegressionSlope(y){ const n=y.length; if(n<2) return 0; const x=Array.from({length:n},(_,i)=>i+1); const sumX=x.reduce((s,v)=>s+v,0); const sumY=y.reduce((s,v)=>s+v,0); const sumXY=x.reduce((s,v,i)=>s+v*y[i],0); const sumXX=x.reduce((s,v)=>s+v*v,0); const denom=(n*sumXX - sumX*sumX); if(denom===0) return 0; return (n*sumXY - sumX*sumY)/denom; }
        let tendenciaText='-'; let tendenciaColor='';
        if (todasNotas.length>=2){ const w=Math.min(5,todasNotas.length); const mm=movingAverage(todasNotas,w); const lastMM=mm[mm.length-1]; const prevMM=mm.length>1?mm[mm.length-2]:mm[0]; const diffMM=lastMM-prevMM; const slope=linearRegressionSlope(todasNotas); const eps=0.05; const slopeLabel=(Math.abs(slope)>=eps)?(slope>0?'↑':'↓'):'→'; const signMM = diffMM>eps?'↑':(diffMM<-eps?'↓':'→'); tendenciaText=`${slopeLabel} (slope ${slope.toFixed(2)}) / MM:${signMM}${Math.abs(diffMM).toFixed(2)}`; if(slope>eps) tendenciaColor='#0a8a2f'; else if(slope<-eps) tendenciaColor='#d33'; else tendenciaColor='#666'; }
        setMetricValue('mTendencia', tendenciaText, tendenciaColor);
        // Render DOM chart
        container.innerHTML = '';
        container.style.position = 'relative';
        // tooltip
        let tooltip = document.getElementById('grafTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'grafTooltip';
            tooltip.className = 'grafico-dom-tooltip';
            document.body.appendChild(tooltip);
        }
        // If no names, show placeholder
        if (nomes.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.style.width = '100%';
            placeholder.style.padding = '28px';
            placeholder.style.color = '#005baa';
            placeholder.style.fontWeight = '600';
            placeholder.textContent = 'Sem estagiários para exibir';
            container.appendChild(placeholder);
        }
        const maxValue = 10;
        estagiarios.forEach((item, i) => {
            const nome = item.nome;
            const notas = item.notas;
            const media = item.media;
            const col = document.createElement('div');
            col.className = 'grafico-dom-column';
            const bar = document.createElement('div');
            bar.className = 'grafico-dom-bar';
            // altura em percent
            const pct = Math.max(4, Math.round((media / maxValue) * 100)); // min 4% para visual
            bar.style.height = pct + '%';
            bar.dataset.nome = nome;
            bar.dataset.media = media.toFixed(2);
            // valor no topo da barra
            const val = document.createElement('div');
            val.style.padding = '6px 4px';
            val.style.fontSize = '13px';
            val.style.color = '#fff';
            val.style.fontWeight = '700';
            val.textContent = media.toFixed(1);
            // montar coluna simples (barra + label)
            bar.appendChild(val);
            const label = document.createElement('div');
            label.className = 'grafico-dom-label';
            label.textContent = nome;
            col.appendChild(bar);
            col.appendChild(label);
            container.appendChild(col);
        });
        // rodapé info
        if (info) info.textContent = `Total de avaliações: ${filtradas.length} | Estagiários: ${nomes.length}`;
        // limpa botão filtro (se existir)
        const btnLimpar = document.getElementById('btnLimparFiltro');
        if (btnLimpar) {
            btnLimpar.onclick = () => {
                const sd = document.getElementById('filtroDashDepartamento');
                const se = document.getElementById('filtroDashEstagiario');
                if (sd) sd.value = '';
                if (se) se.value = '';
                renderizarDashboardGestor(avaliacoes);
            };
        }
    }

    // Microsoft OAuth popup flow (opens auth and consumes one-time token)
    try {
        const btnMicrosoftLogin = document.getElementById('btnMicrosoftLogin');
        if (btnMicrosoftLogin) {
            btnMicrosoftLogin.addEventListener('click', function () {
                const w = 900, h = 600;
                const left = (screen.width / 2) - (w / 2);
                const top = (screen.height / 2) - (h / 2);
                const url = '/auth/microsoft?purpose=admin-login';
                const popup = window.open(url, 'ms-login', `width=${w},height=${h},top=${top},left=${left}`);
                function onMessage(e) {
                    if (!e.data || e.data.type !== 'ms-login') return;
                    const oneTime = e.data.token;
                    fetch('/auth/microsoft/consume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oneTime }) })
                        .then(r => r.json())
                        .then(j => {
                            if (j.token) {
                                try { localStorage.setItem('adminToken', j.token); } catch(e){}
                                alert('Logado como admin: ' + (j.login || 'admin'));
                                window.location.href = 'admin.html';
                            } else if (j.gestor || j.estagiario) {
                                alert('Login via Microsoft reconhecido como ' + (j.gestor ? 'gestor' : 'estagiario') + ' (' + j.login + ').');
                            } else {
                                alert('Login Microsoft concluído, mas sem conta local correspondente.');
                            }
                        }).catch(err => alert('Erro ao consumir token: ' + (err && err.message ? err.message : String(err))));
                    window.removeEventListener('message', onMessage);
                    try { popup.close(); } catch(e){}
                }
                window.addEventListener('message', onMessage);
            });
        }
    } catch(e) { console.warn('ms oauth init failed', e); }
    // --- Gestão de gestores (criar, listar, solicitar reset) ---
    // utilitárias para escapar conteúdo ao usar innerHTML
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    function escapeAttr(unsafe) {
        return escapeHtml(unsafe).replace(/"/g, '&quot;');
    }
    function carregarGestores() {
        // obter gestores e admins (para filtrar administradores que não devem aparecer aqui)
        const el = document.getElementById('listaGestores');
        if (!el) return;
        el.innerHTML = '';
    const fetchGestores = fetch('/gestores?hasEmail=1').then(r => r.json());
        const fetchAdmins = fetch('/admins').then(r => r.json()).catch(() => []);
        Promise.all([fetchGestores, fetchAdmins]).then(([rows, admins]) => {
            if (!rows || rows.length === 0) { el.innerHTML = '<p>Nenhum gestor cadastrado.</p>'; return; }
            const adminLogins = new Set((admins || []).map(a => a.login));
            // filtrar gestores que também são admins
            rows = (rows || []).filter(g => !adminLogins.has(g.login));
            // filtrar apenas gestores que têm email preenchido
            rows = rows.filter(g => g && g.email && String(g.email).trim() !== '');
            if (!rows || rows.length === 0) { el.innerHTML = '<p>Nenhum gestor com email cadastrado.</p>'; return; }
                // ordenar por nome/display e renderizar com link para o login entre parênteses
                rows.sort((a,b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
                rows.forEach(g => {
                    const div = document.createElement('div');
                    div.className = 'gestor-card';
                    // exibir nome forte e login como link azul entre parênteses, botão compacto ao lado
                    div.innerHTML = `<strong>${escapeHtml(g.nome)}</strong> <a href="#" class="gestor-login" data-login="${escapeAttr(g.login)}" style="color:#005baa">(${escapeHtml(g.login)})</a> <button class="btnSolicitarToken small" data-login="${escapeAttr(g.login)}">Solicitar token</button>`;
                    el.appendChild(div);
                });
                    // conectar eventos aos botões e também aos links de login para solicitar token
                    el.querySelectorAll('.btnSolicitarToken, .gestor-login').forEach(btn => {
                        btn.addEventListener('click', async function () {
                            const login = this.getAttribute('data-login');
                            const ok = await ensureAdminAuth();
                            if (!ok) {
                                if (confirm('É necessário autenticar como administrador para solicitar tokens de gestor. Deseja abrir o painel admin para fazer login?')) window.location.href = 'admin.html';
                                return;
                            }
                            const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
                            fetch('/gestor/password-reset/request', { method: 'POST', headers, body: JSON.stringify({ login }) })
                                .then(async r => {
                                    const txt = await r.text();
                                    let json = null;
                                    try { json = txt ? JSON.parse(txt) : null; } catch(e) { json = null; }
                                    if (!r.ok) {
                                        if (r.status === 401) throw new Error('Ação não autorizada. Faça login como administrador para solicitar resets.');
                                        throw new Error((json && json.error) ? json.error : (txt || r.statusText));
                                    }
                                    return json || {};
                                })
                                .then(data => {
                                    if (data.error) { alert('Erro: ' + data.error); return; }
                                    alert('Solicitação registrada. Verifique o e-mail do gestor ou o console do servidor (dev).');
                                }).catch(err => {
                                    const msg = err && err.message ? err.message : String(err);
                                    if (msg.includes('Ação não autorizada')) {
                                        if (confirm(msg + '\n\nDeseja abrir o painel de administração para fazer login?')) window.location.href = 'admin.html';
                                    } else {
                                        alert('Erro na solicitação: ' + msg);
                                    }
                                });
                        });
                    });
            }).catch(() => { const el = document.getElementById('listaGestores'); if (el) el.innerHTML = '<p>Erro ao carregar gestores.</p>'; });
    }

    // carregar administradores e mostrar um rótulo 'Administrador'
    function carregarAdmins() {
        fetch('/admins')
            .then(r => r.json())
            .then(rows => {
                const el = document.getElementById('listaAdmins');
                if (!el) return;
                el.innerHTML = '';
                if (!rows || rows.length === 0) { el.innerHTML = '<p>Nenhum administrador cadastrado.</p>'; return; }
                rows.forEach(a => {
                    const div = document.createElement('div');
                    div.className = 'admin-card';
                    div.innerHTML = `<strong>${escapeHtml(a.nome)}</strong> <span style="color:#005baa">(${escapeHtml(a.login)})</span> <span style="background:#ffd; padding:4px 8px; border-radius:6px; margin-left:8px; font-size:0.85em;">Administrador</span>`;
                    el.appendChild(div);
                });
            }).catch(() => { const el = document.getElementById('listaAdmins'); if (el) el.innerHTML = '<p>Erro ao carregar administradores.</p>'; });
    }

    // Form handler cadastro gestor
    const formCadastroGestor = document.getElementById('formCadastroGestor');
    const mensagemCadastroGestor = document.getElementById('mensagemCadastroGestor');
    if (formCadastroGestor) {
        formCadastroGestor.addEventListener('submit', function (e) {
            e.preventDefault();
            const nome = document.getElementById('nomeGestor').value.trim();
            const login = document.getElementById('loginGestor').value.trim();
            const senha = document.getElementById('senhaGestor').value;
            if (!nome || !login || !senha) { mensagemCadastroGestor.textContent = 'Preencha todos os campos.'; mensagemCadastroGestor.style.color = 'red'; return; }
            mensagemCadastroGestor.textContent = 'Cadastrando...'; mensagemCadastroGestor.style.color = '#005baa';
            fetch('/gestor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, login, senha }) })
                .then(r => r.json())
                .then(data => {
                    if (data.error) { mensagemCadastroGestor.textContent = data.error; mensagemCadastroGestor.style.color = 'red'; return; }
                    mensagemCadastroGestor.textContent = 'Gestor cadastrado com sucesso!'; mensagemCadastroGestor.style.color = '#060';
                    setTimeout(() => { mensagemCadastroGestor.textContent = ''; document.getElementById('nomeGestor').value=''; document.getElementById('loginGestor').value=''; document.getElementById('senhaGestor').value=''; carregarGestores(); }, 1200);
                }).catch(err => { mensagemCadastroGestor.textContent = 'Erro ao cadastrar.'; mensagemCadastroGestor.style.color = 'red'; });
        });
    }

    // Ao abrir a aba de cadastro, também carregamos gestores
    const tabGestoresBtn = document.getElementById('tabGestores');
    if (tabGestoresBtn) {
        tabGestoresBtn.addEventListener('click', () => {
            // mostrar conteúdo de cadastro
            const cadastro = document.getElementById('cadastroContent');
            if (cadastro) cadastro.style.display = 'block';
            // mostrar apenas a seção de gestores dentro do cadastro
            try {
                const estSection = document.getElementById('cadastroEstagiarioSection');
                const gestSection = document.getElementById('cadastroGestorSection');
                if (estSection) estSection.style.display = 'none';
                if (gestSection) gestSection.style.display = '';
            } catch (e) { /* no-op */ }
            // carregar gestores
            carregarGestores();
            carregarAdmins();
        });
    }
    // Debounce utilitário
    function debounce(fn, wait) {
        let t = null;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

        // Redesenha gráficos ao redimensionar a janela (debounced)
        const handleWindowResize = debounce(()=>{
            // redesenha dashboard
            try {
                if (window.__lastAvaliacoes) {
                    renderizarDashboardGestor(window.__lastAvaliacoes);
                }
            } catch(e){ console.warn('Erro ao redesenhar dashboard:', e); }

            // redesenha detalhe do estagiário
            try {
                if (window.__lastDetalheNotas) {
                    if (typeof window.desenharGraficoDetalheEstagiario === 'function') {
                        window.desenharGraficoDetalheEstagiario(window.__lastDetalheNotas);
                    }
                }
            } catch(e){ console.warn('Erro ao redesenhar grafico detalhe:', e); }

            // redesenha painel de informações do estagiário, se aberto
            try {
                if (window.__lastEstagiarioInfo && typeof mostrarInfoEstagiario === 'function'){
                    mostrarInfoEstagiario(window.__lastEstagiarioInfo);
                }
            } catch(e){ console.warn('Erro ao redesenhar painel estagiario:', e); }
        }, 200);

        window.addEventListener('resize', handleWindowResize);

    // Atualiza dashboard ao mudar filtros (usando debounce)
    function atualizarDashboardGestor(avaliacoes) {
        const filtroDept = document.getElementById('filtroDashDepartamento');
        const filtroEst = document.getElementById('filtroDashEstagiario');
        const debounced = debounce(() => renderizarDashboardGestor(avaliacoes), 180);
        // inicial render
        renderizarDashboardGestor(avaliacoes);
    if (filtroDept) filtroDept.addEventListener('change', debounced);
    if (filtroEst) filtroEst.addEventListener('input', debounced);
    // Ordenação fixa: média (maior → menor)
        // redimensionamento: re-render quando a área muda (debounced)
        const debouncedResize = debounce(() => renderizarDashboardGestor(avaliacoes), 220);
        window.addEventListener('resize', debouncedResize);
        // cleanup opcional: se precisar remover listeners futuramente, podemos armazenar referências
    }
    // Carrega avaliações e inicializa dashboard
    if (document.getElementById('dashboardGestor')) {
        fetch('http://localhost:3000/avaliacoes')
            .then(response => response.json())
            .then(avaliacoes => {
                renderizarDashboardGestor(avaliacoes);
                atualizarDashboardGestor(avaliacoes);
            });
    }
    // Função para desenhar gráfico de barras das avaliações do gestor
    window.desenharGraficoNotasGestor = function(avaliacoes) {
        try { window.__lastNotasGestor = avaliacoes; } catch(e) {}
        const canvas = document.getElementById('graficoNotasGestor');
        if (!canvas || !avaliacoes || !avaliacoes.length) return;
        // DPI handling
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 480;
        const height = canvas.clientHeight || 200;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0,0,width,height);
        // Cores Rede Bahia
        const cores = ['#005baa','#0077cc','#00b2e3','#00c3a0','#f7b731','#e94e77','#f9a602','#eaf6ff'];
        // Agrupa por estagiário
        const agrupado = {};
        avaliacoes.forEach(a => {
            const nome = a.nome || 'Sem nome';
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(Number(a.nota) || 0);
        });
        const nomes = Object.keys(agrupado);
        const largura = 32;
        const espacamento = 18;
        nomes.forEach((nome, i) => {
            const notas = agrupado[nome];
            const media = notas.reduce((soma, n) => soma + n, 0) / notas.length;
            const x = i * (largura + espacamento) + 36;
            const y = height - (media / 10) * (height - 40) - 32;
            ctx.fillStyle = cores[i % cores.length];
            ctx.fillRect(x, y, largura, height - y - 32);
            ctx.fillStyle = '#222';
            ctx.font = 'bold 13px Roboto';
            ctx.fillText(nome, x - 4, height - 12);
            ctx.fillText(media.toFixed(1), x + 6, y - 8);
        });
        // Eixo X
        ctx.strokeStyle = '#005baa';
        ctx.beginPath();
        ctx.moveTo(24, height - 32);
        ctx.lineTo(width - 24, height - 32);
        ctx.stroke();
    }
    // Chama o gráfico do gestor após carregar avaliações
    function carregarComentariosGestor() {
        fetch('http://localhost:3000/avaliacoes')
            .then(response => response.json())
            .then(avaliacoes => {
                window.desenharGraficoNotasGestor(avaliacoes);
                // ...continua exibição dos comentários...
            });
    }
    if (document.getElementById('graficoNotasGestor')) {
        carregarComentariosGestor();
    }
    // Função para buscar avaliações do estagiário logado e exibir média/feedback
    function mostrarInfoEstagiario(usuario) {
        try { window.__lastEstagiarioInfo = usuario; } catch(e) {}
        fetch('http://localhost:3000/avaliacoes')
            .then(response => response.json())
            .then(avaliacoes => {
                const minhasAvaliacoes = avaliacoes.filter(a => a.nome.toLowerCase() === usuario.toLowerCase());
                let html = '';
                if (minhasAvaliacoes.length === 0) {
                    html += '<p>Você ainda não recebeu avaliações.</p>';
                } else {
                    const media = (minhasAvaliacoes.reduce((acc, cur) => acc + Number(cur.nota), 0) / minhasAvaliacoes.length).toFixed(2);
                    html += `<p><strong>Média das notas:</strong> ${media}</p>`;
                    html += '<h3>Comentários recebidos:</h3>';
                    // container para comentários com paginação
                    html += '<div id="infoCommentsContainer"></div>';
                    html += '<div id="infoCommentsPager" style="margin-top:8px;"></div>';
                    // Mensagens motivacionais variadas
                    const motivacionais = [
                        'Seu esforço está sendo notado! Continue buscando o seu melhor.',
                        'Você tem potencial para ir além. Acredite e siga evoluindo!',
                        'Cada desafio é uma oportunidade de crescimento. Parabéns pelo empenho!',
                        'Seu trabalho faz diferença! Continue com essa dedicação.',
                        'A persistência é o caminho do sucesso. Não desista!',
                        'Você está construindo uma trajetória de sucesso. Continue assim!',
                        'Seu desenvolvimento é visível. Mantenha o foco e a motivação!',
                        'A cada avaliação, você mostra evolução. Orgulhe-se do seu progresso!',
                        'Continue aprendendo e se superando. O futuro é promissor!',
                        'Seu comprometimento inspira quem está ao seu redor. Parabéns!',
                        'Você é exemplo de dedicação! Continue inspirando.',
                        'A Rede Bahia valoriza seu crescimento. Siga em frente!',
                        'Seu talento é reconhecido. Continue brilhando!',
                        'Você faz parte do nosso sucesso. Obrigado pelo empenho!',
                        'Seu futuro é promissor. Continue investindo em você!',
                        'A cada dia, você se supera. Parabéns pela evolução!',
                        'Seu trabalho é essencial para a equipe. Continue assim!',
                        'A Rede Bahia acredita no seu potencial!',
                        'Você está construindo uma carreira de sucesso. Siga firme!',
                        'Seu esforço é inspiração para todos. Continue crescendo!'
                    ];
                    // Seleciona mensagem motivacional aleatória diferente da última
                    let motivacional = motivacionais[Math.floor(Math.random() * motivacionais.length)];
                    if (window.ultimaMensagemMotivacional === motivacional) {
                        motivacional = motivacionais[(motivacionais.indexOf(motivacional)+1)%motivacionais.length];
                    }
                    window.ultimaMensagemMotivacional = motivacional;
                    // Feedback técnico
                    let feedbacks = [];
                    const comentarios = minhasAvaliacoes.map(a => a.comentario).join(' ').toLowerCase();
                    if (comentarios.includes('atraso') || comentarios.includes('pontualidade')) {
                        feedbacks.push('Procure melhorar sua pontualidade.');
                    }
                    if (comentarios.includes('comunicação') || comentarios.includes('comunicar')) {
                        feedbacks.push('Aprimore sua comunicação com a equipe.');
                    }
                    if (comentarios.includes('proatividade')) {
                        feedbacks.push('Busque ser mais proativo nas tarefas.');
                    }
                    if (comentarios.includes('organização')) {
                        feedbacks.push('Tente ser mais organizado no dia a dia.');
                    }
                    if (comentarios.includes('liderança')) {
                        feedbacks.push('Desenvolva sua liderança e inspire outros.');
                    }
                    if (comentarios.includes('criatividade')) {
                        feedbacks.push('Use sua criatividade para inovar nas tarefas.');
                    }
                    if (comentarios.includes('colaboração')) {
                        feedbacks.push('Colabore mais com o time, juntos vão mais longe.');
                    }
                    let feedback = feedbacks.length > 0 ? feedbacks.join(' ') : motivacional;
                    html += `
                        <div style="margin-top:24px;padding:12px;background:#eaf6ff;border-radius:8px;">
                            <strong>Dashboard de Avaliações</strong><br>
                            <canvas id="graficoNotasEstagiario" width="320" height="120" style="background:#fff;border-radius:8px;box-shadow:0 1px 4px #005baa22;margin-top:8px;"></canvas>
                            Total de avaliações recebidas: <b>${minhasAvaliacoes.length}</b><br>
                            Média das notas: <b>${media}</b><br>
                            Última nota recebida: <b>${minhasAvaliacoes[minhasAvaliacoes.length-1].nota}</b><br>
                            <div style="margin-top:16px;">
                                <strong>Feedback para você:</strong> <span style="color:#005baa">${feedback}</span>
                            </div>
                        </div>
                    `;
                    setTimeout(() => desenharGraficoNotasEstagiario(minhasAvaliacoes), 100);
                    // renderizar comentários paginados (cliente)
                    setTimeout(() => {
                        try {
                            const container = document.getElementById('infoCommentsContainer');
                            const pagerEl = document.getElementById('infoCommentsPager');
                            if (!container) return;
                            const comments = minhasAvaliacoes.map(a => ({ nota: a.nota, comentario: a.comentario || 'Sem comentário.', id: a.id }));
                            // pegar até 6 últimos
                            comments.sort((a,b)=> (b.id||0) - (a.id||0));
                            const last5 = comments.slice(0,6);
                            container.innerHTML = '';
                            const wrap = document.createElement('div'); wrap.className = 'comentarios-cards';
                            last5.forEach(c => {
                                const card = document.createElement('div'); card.className = 'comentario-card-mini';
                                card.innerHTML = `<div class="comentario-top"><strong>Nota ${c.nota}</strong></div><div class="comentario-body">${c.comentario}</div>`;
                                wrap.appendChild(card);
                            });
                            container.appendChild(wrap);
                            if (pagerEl) pagerEl.innerHTML = '';
                        } catch (e) { console.warn('Erro ao renderizar comentários paginados', e); }
                    }, 150);
                }
                document.getElementById('infoEstagiario').innerHTML = html;
    });
    }
    // Botão de voltar na página do estagiário
    const btnVoltarEstagiario = document.getElementById('btnVoltarEstagiario');
    if (btnVoltarEstagiario) {
        btnVoltarEstagiario.addEventListener('click', function () {
            infoEstagiarioSection.style.display = 'none';
            avaliacaoSection.style.display = 'block';
            try { showSobre(); } catch (e) { /* no-op */ }
        });
    }
    // Função para desenhar gráfico de notas do estagiário
    window.desenharGraficoNotasEstagiario = function(avaliacoes) {
        try { window.__lastNotasEstagiario = avaliacoes; } catch(e) {}
        const canvas = document.getElementById('graficoNotasEstagiario');
        if (!canvas || !avaliacoes || !avaliacoes.length) return;
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 320;
        const height = canvas.clientHeight || 120;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0,0,width,height);
        // Cores Rede Bahia
        const corBarra = '#005baa';
        const corBarra2 = '#0077cc';
        // Dados
        const notas = avaliacoes.map(a => Number(a.nota) || 0);
        const maxNota = 10;
        const largura = Math.max(18, Math.floor((width - 48) / notas.length) - 8);
        const espacamento = 12;
        notas.forEach((nota, i) => {
            const x = i * (largura + espacamento) + 24;
            const y = height - (nota / maxNota) * (height - 40) - 24;
            ctx.fillStyle = i % 2 === 0 ? corBarra : corBarra2;
            ctx.fillRect(x, y, largura, height - y - 24);
            ctx.fillStyle = '#222';
            ctx.font = 'bold 14px Roboto';
            ctx.fillText(nota, x + 8, y - 6);
        });
        // Eixo X
        ctx.strokeStyle = '#005baa';
        ctx.beginPath();
        ctx.moveTo(16, height - 24);
        ctx.lineTo(width - 16, height - 24);
        ctx.stroke();
    }
    // Função para desenhar gráfico de detalhe (individual) no painel
    window.desenharGraficoDetalheEstagiario = function(notas) {
        const canvas = document.getElementById('graficoDetalheEstagiario');
        if (!canvas) return;
    // ajustar DPI e resetar transform (evita acumulação de scale)
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 160;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    // define transformação para mapear 1 unit -> 1 css px
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // limpar (em pixels CSS)
    ctx.clearRect(0, 0, width, height);
        if (!notas || !notas.length) {
            ctx.fillStyle = '#f5f9fc';
            ctx.fillRect(0,0,width,height);
            return;
        }
        const maxNota = 10;
        const paddingTop = 20; // espaço no topo para labels
        const padding = 12; // padding lateral e inferior
        const barWidth = Math.max(18, (width - padding*2) / notas.length - 8);
        const espac = 8;
        notas.forEach((n, i) => {
            const x = padding + i * (barWidth + espac);
            const h = ((Number(n) || 0) / maxNota) * (height - (padding + paddingTop));
            const y = height - padding - h;
            ctx.fillStyle = '#0077cc';
            ctx.fillRect(x, y, barWidth, h);
            ctx.fillStyle = '#033';
            ctx.font = 'bold 12px Roboto';
            // posição do label acima da barra, mas não ultrapassar o paddingTop
            const labelY = Math.max(paddingTop - 4, y - 6);
            ctx.fillText(String(n), x + 4, labelY);
            ctx.font = '11px Roboto';
            ctx.fillText(`Nota ${i+1}`, x + 2, height - 4);
        });
    }
    // logs rápidos
    console.log('btnAdminLogin:', btnAdminLogin);
    console.log('btnEstagiarioLogin:', btnEstagiarioLogin);

    // Botão para abrir login do admin
    if (btnAdminLogin) {
        btnAdminLogin.addEventListener('click', function () {
            console.log('Botão Gestores clicado');
            // Exibe apenas a área de login dos gestores
            hideAllMainSections();
            if (loginSection) { try { hideSobre(); } catch(e){}; loginSection.style.display = 'block'; }
            // Mostrar somente o card do gestor (esconder admin)
            try {
                const adminCard = document.querySelector('.admin-card');
                const gestorCard = document.querySelector('.gestor-card');
                if (adminCard) adminCard.style.display = 'none';
                if (gestorCard) gestorCard.style.display = 'block';
                // foco no campo de usuário do gestor
                const userInput = document.getElementById('usuario'); if (userInput) setTimeout(()=>userInput.focus(),120);
            } catch(e){}
            // Fallback visual
            document.body.classList.remove('estagiario-ativo');
            document.body.classList.add('gestor-ativo');
        });
    } else {
        alert('Botão Gestores não encontrado no DOM.');
    }

    // Handler do login admin (campo adicionado no HTML)
    const btnLoginAdmin = document.getElementById('btnLoginAdmin');
    const adminLoginMsg = document.getElementById('adminLoginMsg');
    if (btnLoginAdmin) {
        btnLoginAdmin.addEventListener('click', ()=>{
            const login = document.getElementById('adminLogin').value.trim();
            const senha = document.getElementById('adminSenha').value;
            if (!login || !senha) { if (adminLoginMsg) { adminLoginMsg.textContent='Informe login e senha.'; adminLoginMsg.style.color='red'; } return; }
            if (adminLoginMsg) { adminLoginMsg.textContent='Autenticando...'; adminLoginMsg.style.color='#005baa'; }
            fetch('/login-admin', { method: 'POST', headers: Object.assign({'Content-Type':'application/json'}, {}), body: JSON.stringify({ login, senha }) })
                .then(async r=>{ const t = await r.text(); let p=null; try{ p= t ? JSON.parse(t) : null }catch(e){ p=null; } if(!r.ok) throw new Error((p && p.error) ? p.error : (t || r.statusText)); return p; })
                .then(data => { if (data && data.token) { setAdminToken(data.token); if (adminLoginMsg) { adminLoginMsg.textContent='Admin autenticado.'; adminLoginMsg.style.color='#060'; } } else { if (adminLoginMsg) { adminLoginMsg.textContent='Falha ao autenticar admin.'; adminLoginMsg.style.color='red'; } } })
                .catch(err=>{ if (adminLoginMsg) { adminLoginMsg.textContent = 'Erro: ' + (err && err.message ? err.message : String(err)); adminLoginMsg.style.color='red'; } });
        });
    }

    // Tab controls inside dashboardGestor (Visão Geral / Cadastro)
    const tabVisao = document.getElementById('tabVisao');
    const tabCadastro = document.getElementById('tabCadastro');
    const dashboardContent = document.getElementById('dashboardContent');
    const cadastroContent = document.getElementById('cadastroContent');
    function activateTab(tab) {
        const estagiariosContent = document.getElementById('estagiariosContent');
        // normaliza estado: esconde todos
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (cadastroContent) cadastroContent.style.display = 'none';
        if (estagiariosContent) estagiariosContent.style.display = 'none';
        // limpa classes ativas
        if (tabVisao) tabVisao.classList.remove('btn-active');
        if (tabCadastro) tabCadastro.classList.remove('btn-active');
        if (typeof tabEstagiarios !== 'undefined' && tabEstagiarios) tabEstagiarios.classList.remove('btn-active');

        if (tab === 'visao') {
            if (dashboardContent) dashboardContent.style.display = '';
            if (tabVisao) tabVisao.classList.add('btn-active');
        } else if (tab === 'cadastro') {
            if (cadastroContent) cadastroContent.style.display = '';
            // por padrão mostrar apenas o formulário de cadastro de estagiário
            try {
                const estSection = document.getElementById('cadastroEstagiarioSection');
                const gestSection = document.getElementById('cadastroGestorSection');
                if (estSection) estSection.style.display = '';
                if (gestSection) gestSection.style.display = 'none';
            } catch (e) { /* no-op */ }
            if (tabCadastro) tabCadastro.classList.add('btn-active');
        } else if (tab === 'estagiarios') {
            if (estagiariosContent) estagiariosContent.style.display = '';
            if (typeof tabEstagiarios !== 'undefined' && tabEstagiarios) tabEstagiarios.classList.add('btn-active');
        }
    }
    if (tabVisao) tabVisao.addEventListener('click', ()=>activateTab('visao'));
    if (tabCadastro) tabCadastro.addEventListener('click', ()=>activateTab('cadastro'));
    const tabEstagiarios = document.getElementById('tabEstagiarios');
    if (tabEstagiarios) tabEstagiarios.addEventListener('click', ()=>{
        activateTab('estagiarios');
        // carregar lista de estagiários para gerenciamento quando a aba for ativada
        carregarGerenciarEstagiarios();
    });

    // carregar lista de estagiários para gerenciamento (na aba Estagiários)
    function carregarGerenciarEstagiarios() {
        const target = document.getElementById('gerenciarEstagiariosList');
        if (!target) return;
        target.innerHTML = '<p>Carregando estagiários...</p>';
        // usa base da página atual para evitar problemas de host/porta
        const base = window.location.origin || (window.location.protocol + '//' + window.location.host);
        const url = base + '/estagiarios';
        console.log('carregarGerenciarEstagiarios: GET', url);
        fetch(url, { cache: 'no-store' })
            .then(r=>{
                if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
                return r.json();
            })
            .then(list=>{
                if (!Array.isArray(list) || list.length === 0) { target.innerHTML = '<p>Nenhum estagiário cadastrado.</p>'; return; }
                const wrap = document.createElement('div'); wrap.className = 'estagiario-list';
                target.innerHTML = ''; target.appendChild(wrap);

                // paginação cliente
                const pageSize = 8;
                let currentPage = 1;
                function renderPage(page) {
                    currentPage = page;
                    wrap.innerHTML = '';
                    const start = (page - 1) * pageSize;
                    const pageItems = list.slice(start, start + pageSize);
                    pageItems.forEach(est => {
                        const item = document.createElement('div'); item.className = 'estagiario-item';
                        const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${est.nome || est.login || 'Sem nome'} (${est.departamento || 'Sem dept.'})`;
                        const actions = document.createElement('div'); actions.className = 'actions';
                        const btnRem = document.createElement('button'); btnRem.textContent = 'Remover'; btnRem.className = 'btn-remover';
                        btnRem.addEventListener('click', ()=>{
                            abrirModalConfirmacao({ title: 'Remover estagiário', text: `Remover ${est.nome || est.login || 'este estagiário'}?`, confirmText: 'Remover', cancelText: 'Cancelar' })
                                .then(ok => {
                                    if (!ok) return;
                                    const id = est.id || est._id || est.login;
                                    const delUrl = base + '/estagiario/' + encodeURIComponent(id);
                                    console.log('Removendo estagiário', id, '->', delUrl);
                                    fetch(delUrl, { method: 'DELETE' })
                                        .then(res => {
                                            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
                                            return res.json().catch(() => ({}));
                                        })
                                        .then(() => {
                                            // recarregar lista e dashboard
                                            carregarGerenciarEstagiarios();
                                            fetch(base + '/avaliacoes').then(r => r.json()).then(av => { try { renderizarDashboardGestor(av); } catch (e) { } });
                                        })
                                        .catch(err => { console.error('Erro ao remover estagiário:', err); abrirModalConfirmacao({ title: 'Erro', text: 'Erro ao remover estagiário. Veja console para detalhes.', confirmText: 'OK' }); });
                                });
                        });
                        actions.appendChild(btnRem);
                        item.appendChild(meta); item.appendChild(actions); wrap.appendChild(item);
                    });

                    // pager
                    const totalPages = Math.ceil(list.length / pageSize);
                    const pager = document.createElement('div'); pager.className = 'estagiario-pager';
                    if (totalPages > 1) {
                        const prev = document.createElement('button'); prev.textContent = '<'; prev.className = 'pager-btn'; prev.disabled = page === 1;
                        prev.addEventListener('click', () => renderPage(Math.max(1, page - 1)));
                        pager.appendChild(prev);
                        for (let p = 1; p <= totalPages; p++) {
                            const b = document.createElement('button'); b.textContent = String(p); b.className = 'pager-btn'; if (p === page) b.classList.add('active');
                            b.addEventListener('click', () => renderPage(p));
                            pager.appendChild(b);
                        }
                        const next = document.createElement('button'); next.textContent = '>'; next.className = 'pager-btn'; next.disabled = page === totalPages;
                        next.addEventListener('click', () => renderPage(Math.min(totalPages, page + 1)));
                        pager.appendChild(next);
                    }
                    // remove existing pager e adiciona novo
                    const existingPager = target.querySelector('.estagiario-pager'); if (existingPager) existingPager.remove();
                    target.appendChild(pager);
                }

                renderPage(1);
            })
            .catch(err=>{
                console.error('carregarGerenciarEstagiarios falhou:', err);
                target.innerHTML = '';
                const msg = document.createElement('div');
                msg.innerHTML = `<p>Erro ao carregar estagiários: ${String(err.message || err)}</p>`;
                const retry = document.createElement('button'); retry.textContent = 'Tentar novamente'; retry.className = 'btn-admin-login';
                retry.addEventListener('click', ()=> carregarGerenciarEstagiarios());
                msg.appendChild(retry);
                target.appendChild(msg);
            });
    }
    // set default
    activateTab('visao');

    // carregar lista de estagiários para gerenciamento foi removido conforme solicitado

    if (btnEstagiarioLogin) {
        btnEstagiarioLogin.addEventListener('click', function () {
            console.log('Botão Estagiário clicado');
            // Exibe apenas a área de login dos estagiários
            hideAllMainSections();
            if (loginEstagiarioSection) loginEstagiarioSection.style.display = 'block';
            if (document.getElementById('dashboardGestor')) document.getElementById('dashboardGestor').style.display = 'none';
            // esconder a seção 'sobre' quando entrar na área do estagiário
            try { hideSobre(); } catch (e) { /* no-op */ }
            // esconder cartões de gestor/admin enquanto estamos em tela de estagiário
            try { document.querySelectorAll('.login-card').forEach(c=>c.style.display='none'); } catch(e){}
            // Fallback visual
            document.body.classList.remove('gestor-ativo');
            document.body.classList.add('estagiario-ativo');
        });
    } else {
        alert('Botão Estagiário não encontrado no DOM.');
    }

    // Esconde/exibe a seção 'sobre' e o bloco de instruções de uso
    const sobreSection = document.querySelector('.sobre');
    const instrucoesBlock = document.querySelector('.instrucoes-uso');
    function hideSobre() { if (sobreSection) sobreSection.style.display = 'none'; if (instrucoesBlock) instrucoesBlock.style.display = 'none'; }
    function showSobre() { if (sobreSection) sobreSection.style.display = 'block'; if (instrucoesBlock) instrucoesBlock.style.display = 'block'; }

    // Login do admin (handler registrado dentro do DOMContentLoaded)
    if (formLogin) {
        formLogin.addEventListener('submit', function (e) {
            e.preventDefault();
            const usuario = document.getElementById('usuario').value.trim();
            const senha = document.getElementById('senha').value.trim();
            if (!usuario || !senha) {
                if (mensagemLogin) { mensagemLogin.textContent = 'Informe usuário e senha.'; mensagemLogin.style.color = 'red'; }
                return;
            }
            mensagemLogin.textContent = 'Entrando...'; mensagemLogin.style.color = '#005baa';
            fetch('/login-gestor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: usuario, senha }) })
                .then(async r => {
                    const txt = await r.text();
                    let json = null;
                    try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
                    if (!r.ok) throw new Error((json && json.error) ? json.error : (txt || r.statusText));
                    return json || {};
                })
                .then(data => {
                    mensagemLogin.textContent = '';
                    // sucesso -> mostrar dashboard
                    if (loginSection) loginSection.style.display = 'none';
                    if (comentariosSection) comentariosSection.style.display = 'block';
                    if (avaliacaoSection) avaliacaoSection.style.display = 'none';
                    if (infoEstagiarioSection) infoEstagiarioSection.style.display = 'none';
                    if (loginEstagiarioSection) loginEstagiarioSection.style.display = 'none';
                    formLogin.reset();
                    try { carregarComentarios(); } catch (err) { console.warn('carregarComentarios() falhou:', err); }
                    const dashboard = document.getElementById('dashboardGestor'); if (dashboard) dashboard.style.display = 'block';
                    try { setGestorLogged(true); if (btnLogout) btnLogout.style.display = 'inline-block'; } catch (e) { /* no-op */ }
                }).catch(err => {
                    const msg = err && err.message ? err.message : 'Usuário ou senha inválidos.';
                    if (mensagemLogin) { mensagemLogin.textContent = msg; mensagemLogin.style.color = 'red'; }
                    else alert(msg);
                });
        });
    } else {
        console.warn('formLogin não encontrado ao registrar handler de admin');
    }

    // Botão para voltar ao formulário de avaliação na área de login do estagiário
    if (btnVoltarFormularioEstagiario) {
        btnVoltarFormularioEstagiario.addEventListener('click', function () {
            loginEstagiarioSection.style.display = 'none';
            avaliacaoSection.style.display = 'block';
            infoEstagiarioSection.style.display = 'none';
            try { showSobre(); } catch (e) { /* no-op */ }
        });
    }

    // Logout do gestor
    if (btnLogout) {
        btnLogout.addEventListener('click', function () {
            try { setGestorLogged(false); } catch (e) { /* no-op */ }
            // volta para tela inicial (formulário de avaliação)
            if (avaliacaoSection) avaliacaoSection.style.display = 'block';
            if (loginSection) loginSection.style.display = 'none';
            if (comentariosSection) comentariosSection.style.display = 'none';
            if (document.getElementById('dashboardGestor')) document.getElementById('dashboardGestor').style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'none';
            document.body.classList.remove('gestor-ativo');
            document.body.classList.remove('estagiario-ativo');
            try { showSobre(); } catch (e) { /* no-op */ }
        });
    }

    // Login dinâmico do estagiário
    if (formLoginEstagiario) {
        formLoginEstagiario.addEventListener('submit', function (e) {
            e.preventDefault();
            const login = document.getElementById('usuarioEstagiario').value;
            const senha = document.getElementById('senhaEstagiario').value;
            fetch('http://localhost:3000/login-estagiario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, senha })
            })
            .then(async response => {
                const txt = await response.text();
                let json = null;
                try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
                if (!response.ok) {
                    const msg = (json && json.error) ? json.error : (`${response.status} ${response.statusText}`);
                    throw new Error(msg);
                }
                return json || {};
            })
            .then(data => {
                // sucesso -> mostrar painel do estagiário
                loginEstagiarioSection.style.display = 'none';
                infoEstagiarioSection.style.display = 'block';
                avaliacaoSection.style.display = 'none';
                mensagemLoginEstagiario.textContent = '';
                formLoginEstagiario.reset();
                setTimeout(() => {
                    const u = document.getElementById('usuarioEstagiario'); if (u) u.value = '';
                    const s = document.getElementById('senhaEstagiario'); if (s) s.value = '';
                }, 100);
                mostrarInfoEstagiario(data.nome);
            })
            .catch(err => {
                const msg = err && err.message ? err.message : 'Erro ao autenticar.';
                if (mensagemLoginEstagiario) {
                    mensagemLoginEstagiario.textContent = msg;
                    mensagemLoginEstagiario.style.color = 'red';
                } else {
                    alert(msg);
                }
            });
        });
    }

    // Fluxo de reset de senha (frontend)
    const btnEsqueciSenha = document.getElementById('btnEsqueciSenha');
    const passwordResetRequest = document.getElementById('passwordResetRequest');
    const passwordResetConfirm = document.getElementById('passwordResetConfirm');
    const btnEnviarReset = document.getElementById('btnEnviarReset');
    const resetRequestMensagem = document.getElementById('resetRequestMensagem');
    const btnConfirmarReset = document.getElementById('btnConfirmarReset');
    const resetConfirmMensagem = document.getElementById('resetConfirmMensagem');

    if (btnEsqueciSenha) {
        btnEsqueciSenha.addEventListener('click', () => {
            passwordResetRequest.style.display = 'block';
            passwordResetConfirm.style.display = 'none';
        });
    }
    if (btnEnviarReset) {
        btnEnviarReset.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            const login = document.getElementById('resetLogin').value.trim();
            if (!login) {
                resetRequestMensagem.textContent = 'Informe o login.'; resetRequestMensagem.style.color = 'red'; return;
            }
            resetRequestMensagem.textContent = 'Solicitando token...'; resetRequestMensagem.style.color = '#005baa';
            const headersForReset = Object.assign({'Content-Type':'application/json'}, authHeaders());
            // ensure admin token present before calling protected endpoint
            if (!getAdminToken()) { resetRequestMensagem.textContent = 'Ação não autorizada: faça login como administrador.'; resetRequestMensagem.style.color = 'red'; if (confirm('É necessário autenticar como administrador. Deseja abrir o painel admin?')) window.location.href = 'admin.html'; return; }
            fetch('/password-reset/request', { method: 'POST', headers: headersForReset, body: JSON.stringify({ login }) })
                .then(async r => {
                    const txt = await r.text(); let json = null; try { json = txt ? JSON.parse(txt) : null; } catch(e){ json = null; }
                    if (!r.ok) {
                        if (r.status === 401) throw new Error('Ação não autorizada. Faça login como administrador para solicitar resets.');
                        throw new Error((json && json.error) ? json.error : (txt || r.statusText));
                    }
                    return json || {};
                })
                .then(data => {
                    if (data.error) { resetRequestMensagem.textContent = data.error; resetRequestMensagem.style.color = 'red'; return; }
                        // Se o servidor retornou o token (ambiente dev), mostramos o card.
                        if (data && data.token) {
                            try { passwordResetConfirm.style.display = 'block'; } catch (e) {}
                            const tokenCardId = 'tokenCardDisplay';
                            let existing = document.getElementById(tokenCardId);
                            if (existing) existing.remove();
                            const card = document.createElement('div');
                            card.id = tokenCardId;
                            card.className = 'token-card';
                            const expires = Number(data.expiresAt) || (Date.now() + 3600000);
                            card.innerHTML = `
                                <div class="token-card-body">
                                    <div class="token-label">Token (teste)</div>
                                    <div class="token-value"><code id="tokenValue">${data.token}</code></div>
                                    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
                                        <button type="button" id="btnCopyToken" class="btn-admin-login">Copiar</button>
                                        <div id="tokenCountdown" style="color:#005baa;font-weight:600;"></div>
                                    </div>
                                </div>
                            `;
                            resetRequestMensagem.innerHTML = '';
                            resetRequestMensagem.appendChild(card);
                            // copiar
                            const btnCopy = document.getElementById('btnCopyToken');
                            if (btnCopy) btnCopy.addEventListener('click', (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); const txt = document.getElementById('tokenValue').textContent; try { navigator.clipboard.writeText(txt); btnCopy.textContent = 'Copiado'; setTimeout(()=>btnCopy.textContent='Copiar',2000); } catch(e){ alert('Copie manualmente: ' + txt); } });
                            // contador
                            const countdownEl = document.getElementById('tokenCountdown');
                            function updateCountdown(){ const ms = expires - Date.now(); if (ms<=0){ countdownEl.textContent = 'Expirado'; clearInterval(intervalId); return; } const mins = Math.floor(ms/60000); const secs = Math.floor((ms%60000)/1000); countdownEl.textContent = `expira em ${mins}m ${secs}s`; }
                            updateCountdown();
                            const intervalId = setInterval(updateCountdown, 1000);
                        } else {
                            // Em produção o token é enviado por e-mail; apenas informar o usuário
                            resetRequestMensagem.textContent = 'Solicitação registrada. Verifique seu e-mail para o token.';
                            resetRequestMensagem.style.color = '#005baa';
                        }
                })
                .catch(err => {
                    const msg = err && err.message ? err.message : 'Erro ao solicitar token.';
                    if (String(msg).includes('Ação não autorizada')) {
                        try { setAdminToken(null); } catch(e){}
                        if (confirm(msg + "\n\nDeseja abrir o painel admin para autenticar?")) window.location.href = 'admin.html';
                        else {
                            resetRequestMensagem.textContent = 'Ação não autorizada. Faça login como administrador.';
                            resetRequestMensagem.style.color = 'red';
                        }
                        return;
                    }
                    resetRequestMensagem.textContent = msg;
                    resetRequestMensagem.style.color = 'red';
                });
        });
    }
    if (btnConfirmarReset) {
        btnConfirmarReset.addEventListener('click', () => {
            const token = document.getElementById('resetToken').value.trim();
            const nova = document.getElementById('resetNovaSenha').value;
            if (!token || !nova) { resetConfirmMensagem.textContent = 'Token e nova senha obrigatórios.'; resetConfirmMensagem.style.color = 'red'; return; }
            resetConfirmMensagem.textContent = 'Confirmando...'; resetConfirmMensagem.style.color = '#005baa';
            const headersConfirm = Object.assign({'Content-Type':'application/json'}, authHeaders());
            fetch('/password-reset/confirm', { method: 'POST', headers: headersConfirm, body: JSON.stringify({ token, newSenha: nova }) })
                .then(r => r.json())
                .then(data => {
                    if (data.error) { resetConfirmMensagem.textContent = data.error; resetConfirmMensagem.style.color = 'red'; return; }
                    resetConfirmMensagem.textContent = 'Senha alterada com sucesso!'; resetConfirmMensagem.style.color = '#060';
                    // esconder formularios
                    setTimeout(() => { passwordResetRequest.style.display = 'none'; passwordResetConfirm.style.display = 'none'; resetRequestMensagem.textContent=''; resetConfirmMensagem.textContent=''; }, 3000);
                })
                .catch(() => { resetConfirmMensagem.textContent = 'Erro ao confirmar reset.'; resetConfirmMensagem.style.color = 'red'; });
        });
    }

    // --- Gestor reset handlers ---
    const btnEsqueciSenhaGestor = document.getElementById('btnEsqueciSenhaGestor');
    const gestorPasswordResetRequest = document.getElementById('gestorPasswordResetRequest');
    const gestorPasswordResetConfirm = document.getElementById('gestorPasswordResetConfirm');
    const btnEnviarResetGestor = document.getElementById('btnEnviarResetGestor');
    const resetRequestMensagemGestor = document.getElementById('resetRequestMensagemGestor');
    const btnConfirmarResetGestor = document.getElementById('btnConfirmarResetGestor');
    const resetConfirmMensagemGestor = document.getElementById('resetConfirmMensagemGestor');

    if (btnEsqueciSenhaGestor) {
        btnEsqueciSenhaGestor.addEventListener('click', () => {
            gestorPasswordResetRequest.style.display = 'block';
            gestorPasswordResetConfirm.style.display = 'none';
        });
    }
    if (btnEnviarResetGestor) {
        btnEnviarResetGestor.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            const login = document.getElementById('resetLoginGestor').value.trim();
            if (!login) { resetRequestMensagemGestor.textContent = 'Informe o login.'; resetRequestMensagemGestor.style.color='red'; return; }
            resetRequestMensagemGestor.textContent = 'Solicitando token...'; resetRequestMensagemGestor.style.color='#005baa';
            const headersForResetG = Object.assign({'Content-Type':'application/json'}, authHeaders());
            // ensure admin token present before calling protected endpoint
            if (!getAdminToken()) { resetRequestMensagemGestor.textContent = 'Ação não autorizada: faça login como administrador.'; resetRequestMensagemGestor.style.color = 'red'; if (confirm('É necessário autenticar como administrador. Deseja abrir o painel admin?')) window.location.href = 'admin.html'; return; }
            fetch('/gestor/password-reset/request', { method: 'POST', headers: headersForResetG, body: JSON.stringify({ login }) })
                .then(async r=>{
                    const bodyText = await r.text();
                    let parsed = null;
                    try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch(e) { parsed = null; }
                    if (!r.ok) {
                        const msg = (parsed && parsed.error) ? parsed.error : (bodyText || r.statusText);
                        throw new Error(msg);
                    }
                    return parsed || {};
                }).then(data=>{
                    if (data.error) { resetRequestMensagemGestor.textContent = data.error; resetRequestMensagemGestor.style.color='red'; return; }
                    // mostrar token card (reutilizamos a área do resetRequestMensagemGestor)
                    if (data && data.token) {
                        const tokenCardId = 'tokenCardDisplayGestor';
                        let existing = document.getElementById(tokenCardId); if (existing) existing.remove();
                        const card = document.createElement('div'); card.id = tokenCardId; card.className='token-card';
                        const expires = Number(data.expiresAt) || (Date.now()+3600000);
                        card.innerHTML = `
                            <div class="token-card-body">
                                <div class="token-label">Token (Gestor - teste)</div>
                                <div class="token-value"><code id="tokenValueGestor">${data.token}</code></div>
                                <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
                                    <button type="button" id="btnCopyTokenGestor" class="btn-admin-login">Copiar</button>
                                    <div id="tokenCountdownGestor" style="color:#005baa;font-weight:600;"></div>
                                </div>
                            </div>
                        `;
                        resetRequestMensagemGestor.innerHTML=''; resetRequestMensagemGestor.appendChild(card);
                        const btnCopyG = document.getElementById('btnCopyTokenGestor');
                        if (btnCopyG) btnCopyG.addEventListener('click', (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); const txt=document.getElementById('tokenValueGestor').textContent; try{ navigator.clipboard.writeText(txt); btnCopyG.textContent='Copiado'; setTimeout(()=>btnCopyG.textContent='Copiar',2000); }catch(e){ alert('Copie manualmente: '+txt); } });
                        const countdownEl = document.getElementById('tokenCountdownGestor'); function updateCountdownGestor(){ const ms = expires - Date.now(); if (ms<=0){ countdownEl.textContent='Expirado'; clearInterval(iv); return; } const mins=Math.floor(ms/60000); const secs=Math.floor((ms%60000)/1000); countdownEl.textContent = `expira em ${mins}m ${secs}s`; } updateCountdownGestor(); const iv = setInterval(updateCountdownGestor,1000);
                        gestorPasswordResetConfirm.style.display='block';
                    } else {
                        resetRequestMensagemGestor.textContent = 'Solicitação registrada. Verifique seu e-mail para o token.';
                        resetRequestMensagemGestor.style.color = '#005baa';
                    }
                }).catch(err=>{
                    const msg = err && err.message ? err.message : 'Erro ao solicitar token.';
                    if (String(msg).includes('Ação não autorizada')) {
                        try { setAdminToken(null); } catch(e){}
                        if (confirm(msg + "\n\nDeseja abrir o painel admin para autenticar?")) window.location.href = 'admin.html';
                        else {
                            resetRequestMensagemGestor.textContent = 'Ação não autorizada. Faça login como administrador.';
                            resetRequestMensagemGestor.style.color = 'red';
                        }
                        return;
                    }
                    resetRequestMensagemGestor.textContent = msg;
                    resetRequestMensagemGestor.style.color = 'red';
                });
        });
    }
    if (btnConfirmarResetGestor) {
        btnConfirmarResetGestor.addEventListener('click', ()=>{
            const token = document.getElementById('resetTokenGestor').value.trim();
            const nova = document.getElementById('resetNovaSenhaGestor').value;
            if (!token || !nova) { resetConfirmMensagemGestor.textContent='Token e nova senha obrigatórios.'; resetConfirmMensagemGestor.style.color='red'; return; }
            resetConfirmMensagemGestor.textContent='Confirmando...'; resetConfirmMensagemGestor.style.color='#005baa';
            fetch('/gestor/password-reset/confirm', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, newSenha: nova }) })
                .then(r=>r.json()).then(data=>{ if (data.error){ resetConfirmMensagemGestor.textContent=data.error; resetConfirmMensagemGestor.style.color='red'; return; } resetConfirmMensagemGestor.textContent='Senha alterada com sucesso!'; resetConfirmMensagemGestor.style.color='#060'; setTimeout(()=>{ gestorPasswordResetRequest.style.display='none'; gestorPasswordResetConfirm.style.display='none'; resetRequestMensagemGestor.textContent=''; resetConfirmMensagemGestor.textContent=''; },2500); }).catch(()=>{ resetConfirmMensagemGestor.textContent='Erro ao confirmar reset.'; resetConfirmMensagemGestor.style.color='red'; });
        });
    }

    // Cadastro de estagiário pelo admin
    const formCadastroEstagiario = document.getElementById('formCadastroEstagiario');
    const mensagemCadastroEstagiario = document.getElementById('mensagemCadastroEstagiario');
    if (formCadastroEstagiario) {
        formCadastroEstagiario.addEventListener('submit', function (e) {
            e.preventDefault();
            const nome = document.getElementById('nomeNovo').value.trim();
            const area = document.getElementById('areaNovo').value.trim();
            const departamento = document.getElementById('departamentoNovo').value.trim();
            const login = document.getElementById('loginNovo').value.trim();
            const senha = document.getElementById('senhaNovo').value.trim();
            // Validação básica
            if (!nome || !login || !senha) {
                mensagemCadastroEstagiario.textContent = 'Preencha todos os campos obrigatórios: Nome, Login e Senha.';
                mensagemCadastroEstagiario.style.color = 'red';
                return;
            }
            // Feedback visual
            mensagemCadastroEstagiario.textContent = 'Enviando...';
            mensagemCadastroEstagiario.style.color = '#005baa';
            fetch('http://localhost:3000/estagiario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, area, departamento, login, senha })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    if (data.error.includes('UNIQUE constraint failed')) {
                        mensagemCadastroEstagiario.textContent = 'Já existe um estagiário com esse login. Escolha outro login.';
                    } else if (data.error.includes('Dados obrigatórios')) {
                        mensagemCadastroEstagiario.textContent = 'Preencha todos os campos obrigatórios: Nome, Login e Senha.';
                    } else {
                        mensagemCadastroEstagiario.textContent = 'Erro ao cadastrar estagiário: ' + data.error;
                    }
                    mensagemCadastroEstagiario.style.color = 'red';
                } else {
                    mensagemCadastroEstagiario.textContent = 'Estagiário cadastrado com sucesso!';
                    mensagemCadastroEstagiario.style.color = '#005baa';
                    formCadastroEstagiario.reset();
                    // re-carrega avaliações e atualiza dashboard
                    fetch('http://localhost:3000/avaliacoes').then(r=>r.json()).then(av=>{
                        try { renderizarDashboardGestor(av); atualizarDashboardGestor(av); } catch(e) { /* no-op */ }
                    }).catch(()=>{});
                }
            })
            .catch((err) => {
                mensagemCadastroEstagiario.textContent = 'Erro ao cadastrar estagiário.' + (err?.message ? ' ' + err.message : '');
                mensagemCadastroEstagiario.style.color = 'red';
            });
        });
    }

    // Botão para voltar ao formulário de avaliação na área de comentários
    const btnVoltarAvaliacao = document.getElementById('btnVoltarAvaliacao');
    if (btnVoltarAvaliacao) {
        btnVoltarAvaliacao.addEventListener('click', function () {
            comentariosSection.style.display = 'none';
            avaliacaoSection.style.display = 'block';
            loginSection.style.display = 'none';
            try { showSobre(); } catch (e) { /* no-op */ }
        });
    }

    // Botão para voltar ao formulário de avaliação
    const btnVoltarFormulario = document.getElementById('btnVoltarFormulario') || null;
    if (btnVoltarFormulario) {
        btnVoltarFormulario.addEventListener('click', function () {
            // volta para o formulário principal
            try { loginSection.style.display = 'none'; } catch(e){}
            try { avaliacaoSection.style.display = 'block'; } catch(e){}
            try { comentariosSection.style.display = 'none'; } catch(e){}
            try { showSobre(); } catch (e) { /* no-op */ }
            // restaurar os cartões de login caso algum tenha sido escondido por navegações anteriores
            try { document.querySelectorAll('.login-card').forEach(c => c.style.display = 'block'); } catch(e){}
            // limpar estados visuais de 'gestor'/'estagiario'
            try { document.body.classList.remove('gestor-ativo'); document.body.classList.remove('estagiario-ativo'); } catch(e){}
        });
    }

    // Envio de avaliação
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const nome = document.getElementById('nome').value;
            const area = document.getElementById('area').value;
            const departamento = document.getElementById('departamento').value;
            const nota = document.getElementById('nota').value;
            const comentario = document.getElementById('comentario').value;
            fetch('http://localhost:3000/avaliacao', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nome, area, departamento, nota, comentario })
            })
            .then(response => {
                if (!response.ok) throw new Error('Erro ao enviar avaliação');
                return response.json();
            })
            .then(data => {
                mensagem.textContent = `Avaliação enviada para ${data.nome} (${data.departamento}) com nota ${data.nota}. Obrigado!`;
                mensagem.style.color = '#005baa';
                form.reset();
                setTimeout(() => {
                    mensagem.textContent = '';
                }, 15000); // 15 segundos
                // re-carrega avaliações e atualiza dashboard
                fetch('http://localhost:3000/avaliacoes').then(r=>r.json()).then(av=>{
                    try { renderizarDashboardGestor(av); } catch(e) { /* no-op */ }
                }).catch(()=>{});
            })
            .catch(error => {
                mensagem.textContent = 'Erro ao enviar avaliação. Tente novamente.';
                mensagem.style.color = 'red';
            });
        });
    }
    // Botão para voltar ao formulário de avaliação na área de comentários
    if (btnVoltarAvaliacao) {
        btnVoltarAvaliacao.addEventListener('click', function () {
            comentariosSection.style.display = 'none';
            avaliacaoSection.style.display = 'block';
            loginSection.style.display = 'none';
        });
    }
    // Botão para voltar ao formulário de avaliação
    if (btnVoltarFormulario) {
        btnVoltarFormulario.addEventListener('click', function () {
            try { loginSection.style.display = 'none'; } catch(e){}
            try { avaliacaoSection.style.display = 'block'; } catch(e){}
            try { comentariosSection.style.display = 'none'; } catch(e){}
            try { showSobre(); } catch (e) { /* no-op */ }
            try { document.querySelectorAll('.login-card').forEach(c => c.style.display = 'block'); } catch(e){}
            try { document.body.classList.remove('gestor-ativo'); document.body.classList.remove('estagiario-ativo'); } catch(e){}
        });
    }
});
