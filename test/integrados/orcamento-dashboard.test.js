/**
 * @file Teste integrado: Fluxo de Login → Orçamento → Dashboard
 *
 * Valida:
 * 1. Login
 * 2. Importar orçamento com valores planejados
 * 3. Criar lançamentos realizados
 * 4. Calcular dashboard e validar totais
 * @module test/integrados/orcamento-dashboard.test.js
 * @changelog
 * [2026-06-10] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as repo from "../../services/repository.js";
import { createAndLoginUser, createMockSupabase } from "./helpers.js";
import { construirAuthService } from "../../services/auth.js";

describe("Fluxo Integrado: Login → Orçamento → Dashboard", () => {
  let _auth;
  let mockSupabase;
  let usuario;

  beforeEach(async () => {
    mockSupabase = createMockSupabase();
    repo.__setSupabase(mockSupabase);

    _auth = construirAuthService({
      supabase: mockSupabase,
      createClient: vi.fn(() => mockSupabase),
      onLogin: vi.fn(),
      onLogout: vi.fn(),
    });

    const loginResult = await createAndLoginUser(mockSupabase, {
      email: "usuario@test.com",
      name: "Usuário Teste",
    });
    usuario = loginResult.user;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 1: IMPORTAR ORÇAMENTO PLANEJADO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Importar itens de orçamento planejado", async () => {
    const db = mockSupabase.__db();

    const itens = [
      {
        data: "2026-06-01",
        tipo: "RECEITA",
        descricao: "Salário",
        valor_planejado: 5000,
        valor_realizado: 0,
        categoria_id: 2,
        data_busca: "2026-06",
      },
      {
        data: "2026-06-01",
        tipo: "DESPESA",
        descricao: "Aluguel",
        valor_planejado: 1500,
        valor_realizado: 0,
        categoria_id: 1,
        data_busca: "2026-06",
      },
      {
        data: "2026-06-01",
        tipo: "DESPESA",
        descricao: "Alimentação",
        valor_planejado: 800,
        valor_realizado: 0,
        categoria_id: 1,
        data_busca: "2026-06",
      },
    ];

    const result = await repo.importarOrcamento(itens, usuario.id);

    expect(result.success).toBe(true);
    expect(result.importados).toBe(3);
    expect(db.financas_orcamento).toHaveLength(3);
    expect(db.financas_orcamento.every((o) => o.usuario_id === usuario.id)).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: CRIAR LANÇAMENTOS REALIZADOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Criar lançamentos realizados (PAGOS) no mesmo mês", async () => {
    const lancamentos = [
      { tipo: "RECEITA", valor: 4800, descricao: "Salário mês", categoria_id: 2 },
      { tipo: "DESPESA", valor: 1500, descricao: "Aluguel", categoria_id: 1 },
      { tipo: "DESPESA", valor: 750, descricao: "Supermercado", categoria_id: 1 },
    ];

    for (const l of lancamentos) {
      const inserted = await repo.criarLancamento(
        {
          ...l,
          status: "PAGO",
          data: "2026-06-15",
          data_busca: "2026-06",
        },
        usuario.id,
      );
      expect(inserted.id).toBeTruthy();
    }

    const db = mockSupabase.__db();
    const meusLancamentos = db.financas_lancamentos.filter((l) => l.usuario_id === usuario.id);

    expect(meusLancamentos).toHaveLength(3);
    expect(meusLancamentos.every((l) => l.status === "PAGO")).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: DASHBOARD - VALIDAR TOTAIS PLANEJADOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Calcular totais planejados do orçamento", async () => {
    const itens = [
      {
        data: "2026-06-01",
        tipo: "RECEITA",
        descricao: "Salário",
        valor_planejado: 5000,
        valor_realizado: 0,
        categoria_id: 2,
        data_busca: "2026-06",
      },
      {
        data: "2026-06-01",
        tipo: "DESPESA",
        descricao: "Aluguel",
        valor_planejado: 1500,
        valor_realizado: 0,
        categoria_id: 1,
        data_busca: "2026-06",
      },
    ];

    await repo.importarOrcamento(itens, usuario.id);

    const dashboard = await repo.getDashboard("2026-06", usuario.id);

    expect(dashboard.totais.receitas_planejadas).toBe(5000);
    expect(dashboard.totais.despesas_planejadas).toBe(1500);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: DASHBOARD - VALIDAR TOTAIS REALIZADOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Calcular totais realizados dos lançamentos PAGOS", async () => {
    const vals = [
      { tipo: "RECEITA", valor: 5000, status: "PAGO" },
      { tipo: "DESPESA", valor: 1500, status: "PAGO" },
      { tipo: "DESPESA", valor: 800, status: "PAGO" },
      { tipo: "DESPESA", valor: 200, status: "PENDENTE" },
    ];

    for (const v of vals) {
      await repo.criarLancamento({ ...v, data: "2026-06-15", data_busca: "2026-06", categoria_id: 1 }, usuario.id);
    }

    const dashboard = await repo.getDashboard("2026-06", usuario.id);

    expect(dashboard.totais.receitas_realizadas).toBe(5000);
    expect(dashboard.totais.despesas_realizadas).toBe(2300);

    const lancamentosPagos = dashboard.realizados.filter((l) => l.usuario_id === usuario.id && l.status === "PAGO");
    expect(lancamentosPagos).toHaveLength(3);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: FLUXO COMPLETO - ORÇAMENTO + REALIZADO + SALDO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 5: Fluxo completo - Orçamento, lançamentos e saldo do dashboard", async () => {
    const userId = usuario.id;

    // Importar orçamento
    await repo.importarOrcamento(
      [
        {
          data: "2026-06-01",
          tipo: "RECEITA",
          descricao: "Salário",
          valor_planejado: 5000,
          valor_realizado: 0,
          categoria_id: 2,
          data_busca: "2026-06",
        },
        {
          data: "2026-06-01",
          tipo: "DESPESA",
          descricao: "Aluguel",
          valor_planejado: 1500,
          valor_realizado: 0,
          categoria_id: 1,
          data_busca: "2026-06",
        },
      ],
      userId,
    );

    // Criar lançamentos realizados
    await repo.criarLancamento({ tipo: "RECEITA", valor: 5000, status: "PAGO", data: "2026-06-01", data_busca: "2026-06", categoria_id: 2 }, userId);

    await repo.criarLancamento({ tipo: "DESPESA", valor: 1500, status: "PAGO", data: "2026-06-05", descricao: "Aluguel", data_busca: "2026-06", categoria_id: 1 }, userId);

    await repo.criarLancamento({ tipo: "DESPESA", valor: 300, status: "PAGO", data: "2026-06-10", descricao: "Transporte", data_busca: "2026-06", categoria_id: 1 }, userId);

    const dashboard = await repo.getDashboard("2026-06", userId);

    expect(dashboard.totais.receitas_planejadas).toBe(5000);
    expect(dashboard.totais.despesas_planejadas).toBe(1500);
    expect(dashboard.totais.receitas_realizadas).toBe(5000);
    expect(dashboard.totais.despesas_realizadas).toBe(1800);
    expect(dashboard.totais.receitas_realizadas - dashboard.totais.despesas_realizadas).toBe(3200);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 6: ISOLAMENTO DE ORÇAMENTO ENTRE USUÁRIOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 6: Isolamento de orçamento entre usuários", async () => {
    // Usuário 1 cria orçamento
    await repo.importarOrcamento(
      [
        {
          data: "2026-06-01",
          tipo: "RECEITA",
          descricao: "Salário",
          valor_planejado: 5000,
          valor_realizado: 0,
          categoria_id: 2,
          data_busca: "2026-06",
        },
      ],
      usuario.id,
    );

    // Criar outro usuário
    const outroUser = await createAndLoginUser(mockSupabase, {
      email: "outro@test.com",
      name: "Outro",
    });

    // Usuário 2 cria orçamento
    await repo.importarOrcamento(
      [
        {
          data: "2026-06-01",
          tipo: "RECEITA",
          descricao: "Freela",
          valor_planejado: 3000,
          valor_realizado: 0,
          categoria_id: 2,
          data_busca: "2026-06",
        },
      ],
      outroUser.user.id,
    );

    const orcUser1 = await repo.getOrcamento("2026-06", usuario.id);
    const orcUser2 = await repo.getOrcamento("2026-06", outroUser.user.id);

    expect(orcUser1).toHaveLength(1);
    expect(orcUser2).toHaveLength(1);
    expect(orcUser1[0].valor_planejado).toBe(5000);
    expect(orcUser2[0].valor_planejado).toBe(3000);
  });
});
