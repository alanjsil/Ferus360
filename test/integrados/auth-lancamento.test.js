/**
 * @file Teste integrado: Fluxo de Login → Criar Lançamento → Validar Dashboard
 *
 * Este teste valida o fluxo completo de um usuário:
 * 1. Fazer login com credenciais
 * 2. Criar um novo lançamento
 * 3. Validar que o dashboard foi atualizado com os dados
 * @module test/integrados/auth-lancamento.test.js
 * @changelog
 * [2026-06-10] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, createAndLoginUser } from "./helpers.js";
import * as repo from "../../services/repository.js";
import { construirAuthService } from "../../services/auth.js";

describe("Fluxo Integrado: Login → Criar Lançamento → Validar Dashboard", () => {
  let auth;
  let mockSupabase;
  let usuario;
  let _token;

  beforeEach(async () => {
    mockSupabase = createMockSupabase();
    repo.__setSupabase(mockSupabase);

    auth = construirAuthService({
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
    _token = loginResult.token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 1: LOGIN COM SUCESSO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Login bem-sucedido retorna token e usuário", async () => {
    const loginResult = await auth.login("usuario@test.com", "senha");

    expect(loginResult).toHaveProperty("token");
    expect(loginResult).toHaveProperty("refreshToken");
    expect(loginResult).toHaveProperty("usuario");

    expect(loginResult.usuario.email).toBe("usuario@test.com");
    expect(loginResult.usuario.nome).toBe("Usuário Teste");
    expect(loginResult.usuario.id).toBe(usuario.id);

    expect(loginResult.token).toBeTruthy();
    expect(typeof loginResult.token).toBe("string");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: CRIAR LANÇAMENTO APÓS LOGIN */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Criar lançamento DESPESA com sucesso", async () => {
    const lancamento = await repo.criarLancamento(
      {
        tipo: "DESPESA",
        valor: 150.5,
        descricao: "Compra no supermercado",
        categoria_id: 1,
        data: "2026-06-15",
        status: "PENDENTE",
        data_busca: "2026-06",
      },
      usuario.id,
    );

    expect(lancamento.id).toBeTruthy();
    expect(lancamento.tipo).toBe("DESPESA");
    expect(lancamento.valor).toBe(150.5);
    expect(lancamento.usuario_id).toBe(usuario.id);
    expect(lancamento.descricao).toBe("Compra no supermercado");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: CRIAR LANÇAMENTO DE RECEITA */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Criar lançamento RECEITA com sucesso", async () => {
    const receita = await repo.criarLancamento(
      {
        tipo: "RECEITA",
        valor: 3000,
        descricao: "Salário mensal",
        categoria_id: 2,
        data: "2026-06-01",
        status: "PENDENTE",
        data_busca: "2026-06",
      },
      usuario.id,
    );

    expect(receita.tipo).toBe("RECEITA");
    expect(receita.valor).toBe(3000);
    expect(receita.categoria_id).toBe(2);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: MÚLTIPLOS LANÇAMENTOS E ISOLAMENTO POR USUÁRIO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Criar múltiplos lançamentos e validar isolamento por usuário", async () => {
    // Criar outro usuário
    const outroUser = await createAndLoginUser(mockSupabase, {
      email: "outro@test.com",
      name: "Outro Usuário",
    });

    // Usuário 1 cria 2 lançamentos
    await repo.criarLancamento(
      { tipo: "DESPESA", valor: 100, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      usuario.id,
    );

    await repo.criarLancamento(
      { tipo: "DESPESA", valor: 200, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      usuario.id,
    );

    // Usuário 2 cria 1 lançamento
    await repo.criarLancamento(
      { tipo: "DESPESA", valor: 500, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      outroUser.user.id,
    );

    // Validar isolamento via getLancamentos
    const lancamentosUser1 = await repo.getLancamentos("2026-06", usuario.id);
    const lancamentosUser2 = await repo.getLancamentos("2026-06", outroUser.user.id);

    expect(lancamentosUser1).toHaveLength(2);
    expect(lancamentosUser2).toHaveLength(1);
    expect(lancamentosUser1[0].valor).toBe(100);
    expect(lancamentosUser1[1].valor).toBe(200);
    expect(lancamentosUser2[0].valor).toBe(500);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: FLUXO COMPLETO COM DASHBOARD */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 5: Fluxo completo - Login → Criar Lançamentos → Validar Dashboard", async () => {
    // Step 1: Login
    const loginResult = await auth.login("usuario@test.com", "senha");
    expect(loginResult.token).toBeTruthy();
    const userId = loginResult.usuario.id;

    // Step 2: Criar receita de R$ 3000
    const receita = await repo.criarLancamento(
      { tipo: "RECEITA", valor: 3000, status: "PAGO", data: "2026-06-01", data_busca: "2026-06", categoria_id: 2 },
      userId,
    );
    expect(receita.id).toBeTruthy();

    // Step 3: Criar despesas
    await repo.criarLancamento(
      { tipo: "DESPESA", valor: 500, status: "PAGO", descricao: "Alimentação", data: "2026-06-15", data_busca: "2026-06", categoria_id: 1 },
      userId,
    );

    await repo.criarLancamento(
      { tipo: "DESPESA", valor: 300, status: "PAGO", descricao: "Transporte", data: "2026-06-15", data_busca: "2026-06", categoria_id: 1 },
      userId,
    );

    // Step 4: Validar dashboard
    const dashboard = await repo.getDashboard("2026-06", userId);

    expect(dashboard.totais.receitas_realizadas).toBe(3000);
    expect(dashboard.totais.despesas_realizadas).toBe(800);
    expect(dashboard.totais.receitas_realizadas - dashboard.totais.despesas_realizadas).toBe(2200);
    expect(dashboard.realizados).toHaveLength(3);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 6: ATUALIZAR LANÇAMENTO E REFLETIR NO DASHBOARD */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 6: Atualizar lançamento e validar reflexo no dashboard", async () => {
    const userId = usuario.id;

    // Criar lançamento inicial
    const lancamento = await repo.criarLancamento(
      { tipo: "DESPESA", valor: 100, status: "PENDENTE", data: "2026-06-15", data_busca: "2026-06", categoria_id: 1 },
      userId,
    );

    const lancamentoId = lancamento.id;

    // Atualizar: mudar valor para 200 e status para PAGO
    const atualizado = await repo.updateLancamento(
      lancamentoId,
      { valor: 200, status: "PAGO", data: "2026-06-15", data_busca: "2026-06", categoria_id: 1 },
      userId,
    );

    expect(atualizado.valor).toBe(200);
    expect(atualizado.status).toBe("PAGO");

    // Recalcular totais via dashboard
    const dashboard = await repo.getDashboard("2026-06", userId);

    expect(dashboard.totais.despesas_realizadas).toBe(200);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 7: DELETAR LANÇAMENTO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 7: Deletar lançamento e validar remoção", async () => {
    const userId = usuario.id;

    // Criar lançamento
    const lancamento = await repo.criarLancamento(
      { tipo: "DESPESA", valor: 150, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      userId,
    );

    const lancamentoId = lancamento.id;

    // Validar que existe
    const lancamentos = await repo.getLancamentos("2026-06", userId);
    expect(lancamentos.some((l) => l.id === lancamentoId)).toBe(true);

    // Deletar
    await repo.deletarLancamento(lancamentoId, userId);

    // Validar que foi deletado
    const lancamentosApos = await repo.getLancamentos("2026-06", userId);
    expect(lancamentosApos.some((l) => l.id === lancamentoId)).toBe(false);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 8: VALIDAR FILTRO POR MÊS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 8: Criar lançamentos em meses diferentes e validar filtro", async () => {
    const userId = usuario.id;

    // Criar lançamento em junho
    await repo.criarLancamento(
      { tipo: "DESPESA", data: "2026-06-15", valor: 100, status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      userId,
    );

    // Criar lançamento em julho
    await repo.criarLancamento(
      { tipo: "DESPESA", data: "2026-07-15", valor: 200, status: "PENDENTE", data_busca: "2026-07", categoria_id: 1 },
      userId,
    );

    const lancamentosJunho = await repo.getLancamentos("2026-06", userId);
    const lancamentosJulho = await repo.getLancamentos("2026-07", userId);

    expect(lancamentosJunho).toHaveLength(1);
    expect(lancamentosJulho).toHaveLength(1);
    expect(lancamentosJunho[0].valor).toBe(100);
    expect(lancamentosJulho[0].valor).toBe(200);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 9: LOGOUT */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 9: Logout bem-sucedido", async () => {
    await auth.login("usuario@test.com", "senha");

    const logoutResult = await auth.logout();

    expect(logoutResult).toEqual({ success: true });
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 10: FLUXO COM ERRO - CREDENCIAIS INVÁLIDAS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 10: Login com credenciais inválidas falha graciosamente", async () => {
    await expect(auth.login("usuario@test.com", "senha-errada")).rejects.toThrow("CREDENCIAIS_INVALIDAS");
  });
});
