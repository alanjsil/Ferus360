/**
 * @file Teste integrado: Fluxo de Login → Criar Categoria → Lançamento → Dashboard
 *
 * Este teste valida o fluxo completo:
 * 1. Fazer login com credenciais
 * 2. Criar categoria pessoal
 * 3. Criar lançamento vinculado à categoria
 * 4. Validar listagens e isolamento entre usuários
 * 5. Validar dashboard reflete os dados
 * @module test/integrados/categoria-lancamento.test.js
 * @changelog
 * [2026-06-10] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, createAndLoginUser } from "./helpers.js";
import * as repo from "../../services/repository.js";

describe("Fluxo Integrado: Login → Categoria → Lançamento → Dashboard", () => {
  let auth;
  let mockSupabase;
  let usuario;
  let _token;

  beforeEach(async () => {
    vi.resetModules();

    mockSupabase = createMockSupabase();
    repo.__setSupabase(mockSupabase);

    const authModule = await import("../../services/auth.js");

    auth = authModule.buildAuthService({
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
  /* TESTE 1: CRIAR CATEGORIA PESSOAL */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Criar categoria pessoal com sucesso", async () => {
    const db = mockSupabase.__db();
    const qtdAntes = db.financas_categorias.length;

    const categoria = await repo.createCategoria({
      nome: "Transporte app",
      tipo: "DESPESA",
      usuarioId: usuario.id,
      ehGlobal: false,
    });

    expect(categoria.id).toBeTruthy();
    expect(categoria.nome).toBe("Transporte app");
    expect(categoria.tipo).toBe("DESPESA");
    expect(categoria.usuario_id).toBe(usuario.id);
    expect(categoria.eh_global).toBe(false);

    expect(db.financas_categorias).toHaveLength(qtdAntes + 1);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: CRIAR CATEGORIA E LISTAR */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Criar categoria e listar com filtro por tipo", async () => {
    await repo.createCategoria({
      nome: "Gasolina",
      tipo: "DESPESA",
      usuarioId: usuario.id,
      ehGlobal: false,
    });

    await repo.createCategoria({
      nome: "Freelance",
      tipo: "RECEITA",
      usuarioId: usuario.id,
      ehGlobal: false,
    });

    const despesas = await repo.getCategorias(usuario.id, "DESPESA");
    const receitas = await repo.getCategorias(usuario.id, "RECEITA");

    expect(despesas.length).toBeGreaterThanOrEqual(1);
    expect(receitas.length).toBeGreaterThanOrEqual(1);
    expect(despesas.some((c) => c.nome === "Gasolina")).toBe(true);
    expect(receitas.some((c) => c.nome === "Freelance")).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: ISOLAMENTO DE CATEGORIA ENTRE USUÁRIOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Isolamento de categoria entre usuários", async () => {
    // Usuário 1 cria categoria
    await repo.createCategoria({
      nome: "Categoria secreta",
      tipo: "DESPESA",
      usuarioId: usuario.id,
      ehGlobal: false,
    });

    // Criar usuário 2
    const outroUser = await createAndLoginUser(mockSupabase, {
      email: "outro@test.com",
      name: "Outro",
    });

    const catsUser1 = await repo.getCategorias(usuario.id);
    const catsUser2 = await repo.getCategorias(outroUser.user.id);

    // Usuário 2 não deve ver as categorias pessoais do usuário 1
    expect(catsUser1.length).toBeGreaterThan(0);
    expect(catsUser2.some((c) => c.nome === "Categoria secreta")).toBe(false);
    expect(catsUser1.some((c) => c.nome === "Categoria secreta")).toBe(true);

    // Ambos veem as categorias globais (não têm usuario_id)
    const globais = await repo.getCategorias(null);
    expect(globais.length).toBeGreaterThan(0);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: CRIAR LANÇAMENTO COM CATEGORIA */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Criar lançamento vinculado a categoria existente", async () => {
    const db = mockSupabase.__db();
    const catGlobal = db.financas_categorias.find(
      (c) => c.eh_global && c.nome === "Alimentação",
    );

    const lancamento = await repo.createLancamento(
      {
        tipo: "DESPESA",
        valor: 45.9,
        descricao: "Almoço",
        categoria_id: catGlobal.id,
        data: "2026-06-15",
        status: "PENDENTE",
        data_busca: "2026-06",
      },
      usuario.id,
    );

    expect(lancamento.id).toBeTruthy();
    expect(lancamento.categoria_id).toBe(catGlobal.id);
    expect(lancamento.tipo).toBe("DESPESA");
    expect(lancamento.valor).toBe(45.9);
    expect(lancamento.descricao).toBe("Almoço");

    const lancamentos = db.financas_lancamentos.filter(
      (l) => l.usuario_id === usuario.id,
    );
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].categoria_id).toBe(catGlobal.id);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: MÚLTIPLOS LANÇAMENTOS EM CATEGORIAS DIFERENTES */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 5: Lançamentos em categorias diferentes e total por categoria", async () => {
    const db = mockSupabase.__db();
    const alimentacao = db.financas_categorias.find((c) => c.nome === "Alimentação");
    const transporte = db.financas_categorias.find((c) => c.nome === "Transporte");

    // Criar 2 lançamentos em Alimentação
    await repo.createLancamento(
      { tipo: "DESPESA", valor: 30, categoria_id: alimentacao.id, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06" },
      usuario.id,
    );

    await repo.createLancamento(
      { tipo: "DESPESA", valor: 50, categoria_id: alimentacao.id, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06" },
      usuario.id,
    );

    // Criar 1 lançamento em Transporte
    await repo.createLancamento(
      { tipo: "DESPESA", valor: 20, categoria_id: transporte.id, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06" },
      usuario.id,
    );

    const lancamentos = db.financas_lancamentos.filter(
      (l) => l.usuario_id === usuario.id,
    );
    const totalAlimentacao = lancamentos
      .filter((l) => l.categoria_id === alimentacao.id)
      .reduce((s, l) => s + l.valor, 0);
    const totalTransporte = lancamentos
      .filter((l) => l.categoria_id === transporte.id)
      .reduce((s, l) => s + l.valor, 0);

    expect(lancamentos).toHaveLength(3);
    expect(totalAlimentacao).toBe(80);
    expect(totalTransporte).toBe(20);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 6: FLUXO COMPLETO - LOGIN → CATEGORIA → LANÇAMENTO → VALIDAR DASHBOARD */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 6: Fluxo completo - Login, criar categoria, lançamento e validar dashboard", async () => {
    // Login
    const loginResult = await auth.login("usuario@test.com", "senha");
    expect(loginResult.token).toBeTruthy();
    const userId = loginResult.usuario.id;

    // Criar categoria pessoal
    const categoria = await repo.createCategoria({
      nome: "Salário extra",
      tipo: "RECEITA",
      usuarioId: userId,
      ehGlobal: false,
    });
    expect(categoria.id).toBeTruthy();
    const catId = categoria.id;

    // Criar lançamento de receita com a nova categoria
    await repo.createLancamento(
      {
        tipo: "RECEITA",
        valor: 1000,
        status: "PAGO",
        descricao: "Freela",
        categoria_id: catId,
        data: "2026-06-15",
        data_busca: "2026-06",
      },
      userId,
    );

    // Criar lançamento de despesa com categoria global
    const db = mockSupabase.__db();
    const catAlimentacao = db.financas_categorias.find(
      (c) => c.eh_global && c.nome === "Alimentação",
    );

    await repo.createLancamento(
      {
        tipo: "DESPESA",
        valor: 200,
        status: "PAGO",
        descricao: "Supermercado",
        categoria_id: catAlimentacao.id,
        data: "2026-06-15",
        data_busca: "2026-06",
      },
      userId,
    );

    // Validar via dashboard
    const dashboard = await repo.getDashboard("2026-06", userId);

    expect(dashboard.totais.receitas_realizadas).toBe(1000);
    expect(dashboard.totais.despesas_realizadas).toBe(200);
    expect(dashboard.realizados).toHaveLength(2);
    expect(dashboard.realizados.some((l) => l.categoria_id === catId)).toBe(true);
    expect(dashboard.realizados.some((l) => l.categoria_id === catAlimentacao.id)).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 7: CATEGORIAS GLOBAIS FICAM ACESSÍVEIS A TODOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 7: Categorias globais visíveis para qualquer usuário", async () => {
    const globais = await repo.getCategorias(null);

    expect(globais).toHaveLength(3);
    expect(globais.map((c) => c.nome)).toEqual(
      expect.arrayContaining(["Alimentação", "Salário", "Transporte"]),
    );

    expect(globais.find((c) => c.nome === "Alimentação").tipo).toBe("DESPESA");
    expect(globais.find((c) => c.nome === "Salário").tipo).toBe("RECEITA");
    expect(globais.find((c) => c.nome === "Transporte").tipo).toBe("DESPESA");

    globais.forEach((c) => expect(c.ativo).toBe(true));
  });
});
