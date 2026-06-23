# Análise Comparativa: `schema.sql` vs `services/database.ts`

## 1. `financas_usuarios` — Ausente no SQLite

A tabela de usuários não é criada no cache local, tornando o app 100% dependente do Supabase Auth para dados de perfil — sem suporte offline.</br>
**Isto é proposital.**

## 2. Triggers duplicados no `schema.sql` (linhas 439–514)

Existem **dois conjuntos de triggers** que fazem a mesma coisa (atualizar `atualizado_em`):

- `trigger_set_atualizado_em` / `set_atualizado_em_*`
- `trigger_set_updated_at` / `set_updated_at_*`

Cada `UPDATE` dispara ambos, resultando em duas chamadas a `NOW()`. O segundo conjunto é redundante e deve ser removido.

## 3. Precisão monetária: `REAL` vs `NUMERIC(12,2)`

| Local      | Coluna                              | Tipo            |
| ---------- | ----------------------------------- | --------------- |
| PostgreSQL | `valor`                             | `NUMERIC(12,2)` |
| SQLite     | `valor`                             | `REAL`          |
| PostgreSQL | `valor_planejado / valor_realizado` | `NUMERIC(12,2)` |
| SQLite     | `valor_planejado / valor_realizado` | `REAL`          |

`REAL` (IEEE 754) não é preciso para valores monetários. Deveria ser `INTEGER` (centavos) ou `TEXT` com validação no app.

## 4. Colunas geradas vs manuais

No PostgreSQL `data_busca` e `mes` são `GENERATED ALWAYS AS (...) STORED`. No SQLite são colunas comuns que a aplicação precisa popular manualmente — sem garantia de consistência.

## 5. Ausência de FOREIGN KEYs no SQLite

Apesar de `PRAGMA foreign_keys = ON`, nenhuma FK é declarada no SQLite:

| Coluna                               | Deveria referenciar          |
| ------------------------------------ | ---------------------------- |
| `categoria_id`                       | `financas_categorias(id)`    |
| `subcategoria_id`                    | `financas_subcategorias(id)` |
| `conta_origem_id / conta_destino_id` | `financas_contas(id)`        |
| `pessoa_id`                          | `financas_pessoas(id)`       |
| `usuario_id` (em todas)              | `financas_usuarios(id)`      |
| `updated_by` (em todas)              | `financas_usuarios(id)`      |

Isso permite dados órfãos localmente.

## 6. Tipos JSON: `JSONB` vs `TEXT`

| Coluna                         | PostgreSQL | SQLite |
| ------------------------------ | ---------- | ------ |
| `respostas` (chamados)         | `JSONB`    | `TEXT` |
| `dados_anteriores` (auditoria) | `JSONB`    | `TEXT` |
| `dados_novos` (auditoria)      | `JSONB`    | `TEXT` |

Correto — SQLite não tem JSONB nativo. O app precisa fazer `JSON.parse/stringify`.

## 7. Colunas de sincronia (só SQLite)

Colunas extras no cache local, ausentes no PostgreSQL (comportamento esperado):

- `sync_status`, `sync_error`, `local_updated_at`, `remote_updated_at`

## 8. Policy `auditoria_insert` com `TO public`

```sql
CREATE POLICY "auditoria_insert" ON financas_auditoria FOR INSERT TO public
  WITH CHECK (auth.role () = 'authenticated');
```

O `TO public` é conceitualmente incorreto. Deveria ser `TO authenticated` ou simplesmente omitir o `TO`.

## 9. Resumo das divergências

| Aspecto                  | schema.sql (PostgreSQL) | database.ts (SQLite)     |
| ------------------------ | ----------------------- | ------------------------ |
| `financas_usuarios`      | ✅ Presente             | ❌ Ausente               |
| Triggers `atualizado_em` | ⚠️ Duplicado            | N/A                      |
| `valor`                  | `NUMERIC(12,2)`         | `REAL` ⚠️ perde precisão |
| `data_busca` / `mes`     | `GENERATED ALWAYS`      | Coluna normal ⚠️         |
| FOREIGN KEYs             | ✅ Todas declaradas     | ❌ Nenhuma               |
| `respostas`              | `JSONB`                 | `TEXT` ✅                |
| `dados_anteriores/novos` | `JSONB`                 | `TEXT` ✅                |
| Colunas de sync          | ❌ Ausentes             | ✅ `sync_status` etc.    |
| Auditoria RLS            | `TO public` ⚠️          | N/A                      |
