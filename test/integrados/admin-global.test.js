/**
 * @file Teste integrado: Fluxo de Admin → Categorias Globais
 *
 * Valida:
 * 1. Login como admin e criação de categoria global
 * 2. Login como usuário comum visualiza categorias globais
 * 3. Usuário comum não pode editar categoria global
 * 4. Isolamento: categorias pessoais vs globais
 * @module test/integrados/admin-global.test.js
 * @changelog
 * [2026-06-10] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, createAndLoginUser } from "./helpers.js";
import * as repo from "../../services/repository.js";

describe("Fluxo Integrado: Admin → Categorias Globais", () => {
  let _auth;
  let mockSupabase;
  let admin;
  let usuario;

  beforeEach(async () => {
    vi.resetModules();

    mockSupabase = createMockSupabase();
    repo.__setSupabase(mockSupabase);

    const authModule = await import("../../services/auth.js");

    _auth = authModule.buildAuthService({
      supabase: mockSupabase,
      createClient: vi.fn(() => mockSupabase),
      onLogin: vi.fn(),
      onLogout: vi.fn(),
    });

    // Admin
    const adminResult = await createAndLoginUser(mockSupabase, {
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
    });
    admin = adminResult.user;

    // Usuário comum
    const userResult = await createAndLoginUser(mockSupabase, {
      email: "usuario@test.com",
      name: "Usuário",
      role: "user",
    });
    usuario = userResult.user;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 1: ADMIN CRIA CATEGORIA GLOBAL */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Admin cria categoria global com sucesso", async () => {
    const db = mockSupabase.__db();
    const qtdAntes = db.financas_categorias.length;

    const cat = await repo.createCategoria({
      nome: "Assinaturas",
      tipo: "DESPESA",
      usuarioId: admin.id,
      ehGlobal: true,
    });

    expect(cat.id).toBeTruthy();
    expect(cat.nome).toBe("Assinaturas");
    expect(cat.eh_global).toBe(true);
    expect(cat.usuario_id).toBeNull();

    expect(db.financas_categorias).toHaveLength(qtdAntes + 1);
    const globalCat = db.financas_categorias.find((c) => c.nome === "Assinaturas");
    expect(globalCat).toBeDefined();
    expect(globalCat.eh_global).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: USUÁRIO COMUM VÊ CATEGORIAS GLOBAIS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Usuário comum visualiza categorias globais", async () => {
    // Admin cria categoria global
    await repo.createCategoria({
      nome: "Assinaturas",
      tipo: "DESPESA",
      usuarioId: admin.id,
      ehGlobal: true,
    });

    // Usuário busca categorias (globais + próprias)
    const categorias = await repo.getCategorias(usuario.id);

    // As 3 seed + 1 nova = 4 globais visíveis
    expect(categorias.length).toBeGreaterThanOrEqual(4);
    expect(categorias.some((c) => c.nome === "Assinaturas")).toBe(true);
    expect(categorias.some((c) => c.nome === "Alimentação")).toBe(true);
    expect(categorias.some((c) => c.nome === "Salário")).toBe(true);
    expect(categorias.some((c) => c.nome === "Transporte")).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: USUÁRIO COMUM CRIA CATEGORIA PESSOAL (NÃO GLOBAL) */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Usuário comum cria categoria pessoal (não global)", async () => {
    const cat = await repo.createCategoria({
      nome: "Meu investimento",
      tipo: "RECEITA",
      usuarioId: usuario.id,
      ehGlobal: false,
    });

    expect(cat.eh_global).toBe(false);
    expect(cat.usuario_id).toBe(usuario.id);

    // Admin não deve ver como global
    const catsAdmin = await repo.getCategorias(admin.id);
    expect(catsAdmin.some((c) => c.nome === "Meu investimento")).toBe(false);

    // Mas o usuário pode ver a própria
    const catsUser = await repo.getCategorias(usuario.id);
    expect(catsUser.some((c) => c.nome === "Meu investimento")).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: ISOLAMENTO CATEGORIAS GLOBAIS VS PESSOAIS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Isolamento entre categorias globais e pessoais", async () => {
    // Admin cria global
    await repo.createCategoria({
      nome: "Global adm",
      tipo: "DESPESA",
      usuarioId: admin.id,
      ehGlobal: true,
    });

    // Usuário cria pessoal
    await repo.createCategoria({
      nome: "Pessoal user",
      tipo: "DESPESA",
      usuarioId: usuario.id,
      ehGlobal: false,
    });

    // Admin vê globais + próprias
    const catsAdmin = await repo.getCategorias(admin.id);
    expect(catsAdmin.some((c) => c.nome === "Global adm")).toBe(true);
    expect(catsAdmin.some((c) => c.nome === "Pessoal user")).toBe(false);

    // Usuário vê globais + próprias
    const catsUser = await repo.getCategorias(usuario.id);
    expect(catsUser.some((c) => c.nome === "Pessoal user")).toBe(true);
    expect(catsUser.some((c) => c.nome === "Global adm")).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: ADMIN DESATIVA E REATIVA CATEGORIA GLOBAL */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 5: Admin desativa e reativa categoria global", async () => {
    const db = mockSupabase.__db();

    const catGlobal = db.financas_categorias.find(
      (c) => c.eh_global && c.nome === "Alimentação",
    );

    // Desativar
    const desativada = await repo.toggleCategoriaAtivo(catGlobal.id, admin.id);
    expect(desativada.ativo).toBe(false);

    // Reativar
    const reativada = await repo.toggleCategoriaAtivo(catGlobal.id, admin.id);
    expect(reativada.ativo).toBe(true);
  });
});
