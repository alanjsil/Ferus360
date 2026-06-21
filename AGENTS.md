# AGENTS.md

## Language

- Sempre responder em PT-BR
- Nomenclatura de funções sempre em PT-BR
- Números no formato brasileiro (usar helper "FormatarMoeda")

## Stack

- **Electron** (TypeScript → CJS via `tsc`): `main.ts`, `preload.ts`, `services/*.ts`
- **Renderer** (ESM, `<script type="module">`): `public/`
- **Scripts** (ESM `.mts`): `scripts/`
- **Supabase** (PostgreSQL), **better-sqlite3** (cache offline), **Chart.js**, **dotenv**
- TypeScript apenas no main process; sem bundler.

## Module System

Files declare their system by location — there is no `"type": "module"`:

| Scope            | System           | Source                                                               |
| ---------------- | ---------------- | -------------------------------------------------------------------- |
| Main process     | TypeScript → CJS | `main.ts`, `preload.ts`, `services/*.ts` (compilado para `dist-ts/`) |
| Renderer         | ESM (`import`)   | `public/**/*.js` (loaded via `<script type="module">`)               |
| Scripts / config | ESM (`import`)   | `*.mts`, `scripts/*.mts`, `vitest.config.*`                          |

`postinstall` script uses `node -e` inline (CJS).

## Commands

| Command                                                     | What                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm start`                                                 | `electron .`                                                                                                        |
| `npm test`                                                  | `vitest run` — **unit tests** (24 files, ~500 tests)                                                                |
| `npm run test:e2e`                                          | `vitest run --config vitest.config.integrado.js` — **E2E** tests via `test/e2e/` (needs real Supabase, `.env.test`) |
| `npm run test:integracao`                                   | `vitest run test/integrados` — **integrados** (mock Supabase, multi-serviço)                                        |
| `npm run lint`                                              | ESLint flat config (`eslint.config.mjs`)                                                                            |
| `npm run build`                                             | electron-builder (outputs to `dist/`)                                                                               |
| `npm run cover`                                             | `vitest run --coverage` (cov to `coverage/`)                                                                        |
| `npx vitest`                                                | watch mode                                                                                                          |
| `npx vitest run test/unitarios/services/repository.test.js` | single file                                                                                                         |
| `npm run conecta`                                           | `tsx scripts/list-tables.mts` — list Supabase tables                                                                |
|                                                             |

## Test Architecture (3 tiers)

1. **Unit** (`test/unitarios/`) — jsdom, mocks injected, 15 s timeout. Vitest config: `vitest.config.js`.
2. **E2E** (`test/e2e/`) — real Supabase with `.env.test`, 60 s timeout, `--fileParallelism=false`. Vitest config: `vitest.config.integrado.js`.
3. **Integrados** (`test/integrados/`) — mock Supabase, multi-serviço. Vitest config: `vitest.config.js`.

CI (`Ci Testes.yml`) runs: `npm ci` → `npm test` → `npm run build`.

## Key Conventions

- **AAA structure** (`// Arrange` / `// Act` / `// Assert`) in every `it()` block per `test/Guia para testes.md`
- **describes in PT-BR**, `it()` descriptions in PT-BR
- **Function names in PT-BR**
- **JSDoc `@file` header** on every file; `@module` + `@changelog` on test files (SDD pattern)
- **Indent**: 2 spaces, **Quotes**: double, **Semicolons**: required
- **State mirror**: `services/state.ts` is the source of truth; renderer syncs via IPC
- **All IPC** goes through `preload.ts` → `electronAPI.*` (contextBridge); business logic is exclusively in main process `services/`
- **`.env`** never leaves main process; tests set `SUPABASE_URL` + `SUPABASE_ANON_KEY` via `test/setup.js`

## Supabase

- `.env`: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` required for the app
- `.env.test`: used by `test:e2e` (loaded in `vitest.config.integrado.js`)
- All queries in `services/repository.ts`
- RLS enabled
- MCP remote configured in `opencode.json` (project ref `lsjoopdtjjadfoqsaasu`)

## Repository Test Pattern

Unit tests for `services/repository.ts` use a `__seed(table, rows)` helper that injects mock data directly into the mock Supabase. Integration/E2E tests seed/cleanup via `helpers.js`.

## Playwright (teste de UI)

Testes Playwright ficam em `test/e2e/*.spec.ts` (config: `playwright.config.ts`).

| Comando | O que faz |
|---|---|
| `npm run test:playwright` | `npm run build:ts && playwright test` |

### Lições Aprendidas (debug de 4h que você não quer repetir)

**1. Sessão Supabase vs RLS — a armadilha**

Quando o Electron faz login via `signInWithPassword`, o cliente Supabase global ganha uma sessão. Mas o `getUser(token)` do `verificarAuth` é **stateless** — não garante que a sessão do cliente global ainda está ativa quando os IPCs de dados rodam.

**Sintoma**: IPC retorna categorias globais mas NUNCA retorna categorias pessoais (aquelas com `eh_global: false`, `usuario_id` preenchido).

**Causa**: RLS policy exige `usuario_id = auth.uid()`. Se a sessão Supabase expirou ou não foi propagada, `auth.uid()` é NULL e a RLS filtra tudo.

**Solução**: usar **sempre `eh_global: true`** em categorias seedadas para testes, igual o `test/e2e/seed.js` do Vitest faz. Categoria global é visível por qualquer usuário (RLS: `eh_global = true OR usuario_id = auth.uid()`).

**2. Cache SQLite local sabota consultas Supabase**

`repository.getCategorias()` e `getSubcategorias()` **primeiro consultam SQLite local**, e se houver dados, **retornam sem consultar Supabase**.

**Sintoma**: seed cria dados no Supabase, mas IPC retorna dados antigos (ou vazios) do cache local.

**Solução**: deletar `%APPDATA%/financas/financas.db` (e `-wal`, `-shm`) **antes de abrir o Electron** em cada execução de teste.

**3. Select de subcategoria não popula após change event**

O `change` event do `#categoria` deveria chamar `atualizarSubcategorias()`, que filtra `subcategoriasCache` e popula o select. Há casos em que o cache está populado, o `categoria_id` bate, mas o select não é populado.

**Workaround**: injetar manualmente via `page.evaluate`:

```ts
await page.evaluate(async () => {
  const categoriaId = (document.getElementById("categoria") as HTMLSelectElement).value;
  const select = document.getElementById("subcategoria") as HTMLSelectElement;
  const subs = await window.electronAPI.getSubcategorias();
  if (!subs?.length) return;
  select.innerHTML = '<option value="" disabled selected>Selecione...</option>';
  subs.filter((s) => String(s.categoria_id) === categoriaId)
      .forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.nome;
        select.appendChild(opt);
      });
});
```

**4. Usuário fixo vs dinâmico**

Criar usuário via `auth.admin.createUser` + upsert em `financas_usuarios` a cada execução é frágil (FKs, RLS, cleanup). Prefira **um usuário fixo criado manualmente** no Supabase e reutilizado pelos testes, com seed apenas de dados de teste (subcategoria, conta).

**5. Limpeza cirúrgica**

`afterAll` deve deletar **apenas** o que o seed criou (`where nome = 'X' and usuario_id = 'Y'`), não varrer por domínio de email — evita deletar dados de outros testes.

### Checklist para novo teste Playwright

- [ ] Usar categoria global (`eh_global: true`) já existente ou criar uma
- [ ] Deletar `financas.db` antes de abrir o Electron
- [ ] Usuário fixo no Supabase (não criar via API)
- [ ] Seed com `maybeSingle()` (idempotente)
- [ ] Limpeza cirúrgica no `afterAll` (só o que seedou)
- [ ] Select por `{ label: "..." }` em vez de UUID ou index
- [ ] Workaround de subcategoria via `page.evaluate` se necessário

## Scripts

| Script                              | Purpose                          |
| ----------------------------------- | -------------------------------- |
| `scripts/list-tables.mts`           | Introspect Supabase schema       |
| `scripts/popular-dados-exemplo.mts` | Seed sample data for development |
