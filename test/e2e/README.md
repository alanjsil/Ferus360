# Testes E2E (End-to-End)

Testes que validam fluxos completos do sistema contra um **banco Supabase real**.

## Configuração

- **Vitest config**: `vitest.config.integrado.js` (raiz do projeto)
- **Timeout**: 60s por teste
- **Sem paralelismo**: `fileParallelism: false`
- **Seed**: `seed.js` + helpers em `helpers-reais.js`

## Execução

```bash
npm run test:e2e
```

## Estrutura

| Arquivo                        | Fluxo testado                        |
| ------------------------------ | ------------------------------------ |
| `auth-lancamento.test.js`      | Login → Lançamento → Dashboard       |
| `categoria-lancamento.test.js` | CRUD Categorias + Lançamentos        |
| `conta-lancamento.test.js`     | CRUD Contas + Lançamentos            |
| `orcamento-dashboard.test.js`  | Orçamento → Dashboard                |
| `perfil-auditoria.test.js`     | Perfil → Trilha de Auditoria         |
| `excluir-conta.test.js`        | Exclusão de Conta                    |
| `chamados-suporte.test.js`     | Ciclo de Chamados                    |
| `admin-global.test.js`         | Admin: Dashboard, Clientes, Chamados |

## Origem

Substituiu os antigos `test/integrados/` (mock-based). Migrados no commit
`3291d55` — os `*.real.test.js` foram renomeados para `test/e2e/` e o
config `vitest.config.integrado.js` passou a apontar para cá.
