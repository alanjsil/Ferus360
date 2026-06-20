# Cache & Storage

## Renderer — Cache em memória (variáveis JS)

| Variável             | Tipo    | Onde                     | Descrição                           |
| -------------------- | ------- | ------------------------ | ----------------------------------- |
| `categoriasCache`    | `Array` | `index.js`, `visualizar-cliente.js` | Categorias carregadas do backend    |
| `subcategoriasCache` | `Array` | `index.js`, `visualizar-cliente.js` | Subcategorias carregadas do backend |
| `contasCache`        | `Array` | `index.js`, `visualizar-cliente.js` | Contas carregadas do backend        |

Populadas via IPC (`electronAPI.*`) e usadas para evitar refetch em combos, autocomplete e exibição de lançamentos.

---

## localStorage (persiste entre sessões físicas)

| Chave                    | Valor                               | Onde            |
| ------------------------ | ----------------------------------- | --------------- |
| `filtro_estado_geral`       | JSON do estado completo dos filtros                     | `index.js`  |
| `filtro_mes_selecionado`    | string (`"all"` ou `"2026-06"`)                         | `index.js`  |
| `filtro_ano_selecionado`    | string (`"all"` ou `"2026"`)                            | `index.js`  |
| `filtro_tipo_selecionado`   | string (`"all"`, `"RECEITA"`, `"DESPESA"`)              | `index.js`  |
| `filtro_status_selecionado` | string (`"all"`, `"PAGO"`, `"PENDENTE"`)                | `index.js`  |
| `conflitos_count`           | string (número)                                         | `index.js`, `conflitos.js` |
| `financas.access_token`  | JWT (fallback)                      | `auth-guard.js` |
| `financas.refresh_token` | JWT (só se rememberMe=true)         | `auth-guard.js` |
| `financas.user`          | JSON do usuário (fallback)          | `auth-guard.js` |
| `token`                  | JWT (legacy fallback)               | `auth-guard.js` |

---

## sessionStorage (volátil — dura apenas na aba)

| Chave                   | Valor                      | Onde            |
| ----------------------- | -------------------------- | --------------- |
| `financas.access_token` | JWT (primário)             | `auth-guard.js` |
| `financas.user`         | JSON do usuário (primário) | `auth-guard.js` |
| `token`                 | JWT (legacy)               | `auth-guard.js` |

### Estratégia de fallback

`auth-guard.js` busca o token nesta ordem:
1. `sessionStorage.financas.access_token`
2. `localStorage.financas.access_token`
3. `sessionStorage.token` (legacy)
4. `localStorage.token` (legacy)

---

## Main process — Estado em memória (`services/state.ts`)

```js
state = {
  categorias: [],
  subcategorias: [],
  contas: [],
  pessoas: [],
  lancamentos: [],
  orcamento: [],
  dashboard: null,
  usuarioAtual: null,
};
```

Espelhado para o renderer via IPC (`state:updated`). Tudo é limpo no logout (`resetState()`).

---

# Persistência definitiva

## Supabase (PostgreSQL)

Banco remoto via `services/repository.ts`. Todas as queries CRUD + criptografia AES-256-GCM para dados sensíveis.

## SQLite local (better-sqlite3)

Banco embarcado gerenciado por `services/database.ts` (WAL, verificação de integridade, recriação automática se corrompido). Usado como cache offline e fonte primária para operações sem internet.

### Sincronização bidirecional

`services/sync.ts` gerencia push/pull automático entre SQLite local e Supabase:

| Operação | Intervalo | Descrição                                   |
| -------- | --------- | ------------------------------------------- |
| Push     | 60s       | Envia alterações locais para o Supabase     |
| Pull     | 120s      | Busca alterações remotas para o SQLite local |

Entidades sincronizadas: `categorias`, `subcategorias`, `contas`, `pessoas`, `lancamentos`, `orcamento`, `chamados`.

Conflitos são detectados por versão — entidades críticas (`lancamentos`) exigem resolução manual via `conflitos.html`; demais usam *last-write-wins*.
