## 📋 Roteiro de Debug — Finanças App

- **Última atualização:** 20/06/2026
- **Stack:** Electron + Supabase + Chart.js

## NECESSIDADES

- [ ] ~~User ter uma tela para cadastro de chamados~~ → Backend `createChamado()` pronto em `services/repository/admin.ts:70`, falta UI renderer
- [ ] E baixo de lançamentos, o saldo por conta

---

## INSPEÇÃO

### 0. Login / Autenticação (`login.html`, `redefinir.html`, `auth-guard.js`)

- [x] 0.1 Login com email + senha (formulário valida campos obrigatórios)
  - **Breakpoint:** `login.js:91` `fazerLogin()` — entrada do submit
  - **Breakpoint:** `auth.ts:74` `login()` — chamada Supabase Auth
- [x] 0.2 Login — credenciais inválidas → erro "Email ou senha incorretos"
- [x] 0.3 Login — usuário inativo → erro "Usuário inativado. Entre em contato com o administrador."
  - **Breakpoint:** `auth.ts:87` verificação `perfil.ativo`
- [x] 0.4 Login — email não confirmado → erro "Email não confirmado."
- [x] 0.5 Login — rate limit → erro "Muitas tentativas. Aguarde um momento."
  - **Breakpoint:** `auth.ts:25` `mapSupabaseError()` mapeia erros do Supabase (Não mapeia este erro)
- [x] 0.6 Captcha após 3 falhas consecutivas (soma aritmética, blocante)
  - **Breakpoint:** `login.js:16` `gerarCaptcha()` — gera pergunta
  - **Breakpoint:** `login.js:120` ativa após `falhasConsecutivas >= CAPTCHA_LIMIT`
- [x] 0.7 Login — sucesso → redireciona (admin → `admin.html`, user → `index.html`)
  - **Breakpoint:** `login.js:131` `window.location.href` conforme role
  - **Breakpoint:** `auth-guard.js:81` `storeAuthSession()`
- [x] 0.9 Toggle senha (olho mostra/esconde senha)
  - **Breakpoint:** `password-utils.js:25` `iniciarToggleSenha()`
- [x] 0.10 Restaurar sessão automática ao carregar página de login (se já logado, redireciona)
  - **Breakpoint:** `login.js:140` `tentarRestaurarSessao()`
  - **Breakpoint:** `auth-guard.js:114` `ensureAuthenticated()` — verifica token, tenta renovar
- [x] 0.11 Renovação de token expirado via refreshToken
  - **Breakpoint:** `auth-guard.js:99` `renewFromRefreshToken()`
  - **Breakpoint:** `auth.ts:219` `renovarSessao()`
- [x] 0.12 Logout → limpa state + storage + redirect (`clearAuthSession()`)
  - **Breakpoint:** `auth-guard.js:68` `clearAuthSession()`
  - **Breakpoint:** `auth.ts:103` `logout()`

#### Recuperação de Senha

- [x] 0.13 Abrir modal de recuperação ("Esqueci minha senha")
  - **Breakpoint:** `login.js:171` `configurarRecuperacao()`
- [x] 0.14 Solicitar recuperação — valida email, envia link (mensagem genérica "Se o email existir...")
  - **Breakpoint:** `login.js:187` submit do formulário de recuperação
  - **Breakpoint:** `auth.ts:168` `solicitarRecuperacao()` — chama Supabase `resetPasswordForEmail`
- [x] 0.15 Página `redefinir.html` — deep link (`access_token` no hash → modo automático)
  - **Breakpoint:** `redefinir.js:13` `obterTokenRecuperacao()` — parse do hash
  - **Breakpoint:** `auth.ts:198` `redefinirSenha()` — via token da sessão

```
- [ ] 0.16 Página `redefinir.html` — fallback manual (cola link ou token)
  - **Breakpoint:** `redefinir.js:38` `extrairTokenDoLink()` — parse URL ou token puro
  - **Breakpoint:** `auth.ts:181` `confirmarRecuperacao()` — via email + token + OTP verify
```

- [x] 0.17 Validações de senha em `redefinir.html`:
  - Mínimo 8 caracteres, 1 maiúscula, 1 número (requisitos visuais em tempo real)
  - **Breakpoint:** `password-utils.js:7` `REQUISITOS` — lista de validações
  - **Breakpoint:** `redefinir.js:163` `avaliarRequisitos()` no evento `input`
- [x] 0.18 Confirmar senha — campos conferem antes de enviar
  - **Breakpoint:** `redefinir.js:80` validação `senha !== confirmacao`
- [x] 0.19 Token de recuperação expira em 5 minutos (TTL no backend)
  - **Breakpoint:** `auth.ts:137` `setRecoveryTokens()` com `TEMPO_EXPIRACAO_RECUPERACAO_MS`
- [x] 0.20 Splash screen animada na inicialização do login
  - **Breakpoint:** `login.js:236` fade-out do splash

#### Autenticação Transversal (auth-guard)

```
- [ ] 0.21 `ensureAuthenticated()` — protege páginas (admin.html, index.html, etc.)
  - **Breakpoint:** `auth-guard.js:114`
- [ ] 0.22 Guarda admin — `requireAdmin: true` bloqueia user comum e redireciona
  - **Breakpoint:** `auth-guard.js:148`
- [ ] 0.23 Fallback de token: busca em sessionStorage → localStorage → tenta renovar
  - **Breakpoint:** `auth-guard.js:57` `getAccessToken()`
- [ ] 0.24 Auditoria de autenticação: LOGIN, LOGIN_FAILED, LOGOUT, SENHA_TROCADA, RECUPERACAO_SOLICITADA, RECUPERACAO_CONFIRMADA
  - **Breakpoint:** `auth.ts` em cada `_logAuditoria()` — linhas 80, 94, 112, 133, 172, 192
```

---

### 1. Categorias (`categorias.html`)

- [x] 1.1 Criar categoria (nome 2-40 chars, salva, aparece na tabela)
- [x] 1.2 Criar categoria duplicada (mesmo nome + tipo → erro NOME_DUPLICADO) | Existe um bug, se eu colocar o nome salvar, depois trocar a categoria, ele ignora duplicadas.
- [x] 1.3 Criar categoria nome inválido (<2 ou >40 chars → block no front)
- [x] 1.4 Editar categoria (inline aparece, salva, tabela atualiza)
- [x] 1.5 Editar categoria — cancelar (Esc ou Cancelar → volta)
- [x] 1.6 Ativar/Desativar categoria (toggle, badge verde/vermelho)
- [x] 1.7 Desativar c/ lançamentos no mês → erro CATEGORIA_COM_LANCAMENTOS
- [x] 1.8 Filtrar por tipo (Todos/Receita/Despesa/Transferência)
- [x] 1.9 Categoria global (badge "Global" exibido)
- [x] 1.10 Edição inline — botões Salvar/Cancelar na actions-cell (não embaixo do input)
- [x] 1.11 Categoria global — botões Editar/Ativar ocultos para não-admin
- [x] 1.12 Categoria global — bloqueio no backend (update/toggle rejeita se não admin)
- [x] 1.13 Categorias compartilhadas PF↔PJ (toggle em configurações `compartilharCategorias`)
  - Quando ativo: categorias/subcategorias ignoram filtro `tipo_pessoa`
  - Contas/pessoas/lançamentos/orçamento continuam filtrados por `tipo_pessoa`
  - **Breakpoint:** `services/repository/admin.ts:36` — `getTransacoesCliente()` pula `.eq("tipo_pessoa")` em categorias se compartilhado

#### Toast / Notificações

- [x] 1.13 Toast substitui alert() em categorias, configurações, admin, orçamento
- [x] 1.14 Toast empilha, emerge do canto direito, persiste até clique

#### Subcategorias

- [x] 1.15 Criar subcategoria (painel lateral, salva, lista atualiza)
- [x] 1.16 Editar subcategoria (campo preenchido, salva)
- [x] 1.17 Excluir subcategoria sem vínculo (confirma → some)
- [x] 1.18 Excluir subcategoria em uso → erro SUBCATEGORIA_EM_USO

---

### 2. Lançamentos (`index.html`)

- [x] 2.1 Criar lançamento RECEITA (aparece na tabela, resumo atualiza)
- [x] 2.2 Criar lançamento DESPESA (categorias carregam só despesas)
- [x] 2.3 Criar lançamento TRANSFERÊNCIA (conta origem + destino)
- [x] 2.4 Criar com valor zerado → block "Valor inválido"
- [x] 2.5 Criar com subcategoria (categoria → subcategorias carregam)
- [x] 2.6 Criar com conta/pessoa (selects populados, vincula)
- [x] 2.7 Editar lançamento (form preenchido, salva como "Atualizar")
- [x] 2.8 Editar → Cancelar (form limpo, botão volta "Salvar")
- [x] 2.9 Editar trocando tipo (categorias recarregam)
- [x] 2.10 Excluir lançamento (confirma → some, resumo atualiza)
- [x] 2.11 Excluir — cancelar (nada acontece)
- [x] 2.12 Filtro por mês (select muda → filtra)
- [x] 2.13 Filtro por tipo (pills Receita/Despesa)
- [x] 2.14 Filtro por status (pills Pendente/Pago)
- [x] 2.15 Filtros persistentes (recarrega → mantém localStorage)
- [x] 2.16 Resumo financeiro (cards Receitas/Despesas/Saldo)

---

### 3. Orçamento (`index.html` — importação)

```
- [ ] 3.1 Importar CSV (modal, cola dados, processa, confirma)
  - **Breakpoint:** `index.js:800` `parseCSV()` — parser tabulado
  - **Breakpoint:** `index.js:863` `processarImportacao()` — fluxo completo
- [ ] 3.2 Importar dados inválidos (linhas mal formatadas → filtradas)
- [ ] 3.3 Comparativo planejado vs realizado (cards na página)
  - **Breakpoint:** `index.js` seção de render do comparativo
```

---

### 4. Dashboard (`dashboard.html`)

- [x] 4.1 Carregar dashboard (gráficos sem erro)
- [ ] 4.2 Filtrar por ano
- [ ] 4.3 Filtrar por mês
- [ ] 4.4 Filtrar por categoria (select carrega, filtra)
- [ ] 4.5 Gráfico de categorias (toggle Receita/Despesa)

---

### 5. Configurações (`configuracoes.html`)

- [x ] 5.1 Carregar perfil (nome, email, email recuperação)
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
  - **Breakpoint:** `admin.js:665` `configurarNovoUsuario()`
- [ ] 6.2.2 Listar clientes (tabela com nome, email, criado em, último login, status)
  - **Breakpoint:** `admin.js:118` `carregarClientes()`

#### 6.3 Filtros

- [ ] 6.3 Filtrar clientes (status + busca por nome/email)

#### 6.4 Ativar/Inativar

- [ ] 6.4 Ativar/Inativar cliente (toggle com registro de auditoria)
  - **Breakpoint:** `admin.js:171` evento `data-toggle`

#### 6.5 Visualizar Resumo

- [ ] 6.5 Visualizar resumo cliente (dialog com receitas/despesas/lançamentos/orçamento)
  - **Breakpoint:** `admin.js:189` `visualizarCliente()`
- [ ] 6.5.1 Toggle PF/PJ no resumo cliente (filtra dados por tipo de pessoa)
  - **Breakpoint:** `admin.js:204` `configurarTipoPessoaToggle()`
  - **Estado:** `tipoPessoaResumo` (default `"PF"`) recarrega resumo ao trocar
  - **IPC:** `adminGetResumoCliente(id, tipoPessoaResumo)`

#### 6.6 Detalhes Transações

- [ ] 6.6 Ver detalhes transações (dialog com transações + metas)
  - **Breakpoint:** `admin.js:243` `abrirDetalhesCliente()`
- [ ] 6.6.1 Toggle PF/PJ nos detalhes transações (filtra transações e metas)
  - **Breakpoint:** `admin.js:220` `configurarTipoPessoaToggleDetalhes()`
  - **Estado:** `tipoPessoaDetalhes` (default `"PF"`) recarrega detalhes ao trocar
  - **IPC:** `adminGetTransacoesCliente(id, mes, ano, tipoPessoaDetalhes)`

#### 6.7 Categorias Globais

- [x] 6.7 Categorias globais (CRUD com eh_global)
  - **Breakpoint:** `admin.js:302` `carregarCategoriasGlobais()`

#### 6.8 Redefinir Senha

- [ ] 6.8 Redefinir senha de cliente (envia email de recuperação)
  - **Breakpoint:** `admin.js:463` `buscarParaRedefinir()`
  - **Breakpoint:** `admin.js:505` evento `data-reset` → `adminResetSenha`

#### 6.9 Chamados — Listar

- [ ] 6.9 Chamados — listar (tabela com usuário, título, status, badge de abertos) ✅ PRONTO
  - **Breakpoint:** `admin.js:540` `carregarChamados()`
  - **Breakpoint:** `admin.js:552` `atualizarBadgeChamados()`
  - **Status UI:** Aba "Chamados" ativa em `admin.html` linha 29

#### 6.10 Chamados — Atender

- [ ] 6.10 Chamados — atender (dialog abre com dados do chamado + histórico) ✅ PRONTO
  - **Breakpoint:** `admin.js:590` `abrirAtendimento()`

#### 6.11 Chamados — Responder

- [ ] 6.11 Chamados — responder (mensagem salva, status avança) ✅ PRONTO
  - **Breakpoint:** `admin.js:632` `enviarRespostaChamado()`

#### 6.12 Chamados — Marcar Resolvido

- [ ] 6.12 Chamados — marcar resolvido (via select + submit) ✅ PRONTO
  - **Breakpoint:** `admin.js:651` `adminUpdateChamado(id, novoStatus)`

#### 6.13 Auditoria

- ⚠️ **Backend implementado** (`admin.ts:231` `getAuditoria()`, `services/repository/auditoria.ts:35` `logAuditoria()`, `services/repository/auditoria.ts:10` `getAuditoria()`)
- ⚠️ **IPC registrado** (`ipcHandlers.ts:591` `handleAdminGetAuditoria`, `preload.ts:98` `adminGetAuditoria`)
- 🟡 **Frontend pendente** — Não há aba de auditoria no `admin.html` ainda (UI precisa ser criada ou verificar RLS)

#### 6.14 Alterar Email (Admin)

- [ ] 6.14 Alterar email (admin — campo editável) **não implementado**

#### 6.15 Novo Usuário

- [ ] 6.15 Criar usuário (modal no admin, valida nome/email/senha, edge function)
  - **Breakpoint:** `admin.js:665` `configurarNovoUsuario()`

#### 6.16 Visualizar Cliente (Página Dedicada)

- [ ] 6.16 Visualizar cliente (`visualizar-cliente.html`) — admin vê transações, orçamento, comparativo do cliente
  - **Breakpoint:** `visualizar-cliente.js:126` `carregarLancamentos()`
  - **Breakpoint:** `visualizar-cliente.js:137` `carregarOrcamento()`
- [ ] 6.16.1 Toggle PF/PJ na página do cliente (header, recarrega transações, orçamento, contas)
  - **Breakpoint:** `visualizar-cliente.js:98` `configurarTipoPessoaToggle()`
  - **Estado:** `tipoPessoa` (default `"PF"`) → `recarregarDados()` ao trocar
  - **IPCs:** `adminGetContasCliente(id, tipoPessoa)`, `adminGetTransacoesCliente(id, mes, ano, tipoPessoa)`, `adminGetOrcamentoCliente(id, tipoPessoa)`

#### 6.17 Dashboard do Cliente (Página Dedicada)

- [ ] 6.17 Dashboard do cliente (`visualizar-dashboard-cliente.html`) — gráficos do cliente via admin
  - **Breakpoint:** `visualizar-dashboard-cliente.js` iniciais (carregamento de Chart.js)
- [ ] 6.17.1 Toggle PF/PJ no dashboard do cliente (filtros, recarrega categorias, anos e dashboard)
  - **Breakpoint:** `visualizar-dashboard-cliente.js:99` `configurarTipoPessoaToggle()`
  - **Estado:** `tipoPessoa` (default `"PF"`) → recarrega dashboard ao trocar
  - **IPCs:** `adminGetAnosDisponiveisCliente(id, tipoPessoa)`, `adminGetDashboardDadosCliente(id, ano, mes, categoria, tipoPessoa)`

---

### 📝 Eventos de Auditoria Implementados

Todos os eventos são registrados em `services/repository/auditoria.ts:35` via `logAuditoria()` e salvos em `financas_auditoria` (PostgreSQL com RLS).

| Evento                   | Contexto                | Trigger                                  | Registrado em                 |
| ------------------------ | ----------------------- | ---------------------------------------- | ----------------------------- |
| `LOGIN`                  | User faz login          | Sucesso em `auth.ts:94`                  | Session iniciada              |
| `LOGIN_FAILED`           | Login falha             | Credenciais inválidas em `auth.ts:80`    | Tentativa bloqueada           |
| `LOGOUT`                 | User faz logout         | `auth.ts:112`                            | Limpeza de sessão             |
| `SENHA_TROCADA`          | User muda senha         | `auth.ts:133`                            | Segurança de conta            |
| `RECUPERACAO_SOLICITADA` | User solicita reset     | `auth.ts:172`                            | Email enviado                 |
| `RECUPERACAO_CONFIRMADA` | User confirma reset     | `auth.ts:192`                            | Senha redefinida              |
| `ADMIN_TOGGLE_USUARIO`   | Admin ativa/desativa    | `admin.ts:110`                           | Mudança de status             |
| `ADMIN_RESET_SENHA`      | Admin reseta senha      | `admin.ts:168`                           | Email de reset enviado        |
| `DADOS_EXPORTADOS`       | User exporta dados      | `ipcHandlers.ts:469`                     | JSON downloaded               |
| `CONFLITO_RESOLVIDO`     | Conflito sync resolvido | `services/sync.ts:356`                   | Sincronização reparada        |
| `CATEGORIA_CRIADA`       | Criar categoria         | `services/repository/categorias.ts:79`   | Categoria salva               |
| `LANCAMENTO_CRIADO`      | Criar lançamento        | `services/repository/lancamentos.ts:294` | Transação registrada          |
| `CONTA_EXCLUIDA`         | User deleta conta       | `ipcHandlers.ts:475`                     | Account purge (RLS-protected) |

**Observação:** RLS está ativa em `financas_auditoria` — usuários comuns veem apenas seus próprios logs; admins veem todos.

### 7. Fluxos Transversais

- [ ] 7.1 Sessão expira → renovar token (coberto em 0.11)
- [ ] 7.2 Logout → limpeza completa (coberto em 0.12)
- [ ] 7.3 State mirror (dados refletem entre processos via `services/state.ts`)
- [ ] 7.4 Proteção de rotas (coberto em 0.21-0.22)
- [ ] 7.5 Dialog nativo de senha (`dialog-senha-preload.ts` para troca/exclusão)
- [ ] 7.6 Auditoria de autenticação (coberto em 0.24)
- [ ] 7.7 Categorias compartilhadas PF↔PJ (config `compartilharCategorias` no state)
  - **Breakpoint:** `services/repository/admin.ts:46` `getResumoCliente()` lê `compartilharCategorias` do state para decidir se filtra por `tipo_pessoa` nas categorias
  - **UI:** Toggle em `configuracoes.html` — altera `state.compartilharCategorias`
  - **Impacto:** Categorias/subcategorias ignoram `tipo_pessoa` quando true; contas/pessoas sempre filtradas
- [ ] 7.8 Resolução de Conflitos (SQLite ↔ Supabase) — **NOVO**
  - **Breakpoint:** `public/js/conflitos.js` — UI para resolver conflitos de sincronização
  - **Breakpoint:** `services/ipcHandlers.ts` — handler para aplicar resolução
  - **Auditoria:** Evento `CONFLITO_RESOLVIDO` registrado em `services/repository/auditoria.ts:35`
  - **Backend:** Sincronização em `services/sync.ts` (detecta e marca conflitos)
  - **UI:** Página `public/conflitos.html` com lista e ações

---

### 🎯 Pendências

- [ ] ~~6.13 Frontend: Criar aba de auditoria no `admin.html` (backend + IPC + preload já prontos)~~ — 🟡 Backend pronto, UI falta verificação de RLS/permissões
- [ ] **6.14:** Alterar email do cliente pelo admin (campo editável, não implementado)
- [ ] **6.X:** UI para usuários abrirem chamados de suporte (backend `createChamado()` pronto em `services/repository/admin.ts:70`, falta página renderer)

---

### 🧭 Pontos de Parada Sugeridos (Main Process)

| Checado | Onde                                                                 | O que observar                                          |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| [ ]     | `services/repository/categorias.ts:13`—`getCategorias()`             | Categorias globais + pessoais carregando corretamente   |
| [ ]     | `services/repository/auditoria.ts:35`—`logAuditoria()`               | Todo log de auditoria passa aqui                        |
| [ ]     | `services/repository/admin.ts:58`—`getChamados()`                    | Listagem de chamados (admin vê todos, user vê próprios) |
| [ ]     | `services/repository/admin.ts:81`—`updateChamado()`                  | Atualização de status + respostas                       |
| [ ]     | `services/admin.ts:156`—`resetSenha()`                               | Redefinição de senha via admin                          |
| [ ]     | `services/admin.ts:179`—`getChamados()`                              | Chamados lado admin (join com usuário)                  |
| [ ]     | `services/admin.ts:231`—`getAuditoria()`                             | Consulta de auditoria (back-end)                        |
| [ ]     | `services/admin.ts:236`—`criarUsuario()`                             | Criação via edge function do Supabase                   |
| [ ]     | `services/auth.ts:74`—`login()`                                      | Login com auditoria (LOGIN / LOGIN_FAILED)              |
| [ ]     | `services/ipcHandlers.ts:567`—`handleAdminGetChamados`               | IPC de chamados                                         |
| [ ]     | `services/ipcHandlers.ts:591`—`handleAdminGetAuditoria`              | IPC de auditoria                                        |
| [ ]     | `services/ipcHandlers.ts:503`—`handleAdminToggleCliente`             | Toggle ativa/inativa cliente                            |
| [ ]     | `services/ipcHandlers.ts:441`—`handleConfigGetSessoes`               | IPC listar sessões ativas                               |
| [ ]     | `services/ipcHandlers.ts:469`—`handleConfigExportarDados`            | IPC exportar dados JSON                                 |
| [ ]     | `services/ipcHandlers.ts:475`—`handleConfigExcluirConta`             | IPC deletar conta (RLS-protected)                       |
| [ ]     | `services/ipcHandlers.ts:447`—`handleConfigEncerrarSessao`           | IPC encerrar sessão específica                          |
| [ ]     | `services/ipcHandlers.ts:383`—`handleAdminGetResumoCliente`          | IPC resumo cliente (aceita `tipoPessoa` opcional)       |
| [ ]     | `services/ipcHandlers.ts:403`—`handleAdminGetTransacoesCliente`      | IPC transações cliente (aceita `tipoPessoa` opcional)   |
| [ ]     | `services/ipcHandlers.ts:410`—`handleAdminGetOrcamentoCliente`       | IPC orçamento cliente (aceita `tipoPessoa` opcional)    |
| [ ]     | `services/ipcHandlers.ts:417`—`handleAdminGetContasCliente`          | IPC contas cliente (aceita `tipoPessoa` opcional)       |
| [ ]     | `services/ipcHandlers.ts:424`—`handleAdminGetAnosDisponiveisCliente` | IPC anos disponíveis (aceita `tipoPessoa` opcional)     |
| [ ]     | `services/ipcHandlers.ts:431`—`handleAdminGetDashboardDadosCliente`  | IPC dashboard cliente (aceita `tipoPessoa` opcional)    |
| [ ]     | `services/admin.ts:42`—`getResumoCliente()`                          | Service admin com filtro `tipoPessoa` opcional          |
| [ ]     | `services/admin.ts:59`—`getTransacoesCliente()`                      | Service admin com filtro `tipoPessoa` opcional          |
| [ ]     | `services/admin.ts:76`—`getOrcamentoCliente()`                       | Service admin com filtro `tipoPessoa` opcional          |
| [ ]     | `services/admin.ts:91`—`getDashboardDadosCliente()`                  | Service admin com filtro `tipoPessoa` opcional          |
| [ ]     | `services/admin.ts:104`—`getAnosDisponiveisCliente()`                | Service admin com filtro `tipoPessoa` opcional          |
| [ ]     | `services/admin.ts:113`—`getContasCliente()`                         | Service admin com filtro `tipoPessoa` opcional          |
| [ ]     | `services/repository/admin.ts:36`—`getTransacoesCliente()`           | Repository filtra `.eq("tipo_pessoa")` se passado       |
| [ ]     | `services/repository/admin.ts:46`—`getResumoCliente()`               | Repository filtra `.eq("tipo_pessoa")` se passado       |
| [ ]     | `services/state.ts:37/42`—`setState/getState`                        | State mirror (fonte da verdade)                         |

### 🧭 Pontos de Parada Sugeridos (Renderer)

| Checado | Onde                                                                        | O que observar                          |
| ------- | --------------------------------------------------------------------------- | --------------------------------------- |
| [ ]     | public/js/admin.js:76`—`carregarDashboard()                                 | Dashboard admin (cards totais)          |
| [ ]     | public/js/admin.js:118`—`carregarClientes()                                 | Listagem + filtro de clientes           |
| [ ]     | public/js/admin.js:204`—`configurarTipoPessoaToggle()                       | Toggle PF/PJ no resumo cliente          |
| [ ]     | public/js/admin.js:220`—`configurarTipoPessoaToggleDetalhes()               | Toggle PF/PJ nos detalhes transações    |
| [ ]     | public/js/visualizar-cliente.js:98`—`configurarTipoPessoaToggle()           | Toggle PF/PJ na página do cliente       |
| [ ]     | public/js/visualizar-dashboard-cliente.js:99`—`configurarTipoPessoaToggle() | Toggle PF/PJ no dashboard do cliente    |
| [ ]     | public/js/admin.js:456`—`configurarRedefinirSenha()                         | Busca + redefinição de senha            |
| [ ]     | public/js/admin.js:540`—`carregarChamados()                                 | Carregar chamados + badge               |
| [ ]     | public/js/admin.js:590`—`abrirAtendimento()                                 | Dialog de atendimento com histórico     |
| [ ]     | public/js/admin.js:632`—`enviarRespostaChamado()                            | Enviar resposta + mudar status          |
| [ ]     | public/js/admin.js:665`—`configurarNovoUsuario()                            | Criação de usuário (modal)              |
| [ ]     | public/js/conflitos.js`—`resolverConflito()                                 | Resolver conflitos de sync (UI novo)    |
| [ ]     | public/js/index.js:800`—`parseCSV()                                         | Parser de importação CSV                |
| [ ]     | public/js/index.js:863`—`processarImportacao()                              | Fluxo completo de importação            |
| [ ]     | public/js/visualizar-cliente.js:126`—`carregarLancamentos()                 | Carregar dados do cliente               |
| [ ]     | public/js/visualizar-dashboard-cliente.js`                                  | Dashboard do cliente via admin          |
| [ ]     | public/js/auth-guard.js:99` — renovação de token                            | `renewFromRefreshToken()` quando expira |

---
