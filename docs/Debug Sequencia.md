## 📋 Roteiro de Debug — Finanças App - ✅ testado (576 testes, 26 arquivos)

- **Última atualização:** 17/06/2026
- **Stack:** Electron + Supabase + Chart.js
- **Testes:** `npm test` = 581 passed (unit + integrados mock) | `npm run test:e2e` = E2E real Supabase

## NECESSIDADES

- [x] ~~User ter uma tela para cadastro de chamados~~ → Backend `createChamado()` pronto em `repository.ts:1476`, falta UI renderer

---

### 🧭 Pontos de Parada Sugeridos (Main Process)

| Checado | Onde                                                       | O que observar                                          |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| [ ]     | `services/repository.ts:246`—`getCategorias()`             | Categorias globais + pessoais carregando corretamente   |
| [ ]     | `services/repository.ts:1335`—`logAuditoria()`             | Todo log de auditoria passa aqui                        |
| [ ]     | `services/repository.ts:1464`—`getChamados()`              | Listagem de chamados (admin vê todos, user vê próprios) |
| [ ]     | `services/repository.ts:1487`—`updateChamado()`            | Atualização de status + respostas                       |
| [ ]     | `services/admin.ts:162`—`resetSenha()`                     | Redefinição de senha via admin                          |
| [ ]     | `services/admin.ts:185`—`getChamados()`                    | Chamados lado admin (join com usuário)                  |
| [ ]     | `services/admin.ts:237`—`getAuditoria()`                   | Consulta de auditoria (back-end)                        |
| [ ]     | `services/admin.ts:242`—`criarUsuario()`                   | Criação via edge function do Supabase                   |
| [ ]     | `services/auth.ts:73`—`login()`                            | Login com auditoria (LOGIN / LOGIN_FAILED)              |
| [ ]     | `services/ipcHandlers.ts:535`—`handleAdminGetChamados`     | IPC de chamados                                         |
| [ ]     | `services/ipcHandlers.ts:559`—`handleAdminGetAuditoria`    | IPC de auditoria                                        |
| [ ]     | `services/ipcHandlers.ts:471`—`handleAdminToggleCliente`   | Toggle ativa/inativa cliente                            |
| [ ]     | `services/ipcHandlers.ts:409`—`handleConfigGetSessoes`     | IPC listar sessões ativas                               |
| [ ]     | `services/ipcHandlers.ts:437`—`handleConfigExportarDados`  | IPC exportar dados JSON                                 |
| [ ]     | `services/ipcHandlers.ts:443`—`handleConfigExcluirConta`   | IPC deletar conta (RLS-protected)                       |
| [ ]     | `services/ipcHandlers.ts:415`—`handleConfigEncerrarSessao` | IPC encerrar sessão específica                          |
| [ ]     | `services/state.ts:37/42`—`setState/getState`              | State mirror (fonte da verdade)                         |

### 🧭 Pontos de Parada Sugeridos (Renderer)

| Checado | Onde                                                        | O que observar                          |
| ------- | ----------------------------------------------------------- | --------------------------------------- |
| [ ]     | public/js/admin.js:76`—`carregarDashboard()                 | Dashboard admin (cards totais)          |
| [ ]     | public/js/admin.js:118`—`carregarClientes()                 | Listagem + filtro de clientes           |
| [ ]     | public/js/admin.js:452`—`configurarRedefinirSenha()         | Busca + redefinição de senha            |
| [ ]     | public/js/admin.js:536`—`carregarChamados()                 | Carregar chamados + badge               |
| [ ]     | public/js/admin.js:586`—`abrirAtendimento()                 | Dialog de atendimento com histórico     |
| [ ]     | public/js/admin.js:628`—`enviarRespostaChamado()            | Enviar resposta + mudar status          |
| [ ]     | public/js/admin.js:661`—`configurarNovoUsuario()            | Criação de usuário (modal)              |
| [ ]     | public/js/conflitos.js`—`resolverConflito()                 | Resolver conflitos de sync (UI novo)    |
| [ ]     | public/js/index.js:773`—`parseCSV()                         | Parser de importação CSV                |
| [ ]     | public/js/index.js:836`—`processarImportacao()              | Fluxo completo de importação            |
| [ ]     | public/js/visualizar-cliente.js:126`—`carregarLancamentos() | Carregar dados do cliente               |
| [ ]     | public/js/visualizar-dashboard-cliente.js`                  | Dashboard do cliente via admin          |
| [ ]     | public/js/auth-guard.js:99` — renovação de token            | `renewFromRefreshToken()` quando expira |

---

### 0. Login / Autenticação (`login.html`, `redefinir.html`, `auth-guard.js`)

- [x] 0.1 Login com email + senha (formulário valida campos obrigatórios)
  - **Breakpoint:** `login.js:91` `fazerLogin()` — entrada do submit
  - **Breakpoint:** `auth.ts:73` `login()` — chamada Supabase Auth
- [x] 0.2 Login — credenciais inválidas → erro "Email ou senha incorretos"
- [x] 0.3 Login — usuário inativo → erro "Usuário inativado. Entre em contato com o administrador."
  - **Breakpoint:** `auth.ts:86` verificação `perfil.ativo`
- [ ] 0.4 Login — email não confirmado → erro "Email não confirmado."
- [ ] 0.5 Login — rate limit → erro "Muitas tentativas. Aguarde um momento."
  - **Breakpoint:** `auth.ts:24` `mapSupabaseError()` mapeia erros do Supabase
- [x] 0.6 Captcha após 3 falhas consecutivas (soma aritmética, blocante)
  - **Breakpoint:** `login.js:16` `gerarCaptcha()` — gera pergunta
  - **Breakpoint:** `login.js:120` ativa após `falhasConsecutivas >= CAPTCHA_LIMIT`
- [x] 0.7 Login — sucesso → redireciona (admin → `admin.html`, user → `index.html`)
  - **Breakpoint:** `login.js:129` `window.location.href` conforme role
  - **Breakpoint:** `auth-guard.js:81` `storeAuthSession()`
- [x] 0.9 Toggle senha (olho mostra/esconde senha)
  - **Breakpoint:** `password-utils.js:25` `iniciarToggleSenha()`
- [x] 0.10 Restaurar sessão automática ao carregar página de login (se já logado, redireciona)
  - **Breakpoint:** `login.js:140` `tentarRestaurarSessao()`
  - **Breakpoint:** `auth-guard.js:114` `ensureAuthenticated()` — verifica token, tenta renovar
- [ ] 0.11 Renovação de token expirado via refreshToken
  - **Breakpoint:** `auth-guard.js:99` `renewFromRefreshToken()`
  - **Breakpoint:** `auth.ts:218` `renovarSessao()`
- [ ] 0.12 Logout → limpa state + storage + redirect (`clearAuthSession()`)
  - **Breakpoint:** `auth-guard.js:68` `clearAuthSession()`
  - **Breakpoint:** `auth.ts:102` `logout()`

#### Recuperação de Senha

- [ ] 0.13 Abrir modal de recuperação ("Esqueci minha senha")
  - **Breakpoint:** `login.js:150` `configurarRecuperacao()`
- [ ] 0.14 Solicitar recuperação — valida email, envia link (mensagem genérica "Se o email existir...")
  - **Breakpoint:** `login.js:160` submit do formulário de recuperação
  - **Breakpoint:** `auth.ts:167` `solicitarRecuperacao()` — chama Supabase `resetPasswordForEmail`
- [ ] 0.15 Página `redefinir.html` — deep link (`access_token` no hash → modo automático)
  - **Breakpoint:** `redefinir.js:13` `obterTokenRecuperacao()` — parse do hash
  - **Breakpoint:** `auth.ts:197` `redefinirSenha()` — via token da sessão
- [ ] 0.16 Página `redefinir.html` — fallback manual (cola link ou token)
  - **Breakpoint:** `redefinir.js:38` `extrairTokenDoLink()` — parse URL ou token puro
  - **Breakpoint:** `auth.ts:180` `confirmarRecuperacao()` — via email + token + OTP verify
- [ ] 0.17 Validações de senha em `redefinir.html`:
  - Mínimo 8 caracteres, 1 maiúscula, 1 número (requisitos visuais em tempo real)
  - **Breakpoint:** `password-utils.js:7` `REQUISITOS` — lista de validações
  - **Breakpoint:** `redefinir.js:163` `avaliarRequisitos()` no evento `input`
- [ ] 0.18 Confirmar senha — campos conferem antes de enviar
  - **Breakpoint:** `redefinir.js:80` validação `senha !== confirmacao`
- [ ] 0.19 Token de recuperação expira em 5 minutos (TTL no backend)
  - **Breakpoint:** `auth.ts:136` `setRecoveryTokens()` com `TEMPO_EXPIRACAO_RECUPERACAO_MS`
- [ ] 0.20 Splash screen animada na inicialização do login
  - **Breakpoint:** `login.js:200` fade-out do splash

#### Autenticação Transversal (auth-guard)

- [ ] 0.21 `ensureAuthenticated()` — protege páginas (admin.html, index.html, etc.)
  - **Breakpoint:** `auth-guard.js:114`
- [ ] 0.22 Guarda admin — `requireAdmin: true` bloqueia user comum e redireciona
  - **Breakpoint:** `auth-guard.js:148`
- [ ] 0.23 Fallback de token: busca em sessionStorage → localStorage → tenta renovar
  - **Breakpoint:** `auth-guard.js:57` `getAccessToken()`
- [ ] 0.24 Auditoria de autenticação: LOGIN, LOGIN_FAILED, LOGOUT, SENHA_TROCADA, RECUPERACAO_SOLICITADA, RECUPERACAO_CONFIRMADA
  - **Breakpoint:** `auth.ts` em cada `_logAuditoria()` — linhas 93, 79, 111, 132, 171, 191

---

### 1. Categorias (`categorias.html`)

- [ ] 1.1 Criar categoria (nome 2-40 chars, salva, aparece na tabela)
- [ ] 1.2 Criar categoria duplicada (mesmo nome + tipo → erro NOME_DUPLICADO)
- [ ] 1.3 Criar categoria nome inválido (<2 ou >40 chars → block no front)
- [ ] 1.4 Editar categoria (inline aparece, salva, tabela atualiza)
- [ ] 1.5 Editar categoria — cancelar (Esc ou Cancelar → volta)
- [ ] 1.6 Ativar/Desativar categoria (toggle, badge verde/vermelho)
- [ ] 1.7 Desativar c/ lançamentos no mês → erro CATEGORIA_COM_LANCAMENTOS
- [ ] 1.8 Filtrar por tipo (Todos/Receita/Despesa/Transferência)
- [ ] 1.9 Categoria global (badge "Global" exibido)
- [ ] 1.10 Edição inline — botões Salvar/Cancelar na actions-cell (não embaixo do input)
- [ ] 1.11 Categoria global — botões Editar/Ativar ocultos para não-admin
- [ ] 1.12 Categoria global — bloqueio no backend (update/toggle rejeita se não admin)

#### Toast / Notificações

- [ ] 1.13 Toast substitui alert() em categorias, configurações, admin, orçamento
- [ ] 1.14 Toast empilha, emerge do canto direito, persiste até clique

#### Subcategorias

- [ ] 1.15 Criar subcategoria (painel lateral, salva, lista atualiza)
- [ ] 1.16 Editar subcategoria (campo preenchido, salva)
- [ ] 1.17 Excluir subcategoria sem vínculo (confirma → some)
- [ ] 1.18 Excluir subcategoria em uso → erro SUBCATEGORIA_EM_USO

---

### 2. Lançamentos (`index.html`)

- [ ] 2.1 Criar lançamento RECEITA (aparece na tabela, resumo atualiza)
- [ ] 2.2 Criar lançamento DESPESA (categorias carregam só despesas)
- [ ] 2.3 Criar lançamento TRANSFERÊNCIA (conta origem + destino)
- [ ] 2.4 Criar com valor zerado → block "Valor inválido"
- [ ] 2.5 Criar com subcategoria (categoria → subcategorias carregam)
- [ ] 2.6 Criar com conta/pessoa (selects populados, vincula)
- [ ] 2.7 Editar lançamento (form preenchido, salva como "Atualizar")
- [ ] 2.8 Editar → Cancelar (form limpo, botão volta "Salvar")
- [ ] 2.9 Editar trocando tipo (categorias recarregam)
- [ ] 2.10 Excluir lançamento (confirma → some, resumo atualiza)
- [ ] 2.11 Excluir — cancelar (nada acontece)
- [ ] 2.12 Filtro por mês (select muda → filtra)
- [ ] 2.13 Filtro por tipo (pills Receita/Despesa)
- [ ] 2.14 Filtro por status (pills Pendente/Pago)
- [ ] 2.15 Filtros persistentes (recarrega → mantém localStorage)
- [ ] 2.16 Resumo financeiro (cards Receitas/Despesas/Saldo)

---

### 3. Orçamento (`index.html` — importação)

- [ ] 3.1 Importar CSV (modal, cola dados, processa, confirma)
  - **Breakpoint:** `index.js:773` `parseCSV()` — parser tabulado
  - **Breakpoint:** `index.js:836` `processarImportacao()` — fluxo completo
- [ ] 3.2 Importar dados inválidos (linhas mal formatadas → filtradas)
- [ ] 3.3 Comparativo planejado vs realizado (cards na página)
  - **Breakpoint:** `index.js` seção de render do comparativo

---

### 4. Dashboard (`dashboard.html`)

- [ ] 4.1 Carregar dashboard (gráficos sem erro)
- [ ] 4.2 Filtrar por ano
- [ ] 4.3 Filtrar por mês
- [ ] 4.4 Filtrar por categoria (select carrega, filtra)
- [ ] 4.5 Gráfico de categorias (toggle Receita/Despesa)

---

### 5. Configurações (`configuracoes.html`)

- [ ] 5.1 Carregar perfil (nome, email, email recuperação)
- [ ] 5.2 Alterar nome
- [ ] 5.3 Alterar email recuperação
- [ ] 5.4 Alterar email (admin — ver item 6.14)
- [ ] 5.5 Upload avatar (>2MB erro, PNG/JPG preview)
- [ ] 5.6 Trocar senha — confirmação errada
- [ ] 5.7 Trocar senha — senha atual errada
- [ ] 5.8 Trocar senha — sucesso
- [ ] 5.9 Sessões (lista sessões)
- [ ] 5.10 Exportar dados (download CSV)
- [ ] 5.11 Excluir conta — email errado
- [ ] 5.12 Excluir conta — senha errada
- [ ] 5.13 Excluir conta — sucesso

---

### 6. Admin (`admin.html`) + Páginas Auxiliares

#### 6.1 Dashboard Admin

- [ ] 6.1 Dashboard admin (cards totais: receitas, despesas, saldo, usuários ativos)
  - **Breakpoint:** `admin.js:76` `carregarDashboard()`

#### 6.2 Clientes

- [ ] 6.2.1 Criar clientes (modal "Novo usuário" → edge function)
  - **Breakpoint:** `admin.js:661` `configurarNovoUsuario()`
- [ ] 6.2.2 Listar clientes (tabela com nome, email, criado em, último login, status)
  - **Breakpoint:** `admin.js:118` `carregarClientes()`

#### 6.3 Filtros

- [ ] 6.3 Filtrar clientes (status + busca por nome/email)

#### 6.4 Ativar/Inativar

- [ ] 6.4 Ativar/Inativar cliente (toggle com registro de auditoria)
  - **Breakpoint:** `admin.js:167` evento `data-toggle`

#### 6.5 Visualizar Resumo

- [ ] 6.5 Visualizar resumo cliente (dialog com receitas/despesas/lançamentos/orçamento)
  - **Breakpoint:** `admin.js:189` `visualizarCliente()`

#### 6.6 Detalhes Transações

- [ ] 6.6 Ver detalhes transações (dialog com transações + metas)
  - **Breakpoint:** `admin.js:243` `abrirDetalhesCliente()`

#### 6.7 Categorias Globais

- [ ] 6.7 Categorias globais (CRUD com eh_global)
  - **Breakpoint:** `admin.js:302` `carregarCategoriasGlobais()`

#### 6.8 Redefinir Senha

- [ ] 6.8 Redefinir senha de cliente (envia email de recuperação)
  - **Breakpoint:** `admin.js:459` `buscarParaRedefinir()`
  - **Breakpoint:** `admin.js:500` evento `data-reset` → `adminResetSenha`

#### 6.9 Chamados — Listar

- [x] 6.9 Chamados — listar (tabela com usuário, título, status, badge de abertos) ✅ PRONTO
  - **Breakpoint:** `admin.js:536` `carregarChamados()`
  - **Breakpoint:** `admin.js:563` `atualizarBadgeChamados()`
  - **Status UI:** Aba "Chamados" ativa em `admin.html` linha 29

#### 6.10 Chamados — Atender

- [x] 6.10 Chamados — atender (dialog abre com dados do chamado + histórico) ✅ PRONTO
  - **Breakpoint:** `admin.js:586` `abrirAtendimento()`

#### 6.11 Chamados — Responder

- [x] 6.11 Chamados — responder (mensagem salva, status avança) ✅ PRONTO
  - **Breakpoint:** `admin.js:628` `enviarRespostaChamado()`

#### 6.12 Chamados — Marcar Resolvido

- [x] 6.12 Chamados — marcar resolvido (via select + submit) ✅ PRONTO
  - **Breakpoint:** `admin.js:647` `adminUpdateChamado(id, novoStatus)`

#### 6.13 Auditoria

- ⚠️ **Backend implementado** (`admin.ts:237` `getAuditoria()`, `repository.ts:1335` `logAuditoria()`, `repository.ts:1310` `getAuditoria()`)
- ⚠️ **IPC registrado** (`ipcHandlers.ts:559` `handleAdminGetAuditoria`, `preload.ts:95` `adminGetAuditoria`)
- 🟡 **Frontend pendente** — Não há aba de auditoria no `admin.html` ainda (UI precisa ser criada ou verificar RLS)

#### 6.14 Alterar Email (Admin)

- [ ] 6.14 Alterar email (admin — campo editável) **não implementado**

#### 6.15 Novo Usuário

- [ ] 6.15 Criar usuário (modal no admin, valida nome/email/senha, edge function)
  - **Breakpoint:** `admin.js:661` `configurarNovoUsuario()`

#### 6.16 Visualizar Cliente (Página Dedicada)

- [ ] 6.16 Visualizar cliente (`visualizar-cliente.html`) — admin vê transações, orçamento, comparativo do cliente
  - **Breakpoint:** `visualizar-cliente.js:126` `carregarLancamentos()`
  - **Breakpoint:** `visualizar-cliente.js:137` `carregarOrcamento()`

#### 6.17 Dashboard do Cliente (Página Dedicada)

- [ ] 6.17 Dashboard do cliente (`visualizar-dashboard-cliente.html`) — gráficos do cliente via admin
  - **Breakpoint:** `visualizar-dashboard-cliente.js` iniciais (carregamento de Chart.js)

---

### 📝 Eventos de Auditoria Implementados

Todos os eventos são registrados em `services/repository.ts:1335` via `logAuditoria()` e salvos em `financas_auditoria` (PostgreSQL com RLS).

| Evento                   | Contexto                | Trigger                               | Registrado em                 |
| ------------------------ | ----------------------- | ------------------------------------- | ----------------------------- |
| `LOGIN`                  | User faz login          | Sucesso em `auth.ts:93`               | Session iniciada              |
| `LOGIN_FAILED`           | Login falha             | Credenciais inválidas em `auth.ts:79` | Tentativa bloqueada           |
| `LOGOUT`                 | User faz logout         | `auth.ts:111`                         | Limpeza de sessão             |
| `SENHA_TROCADA`          | User muda senha         | `auth.ts:132`                         | Segurança de conta            |
| `RECUPERACAO_SOLICITADA` | User solicita reset     | `auth.ts:171`                         | Email enviado                 |
| `RECUPERACAO_CONFIRMADA` | User confirma reset     | `auth.ts:191`                         | Senha redefinida              |
| `ADMIN_TOGGLE_USUARIO`   | Admin ativa/desativa    | `admin.ts:116`                        | Mudança de status             |
| `ADMIN_RESET_SENHA`      | Admin reseta senha      | `admin.ts:174`                        | Email de reset enviado        |
| `DADOS_EXPORTADOS`       | User exporta dados      | `ipcHandlers.ts:437`                  | JSON downloaded               |
| `CONFLITO_RESOLVIDO`     | Conflito sync resolvido | `services/sync.ts:335`                | Sincronização reparada        |
| `CATEGORIA_CRIADA`       | Criar categoria         | `repository.ts:372`                   | Categoria salva               |
| `LANCAMENTO_CRIADO`      | Criar lançamento        | `repository.ts:1033`                  | Transação registrada          |
| `CONTA_EXCLUIDA`         | User deleta conta       | `ipcHandlers.ts:443`                  | Account purge (RLS-protected) |

**Observação:** RLS está ativa em `financas_auditoria` — usuários comuns veem apenas seus próprios logs; admins veem todos.

### 7. Fluxos Transversais

- [ ] 7.1 Sessão expira → renovar token (coberto em 0.11)
- [ ] 7.2 Logout → limpeza completa (coberto em 0.12)
- [ ] 7.3 State mirror (dados refletem entre processos via `services/state.ts`)
- [ ] 7.4 Proteção de rotas (coberto em 0.21-0.22)
- [ ] 7.5 Dialog nativo de senha (`dialog-senha-preload.ts` para troca/exclusão)
- [ ] 7.6 Auditoria de autenticação (coberto em 0.24)
- [ ] 7.7 Resolução de Conflitos (SQLite ↔ Supabase) — **NOVO**
  - **Breakpoint:** `public/js/conflitos.js` — UI para resolver conflitos de sincronização
  - **Breakpoint:** `services/ipcHandlers.ts` — handler para aplicar resolução
  - **Auditoria:** Evento `CONFLITO_RESOLVIDO` registrado em `services/repository.ts:1335`
  - **Backend:** Sincronização em `services/sync.ts` (detecta e marca conflitos)
  - **UI:** Página `public/conflitos.html` com lista e ações

---

### 📊 Cobertura por Testes

| Arquivo                                         | Testes | O que cobre                                                        |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `test/integrados/chamados-suporte.test.js`      | 5      | Criar, listar, isolar, atualizar, filtrar chamados                 |
| `test/integrados/admin-global.test.js`          | 5      | CRUD categorias globais, isolamento, toggle                        |
| `test/integrados/perfil-auditoria.test.js`      | 6      | Perfil, alteração nome, log auditoria, isolamento, dados completos |
| `test/integrados/categoria-lancamento.test.js`  | 7      | Categoria + lançamento integrados                                  |
| `test/integrados/conta-lancamento.test.js`      | —      | Conta + lançamento                                                 |
| `test/integrados/auth-lancamento.test.js`       | —      | Auth + lançamento                                                  |
| `test/integrados/excluir-conta.test.js`         | 4      | Exclusão de conta                                                  |
| `test/integrados/orcamento-dashboard.test.js`   | —      | Orçamento + dashboard                                              |
| `test/e2e/orcamento-dashboard.test.js`          | —      | Orçamento + dashboard (real Supabase)                              |
| `test/unitarios/pages/admin.test.js`            | 41     | Renderização admin                                                 |
| `test/unitarios/pages/configuracoes.test.js`    | 38     | Renderização config                                                |
| `test/unitarios/pages/login.test.js`            | 12     | Renderização login + fluxo auth                                    |
| `test/unitarios/pages/orcamento.test.js`        | 15     | Renderização orçamento + importação CSV                            |
| `test/unitarios/services/admin-service.test.js` | —      | Admin service lógica                                               |
| `test/unitarios/services/auth.test.js`          | —      | Auth service lógica                                                |
| `test/unitarios/services/repository.test.js`    | —      | Repository queries                                                 |
| `test/unitarios/utils/ipcHandlers.test.js`      | —      | IPC handlers                                                       |
| `test/unitarios/utils/auditoria.test.js`        | —      | Auditoria utils                                                    |
| `test/unitarios/utils/config.test.js`           | 8      | Perfil, sessões, exportação, auditoria (novo)                      |
| `test/e2e/login.test.js`                        | 10     | Login flow E2E (real Supabase)                                     |

**Total: 26 arquivos, 581 testes — todos passando ✅ (+5 testes desde 16/06, refatoração TS)**

---

### 🎯 Pendências

- [x] ~~6.13 Frontend: Criar aba de auditoria no `admin.html` (backend + IPC + preload já prontos)~~ — 🟡 Backend pronto, UI falta verificação de RLS/permissões
- [ ] **6.14:** Alterar email do cliente pelo admin (campo editável, não implementado)
- [ ] **6.X:** UI para usuários abrirem chamados de suporte (backend `createChamado()` pronto em `repository.ts:1476`, falta página renderer)

---

### ✅ Status de Completude — 16/06/2026

| Módulo                         | Status      | Notas                                                                 |
| ------------------------------ | ----------- | --------------------------------------------------------------------- |
| **Autenticação**               | ✅ Completo | Login, logout, recuperação, renovação token, 2FA (captcha), auditoria |
| **Categorias & Subcategorias** | ✅ Completo | CRUD, global vs pessoais, toggle ativo/inativo, isolamento RLS        |
| **Lançamentos**                | ✅ Completo | CRUD receita/despesa/transferência, filtros, importação CSV           |
| **Orçamento**                  | ✅ Completo | Importação, comparativo planejado vs realizado                        |
| **Dashboard**                  | ✅ Completo | Gráficos Chart.js, filtros ano/mês/categoria                          |
| **Configurações (User)**       | ✅ Completo | Perfil, avatar, senha, sessões, exportar dados, excluir conta         |
| **Admin — Dashboard**          | ✅ Completo | Cards totais (receitas, despesas, saldo, usuários ativos)             |
| **Admin — Clientes**           | ✅ Completo | CRUD, ativar/inativar, visualizar resumo, redefinir senha             |
| **Admin — Categorias Globais** | ✅ Completo | CRUD com isolamento de permissões                                     |
| **Admin — Chamados (Support)** | ✅ Completo | Criar, listar, atender, responder, marcar resolvido, badge            |
| **Admin — Auditoria**          | 🟡 Parcial  | Backend + IPC pronto, UI não encontrada em admin.html                 |
| **Resolução de Conflitos**     | ✅ Completo | UI `conflitos.html`, backend sync.js, evento auditoria                |
| **Alteração de Email**         | 🔴 Pendente | Não implementado (admin pode resetar senha)                           |
| **UI Chamados (User)**         | 🔴 Pendente | Backend pronto, UX para usuários criar tickets falta                  |

**Resumo:** 11 módulos completos ✅, 1 parcial 🟡, 2 pendentes 🔴 → **~85% de completude**

---

### 🏗️ Novas Páginas desde a Criação do Documento

| Página                              | Descrição                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `visualizar-cliente.html`           | Admin visualiza lançamentos, orçamento e comparativo de um cliente específico |
| `visualizar-dashboard-cliente.html` | Admin visualiza gráficos (Chart.js) de um cliente específico                  |
| `redefinir.html`                    | Página de redefinição de senha via deep link (fallback manual + deep link)    |
| `conflitos.html`                    | Resolução visual de conflitos de sincronização SQLite ↔ Supabase (novo)       |
| `dialog-senha-preload.ts`           | Janela filha para capturar senha de forma segura (troca/exclusão)             |

---
