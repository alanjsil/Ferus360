# Plano: Rollback local se Supabase falhar no delete

## Problema

Os 4 handlers de delete no `services/repository/` seguem o padrão **local primeiro, remoto depois**:

1. `deleteLancamento` (`lancamentos.ts:346`) — `database.run(UPDATE SET deleted_at…)` → `supabase.delete()`
2. `deleteTransferencia` (`lancamentos.ts:436`) — idem
3. `deleteConta` (`contas.ts:98`) — idem
4. `deletePessoa` (`pessoas.ts:90`) — idem

**Cenário de falha:**
```
database.run("UPDATE SET deleted_at…")  ← SQLite já alterado
supabase.delete()                       ← falha (rede, RLS, etc.)
throw error                             ← setState() nunca roda
```

Resultado:
- **SQLite local**: `deleted_at` setado → item invisível no próximo select
- **Estado em memória (`setState`)**: item ainda aparece → UI inconsistente
- **Supabase**: item intacto

O usuário vê o item na tela até recarregar a página, momento em que ele "some" sem explicação.

## Solução

Manter o padrão offline-first (local primeiro), mas **reverter (`rollback`) a alteração local se o Supabase falhar**. Assim:

- Preserva delete offline (marca local, sync retenta depois)
- Se remoto falhar, o `deleted_at` é desfeito → item visível de novo no DB local
- `setState` nunca roda porque o erro propaga → UI permanece consistente
- Usuário pode tentar deletar de novo quando estiver online

### Arquivos alterados

#### `services/repository/lancamentos.ts`

**`deleteLancamento`** (linha 345):

```ts
// ANTES
database.run("UPDATE financas_lancamentos SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ?", id);
let query = supabase.from("financas_lancamentos").delete().eq("id", id) as any;
query = addUsuarioFilter(query, usuarioId);
const { error } = await query;
if (error) {
  _marcarPendente("financas_lancamentos", id);
  throw error;
}

// DEPOIS
database.run("UPDATE financas_lancamentos SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ?", id);
let query = supabase.from("financas_lancamentos").delete().eq("id", id) as any;
query = addUsuarioFilter(query, usuarioId);
const { error } = await query;
if (error) {
  database.run("UPDATE financas_lancamentos SET deleted_at = NULL, sync_status = 'synced', version = version + 1, local_updated_at = datetime('now') WHERE id = ?", id);
  throw error;
}
```

**`deleteTransferencia`** (linha 435):

Mesmo padrão: local → Supabase → rollback `deleted_at = NULL` se falhar.

#### `services/repository/contas.ts`

**`deleteConta`** (linha 82):

```ts
// DEPOIS
database.run("UPDATE financas_contas SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ?", id);
let query = supabase.from("financas_contas").delete().eq("id", id) as any;
query = addUsuarioFilter(query, usuarioId);
const { error } = await query;
if (error) {
  database.run("UPDATE financas_contas SET deleted_at = NULL, sync_status = 'synced', version = version + 1, local_updated_at = datetime('now') WHERE id = ?", id);
  throw error;
}
```

A validação de UUID e checagem de vínculo com lançamentos (linhas 83-96) permanece antes de ambos (não toca DB local).

#### `services/repository/pessoas.ts`

Mesmo padrão: checagem de vínculo → local → Supabase → rollback.

#### `services/ipcHandlers.ts`

Nenhuma alteração necessária — `setState()` já está no `try` e só roda se `delete*()` não lançar exceção.

### Mudança de semântica

| Aspecto | Antes | Depois |
|---|---|---|
| Ordem | Local → Remoto | Local → Remoto (mantida) |
| Se remoto falha | `sync_status = pending` (deleted_at mantido) | Rollback: `deleted_at = NULL`, `sync_status = synced` |
| Delete offline | Sim (agenda sync) | Sim (agenda sync) |
| Consistência estado/memória | Quebrada se remoto falha | Garantida |

### Testes

- Verificar mocks existentes em `test/unitarios/services/lancamentos.test.js`, `contas.test.js`, `pessoas.test.js`
- Adicionar teste específico: Supabase falha → local tem `deleted_at = NULL` após rollback
- Adicionar teste: Supabase sucede → local tem `deleted_at` setado com `sync_status = 'synced'`
