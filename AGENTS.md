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

## Scripts

| Script                              | Purpose                          |
| ----------------------------------- | -------------------------------- |
| `scripts/list-tables.mts`           | Introspect Supabase schema       |
| `scripts/popular-dados-exemplo.mts` | Seed sample data for development |
