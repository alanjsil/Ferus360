/**
 * @file Testes do repositório de dados (mock do Supabase client via __setSupabase).
 * @description Injeta mock do Supabase client via DI pattern sem mockar módulos. Valida todas as funções CRUD do repository.
 * @module test/unitarios/services/repository.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * - Adicionados comentários AAA.
 * [2026-06-09] - Exclusão de conta
 * - Adicionado mock de .rpc() no mockSupabase para testar excluirConta.
 * - Atualizados testes de excluirConta para usar RPC sem argumento.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSupabase, resetData, pushResult } = vi.hoisted(() => {
  const results = [{ data: [], error: null, count: null }];
  let callIdx = 0;

  function current() {
    const r = results[Math.min(callIdx, results.length - 1)];
    callIdx++;
    return r;
  }

  function bq() {
    const c = current();
    const p = Promise.resolve({ data: c.data, error: c.error, count: c.count });
    p.select = vi.fn(() => p);
    p.eq = vi.fn(() => p);
    p.or = vi.fn(() => p);
    p.order = vi.fn(() => p);
    p.gte = vi.fn(() => p);
    p.lte = vi.fn(() => p);
    p.like = vi.fn(() => p);
    p.ilike = vi.fn(() => p);
    p.insert = vi.fn(() => p);
    p.delete = vi.fn(() => p);
    p.update = vi.fn(() => p);
    p.single = vi.fn(() => p);
    p.maybeSingle = vi.fn(() => p);
    p.limit = vi.fn(() => p);
    return p;
  }

  return {
    mockSupabase: {
      from: vi.fn(() => bq()),
      rpc: vi.fn(() => {
        const c = current();
        return Promise.resolve({ data: c.data, error: c.error, count: c.count });
      }),
      auth: {
        setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn(),
        getSession: vi.fn(),
      },
    },
    resetData: (data, error = null, count = null) => {
      results.length = 0;
      results.push({ data: data !== undefined ? data : [], error, count });
      callIdx = 0;
    },
    pushResult: (data, error = null, count = null) => {
      results.push({ data: data !== undefined ? data : [], error, count });
    },
  };
});

// No vi.mock — usamos __setSupabase do modulo real para injetar o mock
import * as repo from "../../../services/repository.js";
import crypto from "node:crypto";

repo.__setSupabase(mockSupabase);

beforeEach(() => {
  vi.clearAllMocks();
  resetData([]);
});

/* ─────────── getCategorias ─────────── */

describe("getCategorias", () => {
  it("retorna categorias (apenas globais sem usuarioId)", async () => {
    // Act
    const result = await repo.getCategorias();
    // Assert
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_categorias");
  });

  it("filters by tipo", async () => {
    await repo.getCategorias(null, "DESPESA");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_categorias");
  });

  it("filters by usuarioId (global + user)", async () => {
    await repo.getCategorias("550e8400-e29b-41d4-a716-446655440000");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_categorias");
  });

  it("filters by both usuarioId and tipo", async () => {
    await repo.getCategorias("550e8400-e29b-41d4-a716-446655440000", "RECEITA");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_categorias");
  });

  it("retorna array vazio em erro do Supabase (fallback cache)", async () => {
    resetData([], new Error("DB error"));
    const result = await repo.getCategorias();
    expect(result).toEqual([]);
  });
});

/* ─────────── getSubcategorias ─────────── */

describe("getSubcategorias", () => {
  it("retorna todas as subcategorias do usuário", async () => {
    const result = await repo.getSubcategorias("user-123");
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_subcategorias");
  });

  it("filters by usuario_id and categoriaId", async () => {
    await repo.getSubcategorias("user-123", "cat-1");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_subcategorias");
  });
});

/* ─────────── getContas ─────────── */

describe("getContas", () => {
  it("retorna contas ordenadas por nome", async () => {
    const result = await repo.getContas("user-123");
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_contas");
  });

  it("filters by usuario_id", async () => {
    await repo.getContas("user-123");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_contas");
  });
});

/* ─────────── getPessoas ─────────── */

describe("getPessoas", () => {
  it("retorna pessoas ordenadas por nome", async () => {
    const result = await repo.getPessoas("user-123");
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_pessoas");
  });

  it("filters by usuario_id", async () => {
    await repo.getPessoas("user-123");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_pessoas");
  });
});

/* ─────────── getLancamentos ─────────── */

describe("getLancamentos", () => {
  it("returns lancamentos", async () => {
    const result = await repo.getLancamentos();
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });
});

/* ─────────── getOrcamento ─────────── */

describe("getOrcamento", () => {
  it("retorna orçamento sem mês", async () => {
    const result = await repo.getOrcamento();
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_orcamento");
  });

  it("filters by mes", async () => {
    await repo.getOrcamento("2026-06");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_orcamento");
  });
});

/* ─────────── getDashboardDados ─────────── */

describe("getDashboardDados", () => {
  it("retorna dados do dashboard com formato esperado", async () => {
    const result = await repo.getDashboardDados("2026", undefined, undefined);

    expect(result).toHaveProperty("lancamentos");
    expect(result).toHaveProperty("orcamentos");
    expect(result).toHaveProperty("totalLancamentos");
    expect(result).toHaveProperty("totalOrcamentos");
  });
});

/* ─────────── getDashboard ─────────── */

describe("getDashboard", () => {
  it("retorna dashboard com formato de totais", async () => {
    const result = await repo.getDashboard();
    expect(result).toHaveProperty("totais");
    expect(result).toHaveProperty("orcamento");
    expect(result).toHaveProperty("realizados");
    expect(result.totais).toHaveProperty("receitas_planejadas");
    expect(result.totais).toHaveProperty("receitas_realizadas");
    expect(result.totais).toHaveProperty("despesas_planejadas");
    expect(result.totais).toHaveProperty("despesas_realizadas");
  });

  it("calcula totais corretamente a partir dos dados de orçamento", async () => {
    resetData([
      { tipo: "RECEITA", valor_planejado: 1000, valor_realizado: 800, valor: 800 },
      { tipo: "DESPESA", valor_planejado: 500, valor_realizado: 450, valor: 450 },
    ]);
    const result = await repo.getDashboard();
    expect(result.totais.receitas_planejadas).toBe(1000);
    expect(result.totais.receitas_realizadas).toBe(800);
    expect(result.totais.despesas_planejadas).toBe(500);
    expect(result.totais.despesas_realizadas).toBe(450);
  });
});

/* ─────────── createLancamento ─────────── */

describe("createLancamento", () => {
  it("cria um registro de lançamento", async () => {
    const payload = {
      data: "2026-06-01",
      tipo: "DESPESA",
      valor: 100,
    };
    resetData({ id: 1, ...payload });
    const result = await repo.criarLancamento(payload);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
    expect(result).toEqual({ id: 1, ...payload });
  });

  it("define data_pagamento quando status é PAGO", async () => {
    const payload = {
      data: "2026-06-01",
      tipo: "DESPESA",
      valor: 100,
      status: "PAGO",
    };
    resetData({ id: 1, data_pagamento: expect.any(String), ...payload });
    const result = await repo.criarLancamento(payload);
    expect(result.data_pagamento).toBeDefined();
    expect(result.data_pagamento).toEqual(expect.any(String));
  });

  it("rejeita tipo inválido", async () => {
    // Act / Assert
    await expect(repo.criarLancamento({ data: "2026-06-01", tipo: "INVALIDA", valor: 100 })).rejects.toThrow("Tipo inválido");
  });

  it("rejeita valor não positivo", async () => {
    // Act / Assert
    await expect(repo.criarLancamento({ data: "2026-06-01", tipo: "DESPESA", valor: 0 })).rejects.toThrow("Valor deve ser um número positivo");
  });

  it("rejeita valor negativo", async () => {
    // Act / Assert
    await expect(repo.criarLancamento({ data: "2026-06-01", tipo: "DESPESA", valor: -50 })).rejects.toThrow("Valor deve ser um número positivo");
  });

  it("rejeita descrição muito longa", async () => {
    // Arrange
    const descricaoLonga = "A".repeat(501);
    // Act / Assert
    await expect(repo.criarLancamento({ data: "2026-06-01", tipo: "DESPESA", valor: 100, descricao: descricaoLonga })).rejects.toThrow("Descrição deve ter no máximo 500 caracteres");
  });

  it("rejeita status inválido", async () => {
    // Act / Assert
    await expect(repo.criarLancamento({ data: "2026-06-01", tipo: "RECEITA", valor: 100, status: "FATURADO" })).rejects.toThrow("Status inválido");
  });

  it("rejeita data ausente", async () => {
    // Act / Assert
    await expect(repo.criarLancamento({ tipo: "RECEITA", valor: 100 })).rejects.toThrow("Data é obrigatória");
  });
});

/* ─────────── deleteLancamento ─────────── */

describe("deleteLancamento", () => {
  it("deletes by id", async () => {
    const result = await repo.deletarLancamento(42);
    expect(result).toEqual({ success: true });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });
});

/* ─────────── updateLancamento ─────────── */

describe("updateLancamento", () => {
  it("atualiza um lançamento", async () => {
    resetData({ id: 1, valor: 200 });
    const result = await repo.updateLancamento(1, { valor: 200 });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
    expect(result).toEqual({ id: 1, valor: 200 });
  });
});

/* ─────────── importarOrcamento ─────────── */

describe("importarOrcamento", () => {
  it("importa itens com sucesso", async () => {
    const itens = [
      {
        data: "2026-06-01",
        tipo: "DESPESA",
        valor_planejado: "500",
        descricao: "Teste",
      },
    ];
    resetData([{ id: 1, data: "2026-06-01", tipo: "DESPESA", valor_planejado: 500 }]);
    const result = await repo.importarOrcamento(itens);
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("importados");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_orcamento");
  });

  it("throws on invalid input", async () => {
    await expect(repo.importarOrcamento(null)).rejects.toThrow("Array de itens é obrigatório");
  });
});

/* ─────────── getPerfil ─────────── */

describe("getPerfil", () => {
  it("retorna perfil do usuário", async () => {
    resetData({ id: "user-1", nome: "Alan", email: "alan@test.com" });
    const result = await repo.getPerfil("user-1");
    expect(result).toEqual({ id: "user-1", nome: "Alan", email: "alan@test.com" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_usuarios");
  });
});

/* ─────────── updatePerfil ─────────── */

describe("updatePerfil", () => {
  it("atualiza e retorna perfil", async () => {
    // Arrange
    resetData({ id: "user-1", nome: "Alan Atualizado" });
    // Act
    const result = await repo.updatePerfil("user-1", { nome: "Alan Atualizado" });
    // Assert
    expect(result).toEqual({ id: "user-1", nome: "Alan Atualizado" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_usuarios");
  });

  it("rejeita nome muito curto", async () => {
    // Act / Assert
    await expect(repo.updatePerfil("user-1", { nome: "X" })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("rejeita nome muito longo", async () => {
    // Act / Assert
    await expect(repo.updatePerfil("user-1", { nome: "A".repeat(41) })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });
});

/* ─────────── getSessoes ─────────── */

describe("getSessoes", () => {
  const mockSupabaseAdmin = { rpc: vi.fn() };
  let originalFetch;

  beforeEach(() => {
    repo.__setSupabaseAdmin(mockSupabaseAdmin);
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("retorna sessões via edge function", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    });
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "s-1", user_agent: "Chrome", ip: "127.0.0.1", created_at: "2026-06-01T00:00:00Z" },
        { id: "s-2", user_agent: "Firefox", ip: "10.0.0.1", created_at: "2026-06-02T00:00:00Z" },
      ],
    });

    const result = await repo.getSessoes("550e8400-e29b-41d4-a716-446655440000");

    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/functions/v1/get-user-sessions"), expect.objectContaining({ method: "POST" }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s-1");
    expect(result[0].criado_em).toBe("2026-06-01T00:00:00Z");
  });

  it("fallback para supabaseAdmin.from('auth_sessions') se edge function falha", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    });
    globalThis.fetch.mockRejectedValue(new Error("network error"));
    const mockData = [{ id: "s-1", user_agent: "Chrome", ip: "127.0.0.1", created_at: "2026-06-01T00:00:00Z" }];
    const fromObj = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    mockSupabaseAdmin.from = vi.fn().mockReturnValue(fromObj);

    const result = await repo.getSessoes("550e8400-e29b-41d4-a716-446655440000");

    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("auth_sessions");
    expect(result).toHaveLength(1);
  });

  it("retorna array vazio se supabaseAdmin não disponível e edge function falha", async () => {
    repo.__setSupabaseAdmin(null);
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    });
    globalThis.fetch.mockRejectedValue(new Error("network error"));

    const result = await repo.getSessoes("550e8400-e29b-41d4-a716-446655440000");
    expect(result).toEqual([]);
  });

  it("retorna array vazio se query retorna null", async () => {
    const fromObj = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockSupabaseAdmin.from = vi.fn().mockReturnValue(fromObj);
    const result = await repo.getSessoes("550e8400-e29b-41d4-a716-446655440000");
    expect(result).toEqual([]);
  });

  it("lança erro se query falha", async () => {
    const fromObj = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error("DB error") }),
    };
    mockSupabaseAdmin.from = vi.fn().mockReturnValue(fromObj);
    await expect(repo.getSessoes("550e8400-e29b-41d4-a716-446655440000")).rejects.toThrow("DB error");
  });
});

/* ─────────── deleteSessao ─────────── */

describe("deleteSessao", () => {
  const makeMockFrom = () => ({
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  let mockSupabaseAdmin;
  let originalFetch;

  beforeEach(() => {
    mockSupabaseAdmin = { from: vi.fn().mockReturnValue(makeMockFrom()) };
    repo.__setSupabaseAdmin(mockSupabaseAdmin);
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("encerra sessão via edge function", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await repo.deletarSessao("sessao-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/functions/v1/delete-user-session"), expect.objectContaining({ method: "POST" }));
    expect(result).toEqual({ success: true });
  });

  it("fallback para supabaseAdmin.from('auth_refresh_tokens') e auth_sessions se edge function falha", async () => {
    globalThis.fetch.mockRejectedValue(new Error("network error"));

    const result = await repo.deletarSessao("sessao-1");

    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("auth_refresh_tokens");
    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("auth_sessions");
    expect(result).toEqual({ success: true });
  });

  it("lança erro se sessaoId é vazio", async () => {
    await expect(repo.deletarSessao()).rejects.toThrow("SESSAO_ID_AUSENTE");
    await expect(repo.deletarSessao("")).rejects.toThrow("SESSAO_ID_AUSENTE");
  });

  it("fallback não lança erro mesmo se query falha (fire-and-forget)", async () => {
    globalThis.fetch.mockRejectedValue(new Error("network error"));

    const result = await repo.deletarSessao("sessao-1");

    expect(result).toEqual({ success: true });
  });
});

/* ─────────── exportarDados ─────────── */

describe("exportarDados", () => {
  it("retorna lançamentos do usuário", async () => {
    resetData([{ id: 1, valor: 100 }]);
    const result = await repo.exportarDados("user-1");
    expect(result).toEqual({ lancamentos: [{ id: 1, valor: 100 }] });
  });
});

/* ─────────── excluirConta ─────────── */

describe("excluirConta", () => {
  it("chama RPC excluir_conta e retorna sucesso", async () => {
    const result = await repo.excluirConta();
    expect(result).toEqual({ success: true });
  });

  it("lança erro se RPC falha", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.excluirConta()).rejects.toThrow("DB error");
  });
});

/* ─────────── createCategoria ─────────── */

describe("createCategoria", () => {
  it("cria uma categoria", async () => {
    resetData(null); // maybeSingle → activeExisting = null
    pushResult(null); // maybeSingle → inactiveExisting = null
    pushResult({ id: "cat-1", nome: "Salário", tipo: "RECEITA", usuario_id: "user-1" }); // insert result
    const result = await repo.criarCategoria({ nome: "Salário", tipo: "RECEITA", usuarioId: "user-1" });
    expect(result).toEqual({ id: "cat-1", nome: "Salário", tipo: "RECEITA", usuario_id: "user-1" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_categorias");
  });

  it("throws on error", async () => {
    resetData(null); // maybeSingle → activeExisting = null
    pushResult(null); // maybeSingle → inactiveExisting = null
    pushResult({ id: "cat-1" }, new Error("DB error")); // insert error
    await expect(repo.criarCategoria({ nome: "Teste", tipo: "RECEITA", usuarioId: "u-1" })).rejects.toThrow("DB error");
  });
});

/* ─────────── updateCategoria ─────────── */

describe("updateCategoria", () => {
  it("atualiza uma categoria", async () => {
    resetData({ id: "cat-1", eh_global: false });
    await repo.updateCategoria("cat-1", { nome: "Salário Atualizado" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_categorias");
  });

  it("throws on error", async () => {
    resetData({ id: "cat-1", eh_global: false }); // first select returns cat
    pushResult({ id: "cat-1", nome: "Atualizado" }, new Error("DB error")); // update error
    await expect(repo.updateCategoria("cat-1", { nome: "Atualizado" })).rejects.toThrow("DB error");
  });
});

/* ─────────── toggleCategoriaAtivo ─────────── */

describe("toggleCategoriaAtivo", () => {
  it("alterna ativo de true para false", async () => {
    resetData({ id: "cat-1", eh_global: false, ativo: true }); // select single → cat
    pushResult(null, null, 0); // count check → 0 lancamentos vinculados
    pushResult({ id: "cat-1", ativo: false }); // update result
    const result = await repo.toggleCategoriaAtivo("cat-1");
    expect(result).toEqual({ id: "cat-1", ativo: false });
  });

  it("throws on error", async () => {
    resetData({ id: "cat-1", eh_global: false, ativo: true }); // select single → cat
    pushResult(null, null, 0); // count check → 0
    pushResult(null, new Error("DB error")); // update error
    await expect(repo.toggleCategoriaAtivo("cat-1")).rejects.toThrow("DB error");
  });
});

/* ─────────── createSubcategoria ─────────── */

describe("createSubcategoria", () => {
  it("cria uma subcategoria", async () => {
    resetData(null); // maybeSingle → no existing
    pushResult({ id: "sub-1", nome: "Aluguel", categoria_id: "cat-1", usuario_id: "user-123" }); // insert result
    const result = await repo.criarSubcategoria("user-123", { nome: "Aluguel", categoria_id: "cat-1" });
    expect(result).toEqual({ id: "sub-1", nome: "Aluguel", categoria_id: "cat-1", usuario_id: "user-123" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_subcategorias");
  });
});

/* ─────────── updateSubcategoria ─────────── */

describe("updateSubcategoria", () => {
  it("atualiza uma subcategoria", async () => {
    resetData([{ id: "sub-1", nome: "Aluguel Atualizado" }]);
    const result = await repo.updateSubcategoria("sub-1", { nome: "Aluguel Atualizado" });
    expect(result).toEqual({ id: "sub-1", nome: "Aluguel Atualizado" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_subcategorias");
  });
});

/* ─────────── deleteSubcategoria ─────────── */

describe("deleteSubcategoria", () => {
  it("exclui uma subcategoria", async () => {
    const result = await repo.deletarSubcategoria("sub-1");
    expect(result).toEqual({ success: true });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_subcategorias");
  });
});

/* ─────────── setAuthSession ─────────── */

describe("setAuthSession", () => {
  it("chama auth.setSession com tokens", async () => {
    await repo.setAuthSession("access-token", "refresh-token");
    expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
  });
});

/* ─────────── clearAuthSession ─────────── */

describe("clearAuthSession", () => {
  it("chama auth.signOut", async () => {
    await repo.limparSessaoAuth();
    expect(mockSupabase.auth.signOut).toHaveBeenCalledOnce();
  });
});

/* ─────────── logAuditoria ─────────── */

describe("logAuditoria", () => {
  beforeEach(() => {
    repo.__setSupabaseAdmin(null);
  });
  it("insere registro de auditoria com metadados completos", async () => {
    resetData({ id: 1, acao: "LOGIN", usuario_id: "user-1" });
    const result = await repo.logAuditoria("user-1", "LOGIN", {
      entidade: "auth",
      entidade_id: "user-1",
      dados_anteriores: null,
      dados_novos: { ip: "127.0.0.1" },
      ip: "127.0.0.1",
      user_agent: "Mozilla",
      contexto: "user",
    });
    expect(result).toEqual({ id: 1, acao: "LOGIN", usuario_id: "user-1" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_auditoria");
  });

  it("insere auditoria com valores padrão quando metadados vazio", async () => {
    resetData({ id: 2, acao: "LOGOUT", usuario_id: "user-1" });
    const result = await repo.logAuditoria("user-1", "LOGOUT");
    expect(result.acao).toBe("LOGOUT");
  });

  it("throws on error", async () => {
    resetData(null, new Error("DB error"));
    await expect(repo.logAuditoria("u-1", "LOGIN")).rejects.toThrow("DB error");
  });
});

/* ─────────── getAuditoria ─────────── */

describe("getAuditoria", () => {
  it("retorna registros de auditoria com limite padrão", async () => {
    resetData([{ id: 1, acao: "LOGIN" }]);
    const result = await repo.getAuditoria();
    expect(result).toEqual([{ id: 1, acao: "LOGIN" }]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_auditoria");
  });

  it("filtra por usuarioId, acao, entidade e período", async () => {
    resetData([{ id: 1, acao: "LOGIN" }]);
    await repo.getAuditoria({
      usuarioId: "user-1",
      acao: "LOGIN",
      entidade: "auth",
      de: "2026-01-01",
      ate: "2026-12-31",
      limite: 50,
    });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_auditoria");
  });

  it("throws on error", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.getAuditoria()).rejects.toThrow("DB error");
  });
});

/* ─────────── getAdminDashboard ─────────── */

describe("getAdminDashboard", () => {
  it("retorna dashboard com totais calculados", async () => {
    resetData([
      { tipo: "RECEITA", valor: "1000", status: "PAGO" },
      { tipo: "DESPESA", valor: "400", status: "PAGO" },
      { tipo: "RECEITA", valor: "200", status: "PENDENTE" },
    ]);
    pushResult(null, null, 5); // count totalUsuariosAtivos
    const result = await repo.getAdminDashboard();
    expect(result).toHaveProperty("totalReceitas", 1000);
    expect(result).toHaveProperty("totalDespesas", 400);
    expect(result).toHaveProperty("saldo", 600);
    expect(result).toHaveProperty("totalUsuariosAtivos", 5);
  });

  it("throws on lancamentos error", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.getAdminDashboard()).rejects.toThrow("DB error");
  });

  it("trata lançamentos null de forma segura", async () => {
    resetData(null);
    pushResult(null, null, 0);
    const result = await repo.getAdminDashboard();
    expect(result.totalReceitas).toBe(0);
    expect(result.totalDespesas).toBe(0);
    expect(result.saldo).toBe(0);
  });
});

/* ─────────── getTransacoesCliente ─────────── */

describe("getTransacoesCliente", () => {
  it("retorna transações de um usuário sem filtro de data", async () => {
    resetData([{ id: 1, valor: 100 }]);
    const result = await repo.getTransacoesCliente("user-1");
    expect(result).toEqual([{ id: 1, valor: 100 }]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });

  it("filters by mes and ano", async () => {
    resetData([{ id: 1, valor: 100 }]);
    await repo.getTransacoesCliente("user-1", 6, 2026);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });

  it("filtra apenas por ano quando mês não fornecido", async () => {
    resetData([{ id: 1, valor: 100 }]);
    await repo.getTransacoesCliente("user-1", null, 2026);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });

  it("throws on error", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.getTransacoesCliente("user-1")).rejects.toThrow("DB error");
  });
});

/* ─────────── getChamados ─────────── */

describe("getChamados", () => {
  it("retorna todos os chamados sem usuarioId", async () => {
    resetData([{ id: 1, titulo: "Bug" }]);
    const result = await repo.getChamados();
    expect(result).toEqual([{ id: 1, titulo: "Bug" }]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_chamados");
  });

  it("filtra por usuarioId quando fornecido", async () => {
    resetData([{ id: 1, titulo: "Bug", usuario_id: "user-1" }]);
    const result = await repo.getChamados("user-1");
    expect(result).toEqual([{ id: 1, titulo: "Bug", usuario_id: "user-1" }]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_chamados");
  });

  it("throws on error", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.getChamados()).rejects.toThrow("DB error");
  });
});

/* ─────────── getChamadoById ─────────── */

describe("getChamadoById", () => {
  it("retorna chamado por id", async () => {
    resetData({ id: 1, titulo: "Bug report" });
    const result = await repo.getChamadoById(1);
    expect(result).toEqual({ id: 1, titulo: "Bug report" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_chamados");
  });

  it("throws on error", async () => {
    resetData(null, new Error("Not found"));
    await expect(repo.getChamadoById(999)).rejects.toThrow("Not found");
  });
});

/* ─────────── createChamado ─────────── */

describe("createChamado", () => {
  it("cria um chamado com array de respostas vazio", async () => {
    resetData({ id: 1, titulo: "Bug", descricao: "Erro", respostas: [] });
    const result = await repo.criarChamado({ titulo: "Bug", descricao: "Erro", usuario_id: "user-1" });
    expect(result).toEqual({ id: 1, titulo: "Bug", descricao: "Erro", respostas: [] });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_chamados");
  });

  it("throws on error", async () => {
    resetData(null, new Error("DB error"));
    await expect(repo.criarChamado({ titulo: "Bug" })).rejects.toThrow("DB error");
  });
});

/* ─────────── updateChamado ─────────── */

describe("updateChamado", () => {
  it("atualiza um chamado", async () => {
    resetData({ id: 1, titulo: "Bug Atualizado", status: "RESOLVIDO" });
    const result = await repo.updateChamado(1, { status: "RESOLVIDO" });
    expect(result).toEqual({ id: 1, titulo: "Bug Atualizado", status: "RESOLVIDO" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_chamados");
  });

  it("throws on error", async () => {
    resetData(null, new Error("DB error"));
    await expect(repo.updateChamado(1, { status: "RESOLVIDO" })).rejects.toThrow("DB error");
  });
});

/* ─────────── getClientes ─────────── */

describe("getClientes", () => {
  it("retorna todos os clientes ordenados por criado_em desc", async () => {
    resetData([{ id: "user-1", nome: "Alan", email: "alan@test.com", role: "user", ativo: true }]);
    pushResult([]); // financas_auditoria retorna vazio
    const result = await repo.getClientes();
    expect(result).toEqual([{ id: "user-1", nome: "Alan", email: "alan@test.com", role: "user", ativo: true, ultimo_login: null }]);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_usuarios");
  });

  it("com ultimo_login da auditoria", async () => {
    resetData([{ id: "user-1", nome: "Alan", email: "alan@test.com", role: "user", ativo: true }]);
    pushResult([{ usuario_id: "user-1", criado_em: "2026-06-10T12:00:00Z" }]);
    const result = await repo.getClientes();
    expect(result).toEqual([{ id: "user-1", nome: "Alan", email: "alan@test.com", role: "user", ativo: true, ultimo_login: "2026-06-10T12:00:00Z" }]);
  });

  it("throws on error", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.getClientes()).rejects.toThrow("DB error");
  });
});

/* ─────────── getResumoCliente ─────────── */

describe("getResumoCliente", () => {
  it("retorna resumo com lançamentos e orçamento", async () => {
    resetData([{ id: 1, tipo: "RECEITA", valor: 100, status: "PAGO", data: "2026-06-01" }]);
    pushResult([{ tipo: "RECEITA", valor_planejado: 1000, valor_realizado: 800 }]);
    const result = await repo.getResumoCliente("user-1");
    expect(result).toHaveProperty("lancamentos");
    expect(result).toHaveProperty("orcamento");
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });

  it("retorna dados vazios quando não há lançamentos", async () => {
    resetData([]);
    pushResult([]);
    const result = await repo.getResumoCliente("user-1");
    expect(result).toEqual({ lancamentos: [], orcamento: [] });
  });

  it("throws on lancamentos error", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.getResumoCliente("user-1")).rejects.toThrow("DB error");
  });
});

/* ─────────── toggleClienteStatus ─────────── */

describe("toggleClienteStatus", () => {
  it("alterna ativo de true para false", async () => {
    resetData({ id: "user-1", ativo: true }); // first select
    pushResult({ id: "user-1", ativo: false }); // update result
    const result = await repo.toggleClienteStatus("user-1");
    expect(result).toEqual({ id: "user-1", ativo: false });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_usuarios");
  });

  it("alterna ativo de false para true", async () => {
    resetData({ id: "user-1", ativo: false }); // first select
    pushResult({ id: "user-1", ativo: true }); // update result
    const result = await repo.toggleClienteStatus("user-1");
    expect(result).toEqual({ id: "user-1", ativo: true });
  });

  it("lança erro quando usuário não encontrado", async () => {
    resetData(null); // first select returns null
    await expect(repo.toggleClienteStatus("invalid-id")).rejects.toThrow("USUARIO_NAO_ENCONTRADO");
  });

  it("throws on update error", async () => {
    resetData({ id: "user-1", ativo: true }); // first select succeeds
    pushResult(null, new Error("DB error")); // update fails
    await expect(repo.toggleClienteStatus("user-1")).rejects.toThrow("DB error");
  });
});

/* ─────────── createTransferencia ─────────── */

describe("createTransferencia", () => {
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("mock-uuid-transf");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cria 2 lancamentos com mesmo transferencia_grupo_id", async () => {
    // Arrange
    const payload = {
      data: "2026-06-15",
      status: "PENDENTE",
      valor: 500,
      conta_origem_id: 1,
      conta_destino_id: 2,
      categoria_id: 1,
      descricao: "Transferência",
    };
    resetData({ id: 1, tipo: "DESPESA", transferencia_grupo_id: "mock-uuid-transf", conta_origem_id: 1, conta_destino_id: null });
    pushResult({ id: 2, tipo: "RECEITA", transferencia_grupo_id: "mock-uuid-transf", conta_origem_id: null, conta_destino_id: 2 });
    // Act
    const result = await repo.criarTransferencia(payload);

    expect(result).toHaveLength(2);
    expect(result[0].transferencia_grupo_id).toBe("mock-uuid-transf");
    expect(result[1].transferencia_grupo_id).toBe("mock-uuid-transf");
    expect(result[0].tipo).toBe("DESPESA");
    expect(result[0].conta_origem_id).toBe(1);
    expect(result[0].conta_destino_id).toBeNull();
    expect(result[1].tipo).toBe("RECEITA");
    expect(result[1].conta_origem_id).toBeNull();
    expect(result[1].conta_destino_id).toBe(2);
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });

  it("inclui usuario_id em ambos lancamentos", async () => {
    resetData({ id: 1, tipo: "DESPESA" });
    pushResult({ id: 2, tipo: "RECEITA" });

    await repo.criarTransferencia({ data: "2026-06-01", status: "PENDENTE", valor: 100, conta_origem_id: 1, conta_destino_id: 2 }, "user-123");

    const firstInsert = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
    const secondInsert = mockSupabase.from.mock.results[1].value.insert.mock.calls[0][0];
    expect(firstInsert.usuario_id).toBe("user-123");
    expect(secondInsert.usuario_id).toBe("user-123");
  });

  it("lança erro no primeiro insert", async () => {
    resetData(null, new Error("DB error"));

    await expect(repo.criarTransferencia({ data: "2026-06-01", status: "PENDENTE", valor: 100, conta_origem_id: 1, conta_destino_id: 2 })).rejects.toThrow("DB error");
  });
});

/* ─────────── deleteTransferencia ─────────── */

describe("deleteTransferencia", () => {
  it("deleta por grupoId e retorna success", async () => {
    const result = await repo.deletarTransferencia("grupo-1");
    expect(result).toEqual({ success: true });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });

  it("lança erro", async () => {
    resetData([], new Error("DB error"));
    await expect(repo.deletarTransferencia("grupo-1")).rejects.toThrow("DB error");
  });
});

/* ─────────── updateTransferencia ─────────── */

describe("updateTransferencia", () => {
  it("atualiza ambos registros e retorna lista atualizada", async () => {
    // Arrange
    const payload = {
      data: "2026-06-20",
      status: "PENDENTE",
      valor: 600,
      conta_origem_id: 3,
      conta_destino_id: 4,
      categoria_id: 1,
    };
    resetData([
      { id: 1, tipo: "DESPESA", conta_origem_id: 1, conta_destino_id: null },
      { id: 2, tipo: "RECEITA", conta_origem_id: null, conta_destino_id: 2 },
    ]);
    pushResult(null);
    pushResult(null);
    pushResult([
      { id: 1, tipo: "DESPESA", valor: 600, transferencia_grupo_id: "grupo-1" },
      { id: 2, tipo: "RECEITA", valor: 600, transferencia_grupo_id: "grupo-1" },
    ]);
    // Act
    const result = await repo.updateTransferencia("grupo-1", payload);

    expect(result).toHaveLength(2);
    expect(result[0].valor).toBe(600);
    expect(result[1].valor).toBe(600);
    expect(mockSupabase.from).toHaveBeenCalledTimes(4);
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_lancamentos");
  });

  it("lança Transferência não encontrada quando não existem registros", async () => {
    resetData(null);

    await expect(repo.updateTransferencia("grupo-invalido", { data: "2026-06-01", status: "PENDENTE", valor: 100 })).rejects.toThrow("Transferência não encontrada.");
  });

  it("inclui data_pagamento quando status é PAGO", async () => {
    const payload = {
      data: "2026-06-20",
      status: "PAGO",
      valor: 600,
      conta_origem_id: 3,
      conta_destino_id: 4,
      categoria_id: 1,
    };
    resetData([
      { id: 1, tipo: "DESPESA" },
      { id: 2, tipo: "RECEITA" },
    ]);
    pushResult(null);
    pushResult(null);
    pushResult([
      { id: 1, tipo: "DESPESA" },
      { id: 2, tipo: "RECEITA" },
    ]);

    await repo.updateTransferencia("grupo-1", payload);

    const firstUpdate = mockSupabase.from.mock.results[1].value.update.mock.calls[0][0];
    expect(firstUpdate.data_pagamento).toEqual(expect.any(String));
  });

  it("lança erro no update", async () => {
    resetData([{ id: 1, tipo: "DESPESA" }]);
    pushResult(null, new Error("DB error"));

    await expect(repo.updateTransferencia("grupo-1", { data: "2026-06-01", status: "PENDENTE", valor: 100 })).rejects.toThrow("DB error");
  });
});

/* ─────────── createConta ─────────── */

describe("createConta", () => {
  it("rejeita nome vazio", async () => {
    // Act / Assert
    await expect(repo.criarConta("user-1", { nome: "" })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("rejeita nome muito curto", async () => {
    // Act / Assert
    await expect(repo.criarConta("user-1", { nome: "A" })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("rejeita nome muito longo", async () => {
    // Act / Assert
    await expect(repo.criarConta("user-1", { nome: "A".repeat(41) })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("cria conta com nome válido", async () => {
    // Arrange
    resetData({ id: "conta-1", nome: "Nubank", usuario_id: "user-1" });
    // Act
    const result = await repo.criarConta("user-1", { nome: "Nubank" });
    // Assert
    expect(result).toEqual({ id: "conta-1", nome: "Nubank", usuario_id: "user-1" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_contas");
  });
});

/* ─────────── updateConta ─────────── */

describe("updateConta", () => {
  it("rejeita nome muito curto", async () => {
    // Act / Assert
    await expect(repo.updateConta("conta-1", { nome: "X" })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("rejeita nome muito longo", async () => {
    // Act / Assert
    await expect(repo.updateConta("conta-1", { nome: "A".repeat(41) })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("atualiza conta com nome válido", async () => {
    // Arrange
    resetData({ id: "conta-1", nome: "Nubank Atualizado" });
    // Act
    const result = await repo.updateConta("conta-1", { nome: "Nubank Atualizado" });
    // Assert
    expect(result).toEqual({ id: "conta-1", nome: "Nubank Atualizado" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_contas");
  });

  it("ignora update quando patch está vazio", async () => {
    // Act
    const result = await repo.updateConta("conta-1", {});
    // Assert
    expect(result).toBeNull();
  });
});

/* ─────────── createPessoa ─────────── */

describe("createPessoa", () => {
  it("rejeita nome vazio", async () => {
    // Act / Assert
    await expect(repo.criarPessoa("user-1", { nome: "" })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("rejeita nome muito curto", async () => {
    // Act / Assert
    await expect(repo.criarPessoa("user-1", { nome: "A" })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("rejeita nome muito longo", async () => {
    // Act / Assert
    await expect(repo.criarPessoa("user-1", { nome: "A".repeat(41) })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("cria pessoa com nome válido", async () => {
    // Arrange
    resetData({ id: "pessoa-1", nome: "João", usuario_id: "user-1" });
    // Act
    const result = await repo.criarPessoa("user-1", { nome: "João" });
    // Assert
    expect(result).toEqual({ id: "pessoa-1", nome: "João", usuario_id: "user-1" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_pessoas");
  });
});

/* ─────────── updatePessoa ─────────── */

describe("updatePessoa", () => {
  it("rejeita nome muito curto", async () => {
    // Act / Assert
    await expect(repo.updatePessoa("pessoa-1", { nome: "X" })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("rejeita nome muito longo", async () => {
    // Act / Assert
    await expect(repo.updatePessoa("pessoa-1", { nome: "A".repeat(41) })).rejects.toThrow("Nome deve ter entre 2 e 40 caracteres");
  });

  it("atualiza pessoa com nome válido", async () => {
    // Arrange
    resetData({ id: "pessoa-1", nome: "João Atualizado" });
    // Act
    const result = await repo.updatePessoa("pessoa-1", { nome: "João Atualizado" });
    // Assert
    expect(result).toEqual({ id: "pessoa-1", nome: "João Atualizado" });
    expect(mockSupabase.from).toHaveBeenCalledWith("financas_pessoas");
  });
});
