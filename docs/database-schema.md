# Schema do Banco de Dados

## Visão geral

Banco PostgreSQL no Supabase com extensão `pgcrypto`. Todas as tabelas seguem o prefixo `financas_` e possuem RLS (Row Level Security) ativado.

## Convenções comuns

Todas as tabelas possuem estes campos de sincronização:

| Coluna         | Tipo        | Descrição                                      |
| -------------- | ----------- | ---------------------------------------------- |
| `version`      | `INTEGER`   | Controle de versão otimista para sync offline  |
| `deleted_at`   | `TIMESTAMPTZ` | Soft delete (sincronizado via sync)           |
| `device_id`    | `TEXT`      | Identificador do dispositivo que criou/alterou |
| `updated_by`   | `UUID`      | Quem fez a última alteração                   |
| `criado_em`    | `TIMESTAMPTZ` | Data de criação (default `NOW()`)            |
| `atualizado_em` | `TIMESTAMPTZ` | Data da última alteração (trigger automático) |

---

## Tabelas

### `financas_usuarios`

Perfil dos usuários. Criado automaticamente pelo trigger `on_auth_user_created` quando um usuário se cadastra no Supabase Auth.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `nome` | `TEXT` | NOT NULL, 2-40 caracteres |
| `email` | `TEXT` | NOT NULL, UNIQUE |
| `role` | `TEXT` | `'user'` ou `'admin'`, default `'user'` |
| `ativo` | `BOOLEAN` | Default `TRUE` |
| `avatar_url` | `TEXT` | |
| `criado_em` | `TIMESTAMPTZ` | `NOW()` |
| `atualizado_em` | `TIMESTAMPTZ` | `NOW()` |

**RLS:** próprio usuário ou admin.
**Trigger:** `handle_new_user()` — cria perfil automaticamente ao cadastrar via Auth.

---

### `financas_categorias`

Categorias de lançamentos (RECEITA, DESPESA, TRANSFERENCIA). Podem ser globais (criadas por admin) ou pessoais.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `nome` | `TEXT` | 2-40 caracteres |
| `tipo` | `TEXT` | `'RECEITA'`, `'DESPESA'`, `'TRANSFERENCIA'` |
| `usuario_id` | `UUID` | FK → `financas_usuarios`, NULL para globais |
| `eh_global` | `BOOLEAN` | Default `FALSE` |
| `ativo` | `BOOLEAN` | Default `TRUE` |

**RLS:** globais são públicas, pessoais isoladas por usuário, admin vê tudo.

---

### `financas_subcategorias`

Subcategorias vinculadas a uma categoria.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `categoria_id` | `UUID` | FK → `financas_categorias` (ON DELETE CASCADE) |
| `nome` | `TEXT` | 2-40 caracteres |
| `usuario_id` | `UUID` | FK → `financas_usuarios` |

**RLS:** isolamento por `usuario_id`.

---

### `financas_contas`

Contas bancárias/carteiras do usuário.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `nome` | `TEXT` | 2-40 caracteres |
| `usuario_id` | `UUID` | FK → `financas_usuarios` |

**RLS:** admin vê tudo, usuário só as próprias.

---

### `financas_pessoas`

Pessoas associadas a lançamentos (ex: fornecedores, clientes).

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `nome` | `TEXT` | 2-40 caracteres |
| `usuario_id` | `UUID` | FK → `financas_usuarios` |

**RLS:** admin vê tudo, usuário só as próprias.

---

### `financas_lancamentos`

Tabela principal — registros financeiros (receitas, despesas, transferências).

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `usuario_id` | `UUID` | FK → `financas_usuarios` |
| `data` | `DATE` | NOT NULL |
| `tipo` | `TEXT` | `'RECEITA'`, `'DESPESA'`, `'TRANSFERENCIA'` |
| `valor` | `NUMERIC(12,2)` | > 0 |
| `status` | `TEXT` | `'PAGO'`, `'PENDENTE'`, `'CANCELADO'` |
| `categoria_id` | `UUID` | FK → `financas_categorias` |
| `subcategoria_id` | `UUID` | FK → `financas_subcategorias` |
| `conta_origem_id` | `UUID` | FK → `financas_contas` |
| `conta_destino_id` | `UUID` | FK → `financas_contas` |
| `transferencia_grupo_id` | `UUID` | Agrupa lançamentos de uma transferência |
| `pessoa_id` | `UUID` | FK → `financas_pessoas` |
| `descricao` | `TEXT` | |
| `data_pagamento` | `TIMESTAMPTZ` | |
| `data_busca` | `TEXT` | Coluna gerada: `YYYY-MM` para filtros |

**Índices:** data, tipo, status, categoria, data_busca, transferencia_grupo, usuário.
**RLS:** admin vê tudo, usuário só os próprios.

---

### `financas_orcamento`

Planejamento orçamentário mensal.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `usuario_id` | `UUID` | FK → `financas_usuarios` |
| `data` | `DATE` | NOT NULL |
| `tipo` | `TEXT` | `'RECEITA'` ou `'DESPESA'` |
| `descricao` | `TEXT` | |
| `valor_planejado` | `NUMERIC(12,2)` | >= 0 |
| `valor_realizado` | `NUMERIC(12,2)` | >= 0, default 0 |
| `categoria_id` | `UUID` | FK → `financas_categorias` |
| `subcategoria_id` | `UUID` | FK → `financas_subcategorias` |
| `conta_id` | `UUID` | FK → `financas_contas` |
| `pessoa_id` | `UUID` | FK → `financas_pessoas` |
| `recorrente` | `BOOLEAN` | Default FALSE |
| `observacoes` | `TEXT` | |
| `mes` | `INTEGER` | Coluna gerada |
| `data_busca` | `TEXT` | Coluna gerada: `YYYY-MM` |

**RLS:** admin vê tudo, usuário só o próprio.

---

### `financas_chamados`

Chamados de suporte abertos por usuários.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `usuario_id` | `UUID` | FK → `financas_usuarios` |
| `titulo` | `TEXT` | 2-200 caracteres |
| `descricao` | `TEXT` | |
| `respostas` | `JSONB` | Array de respostas, default `[]` |
| `status` | `TEXT` | `'aberto'`, `'em_andamento'`, `'resolvido'` |

**RLS:** próprio usuário ou admin.

---

### `financas_auditoria`

Log de auditoria de todas as operações.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `UUID` | PK |
| `usuario_id` | `UUID` | FK → `financas_usuarios` |
| `acao` | `ENUM` | `INSERT`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `SENHA_TROCADA`, `DADOS_EXPORTADOS`, `CONTA_EXCLUIDA`, `ADMIN_TOGGLE_USUARIO`, `ADMIN_RESET_SENHA`, `ADMIN_CRIOU_USUARIO`, `CONFLITO_RESOLVIDO` |
| `entidade` | `TEXT` | Nome da tabela |
| `entidade_id` | `UUID` | ID do registro |
| `dados_anteriores` | `JSONB` | Estado antes (UPDATE/DELETE) |
| `dados_novos` | `JSONB` | Estado depois (INSERT/UPDATE) |
| `ip` | `TEXT` | |
| `user_agent` | `TEXT` | |
| `contexto` | `TEXT` | `'user'`, `'admin'`, `'trigger'` |

**Índices:** usuário, ação, entidade, data.
**RLS:** admin vê tudo, usuário vê apenas os próprios logs.

---

## Row Level Security (RLS)

Todas as tabelas têm RLS habilitado. O padrão geral:

| Operação | Regra |
|---|---|
| `SELECT` | Próprio registro OU admin |
| `INSERT` | Apenas próprio usuário (exceção: admin pode criar categorias globais) |
| `UPDATE` | Próprio usuário OU admin |
| `DELETE` | Próprio usuário (admin via service role) |

A função helper `is_admin()` verifica se `auth.uid()` tem `role = 'admin'` na tabela `financas_usuarios`.

---

## Sincronização offline (RPCs)

| Função | Descrição |
|---|---|
| `sync_insert(tabela, payload)` | Insere registro em tabela permitida |
| `sync_upsert(registro_id, expected_version, tabela, payload)` | Atualiza com controle de versão (lança `CONFLICT` se versão não bater) |
| `sync_delete(registro_id, tabela)` | Soft delete (marca `deleted_at`) |

Tabelas permitidas nas RPCs de sync: `financas_lancamentos`, `financas_categorias`, `financas_subcategorias`, `financas_contas`, `financas_pessoas`, `financas_orcamento`, `financas_chamados`.

---

## Gerenciamento de sessões

| Função | Descrição |
|---|---|
| `get_user_sessions(p_user_id)` | Lista sessões ativas no `auth.sessions` |
| `delete_user_session(p_session_id)` | Remove sessão + refresh tokens |

---

## Exclusão de conta

Função `excluir_conta()` (SECURITY DEFINER): remove todos os dados do usuário em todas as tabelas (`lancamentos`, `orcamento`, `contas`, `pessoas`, `categorias`, `subcategorias`, `chamados`, `usuarios`) e também do `auth.users`. Restrita a usuários autenticados (`GRANT EXECUTE TO authenticated`).

---

## Triggers

| Trigger | Tabelas | Função |
|---|---|---|
| `set_atualizado_em_*` | Todas as 8 tabelas | Atualiza `atualizado_em` automaticamente |
| `audit_*` | Todas as 7 tabelas de dados | Log de auditoria (INSERT/UPDATE/DELETE) via `auditoria_trigger()` |
| `on_auth_user_created` | `auth.users` | Cria perfil em `financas_usuarios` ao cadastrar |
