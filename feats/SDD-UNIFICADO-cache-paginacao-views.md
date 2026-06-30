# SDD — Cache JSON, Paginação e RPCs Supabase
**Projeto:** FERUS 360° / Finanças Pessoais
**Versão:** 2.0 (unifica revisão 29/06/2026)
**Status:** Plano executável

---

## 1. Contexto e Motivação

Após remoção do SQLite, o app faz requisições diretas ao Supabase para toda leitura, gerando:

| Problema | Impacto |
|---|---|
| `recarregarTudo()` dispara 8+ requests | 400–800ms ao trocar tipo-pessoa |
| Lançamentos sem paginação (`.limit(5000)`) | Payload grande, sem escalabilidade |
| Dashboard calculado 100% no frontend | Processamento redundante, resultados divergentes |
| App inutilizável offline | Arrays vazios silenciosos |

**Três sistemas independentes:**
1. Cache JSON de referência (categorias, subcategorias, contas, pessoas)
2. Paginação cursor-based de lançamentos
3. RPCs Supabase para dados agregados

---

## 2. Sistema 1 — Cache JSON de Referência

### 2.1 Escopo

**Cacheado:** `financas_categorias` · `financas_subcategorias` · `financas_contas` · `financas_pessoas`

**Fora do escopo:** lançamentos · orçamento · auditoria · sessões

### 2.2 Estrutura em disco

```
{userData}/
└── cache/
    ├── meta.json
    ├── categorias.json
    ├── subcategorias.json
    ├── contas.json
    └── pessoas.json
```

### 2.3 Formato

**`meta.json`**:
```json
{
  "version": 1,
  "entries": {
    "categorias": {
      "cachedAt": 1719600000000,
      "expiresAt": 1719686400000,
      "usuarioId": "uuid",
      "tipoPessoa": "PF",
      "checksum": "sha256..."
    }
  }
}
```

**Dados:** Array puro como o Supabase retorna, sem transformação:
```json
{ "data": [ { "id": "uuid", "nome": "Alimentação", ... } ] }
```

### 2.4 TTL

| Entidade | TTL | Justificativa |
|---|---|---|
| categorias | 24h | Mudam raramente |
| subcategorias | 24h | Idem |
| contas | 12h | Mais volátil |
| pessoas | 12h | Idem |

Invalidação primária é por evento (escrita). TTL é fallback.

### 2.5 Lógica de leitura (cache-first)

```
isValid(entidade, usuarioId, tipoPessoa)?
  ├── SIM → ler arquivo → retornar dados
  └── NÃO → buscar Supabase
              ├── sucesso → salvar cache + meta → retornar
              └── falha (offline) → hasStale?
                  ├── SIM → retornar expirado + warning
                  └── NÃO → retornar [] + error
```

Cache expirado é melhor que array vazio para o usuário offline.

### 2.6 Invalidação por evento

Toda operação de escrita que tenha sucesso no Supabase invalida a entry no `meta.json`.

| Operação | Invalida |
|---|---|
| `criarConta` / `updateConta` / `deletarConta` | `contas` |
| `criarPessoa` / `updatePessoa` / `deletarPessoa` | `pessoas` |
| `criarCategoria` / `updateCategoria` / `toggleCategoriaAtivo` | `categorias` |
| `toggleCategoriaUniversal` | `categorias` + `subcategorias` |
| `criarSubcategoria` / `updateSubcategoria` / `deletarSubcategoria` | `subcategorias` |
| `setTipoPessoa` / `setUsarPj` | todos |
| Login de usuário diferente | todos (`invalidarTodos`) |
| Logout | todos (`invalidarTodos` + apagar disco) |

### 2.7 Isolamento

`meta.json` armazena `usuarioId` + `tipoPessoa` — se diferir do atual, cache é inválido automaticamente. Resolve multiusuário no mesmo computador.

### 2.8 Implementação — `services/cache.ts`

```typescript
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as logger from "./logger";

type EntidadeCache = "categorias" | "subcategorias" | "contas" | "pessoas";

interface CacheEntry {
  cachedAt: number;
  expiresAt: number;
  usuarioId: string;
  tipoPessoa: string;
  checksum: string;
}

interface CacheMeta {
  version: number;
  entries: Partial<Record<EntidadeCache, CacheEntry>>;
}

const TTL_MS: Record<EntidadeCache, number> = {
  categorias:    24 * 60 * 60 * 1000,
  subcategorias: 24 * 60 * 60 * 1000,
  contas:        12 * 60 * 60 * 1000,
  pessoas:       12 * 60 * 60 * 1000,
};

class CacheService {
  private dir: string;
  private metaPath: string;

  constructor(userDataPath: string) {
    this.dir = path.join(userDataPath, "cache");
    this.metaPath = path.join(this.dir, "meta.json");
    this.garantirDiretorio();
  }

  isValid(entidade: EntidadeCache, usuarioId: string, tipoPessoa: string): boolean {
    const meta = this.lerMeta();
    const entry = meta.entries[entidade];
    if (!entry) return false;
    if (entry.usuarioId !== usuarioId || entry.tipoPessoa !== tipoPessoa) return false;
    if (Date.now() > entry.expiresAt) return false;
    return true;
  }

  hasStale(entidade: EntidadeCache): boolean {
    return !!this.lerMeta().entries[entidade];
  }

  get<T>(entidade: EntidadeCache): T[] {
    try {
      const raw = fs.readFileSync(this.caminhoEntidade(entidade), "utf-8");
      const parsed = JSON.parse(raw) as { data: T[] };
      return parsed.data ?? [];
    } catch (err) {
      logger.warn("cache", `Falha ao ler ${entidade}.json`, err);
      return [];
    }
  }

  set<T>(entidade: EntidadeCache, data: T[], usuarioId: string, tipoPessoa: string): void {
    const payload = JSON.stringify({ data });
    const checksum = crypto.createHash("sha256").update(payload).digest("hex");
    try {
      fs.writeFileSync(this.caminhoEntidade(entidade), payload, "utf-8");
    } catch (err) {
      logger.error("cache", `Falha ao escrever ${entidade}.json`, err);
      return;
    }
    const meta = this.lerMeta();
    meta.entries[entidade] = {
      cachedAt: Date.now(),
      expiresAt: Date.now() + TTL_MS[entidade],
      usuarioId, tipoPessoa, checksum,
    };
    this.salvarMeta(meta);
  }

  invalidar(entidade: EntidadeCache): void {
    const meta = this.lerMeta();
    delete meta.entries[entidade];
    this.salvarMeta(meta);
  }

  invalidarTodos(): void {
    const meta = this.lerMeta();
    meta.entries = {};
    this.salvarMeta(meta);
    const entidades: EntidadeCache[] = ["categorias", "subcategorias", "contas", "pessoas"];
    for (const e of entidades) {
      const fp = this.caminhoEntidade(e);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch { /* ignora */ } }
    }
  }

  private garantirDiretorio(): void {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  private caminhoEntidade(entidade: EntidadeCache): string {
    return path.join(this.dir, `${entidade}.json`);
  }

  private lerMeta(): CacheMeta {
    try {
      if (fs.existsSync(this.metaPath)) return JSON.parse(fs.readFileSync(this.metaPath, "utf-8"));
    } catch { /* meta corrompido — começa do zero */ }
    return { version: 1, entries: {} };
  }

  private salvarMeta(meta: CacheMeta): void {
    try {
      fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2), "utf-8");
    } catch (err) {
      logger.error("cache", "Falha ao salvar meta.json", err);
    }
  }
}

let _instance: CacheService | null = null;

export function initCache(userDataPath: string): void {
  _instance = new CacheService(userDataPath);
}

export function getCache(): CacheService {
  if (!_instance) throw new Error("Cache não inicializado. Chame initCache() primeiro.");
  return _instance;
}
```

### 2.9 Integração com repositórios (padrão)

**Leitura (cache-first) — exemplo `contas.ts`:**
1. Cache válido → retorna sem rede
2. Busca Supabase → sucesso → salva cache + retorna
3. Falha → cache expirado → retorna stale + warning
4. Falha + sem cache → retorna []

**Escrita (invalidação):**
```typescript
async function criarConta(usuarioId: string, payload): Promise<Conta> {
  const { data, error } = await supabase.from("financas_contas").insert(payload).select().single();
  if (error) throw error;
  getCache().invalidar("contas");
  return data;
}
// updateConta, deletarConta — mesmo padrão
```

**⚠️ Diferença de filtro por tipo_pessoa:**
- **Contas/Pessoas:** `adicionarFiltroTipoPessoaRestrito(query, tp)` — `eq` simples
- **Categorias/Subcategorias:** `adicionarFiltroCategoriaTipoPessoa(query, tp)` — `tipo_pessoa.is.null OR tipo_pessoa.eq.${tp}` (inclui globais)

### 2.10 `main.ts`

```typescript
app.whenReady().then(() => {
  const userDataPath = app.getPath("userData");
  initCache(userDataPath);   // antes de registerHandlers
  logger.init(userDataPath);
  // ...
});
```

### 2.11 Limpeza no login/logout

**Logout** — apaga cache do usuário:
```typescript
handleAuthLogout: async (event) => {
  const data = await auth.logout(await _extrairMetadados(event));
  resetStateFn();
  setState("usuarioAtual", null);
  getCache().invalidarTodos();   // apaga disco
  return data;
},
```

**Login** — limpa cache do usuário anterior (#8):
```typescript
handleAuthLogin: async (event, ...) => {
  // ... lógica de login ...
  getCache().invalidarTodos();
  return data;
},
```

`handleLimparCache` removido (não fazia nada).

### 2.12 Prefetch após login

Após login bem-sucedido, aquecer o cache das 4 entidades em paralelo para que o usuário não enfrente loading na primeira navegação:

```typescript
// handleAuthLogin — após invalidarTodos e salvar estado do usuário
await Promise.all([
  carregarCategorias(),
  carregarSubcategorias(),
  carregarContas(),
  carregarPessoas(),
]);
```

Cada `carregar*` passa pela lógica cache-first (seção 2.5): como o cache foi recém-invalidado, busca do Supabase e popula o cache. Navegações subsequentes serão instantâneas.

---

## 3. Sistema 2 — Paginação de Lançamentos

### 3.1 Problema atual

```typescript
// ATUAL — problemático
.limit(5000) // hardcoded, sem paginação real
```

### 3.2 Estratégia: cursor-based

Cursor composto: `(data DESC, criado_em DESC, id ASC)`.

Usa `criado_em` (timestamp de inserção) como tiebreaker — UUIDs são aleatórios, comparação lexicográfica não reflete ordem de inserção (#1).

### 3.3 Contrato

```typescript
interface FiltrosLancamento {
  mes?: string;           // "2024-03"
  usuarioId?: string;
  tipoPessoa?: string;
  tipo?: string;
  status?: string;
  cursor?: { data: string; criado_em: string; id: string; };
  limite?: number;        // default 50, max 100
}

interface PaginaLancamentos {
  data: Lancamento[];
  cursor: CursorLancamento | null;
  total: number;
  hasMore: boolean;
}
```

### 3.4 Implementação — `getLancamentosPaginado`

```typescript
async function getLancamentosPaginado(filtros: FiltrosLancamento): Promise<PaginaLancamentos> {
  const limite = Math.min(filtros.limite ?? 50, 100);
  const limiteMaisUm = limite + 1;  // (#7) detecta fim real

  // ── Query de contagem ──
  let countQuery = supabase.from("financas_lancamentos")
    .select("id", { count: "exact", head: true }) as any;
  countQuery = adicionarFiltroUsuario(countQuery, filtros.usuarioId);
  countQuery = adicionarFiltroTipoPessoaRestrito(countQuery, filtros.tipoPessoa);
  if (filtros.mes) countQuery = countQuery.like("data_busca", `${filtros.mes}%`);
  if (filtros.tipo) countQuery = countQuery.eq("tipo", filtros.tipo);
  if (filtros.status) countQuery = countQuery.eq("status", filtros.status);

  // ── Query principal ──
  let query = supabase.from("financas_lancamentos")
    .select("*")
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false })  // (#1) tiebreaker confiável
    .order("id", { ascending: true })
    .limit(limiteMaisUm) as any;               // (#7) limite+1 para detectar hasMore

  query = adicionarFiltroUsuario(query, filtros.usuarioId);
  query = adicionarFiltroTipoPessoaRestrito(query, filtros.tipoPessoa);
  if (filtros.mes) query = query.like("data_busca", `${filtros.mes}%`);
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
  if (filtros.status) query = query.eq("status", filtros.status);

  // Cursor: (data < cursor.data) OR (data = cursor.data AND criado_em < cursor.criado_em) OR ...
  if (filtros.cursor) {
    query = query.or(
      `data.lt.${filtros.cursor.data},` +
      `and(data.eq.${filtros.cursor.data},criado_em.lt.${filtros.cursor.criado_em}),` +
      `and(data.eq.${filtros.cursor.data},criado_em.eq.${filtros.cursor.criado_em},id.gt.${filtros.cursor.id})`
    );
  }

  const [{ count }, { data, error }] = await Promise.all([countQuery, query]);
  if (error) throw error;

  const registros = (data as Lancamento[]).slice(0, limite);
  const temMais = data.length > limite;

  const ultimo = registros.length > 0 ? registros[registros.length - 1] : null;
  return {
    data: registros,
    cursor: temMais && ultimo
      ? { data: ultimo.data, criado_em: ultimo.criado_em, id: ultimo.id }
      : null,
    total: count ?? 0,
    hasMore: temMais,
  };
}
```

### 3.5 Handler IPC + preload

```typescript
// ipcHandlers.ts
handleLancamentosPaginado: async (_event, filtros) => {
  const usuarioId = obterUsuarioId();
  if (!usuarioId) return { error: "UNAUTHORIZED" };
  try {
    return await repository.getLancamentosPaginado({
      ...filtros, usuarioId, tipoPessoa: obterTipoPessoaAtivo(),
    });
  } catch (err) {
    logger.error("ipc", "getLancamentosPaginado", err);
    return { error: "ERRO_INTERNO" };
  }
};

// registerHandlers
ipcMain.handle("lancamentos:paginado", handlers.handleLancamentosPaginado);

// preload.ts
getLancamentosPaginado: (filtros) => ipcRenderer.invoke("lancamentos:paginado", filtros),
```

### 3.6 Frontend — estado de paginação

```javascript
let _paginaAtual = {
  cursor: null,
  total: 0,
  hasMore: false,
  carregando: false,
};

function resetarPaginacao() {
  _paginaAtual = { cursor: null, total: 0, hasMore: false, carregando: false };
  lancamentos = [];
}

async function carregarPrimeiraPagina() {
  resetarPaginacao();
  await carregarProximaPagina();
}

async function carregarProximaPagina() {
  if (_paginaAtual.carregando) return;
  if (!_paginaAtual.hasMore && _paginaAtual.cursor !== null) return;

  _paginaAtual.carregando = true;
  atualizarBotaoPaginacao();

  try {
    // (#2) construir "YYYY-MM" completo a partir dos filtros individuais
    const mes = (filtroAtualMes !== "all" && filtroAtualAno !== "all")
      ? `${filtroAtualAno}-${filtroAtualMes.padStart(2, "0")}`
      : undefined;

    const resultado = await window.electronAPI.getLancamentosPaginado({
      mes,
      tipo: filtroAtualTipo !== "all" ? filtroAtualTipo : undefined,
      status: filtroAtualStatus !== "all" ? filtroAtualStatus : undefined,
      cursor: _paginaAtual.cursor ?? undefined,
      limite: 50,
    });

    if (resultado.error) {
      exibirToast("Erro ao carregar lançamentos.", "error");
      return;
    }

    lancamentos = [...lancamentos, ...resultado.data];
    _paginaAtual.cursor  = resultado.cursor;
    _paginaAtual.total   = resultado.total;
    _paginaAtual.hasMore = resultado.hasMore;

    renderizarTabela();
    atualizarContador();
    atualizarBotaoPaginacao();
  } finally {
    _paginaAtual.carregando = false;
    atualizarBotaoPaginacao();
  }
}

function atualizarBotaoPaginacao() {
  const btn = document.getElementById("btnCarregarMais");
  if (!btn) return;
  if (!_paginaAtual.hasMore) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.disabled = _paginaAtual.carregando;
  btn.textContent = _paginaAtual.carregando
    ? "Carregando..."
    : `Carregar mais (${lancamentos.length} de ${_paginaAtual.total})`;
}

function atualizarContador() {
  const el = document.getElementById("contadorLancamentos");
  if (!el) return;
  const sufixo = _paginaAtual.hasMore ? ` de ${_paginaAtual.total}` : "";
  el.textContent = `${lancamentos.length} lançamento${lancamentos.length !== 1 ? "s" : ""}${sufixo}`;
}
```

### 3.7 HTML

```html
<div class="table-footer">
  <button type="button" class="btn outline" id="btnCarregarMais" hidden>
    Carregar mais
  </button>
</div>
```

### 3.8 Filtros chamam `carregarPrimeiraPagina()`

```javascript
// Substituir carregarLancamentos() por carregarPrimeiraPagina() nos change listeners
document.getElementById("filtroMes").addEventListener("change", async function () {
  filtroAtualMes = this.value;
  salvarEstadoFiltros();
  await carregarPrimeiraPagina();
  await carregarOrcamento();
  atualizarResumo();
});
```

### 3.9 Compatibilidade com `getLancamentos` existente

Handler `lancamentos:get` mantido para `exportarDados`. Limite de 5000 pode ser aumentado com segurança porque é chamado explicitamente pelo usuário.

---

## 4. Sistema 3 — RPCs Supabase para Dados Agregados

### 4.1 Estratégia

Migrar agregação do frontend para RPCs no banco. O frontend recebe dados já agregados.

**⚠️ Views SQL removidas** — as 3 views (`financas_resumo_mensal`, `financas_totais_periodo`, `financas_gastos_por_categoria`) nunca eram consultadas; as RPCs já contêm toda lógica necessária (#10).

### 4.2 RPC 1 — `get_dashboard_data`

Retorna `{ totais, por_mes, por_categoria, saldo_acumulado }` em uma chamada.

```sql
CREATE OR REPLACE FUNCTION get_dashboard_data(
  p_usuario_id   UUID,
  p_tipo_pessoa  TEXT,
  p_ano          INT     DEFAULT NULL,
  p_mes          INT     DEFAULT NULL,
  p_categoria_id UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado JSON;
BEGIN
  IF p_usuario_id != auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT json_build_object(
    'totais', (
      SELECT json_build_object(
        'receitas', COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor END), 0),
        'despesas', COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor END), 0)
      )
      FROM financas_lancamentos
      WHERE usuario_id = p_usuario_id AND tipo_pessoa = p_tipo_pessoa
        AND status = 'PAGO' AND transferencia_grupo_id IS NULL
        AND (p_ano IS NULL OR EXTRACT(YEAR FROM data) = p_ano)
        AND (p_mes IS NULL OR EXTRACT(MONTH FROM data) = p_mes)
    ),

    -- (#3) por_mes NUNCA filtra por p_mes — gráfico precisa do ano inteiro
    'por_mes', (
      SELECT json_agg(row_to_json(rm)) FROM (
        SELECT EXTRACT(MONTH FROM data)::int AS mes, tipo, SUM(valor) AS total
        FROM financas_lancamentos
        WHERE usuario_id = p_usuario_id AND tipo_pessoa = p_tipo_pessoa
          AND status = 'PAGO' AND transferencia_grupo_id IS NULL
          AND (p_ano IS NULL OR EXTRACT(YEAR FROM data) = p_ano)
        GROUP BY EXTRACT(MONTH FROM data), tipo
        ORDER BY EXTRACT(MONTH FROM data)
      ) rm
    ),

    'por_categoria', (
      SELECT json_agg(row_to_json(gc)) FROM (
        SELECT l.categoria_id, c.nome AS categoria_nome, l.tipo, SUM(l.valor) AS total
        FROM financas_lancamentos l
        LEFT JOIN financas_categorias c ON c.id = l.categoria_id
        WHERE l.usuario_id = p_usuario_id AND l.tipo_pessoa = p_tipo_pessoa
          AND l.status = 'PAGO' AND l.transferencia_grupo_id IS NULL
          AND (p_ano IS NULL OR EXTRACT(YEAR  FROM l.data) = p_ano)
          AND (p_mes IS NULL OR EXTRACT(MONTH FROM l.data) = p_mes)
          AND (p_categoria_id IS NULL OR l.categoria_id = p_categoria_id)
        GROUP BY l.categoria_id, c.nome, l.tipo
        ORDER BY SUM(l.valor) DESC LIMIT 8
      ) gc
    ),

    'saldo_acumulado', (
      SELECT json_agg(row_to_json(sa)) FROM (
        SELECT EXTRACT(MONTH FROM data)::int AS mes,
          SUM(SUM(CASE
            WHEN tipo = 'RECEITA' THEN  valor
            WHEN tipo = 'DESPESA' THEN -valor
            ELSE 0
          END)) OVER (ORDER BY EXTRACT(MONTH FROM data)) AS saldo
        FROM financas_lancamentos
        WHERE usuario_id = p_usuario_id AND tipo_pessoa = p_tipo_pessoa
          AND status = 'PAGO' AND transferencia_grupo_id IS NULL
          AND (p_ano IS NULL OR EXTRACT(YEAR FROM data) = p_ano)
        GROUP BY EXTRACT(MONTH FROM data)
        ORDER BY EXTRACT(MONTH FROM data)
      ) sa
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION get_dashboard_data(UUID, TEXT, INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_dashboard_data(UUID, TEXT, INT, INT, UUID) TO authenticated;
```

### 4.3 RPC 2 — `get_comparacao_orcamento`

```sql
CREATE OR REPLACE FUNCTION get_comparacao_orcamento(
  p_usuario_id  UUID,
  p_tipo_pessoa TEXT,
  p_ano         INT  DEFAULT NULL,
  p_mes         INT  DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado JSON;
BEGIN
  IF p_usuario_id != auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT json_build_object(
    'receitas_planejadas', COALESCE((
      SELECT SUM(valor_planejado) FROM financas_orcamento
      WHERE usuario_id = p_usuario_id AND tipo_pessoa = p_tipo_pessoa AND tipo = 'RECEITA'
        AND (p_ano IS NULL OR EXTRACT(YEAR FROM data) = p_ano)
        AND (p_mes IS NULL OR EXTRACT(MONTH FROM data) = p_mes)
    ), 0),

    'despesas_planejadas', COALESCE((
      SELECT SUM(valor_planejado) FROM financas_orcamento
      WHERE usuario_id = p_usuario_id AND tipo_pessoa = p_tipo_pessoa AND tipo = 'DESPESA'
        AND (p_ano IS NULL OR EXTRACT(YEAR FROM data) = p_ano)
        AND (p_mes IS NULL OR EXTRACT(MONTH FROM data) = p_mes)
    ), 0),

    -- (#6) filtro transferencia_grupo_id IS NULL adicionado
    'receitas_realizadas', COALESCE((
      SELECT SUM(valor) FROM financas_lancamentos
      WHERE usuario_id = p_usuario_id AND tipo_pessoa = p_tipo_pessoa AND tipo = 'RECEITA'
        AND status = 'PAGO' AND transferencia_grupo_id IS NULL
        AND (p_ano IS NULL OR EXTRACT(YEAR  FROM data) = p_ano)
        AND (p_mes IS NULL OR EXTRACT(MONTH FROM data) = p_mes)
    ), 0),

    'despesas_realizadas', COALESCE((
      SELECT SUM(valor) FROM financas_lancamentos
      WHERE usuario_id = p_usuario_id AND tipo_pessoa = p_tipo_pessoa AND tipo = 'DESPESA'
        AND status = 'PAGO' AND transferencia_grupo_id IS NULL
        AND (p_ano IS NULL OR EXTRACT(YEAR  FROM data) = p_ano)
        AND (p_mes IS NULL OR EXTRACT(MONTH FROM data) = p_mes)
    ), 0)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION get_comparacao_orcamento(UUID, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_comparacao_orcamento(UUID, TEXT, INT, INT) TO authenticated;
```

### 4.4 Handlers IPC

```typescript
// (#5) Manter setAuthSession() em ambos os handlers
handleDashboardDados: async (_event, ano, mes, categoria) => {
  try {
    await setAuthSession();
    const usuarioId = obterUsuarioId();
    if (!usuarioId) return { error: "UNAUTHORIZED" };

    const { data, error } = await supabase.rpc("get_dashboard_data", {
      p_usuario_id:   usuarioId,
      p_tipo_pessoa:  obterTipoPessoaAtivo(),
      p_ano:          ano && ano !== "all" ? Number(ano) : null,
      p_mes:          mes && mes !== "all" ? Number(mes) : null,
      p_categoria_id: categoria && categoria !== "all" ? categoria : null,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    logger.error("ipc", "dashboard:dados", err);
    return { error: "ERRO_INTERNO", detalhe: (err as Error).message };
  }
},

handleDashboardGet: async (_event, mes) => {
  try {
    await setAuthSession();
    const usuarioId = obterUsuarioId();
    if (!usuarioId) return { error: "UNAUTHORIZED" };

    const parts = mes ? mes.split("-") : [];
    const { data, error } = await supabase.rpc("get_comparacao_orcamento", {
      p_usuario_id:  usuarioId,
      p_tipo_pessoa: obterTipoPessoaAtivo(),
      p_ano:         parts[0] ? Number(parts[0]) : null,
      p_mes:         parts[1] ? Number(parts[1]) : null,
    });
    if (error) throw error;
    return { totais: data };  // (#11) compatível com DashboardData
  } catch (err) {
    logger.error("ipc", "dashboard:get", err);
    return { error: "ERRO_INTERNO" };
  }
},
```

### 4.5 Frontend — adaptações

```javascript
// ANTES: iterava dadosDashboard.lancamentos (até 5000 itens)
// DEPOIS: itera dadosDashboard.por_mes (máx 24 itens)

function renderizarGraficoMensal() {
  const ctx = document.getElementById("chartMensal").getContext("2d");
  if (chartMensal) chartMensal.destroy();

  const receitas = new Array(12).fill(0);
  const despesas = new Array(12).fill(0);

  (dadosDashboard.por_mes || []).forEach((item) => {
    const idx = item.mes - 1;
    if (item.tipo === "RECEITA") receitas[idx] = Number(item.total);
    if (item.tipo === "DESPESA") despesas[idx] = Number(item.total);
  });
  // ... resto idêntico
}

function renderizarGraficoSaldo() {
  const saldos = new Array(12).fill(0);
  (dadosDashboard.saldo_acumulado || []).forEach((item) => {
    saldos[item.mes - 1] = Number(item.saldo);
  });
  // ... resto idêntico
}

function renderizarGraficoCategorias() {
  const tipoFiltro = document.getElementById("filtroTipoGrafico").value;
  const dados = (dadosDashboard.por_categoria || [])
    .filter((item) => item.tipo === tipoFiltro)
    .slice(0, 8);
  const categorias = dados.map((d) => d.categoria_nome || "Sem categoria");
  const valores    = dados.map((d) => Number(d.total));
  // ... resto idêntico
}

// (#4) popularMeses e filtrarCategoriasComLancamentos também adaptados
function popularMeses() {
  const select = document.getElementById("filtroMes");
  if (!select) return;
  // Usa dadosDashboard.por_mes em vez de lancamentos
  const mesesComDados = new Set(
    (dadosDashboard.por_mes || []).map(item => item.mes)
  );
  // ...
}

function filtrarCategoriasComLancamentos() {
  // Usa dadosDashboard.por_categoria em vez de lancamentos
  const tipoFiltro = document.getElementById("filtroTipoGrafico").value;
  const categoriasAtivas = (dadosDashboard.por_categoria || [])
    .filter(item => item.tipo === tipoFiltro)
    .map(item => item.categoria_id);
  // ...
}
```

---

## 5. Plano de Implementação

### Fase 1 — Fundação (não quebra nada existente)

| Tarefa | Arquivo | Detalhes |
|--------|---------|----------|
| Criar `CacheService` | `services/cache.ts` | Código da seção 2.8 |
| Inicializar em main | `main.ts` | `initCache(app.getPath("userData"))` |
| Migration RPC dashboard | `.sql` | Seção 4.2 (corrigida: `por_mes` sem filtro `p_mes`) |
| Migration RPC orçamento | `.sql` | Seção 4.3 (corrigida: `transferencia_grupo_id IS NULL`) |

**Teste:** Verificar que `cache/` é criado em userData, `meta.json` existe após login.

### Fase 2 — Cache de Referência

| Tarefa | Arquivo | Detalhes |
|--------|---------|----------|
| Cache em `getContas` + invalidar writes | `services/repository/contas.ts` | Padrão cache-first |
| Cache em `getPessoas` + invalidar writes | `services/repository/pessoas.ts` | idem |
| Cache em `getCategorias` + invalidar writes | `services/repository/categorias.ts` | Usar `adicionarFiltroCategoriaTipoPessoa` |
| Cache em `getSubcategorias` + invalidar writes | `services/repository/subcategorias.ts` | idem |
| `invalidarTodos()` no login | `ipcHandlers.ts` | `handleAuthLogin` |
| Prefetch após login | `ipcHandlers.ts` | `Promise.all([carregarCategorias, ...])` após login |
| Remover `handleLimparCache` | `ipcHandlers.ts` | Era no-op |

**Testes:**
1. Criar conta → desconectar rede → configs → conta aparece
2. Logout → `contas.json` é apagado
3. Trocar PF→PJ → cache invalidado → dados corretos de PJ

### Fase 3 — RPCs (substitui `getDashboardDados` e `getDashboard`)

| Tarefa | Arquivo | Detalhes |
|--------|---------|----------|
| Handler `dashboard:dados` | `ipcHandlers.ts` | Com `setAuthSession()` |
| Handler `dashboard:get` | `ipcHandlers.ts` | Com `setAuthSession()` |
| Adaptar gráficos | `public/dashboard.js` | 3 funções + `popularMeses` + `filtrarCategoriasComLancamentos` |
| Adaptar `atualizarComparacao` | `public/index.js` | Usa `get_comparacao_orcamento` |
| Atualizar `DashboardData` | `types/` | (#11) Interface consistente |

**Testes:**
1. Comparar totais do dashboard com somatório manual
2. Filtrar por mês → gráfico mostra ano inteiro (12 meses)

### Fase 4 — Paginação

| Tarefa | Arquivo | Detalhes |
|--------|---------|----------|
| `getLancamentosPaginado` | `services/repository/lancamentos.ts` | Cursor com `criado_em`, `limite+1` |
| Handler IPC | `ipcHandlers.ts` | `lancamentos:paginado` |
| Preload | `preload.ts` | `getLancamentosPaginado` |
| Estado + botão | `public/index.js` + `index.html` | Carregar mais |
| Substituir chamadas | `public/index.js` | `carregarLancamentos` → `carregarPrimeiraPagina` |

**Testes:**
1. 60 lançamentos → mostra 50 + botão "Carregar mais"
2. Clicar → próximos 10 sem duplicatas
3. Trocar filtro → paginação reinicia

### Fase 5 — Limpeza

| Tarefa | Detalhes |
|--------|----------|
| Remover `.limit(5000)` de `getLancamentos` | Manter para `exportarDados` |
| Remover agregação JS do dashboard | Tudo via RPC agora |

---

## 6. Correções Incorporadas

| # | Severidade | O que era | O que é | Seção |
|---|------------|-----------|---------|-------|
| 1 | 🔴 | Cursor `id.gt` (UUID aleatório) | Cursor `(data DESC, criado_em DESC, id ASC)` | 3.4 |
| 2 | 🔴 | `filtroAtualMes` sem ano | `${filtroAtualAno}-${filtr oAtualMes.padStart(2,'0')}` | 3.6 |
| 3 | 🔴 | `por_mes` filtra por `p_mes` | `por_mes` ignora `p_mes` (ano inteiro) | 4.2 |
| 4 | 🔴 | `popularMeses`/`filtrarCategorias` não adaptadas | Migradas para `por_mes`/`por_categoria` | 4.5 |
| 5 | 🔴 | Handlers sem `setAuthSession()` | Ambos mantêm `setAuthSession()` | 4.4 |
| 6 | 🟡 | RPC2 sem `transferencia_grupo_id IS NULL` | Adicionado nas realizadas | 4.3 |
| 7 | 🟡 | `hasMore` via `length === limite` | `.limit(limite+1)` + `> limite` | 3.4 |
| 8 | 🟡 | Login não invalidava cache | `handleAuthLogin` chama `invalidarTodos()` | 2.11 |
| 9 | 🟡 | `handleLimparCache` era no-op | **Removido** | 2.11 |
| 10 | 🟢 | 3 views SQL nunca usadas | **Removidas** | 4.1 |
| 11 | 🟢 | Retorno `handleDashboardGet` inconsistente | `{ totais: data }` compatível | 4.4 |
| 12 | 🟢 | Filtro tipo_pessoa genérico | Documentado: categorias/sub usam filtro específico | 2.9 |
