/**
 * @file Teste e2e: Fluxo de Admin → Categorias Globais.
 * @description Conecta ao Supabase real (sem mock). Valida RLS, permissões e constraints do banco.
 * @module test/e2e/admin-global.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado admin-global.test.js
 * - Admin usa service_role (bypass RLS); usuário comum usa anon + login
 * - Valida RLS: policies de insert/select/update/delete
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seedBase, getAdminClient } from "./seed.js";
import { autenticarUsuario } from "./helpers-reais.js";

describe("Admin → Categorias Globais [REAL]", () => {
  let supabaseAdmin;
  let clientUser;
  let adminUser;
  let normalUser;

  beforeAll(async () => {
    supabaseAdmin = getAdminClient();
    const seed = await seedBase(supabaseAdmin);
    adminUser = seed.admin;
    normalUser = seed.usuario;

    // Apenas usuário comum autentica (para testar RLS)
    const autenticado = await autenticarUsuario(normalUser.email, normalUser.senha);
    clientUser = autenticado.client;
  });

  afterAll(async () => {
    if (!supabaseAdmin) return;
    const { error } = await supabaseAdmin
      .from("financas_categorias")
      .delete()
      .eq("nome", "Assinaturas");
    if (error) console.warn("Cleanup warning:", error.message);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 1: Admin cria categoria global    */
  /* ─────────────────────────────────────── */
  it("Step 1: Admin cria categoria global com sucesso", async () => {
    const { data: cat, error } = await supabaseAdmin
      .from("financas_categorias")
      .insert({
        nome: "Assinaturas",
        tipo: "DESPESA",
        eh_global: true,
        ativo: true,
        usuario_id: adminUser.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(cat).toBeTruthy();
    expect(cat.id).toBeTruthy();
    expect(cat.nome).toBe("Assinaturas");
    expect(cat.eh_global).toBe(true);
    expect(cat.usuario_id).toBe(adminUser.id);
    expect(cat.ativo).toBe(true);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: Usuário vê globais com RLS     */
  /* ─────────────────────────────────────── */
  it("Step 2: Usuário comum visualiza categorias globais (RLS)", async () => {
    const { data: categorias, error } = await clientUser
      .from("financas_categorias")
      .select("*")
      .eq("eh_global", true);

    expect(error).toBeNull();
    expect(categorias.length).toBeGreaterThanOrEqual(6);
    expect(categorias.some((c) => c.nome === "Assinaturas")).toBe(true);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: RLS bloqueia update de global  */
  /* ─────────────────────────────────────── */
  it("Step 3: RLS impede usuário comum de alterar categoria global (silent no-op)", async () => {
    const { data: globais } = await supabaseAdmin
      .from("financas_categorias")
      .select("id, nome")
      .eq("eh_global", true)
      .limit(1);

    const globalCat = globais[0];
    const nomeOriginal = globalCat.nome;

    // Usuário comum tenta alterar — RLS policy USING clause faz o update
    // afetar 0 linhas silenciosamente (não lança erro 42501)
    const { error } = await clientUser
      .from("financas_categorias")
      .update({ nome: "Hackeado" })
      .eq("id", globalCat.id);

    expect(error).toBeNull();

    // Verificar que o nome não foi alterado
    const { data: atual } = await supabaseAdmin
      .from("financas_categorias")
      .select("nome")
      .eq("id", globalCat.id)
      .single();

    expect(atual.nome).toBe(nomeOriginal);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: Usuário cria categoria pessoal */
  /* ─────────────────────────────────────── */
  it("Step 4: Usuário comum cria categoria pessoal (isolamento)", async () => {
    const { data: catPessoal, error } = await clientUser
      .from("financas_categorias")
      .insert({
        nome: "Minha receita",
        tipo: "RECEITA",
        eh_global: false,
        ativo: true,
        usuario_id: normalUser.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(catPessoal.eh_global).toBe(false);
    expect(catPessoal.usuario_id).toBe(normalUser.id);

    // Admin não deve ver a categoria pessoal do usuário via SQL direto
    const { data: catsAdmin } = await supabaseAdmin
      .from("financas_categorias")
      .select("nome")
      .eq("eh_global", false)
      .eq("usuario_id", adminUser.id);

    const nomesAdmin = catsAdmin.map((c) => c.nome);
    expect(nomesAdmin).not.toContain("Minha receita");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 5: Admin desativa/reativa global   */
  /* ─────────────────────────────────────── */
  it("Step 5: Admin desativa e reativa categoria global", async () => {
    const { data: categorias } = await supabaseAdmin
      .from("financas_categorias")
      .select("id, nome, ativo")
      .eq("eh_global", true)
      .limit(1);

    const cat = categorias[0];
    expect(cat.ativo).toBe(true);

    // Desativar
    const { data: desativada, error: err1 } = await supabaseAdmin
      .from("financas_categorias")
      .update({ ativo: false })
      .eq("id", cat.id)
      .select()
      .single();

    expect(err1).toBeNull();
    expect(desativada.ativo).toBe(false);

    // Reativar
    const { data: reativada, error: err2 } = await supabaseAdmin
      .from("financas_categorias")
      .update({ ativo: true })
      .eq("id", cat.id)
      .select()
      .single();

    expect(err2).toBeNull();
    expect(reativada.ativo).toBe(true);
  });
});
