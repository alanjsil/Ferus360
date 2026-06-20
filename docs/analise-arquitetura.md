# Análise Arquitetural — Finanças Pessoais

## 1. Dead Code

| Item                                                     | Problema                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/js/electron-api.d.ts`                            | Duplicata manual de `src/types.d.ts` — vai dessincronizar com o tempo                                                                                                                                                                                                                                                                                                                                                            |
| ~~`services/repository.ts:1478` `getTransacoesCliente`~~ | ~~Exportada, mas sem consumidor identificado no renderer~~ — **FALSO POSITIVO**: consumida via `admin.ts` → `ipcHandlers.ts` → `preload.ts` (`adminGetTransacoesCliente`)                                                                                                                                                                                                                                                        |
| ~~`services/admin.ts` vs `services/repository.ts`~~      | ~~Admin tem módulo próprio mas `repository.ts` ainda exporta `getAdminDashboard`, `getClientes`, `getChamados` — responsabilidade duplicada~~ — **ACEITO**: `getChamados` faz pós-processamento (achata `usuario.nome`); `getAdminDashboard`/`getClientes` são pass-through com `verificarAdmin` — padrão intencional de camada (serviço com auth sobre acesso a dados). `repository.ts` exporta para viabilizar testes diretos. |

---

## 2. Falhas de Segurança

### 🟢 Não crítico — Chave de criptografia (aceito)

**Arquivo:** `services/repository.ts:210-213`

```ts
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_KEY || process.env.SUPABASE_URL || "financas-pessoais-key")
  .digest();
```

**Justificativa para não corrigir:** A criptografia AES-256-GCM é usada **apenas** no campo `email_recuperacao` (email alternativo do perfil). Não é dado financeiro, não é PII crítica além do que já está no banco, e nunca é usado como chave de busca. O propósito real é **obfuscação básica**, não segurança defensiva. Como:

1. `SUPABASE_URL` é pública (anon key)
2. O dado protegido é apenas um email alternativo
3. Não há requisito regulatório (LGPD) sendo violado — o email já está salvo sem criptografia no campo `email`

Uma troca para `crypto.generateKeySync` ou keystore adicionaria complexidade sem ganho real de segurança para este caso de uso. **Decisão: aceitar como está.**

### ✅ SQL Injection via template literals — corrigido

`SELECT * FROM ${entidade} WHERE ...` aparecia de forma generalizada em `repository.ts` e `sync.ts`.

**Correções:**

- `sync.ts`: Adicionada função `validarEntidade()` com whitelist `ENTIDADES_VALIDAS` (`Set<string>`), chamada em `pushRegistro` e `tratarConflito` — qualquer nome fora da lista lança `Error`
- `sync.ts`: Função `_lerLocal` removida de `repository.ts` (era a única que aceitava nome de tabela arbitrário vindo do Supabase sem validação)

### 🟢 Falso Positivo — Service Role no main process (apenas dev)

**FALSO POSITIVO.** `SUPABASE_SERVICE_ROLE` só existe em dev (`.env` não entra no ASAR). Em produção `supabaseAdmin` é `null`. O parâmetro `_supabaseAdmin` em `ipcHandlers.ts:12` era dead code — removido.

**Caminho completo:**

| Arquivo                   | Linha     | O que acontece                                              | Em prod?                 |
| ------------------------- | --------- | ----------------------------------------------------------- | ------------------------ |
| `services/conexao.ts`     | 10        | `SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE` | `undefined`              |
| `services/conexao.ts`     | 20-23     | `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)`         | **não executa** → `null` |
| `services/ipcHandlers.ts` | 618       | `const { supabaseAdmin } = require("./conexao")`            | `null`                   |
| `services/repository.ts`  | 1289-1292 | fallback `supabaseAdminInstance.rpc(...)`                   | **não executa**          |
| `services/repository.ts`  | 1551      | `supabaseAdminInstance.auth.admin.signOut(...)`             | **não executa**          |

**Problemas reais:**

1. **`_supabaseAdmin` em `ipcHandlers.ts:12`** — parâmetro morto. É recebido como `_supabaseAdmin: unknown = null` mas **nunca referenciado** dentro do corpo de `createHandlers`. Deveria ser removido.

2. **Fallback dev-only** — se uma Edge Function falhar em **produção**, `repository.ts` silenciosamente retorna array vazio (`if (!supabaseAdminInstance) return []`) em vez de lançar um erro detectável. O fallback só existe em dev.

3. **Em dev**, se o main process for comprometido (RCE via IPC), `supabaseAdmin` (com service_role) está acessível em memória. O risco é baixo porque `contextIsolation: true` e `nodeIntegration: false` protegem o renderer.

### ✅ Erros engolidos silenciosamente — corrigido

`.catch(() => {})` substituídos por `logger.error()` em **14 locais**:

| Arquivo          | Função                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `repository.ts`  | `logAuditoria` (createCategoria, createLancamento, exportarDados)                                            |
| `repository.ts`  | `revokeUserSessions` (toggleClienteStatus)                                                                   |
| `auth.ts`        | `_logAuditoria` (LOGIN_FAILED, LOGIN, LOGOUT, SENHA_TROCADA, RECUPERACAO_SOLICITADA, RECUPERACAO_CONFIRMADA) |
| `auth.ts`        | `supabase.auth.signOut`                                                                                      |
| `admin.ts`       | `logAuditoria` (toggleClienteStatus, resetSenha)                                                             |
| `ipcHandlers.ts` | `setAuthSession`                                                                                             |

### 🟡 Média — Validação inconsistente de UUID

`validarUUID()` é chamada em:

- `getCategorias` (para `usuarioId`)
- `deleteConta`

**Não** é chamada em:

- `deleteSubcategoria`
- `deletePessoa`
- `updateCategoria`, `toggleCategoriaAtivo`
- `createSubcategoria`, `createConta`, `createPessoa`

### 🟡 Média — Edge Function sem validação de nome

`_callEdgeFunction` (`repository.ts:53`) aceita `functionName` como parâmetro. Hoje só recebe constantes, mas o padrão permite chamar qualquer Edge Function com o JWT do usuário.

---

## 3. Sobrecarga de Memória

### ✅ Queries com paginação — corrigido

`.limit()` adicionado nas queries de maior volume:

| Função              | Limite                                          |
| ------------------- | ----------------------------------------------- |
| `getLancamentos`    | `5000`                                          |
| `getClientes`       | `5000`                                          |
| `getChamados`       | `1000`                                          |
| `getDashboardDados` | `5000` (ambas queries: orçamento + lançamentos) |
| `getOrcamento`      | `5000`                                          |
| `getAuditoria`      | `100` (default) ou `filtros.limite`             |

**Não cobertos:** `exportarDados` (precisa exportar tudo por definição) — aceito como necessário.

### 🟡 Dupla-fetch em `getClientes`

`repository.ts:1536-1561`:

1. Busca todos usuários
2. Busca TODOS registros de auditoria (LOGIN)
3. Itera O(n×m) em JS para montar mapa de último login

### ✅ Cache local com evicção — corrigido

`_popularCache` agora chama `_limparCacheEviccao` que:

- Remove registros soft-deleted com mais de 30 dias
- Remove `financas_lancamentos` synced com mais de 6 meses
- Limita `financas_auditoria` aos 1000 registros mais recentes
- `limparCacheGeral()` também limpa `sync_conflicts` resolvidos há >7 dias
- Executado inicialmente e a cada 1h via `setInterval` em `main.ts`
- Exposto como `sync:limpar-cache` via IPC (`preload.ts` → `electronAPI.limparCache`)

---

## 4. Vazamento de Listeners / Garbage Collection

### ✅ `_statusListeners` sem cleanup — corrigido

**Arquivo:** `services/sync.ts:25`

```ts
let _statusListeners = new Set<(status: SyncStatus) => void>();
```

`onSyncStatus` retorna uma função de cleanup, mas **nenhum caller a invoca**. Se o renderer recarregar (SPA navigation, Electron reload), listeners acumulam na closure do main process.

**Correção:** `stop()` agora limpa o `Set` com `_statusListeners.clear()`.

### ✅ EventEmitter com `removeListener` — corrigido

**Arquivo:** `services/conexao.ts:41-43`

```ts
function onStatusChange(callback: (online: boolean) => void): () => void {
  emitter.on("conexao:status", callback);
  return () => {
    emitter.removeListener("conexao:status", callback);
  };
}
```

`sync.ts:60` armazena o cleanup retornado e o chama em `stop()`.

### 🟡 Timer de recuperação sobrescrito

**Arquivo:** `services/auth.ts:137-143`

```ts
function setRecoveryTokens(accessToken: string, refreshToken: string): void {
  if (_recoveryTimer) clearTimeout(_recoveryTimer);
  pendingRecoveryTokens = { accessToken, refreshToken };
  _recoveryTimer = setTimeout(() => { ... }, TEMPO_EXPIRACAO_RECUPERACAO_MS);
}
```

Se `setRecoveryTokens` for chamado sem `getRecoveryTokens`, o timer anterior é cancelado mas o próximo ainda executa — o `_recoveryTimer` é substituído sem garantir que o anterior foi completamente drenado.

### 🟢 WAL mode (ok)

SQLite está em `journal_mode = WAL`, o que reduz contenção. Mas sem checkpoint explícito, o WAL pode crescer.

---

## 5. Problemas Arquiteturais

### 🔴 God Object `repository.ts`

- **1668 linhas**, único arquivo
- Responsabilidades: CRUD de 8+ entidades, cache local, auth, admin, auditoria, exportação, Edge Functions
- Viola SRP (Single Responsibility Principle) severamente

### 🟡 Boilerplate CRUD duplicado

Cada entidade (`categoria`, `subcategoria`, `conta`, `pessoa`, `lancamento`, `orcamento`) tem `create`, `update`, `delete`, `get` com lógica **quase idêntica**. Uma camada de repositório genérico eliminaria ~60% do código.

### 🟡 Dois padrões de escrita local concorrentes

| Função             | `sync_status` | Uso                           |
| ------------------ | ------------- | ----------------------------- |
| `_inserirLocal`    | `"synced"`    | Após sucesso no Supabase      |
| `_syncAposEscrita` | `"pending"`   | Antes de escrever no Supabase |

Difícil garantir consistência entre os dois caminhos.

### 🟡 Supabase como source of truth primário

O fluxo atual:

```
Usuário → Supabase (remoto) → SQLite (local)
```

Numa app com suporte offline, deveria ser:

```
Usuário → SQLite (local) → Supabase (remoto)
```

### 🟡 Inconsistência entre módulos (CJS × ESM × TS)

| Escopo                         | Sistema                        | Problema                                                                  |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------- |
| Main process (`services/*.ts`) | TypeScript → CJS               | Correto                                                                   |
| Renderer (`public/*.js`)       | ESM (`<script type="module">`) | Correto                                                                   |
| `electron-api.d.ts`            | TS declarations                | Importa `../../src/types` mas renderer é JS puro — sem type checking real |
| Scripts                        | `.mts` + `.mjs`                | Inconsistente                                                             |

---

## 6. Resumo

| Categoria   | Qtde | Críticos                                                                |
| ----------- | ---- | ----------------------------------------------------------------------- |
| Segurança   | 7    | **Chave fraca**, SQL injection pattern; service role é baixo (dev-only) |
| Memória     | 5    | **Sem paginação**, dupla-fetch, cache sem evicção                       |
| Listener/GC | 4    | Listeners sem cleanup, timer sobrescrito                                |
| Arquitetura | 6    | **God object 1668 linhas**, CRUD duplicado, fluxo offline invertido     |

### Prioridades de correção

1. 🟢 ~~**Chave de criptografia** —~~ **ACEITO** (justificativa acima)
2. ✅ **SQL injection pattern** — corrigido: whitelist de entidades + remoção de `_lerLocal`
3. ✅ **Paginação** — `.limit()` adicionado em `getLancamentos(5000)`, `getClientes(5000)`, `getChamados(1000)`, `getDashboardDados` (ambas as queries)
4. ✅ **Erros engolidos** — 14 `.catch(() => {})` substituídos por `logger.error` em `repository.ts`, `auth.ts`, `admin.ts`, `ipcHandlers.ts`
5. ✅ **Service Role** — **FALSO POSITIVO**: `SUPABASE_SERVICE_ROLE` nunca chega em produção (`.env` não entra no ASAR). Único reparo: parâmetro morto `_supabaseAdmin` removido de `ipcHandlers.ts`
6. 🟢 ~~**Admin functions duplicadas** —~~ **ACEITO**: `getAdminDashboard`, `getClientes` e `getChamados` coexistem em `repository.ts` e `admin.ts` por padrão de camada (serviço com auth sobre dados). `getChamados` faz pós-processamento real; os pass-throughs são wrapper intencional.
7. 🟡 **God object** — fatiar `repository.ts` por domínio (categoria, lancamento, admin, sync)
8. ✅ **Listener leak** — `removeListener` no `stop()` + `_statusListeners.clear()`
9. ✅ **Cache evicção** — `_limparCacheEviccao` após `_popularCache`, executado a cada 1h
10. ✅ **UUID validation duplicada** — `admin.ts` tinha `validarUUID` + `UUID_REGEX` local. Removido; passou a importar de `repository.ts`.

---

### Plano de refatoração — God object `repository.ts`

Criar módulos por domínio sob `services/repository/`, mantendo `repository.ts` como barrel de re-exports para compatibilidade total com os testes existentes.

```
services/repository/
├── index.ts              # barrel: re-exporta todos os símbolos públicos (42)
├── utils.ts              # Helpers + infra compartilhada
├── categorias.ts         # 8 funções: CRUD categorias + subcategorias
├── contas.ts             # 4 funções: CRUD contas
├── pessoas.ts            # 4 funções: CRUD pessoas
├── lancamentos.ts        # 14 funções: CRUD lançamentos, transferências, orçamento, dashboard
├── perfil.ts             # 7 funções: perfil, sessões, export, exclusão
├── admin.ts              # 9 funções: admin dashboard, clientes, chamados
└── auditoria.ts          # 2 funções: log e query auditoria
```

#### Estratégia (incremental — cada etapa validada por testes)

| Etapa | Módulo | Funções | Risco |
|-------|--------|---------|-------|
| 0 | `utils.ts` | Helpers + infra | Baixo |
| 1 | `categorias.ts` | 8 (cat + subcat) | Baixo |
| 2 | `contas.ts` | 4 | Baixo |
| 3 | `pessoas.ts` | 4 | Baixo |
| 4 | `lancamentos.ts` | 14 (lanc, transf, orc, dash) | Médio |
| 5 | `perfil.ts` | 7 | Baixo |
| 6 | `admin.ts` | 9 | Médio |
| 7 | `auditoria.ts` | 2 | Baixo |
| — | `index.ts` + barrel | Re-exports | Nenhum |

Nenhum módulo de domínio importa outro — todos dependem apenas de `utils.ts`. Tests importam de `services/repository` (barrel) — inalterados.
