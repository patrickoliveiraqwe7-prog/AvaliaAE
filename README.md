Projeto: Painel de avaliações

Resumo

Alterações e recomendações de segurança
1) Remover envio de token no JSON de resposta
   - Em ambientes de produção nunca retorne tokens sensíveis no corpo da resposta.
   - O projeto foi atualizado para não retornar tokens nos endpoints de request; tokens continuam sendo logados no console para ambiente de desenvolvimento.

Resumo
- Aplicação Node.js + Express com banco SQLite (`avaliacoes.db`).
- Funcionalidades: cadastro de estagiários, login, reset de senha via token, painel admin para redefinir senhas de gestores/estagiários.

Principais mudanças nesta versão
- Tokens curtos legíveis (ex.: `AB12-CD34`) com TTL configurável via `TOKEN_TTL_MS`.
- Tokens armazenados no banco apenas como hash (sha256 + `TOKEN_PEPPER`). O token em texto só é retornado no momento da criação e apenas quando `NODE_ENV !== 'production'`.
- Auditoria persistente em `audit_events` (registra eventos de geração/revogação).
- Endpoints administrativos para gerar/regenerar/revogar tokens de admin e para gerar tokens de estagiários/gestores.
- Job de limpeza automática de tokens expirados (executa a cada 5 minutos).

Variáveis de ambiente importantes
- `NODE_ENV`=production|development — define comportamento de segurança (não retorna tokens em produção).
- `TOKEN_TTL_MS` — tempo de vida do token em ms (default 30 minutos).
- `TOKEN_PEPPER` — valor secreto adicional usado para 'pepar' o hash do token (recomendado em produção).
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` / `SMTP_FROM` — configurações SMTP (se não presente, o servidor usa Ethereal para dev).
- `DEBUG_LOGS`=true — habilita logs de depuração extras (use apenas em dev).

Como gerar tokens via Admin
1. Fazer login admin (POST `/login-admin`) e usar o token retornado no header `Authorization: Bearer <token>`.
2. Gerar token para estagiário: `POST /admin/token/estagiario` { login }
3. Gerar token para gestor: `POST /admin/token/gestor` { login }
4. Gerar/regenerar token para o próprio admin: `POST /admin/token/generate`
5. Ver token atual do admin (apenas dev retorna o token claro): `GET /admin/token/current`
6. Revogar token: `POST /admin/token/revoke` (para token do admin) ou
   `POST /admin/token/revoke/estagiario` { login } / `POST /admin/token/revoke/gestor` { login }

E-mail de reset
- O servidor usa um template simples HTML/text ao enviar tokens por e-mail (função `renderResetTemplate`).
- Em dev ele cria um preview via Ethereal e o URL do preview é logado (apenas em dev).

Testes
- Testes de integração básicos (Mocha + Supertest) foram adicionados em `test/token.spec.js`.

Checklist de deploy (produção)
1. Definir `NODE_ENV=production`.
2. Configurar SMTP real e testar envio (defina as variáveis `SMTP_*`).
3. Definir `TOKEN_PEPPER` com um valor secreto.
4. Usar HTTPS (reverse-proxy, cert-manager/Let's Encrypt).
5. Considerar mover sessões de admin para Redis ou tabela persistente e aplicar rate-limits mais agressivos para endpoints de login/reset.
6. Avaliar hashing diferente (HMAC-SHA256 com pepper ou bcrypt/argon2) se tokens puderem ser alvo de brute-force após vazamento.
7. Configurar logs estruturados e retenção de auditoria (arquivos/S3/ELK).

Como rodar localmente (PowerShell / Windows)
Se o wrapper `npm` estiver bloqueado pelo PowerShell, execute o `npm-cli.js` diretamente com o node:

```powershell
node "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" install
```

Iniciar servidor:

# Projeto: Painel de avaliações

Este repositório contém um painel de avaliações com autenticação, redefinição de senha por token e um painel administrativo capaz de gerar e revogar tokens para gestores, estagiários e admins.

Principais pontos
- Tokens legíveis curtos (ex.: AB12-CD34) com TTL configurável via `TOKEN_TTL_MS`.
- Tokens armazenados como hash (SHA256 + `TOKEN_PEPPER`). Em produção o token em texto não é retornado; em desenvolvimento (`NODE_ENV !== 'production'`) o token claro é retornado para facilitar testes.
- Auditoria persistente em `audit_events` para eventos críticos (geração/revogação).
- Endpoints admin para gerar/regenerar/revogar tokens e gerenciar sessões de administrador.
- Job de limpeza de tokens expirados (executa a cada 5 minutos).

Variáveis de ambiente importantes
- `NODE_ENV`: `production` ou `development` — controla comportamentos de segurança (ex.: retorno de tokens em texto).
- `TOKEN_TTL_MS`: tempo de vida do token em milissegundos. Recomendação: 30 * 60 * 1000 (30 minutos). Padrão: 30 minutos.
- `TOKEN_PEPPER`: segredo adicional para 'pepper' do hash do token — obrigatório em produção.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`: configurações SMTP. Se ausentes, o servidor usa Ethereal para desenvolvimento.
- `DEBUG_LOGS`: `true` para logs de depuração (apenas em desenvolvimento).

Como gerar tokens via Admin
1. Fazer login admin: POST `/login-admin` com credenciais do admin. O login retorna um token de sessão (use em `Authorization: Bearer <token>`).
2. Gerar token para estagiário: POST `/admin/token/estagiario` { "login": "usuario" }.
3. Gerar token para gestor: POST `/admin/token/gestor` { "login": "usuario" }.
4. Gerar/regenerar token do próprio admin: POST `/admin/token/generate`.
5. Ver token atual do admin: GET `/admin/token/current` (retorna o token claro somente em dev).
6. Revogar token: POST `/admin/token/revoke` (admin) ou POST `/admin/token/revoke/estagiario` { "login" } / POST `/admin/token/revoke/gestor` { "login" }.

E-mail de reset
- O servidor usa um template HTML/text para envio de tokens por e-mail (função `renderResetTemplate`).
- Em desenvolvimento o servidor cria um preview via Ethereal e exibe a URL de preview nos logs.

Testes
- Testes de integração (Mocha + Supertest) estão em `test/token.spec.js`.

Checklist de deploy (produção)
1. Definir `NODE_ENV=production`.
2. Configurar SMTP real e testar envio (defina as variáveis `SMTP_*`).
3. Definir `TOKEN_PEPPER` com um valor secreto.
4. Usar HTTPS (reverse-proxy, cert-manager/Let's Encrypt).
5. Considerar mover sessões de admin para Redis ou tabela persistente e aplicar rate-limits mais agressivos para endpoints de login/reset.
6. Avaliar hashing diferente (HMAC-SHA256 com pepper ou bcrypt/argon2) para maior resistência a brute-force.
7. Configurar logs estruturados e retenção de auditoria (arquivos/S3/ELK).

Como rodar localmente (PowerShell / Windows)

1) Instalar dependências

```powershell
npm install
```

Se o wrapper `npm` estiver bloqueado pelo PowerShell, instale as dependências executando o `npm-cli.js` diretamente com o node:

```powershell
node "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" install
```

2) Iniciar servidor

```powershell
node server.js
```

3) Abrir no navegador

http://localhost:3000

Próximos passos sugeridos
- Implementar persistência de sessão para admins (Redis ou DB) para escalabilidade.
- Remover logging de tokens em produção e enviar tokens apenas por e-mail.
- Adicionar testes unitários para `generateShortToken` e `hashToken`.

Tokens curtos (detalhes)
- Os tokens são gerados em formato curto e legível (ex.: `AB12-CD34`) e têm validade configurável via `TOKEN_TTL_MS` (milissegundos). Por padrão: 30 minutos.
- Em produção os tokens são armazenados apenas como hash (SHA256 + `TOKEN_PEPPER`) e o token em texto não é retornado nas respostas.
- Endpoints administrativos: `POST /admin/token/estagiario` e `POST /admin/token/gestor` (retornam `{ token, expiresAt }` apenas em desenvolvimento).

Configuração de e-mail (SMTP)

Para ativar envio real de e-mails configure as variáveis de ambiente antes de iniciar o servidor:

- `SMTP_HOST` - endereço do servidor SMTP (ex: smtp.example.com)
- `SMTP_PORT` - porta (ex: 587)
- `SMTP_SECURE` - 'true' ou 'false' (usar true para SMTPS 465)
- `SMTP_USER` - usuário SMTP
- `SMTP_PASS` - senha SMTP
- `SMTP_FROM` - endereço "from" (opcional, default no-reply@example.com)
- `SMTP_FALLBACK_TO` - e-mail fallback para testes (opcional)

Se não houver configuração de SMTP o servidor tentará criar uma conta Ethereal para desenvolvimento e mostrará um URL de visualização do e-mail nos logs do servidor.

