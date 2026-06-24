/**
 * @file Helpers para criar mocks do Supabase em testes integrados.
 * @description Simula comportamento real do Supabase sem requisições de rede:
 * banco em memória, autenticação, RPC e operações CRUD.
 * @module test/integrados/helpers.js
 * @changelog
 * [2026-06-09] - Criação
 * - Implementado createMockSupabase com banco em memória.
 * - Suporte a autenticação (signUp, signInWithPassword, setSession).
 * - Mock de RPC para excluir_conta com auditoria e limpeza.
 * [2026-06-09] - Exclusão de auth.users
 * - Adicionado db.auth_users para simular auth.users do Supabase.
 * - __setUser também adiciona entrada em auth_users.
 * - RPC excluir_conta também remove de auth_users.
 */

/**
 * Cria um mock completo do Supabase com dados em memória
 */
export function createMockSupabase() {
  // In-memory database
  const db = {
    financas_usuarios: [],
    financas_lancamentos: [],
    financas_orcamento: [],
    financas_categorias: [],
    financas_subcategorias: [],
    financas_contas: [],
    financas_pessoas: [],
    financas_auditoria: [],
    auth_users: [],
  };

  // Seed with default categories
  db.financas_categorias.push(
    { id: 1, nome: "Alimentação", tipo: "DESPESA", eh_global: true, ativo: true },
    { id: 2, nome: "Salário", tipo: "RECEITA", eh_global: true, ativo: true },
    { id: 3, nome: "Transporte", tipo: "DESPESA", eh_global: true, ativo: true },
  );

  let currentUserId = null;
  let currentSessionToken = null;

  return {
    auth: {
      signInWithPassword: vi.fn().mockImplementation(async (creds) => {
        const user = db.financas_usuarios.find((u) => u.email === creds.email);
        if (!user || (user._password && creds.password !== user._password)) {
          return { data: null, error: new Error("Invalid login credentials") };
        }
        currentUserId = user.id;
        currentSessionToken = `token-${user.id}-${Date.now()}`;
        return {
          data: {
            user: { id: user.id },
            session: { access_token: currentSessionToken, refresh_token: `refresh-${user.id}` },
          },
          error: null,
        };
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockImplementation(async (token) => {
        if (token === currentSessionToken) {
          return { data: { user: { id: currentUserId } }, error: null };
        }
        return { data: { user: null }, error: new Error("Invalid token") };
      }),
      getSession: vi.fn().mockImplementation(async () => {
        if (currentUserId) {
          return {
            data: { session: { user: { id: currentUserId }, access_token: currentSessionToken } },
            error: null,
          };
        }
        return { data: { session: null }, error: null };
      }),
      setSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      refreshSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "new-token", refresh_token: "new-refresh" } },
        error: null,
      }),
    },

    rpc: vi.fn().mockImplementation(async (fnName, _args) => {
      if (fnName === "excluir_conta") {
        if (!currentUserId) return { data: null, error: new Error("No session") };
        db.financas_auditoria.push({
          id: `audit-${Date.now()}`,
          usuario_id: currentUserId,
          acao: "CONTA_EXCLUIDA",
          entidade: "usuarios",
          entidade_id: currentUserId,
          dados_novos: { metodo: "user" },
          contexto: "user",
          criado_em: new Date().toISOString(),
        });
        Object.keys(db).forEach((table) => {
          if (table === "auth_users") {
            db[table] = db[table].filter((u) => u.id !== currentUserId);
          } else if (table.endsWith("_usuarios")) {
            db[table] = db[table].filter((u) => u.id !== currentUserId);
          } else if (table !== "financas_auditoria") {
            db[table] = db[table].filter((r) => r.usuario_id !== currentUserId);
          }
        });
        return { data: null, error: null };
      }

      return { data: null, error: new Error("Function not found") };
    }),

    from: vi.fn().mockImplementation((table) => {
      const chain = {
        select: vi.fn().mockImplementation(function (columns, opts) {
          this._columns = columns;
          this._selectOpts = opts || null;
          return this;
        }),
        insert: vi.fn().mockImplementation(function (payload) {
          if (!db[table]) db[table] = [];
          const items = Array.isArray(payload) ? payload : [payload];
          const inserted = items.map((item, i) => ({
            id: (db[table].length || 0) + i + 1,
            ...item,
            criado_em: new Date().toISOString(),
          }));
          db[table].push(...inserted);
          this._data = inserted;
          return this;
        }),
        update: vi.fn().mockImplementation(function (payload) {
          this._payload = payload;
          return this;
        }),
        delete: vi.fn().mockImplementation(function () {
          this._isDelete = true;
          return this;
        }),
        eq: vi.fn().mockImplementation(function (col, val) {
          this._filters = { ...this._filters, [col]: val };
          return this;
        }),
        like: vi.fn().mockImplementation(function (col, val) {
          this._filters = { ...this._filters, [col]: { $like: val } };
          return this;
        }),
        ilike: vi.fn().mockImplementation(function (col, val) {
          this._filters = { ...this._filters, [col]: { $ilike: val } };
          return this;
        }),
        gte: vi.fn().mockImplementation(function (col, val) {
          this._filters = { ...this._filters, [col]: { $gte: val } };
          return this;
        }),
        lte: vi.fn().mockImplementation(function (col, val) {
          this._filters = { ...this._filters, [col]: { $lte: val } };
          return this;
        }),
        or: vi.fn().mockImplementation(function (filter) {
          this._orFilter = filter;
          return this;
        }),
        order: vi.fn().mockImplementation(function () {
          return this;
        }),
        limit: vi.fn().mockImplementation(function () {
          return this;
        }),
        single: vi.fn().mockImplementation(async function () {
          if (this._isDelete) {
            const filtered = db[table].filter((item) => !matchesFilters(item, this._filters));
            db[table] = filtered;
            return { data: null, error: null };
          }
          if (this._data) {
            return { data: this._data[0] || null, error: null };
          }
          if (this._payload) {
            let result = db[table] || [];
            if (this._filters) result = applyFilters(result, this._filters);
            const updated = result[0];
            if (updated) Object.assign(updated, this._payload);
            return { data: updated, error: null };
          }
          let result = db[table] || [];
          if (this._filters) result = applyFilters(result, this._filters);
          return { data: result[0] || null, error: null };
        }),
        maybeSingle: vi.fn().mockImplementation(async function () {
          let result = db[table] || [];
          result = applyFilters(result, this._filters);
          return { data: result[0] || null, error: null };
        }),
        then: vi.fn().mockImplementation(function (onResolve) {
          let result;
          if (this._data) {
            result = this._data;
          } else {
            result = db[table] || [];
            if (this._filters) result = applyFilters(result, this._filters);
            if (this._orFilter) {
              const parts = this._orFilter.split(",");
              result = result.filter((item) => {
                return parts.some((part) => {
                  const m = part.match(/^(\w+)\.(\w+)\.(.+)$/);
                  if (!m) return false;
                  const [, col, op, val] = m;
                  if (op === "eq") return String(item[col]) === val;
                  return false;
                });
              });
            }
            if (this._isDelete) {
              db[table] = db[table].filter((item) => !matchesFilters(item, this._filters));
            }
            if (this._payload) {
              result = result.map((item) => Object.assign(item, this._payload));
            }
          }
          if (this._selectOpts && this._selectOpts.count === "exact") {
            return onResolve({ data: null, count: result.length, error: null });
          }
          return onResolve({ data: result, error: null });
        }),
      };
      return chain;
    }),

    __db: () => db,
    __setUser: (user) => {
      if (!db.financas_usuarios.find((u) => u.id === user.id)) {
        db.financas_usuarios.push(user);
      }
      if (!db.auth_users.find((u) => u.id === user.id)) {
        db.auth_users.push({ id: user.id, email: user.email });
      }
      currentUserId = user.id;
    },
    __getCurrentUserId: () => currentUserId,
  };
}

/**
 * Aplica filtros ao array
 */
function applyFilters(items, filters) {
  if (!filters) return items;
  return items.filter((item) => matchesFilters(item, filters));
}

/**
 * Verifica se um item corresponde aos filtros
 */
function matchesFilters(item, filters) {
  if (!filters) return true;
  for (const [key, value] of Object.entries(filters)) {
    if (value && typeof value === "object" && "$like" in value) {
      const pattern = value.$like.replace(/%/g, "");
      if (!String(item[key]).includes(pattern)) return false;
    } else if (value && typeof value === "object" && "$gte" in value) {
      if (item[key] < value.$gte) return false;
    } else if (value && typeof value === "object" && "$lte" in value) {
      if (item[key] > value.$lte) return false;
    } else if (item[key] !== value) {
      return false;
    }
  }
  return true;
}

/**
 * Helper para criar um usuário e fazer login
 */
let _userIdCounter = 0;

function gerarUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function createAndLoginUser(mockSupabase, { email = "teste@example.com", name = "Teste User", role = "user" } = {}) {
  const user = {
    id: gerarUUID(),
    email,
    nome: name,
    role,
    ativo: true,
    senha_hash: "hash",
    _password: "senha",
  };

  mockSupabase.__setUser(user);

  const loginResult = await mockSupabase.auth.signInWithPassword({
    email,
    password: "senha",
  });

  return { user, token: loginResult.data?.session?.access_token };
}

/**
 * Helper para criar um lançamento pré-preenchido
 */
export function createLancamentoPayload(overrides = {}) {
  return {
    data: "2026-06-15",
    tipo: "DESPESA",
    status: "PENDENTE",
    valor: 150.5,
    categoria_id: 1,
    subcategoria_id: null,
    conta_origem_id: 1,
    conta_destino_id: null,
    pessoa_id: null,
    descricao: "Teste lancamento",
    data_busca: "2026-06",
    ...overrides,
  };
}

/**
 * Helper para criar conta pré-preenchida
 */
export function createContaPayload(overrides = {}) {
  return {
    nome: "Conta Teste",
    tipo: "CORRENTE",
    saldo: 1000,
    ativa: true,
    ...overrides,
  };
}

import { vi } from "vitest";
export { vi };
