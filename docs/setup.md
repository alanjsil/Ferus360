# Setup do Ambiente de Desenvolvimento

## Pré-requisitos

| Ferramenta | Versão Mínima | Instalação                                |
| ---------- | ------------- | ----------------------------------------- |
| Node.js    | >= 22         | `winget install OpenJS.NodeJS.LTS` ou [nodejs.org](https://nodejs.org) |
| npm        | >= 10         | Acompanha o Node.js                       |
| Git        | —             | `winget install Git.Git`                  |
| Python     | 3.x           | Necessário para compilar `better-sqlite3` |

## Passo a passo

### 1. Clonar o repositório

```bash
git clone https://github.com/alanjsil/financas.git
cd financas
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
SUPABASE_URL=https://lsjoopdtjjadfoqsaasu.supabase.co
SUPABASE_SERVICE_ROLE=suas_service_role_key_aqui
```

A `SUPABASE_SERVICE_ROLE` pode ser obtida no painel do Supabase (Project Settings → API → service_role key). Necessária para operações administrativas.

### 3. Instalar dependências

```bash
npm install
```

O `postinstall` executa:
1. `@electron/rebuild` — recompila `better-sqlite3` para a versão do Electron
2. `tsc` — compila TypeScript para `dist-ts/`

### 4. Configurar o banco Supabase

Aplique o schema SQL:

```bash
npm run conecta           # Testa conexão com Supabase
```

Copie e execute o conteúdo de `supabase/schema.sql` no SQL Editor do painel Supabase (ou use a CLI do Supabase).

### 5. Executar o app

```bash
npm start
```

Compila TypeScript + inicia o Electron.

### 6. Executar testes

```bash
npm test                  # Testes unitários + integrados (581 testes)
npm run test:e2e          # E2E com Supabase real (precisa de .env.test)
npm run test:integracao   # Apenas testes integrados
```

## Estrutura de diretórios

```
financas/
├── main.ts               # Entrada do Electron (TypeScript → dist-ts/)
├── preload.ts            # Ponte IPC (contextBridge)
├── dialog-senha-preload.ts # Preload da janela modal de senha
├── services/             # Lógica de negócio (main process)
│   ├── auth.ts           # Autenticação Supabase
│   ├── repository.ts     # CRUD + criptografia
│   ├── ipcHandlers.ts    # Registro de canais IPC
│   ├── state.ts          # Estado centralizado
│   ├── conexao.ts        # Cliente Supabase + monitor
│   ├── database.ts       # SQLite local (better-sqlite3)
│   ├── sync.ts           # Sincronização offline
│   └── admin.ts          # Operações administrativas
├── public/               # Renderer (ESM, sem framework)
│   ├── *.html            # Páginas
│   └── js/               # Módulos JS
├── src/                  # Tipos compartilhados
│   └── types.d.ts        # Interfaces de domínio
├── supabase/
│   └── schema.sql        # Schema PostgreSQL + RLS
├── test/                 # Testes
│   ├── unitarios/        # Testes unitários (jsdom)
│   ├── integrados/       # Testes integrados (mock Supabase)
│   └── e2e/              # Testes E2E (Supabase real)
├── dist-ts/              # TypeScript compilado (não versionar)
├── dist/                 # Build do electron-builder (não versionar)
└── docs/                 # Documentação
```

## Configuração de testes

| Config         | Unitários (`vitest.config.js`) | E2E (`vitest.config.integrado.js`) |
| -------------- | ------------------------------ | ---------------------------------- |
| Ambiente       | jsdom                          | jsdom                              |
| Timeout        | 15s                            | 60s                                |
| Setup          | `test/setup.js`                | `.env.test`                        |
| Inclusão       | `test/unitarios/`              | `test/e2e/`                        |
| Parallelismo   | Sim                            | Não (`fileParallelism: false`)     |

## Wireguard / VPN (se aplicável)

Se o Supabase estiver atrás de firewalls corporativos, configure o acesso via rede corporativa.

## Troubleshooting

### better-sqlite3 não compila

```bash
npm rebuild better-sqlite3
npx @electron/rebuild -f -w better-sqlite3
```

No Windows, instale Visual Studio Build Tools ou `windows-build-tools`.

### TypeScript não compila

```bash
npm run build:ts    # tsc
```

Verifique erros no terminal.

### Erro de conexão com Supabase

Confirme que `.env` está na raiz e contém as chaves corretas.

### Testes falham com timeout

Aumente `testTimeout` no `vitest.config.js` ou execute testes individualmente:

```bash
npx vitest run test/unitarios/services/repository.test.js
```
