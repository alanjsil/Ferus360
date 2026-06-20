# Finanças Pessoais

Sistema desktop de **controle financeiro pessoal** construído com Electron e Supabase. Gerencia receitas, despesas, transferências, orçamento mensal, auditoria e dashboards com gráficos interativos.

## Funcionalidades

- **Autenticação** — login com email/senha via Supabase Auth, recuperação de senha com link mágico
- **Dashboard** — visão geral com saldo, receitas/despesas por período, gráficos Chart.js e indicadores
- **Categorias** — cadastro de categorias (RECEITA/DESPESA/TRANSFERÊNCIA), subcategorias, categorias globais
- **Contas** — contas bancárias para rastrear origem/destino das transações
- **Pessoas** — cadastro de pessoas/contrapartes vinculadas a lançamentos
- **Lançamentos** — transações financeiras com data, valor, status (PAGO/PENDENTE/CANCELADO), categoria, subcategoria, conta e pessoa
- **Orçamento** — planejamento mensal com valores planejados vs realizados por categoria, suporte a itens recorrentes
- **Auditoria** — registro de todas as ações com metadados (entidade, IP, device_id)
- **Administração** — painel admin para gestão de usuários (ativar/desativar, alterar papel)
- **Chamados** — sistema de suporte interno com respostas e status (aberto/em andamento/resolvido)
- **Temas claro/escuro** — alternância por botão com preferência persistida
- **Segurança** — contextIsolation + nodeIntegration desligado + RLS no Supabase

## Stack

| Camada        | Tecnologia                                         |
| ------------- | -------------------------------------------------- |
| Desktop       | Electron 39                                        |
| Frontend      | JavaScript (ES modules, sem framework)             |
| Backend       | Node.js (processo principal do Electron, TypeScript → CJS via `tsc`) |
| Banco         | Supabase (PostgreSQL) via `@supabase/supabase-js`  |
| Gráficos      | Chart.js                                           |
| Ícones        | FontAwesome 7 (npm, sem CDN)                       |
| Testes        | Vitest v4 com cobertura (v8) + jsdom               |
| Linter        | ESLint flat config (`eslint.config.mjs`)           |

## Arquitetura

```
┌───────────────────────────────────────────────────────────┐
│               main process (Node.js, TypeScript)          │
│                                                           │
│  services/                                                │
│  ├── state.ts        ◄── fonte da verdade                 │
│  ├── auth.ts         ◄── Supabase Auth                    │
│  ├── admin.ts        ◄── administração                    │
│  ├── repository.ts   ◄── queries centralizadas            │
│  ├── ipcHandlers.ts  ◄── handlers IPC                     │
│  ├── sync.ts         ◄── sincronização offline→online     │
│  ├── logger.ts       ◄── logging estruturado              │
│  ├── database.ts     ◄── conexão SQLite (cache offline)   │
│  └── conexao.ts      ◄── gerenciamento de conectividade   │
│         │                                                 │
│         ▼ IPC (ipcMain.handle)                            │
├───────────────────────────────────────────────────────────┤
│                   preload.ts                              │
│         contextBridge → electronAPI.*                     │
├───────────────────────────────────────────────────────────┤
│                   renderer (sandbox)                      │
│                                                           │
│  public/                                                  │
│  ├── login.html              ◄── autenticação             │
│  ├── redefinir.html          ◄── recuperação de senha     │
│  ├── dashboard.html          ◄── visão geral              │
│  ├── index.html              ◄── planejamento orçamentário│
│  ├── configuracoes.html      ◄── configurações + cat.     │
│  ├── admin.html              ◄── painel administrativo    │
│  ├── conflitos.html          ◄── resolução de conflitos   │
│  ├── visualizar-cliente.html ◄── visão cliente            │
│  └── visualizar-dashboard-cliente.html ◄── dashboard cliente
└───────────────────────────────────────────────────────────┘
```

**State Mirror Pattern**: o `services/state.ts` no main process é a única fonte da verdade. O renderer mantém uma cópia local sincronizada via IPC. Toda mutação passa por IPC e o renderer atualiza seu mirror com o snapshot retornado.

**IPC Bridge**: toda lógica de negócio roda no main process, nunca exposta ao DevTools. O `preload.ts` expõe apenas canais específicos via `contextBridge.exposeInMainWorld("electronAPI", ...)`.

## Estrutura do projeto

```
Finanças Pessoais/
├── main.ts                          # Janela Electron + IPC handlers (TypeScript → CJS)
├── preload.ts                       # Bridge seguro (contextBridge)
├── dialog-senha-preload.ts          # Preload para dialog de senha
├── tsconfig.json                    # Configuração TypeScript (compila para dist-ts/)
├── package.json                     # Dependências e scripts
├── eslint.config.mjs                # ESLint flat config
├── opencode.json                    # Configuração opencode + MCP Supabase
├── AGENTS.md                        # Instruções para agentes de IA
├── .env                             # Credenciais Supabase (gitignored)
├── .gitignore                       # Arquivos ignorados pelo git
├── .vscode/                         # Configurações do VS Code
├── .github/                         # GitHub Actions (CI)
├── ProjetoFinancas.code-workspace   # Workspace do VS Code
├── build/                           # Ícone do aplicativo (electron-builder)
├── CHANGELOG.md                     # Histórico de versões
├── CODE_OF_CONDUCT.md               # Código de conduta
├── LICENSE.md                       # Licença do projeto
├── SECURITY.md                      # Política de segurança
├── THIRD-PARTY-NOTICES.md           # Avisos de licenças de terceiros
├── vitest.config.js                 # Configuração Vitest (unitários/integrados)
├── vitest.config.integrado.js       # Configuração Vitest (E2E)
├── dist-ts/                         # Compilado TypeScript (gerado)
├── src/                             # Código compartilhado
│   ├── env.js                       # Consumo de variáveis de ambiente
│   └── types.d.ts                   # Tipos TypeScript globais
├── public/                          # Renderer (sandbox)
│   ├── *.html                       # Páginas do app (login, dashboard, etc.)
│   ├── js/                          # Scripts do renderer (ESM)
│   ├── css/                         # Estilos do app
│   ├── fontawesome/                 # FontAwesome 7 (versão free, assets estáticos)
│   └── img/                         # Imagens
├── services/                        # Main process (TypeScript → CJS)
│   ├── state.ts                     # Estado centralizado (fonte da verdade)
│   ├── auth.ts                      # Autenticação Supabase
│   ├── admin.ts                     # Administração de usuários
│   ├── repository.ts                # Queries Supabase centralizadas
│   ├── ipcHandlers.ts               # Handlers IPC
│   ├── sync.ts                      # Sincronização offline→online
│   ├── logger.ts                    # Logging estruturado
│   ├── database.ts                  # Conexão SQLite (cache offline)
│   └── conexao.ts                   # Gerenciamento de conectividade
├── scripts/                         # Scripts auxiliares (ESM)
│   ├── list-tables.mts              # Lista tabelas no Supabase
│   ├── popular-dados-exemplo.mts    # Popula dados de exemplo
│   └── vite-plugin-resolve-js-to-ts.mjs # Plugin Vite para resolver TS
├── supabase/                        # Supabase Edge Functions
│   └── functions/
│       ├── criar-usuario/           # Cria usuário (admin)
│       ├── get-user-sessions/       # Lista sessões do usuário
│       ├── revoke-user-sessions/    # Revoga sessões do usuário
│       ├── revoke-other-sessions/   # Revoga sessões de outros
│       └── delete-user-session/     # Remove sessão específica
├── test/                            # Testes Vitest
│   ├── setup.js                     # Setup global (jsdom)
│   ├── unitarios/                   # Testes unitários
│   │   ├── pages/                   # Testes de páginas do renderer
│   │   ├── services/                # Testes de serviços do main process
│   │   └── utils/                   # Testes de utilitários
│   ├── integrados/                  # Testes de integração (mock Supabase)
│   └── e2e/                         # Testes E2E (Supabase real)
├── docs/
│   ├── database-schema.md           # DDL completo do banco Supabase
│   ├── architecture.md              # Arquitetura detalhada
│   ├── setup.md                     # Guia de setup
│   ├── deploy.md                    # Guia de deploy
│   ├── ipc-reference.md             # Referência IPC
│   ├── cache-e-storage.md           # Cache offline e storage
│   └── Debug Sequencia.md           # Debug passo a passo
└── coverage/                        # Relatório de cobertura (gerado)
```

## Como usar

### Pré-requisitos

- Node.js 22+
- Uma instância Supabase (PostgreSQL) com as tabelas do projeto
- Conta no Supabase para credenciais de autenticação

### Instalação

```bash
npm install
```

> O `postinstall` executa `@electron/rebuild` para `better-sqlite3` e compila o TypeScript (`tsc`).

### Configuração

Crie um arquivo `.env` na raiz com base no template:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE=sua_service_role_key
```

### Executar

```bash
npm start
```

### Testes

```bash
npm test                    # vitest run (unitários + integrados)
npm run test:e2e            # E2E (Supabase real, .env.test)
npm run cover               # vitest run --coverage (cobertura em coverage/)
npx vitest                  # modo watch
npx vitest run test/unitarios/services/repository.test.js # arquivo único
```

### Lint

```bash
npm run lint
```

### Build / Distribuição

```bash
npm run build          # electron-builder (NSIS/portable Windows)
npm run build_mac      # electron-builder (macOS DMG)
```

## Modelo de dados (Supabase)

- `financas_usuarios` — usuários do sistema (roles: user, admin)
- `financas_categorias` — categorias (RECEITA/DESPESA/TRANSFERÊNCIA), com suporte a categorias globais
- `financas_subcategorias` — subcategorias vinculadas a categorias
- `financas_contas` — contas bancárias
- `financas_pessoas` — pessoas/contrapartes
- `financas_lancamentos` — transações financeiras com status, categorização e vinculo a contas/pessoas
- `financas_orcamento` — planejamento orçamentário mensal com valores planejados vs realizados
- `financas_chamados` — chamados de suporte com respostas e status
- `financas_auditoria` — auditoria de ações com metadados (entidade, IP, device_id, contexto)

## Licença

**Software proprietário** — Todos os direitos reservados.

Copyright (c) 2025 Alan Silveira.

Este software é proprietário e de uso comercial. Consulte o arquivo
[`LICENSE.md`](LICENSE.md) para os termos completos.

Este projeto incorpora componentes de terceiros sob licenças
permissivas (MIT, BSD). Os avisos de copyright e termos aplicáveis
estão no arquivo [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
