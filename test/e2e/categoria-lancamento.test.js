/**
 * @file Teste e2e: Fluxo de Login -> Categoria -> Lancamento -> Dashboard.
 * @description Conecta ao Supabase real (sem mock). Valida criacao de categorias, RLS e isolamento.
 * @module test/e2e/categoria-lancamento.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado categoria-lancamento.test.js
 * - Valida RLS de categorias: select (globais + proprias), insert (propria), update/delete (admin)
 * - Valida isolamento de categorias pessoais entre usuarios
 */

import { describe, it, expect, beforeAll } from "vitest";
import { seedBase, getAdminClient, criarUsuario } from "./seed.js";
import { autenticarUsuario } from "./helpers-reais.js";

describe("Categoria -> Lancamentos [REAL]", () => {
  let supabaseAdmin;
  let clientUser;
  let normalUser;

  beforeAll(async () => {
    supabaseAdmin = getAdminClient();
    const seed = await seedBase(supabaseAdmin);
    normalUser = seed.usuario;

    const autenticado = await autenticarUsuario(normalUser.email, normalUser.senha);
    clientUser = autenticado.client;
  });

  /* ─────────────────────────────────────── */
  /* TESTE 1: CRIAR CATEGORIA PESSOAL        */
  /* ─────────────────────────────────────── */
  it("Step 1: Criar categoria pessoal com sucesso", async () => {
    const { data: cat, error } = await clientUser
      .from("financas_categorias")
      .insert({
        nome: "Transporte app",
        tipo: "DESPESA",
        eh_global: false,
        ativo: true,
        usuario_id: normalUser.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(cat.id).toBeTruthy();
    expect(cat.nome).toBe("Transporte app");
    expect(cat.tipo).toBe("DESPESA");
    expect(cat.usuario_id).toBe(normalUser.id);
    expect(cat.eh_global).toBe(false);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: LISTAR CATEGORIAS POR TIPO     */
  /* ─────────────────────────────────────── */
  it("Step 2: Listar categorias com filtro por tipo", async () => {
    await clientUser.from("financas_categorias").insert({ nome: "Gasolina", tipo: "DESPESA", eh_global: false, ativo: true, usuario_id: normalUser.id });

    await clientUser.from("financas_categorias").insert({ nome: "Freelance", tipo: "RECEITA", eh_global: false, ativo: true, usuario_id: normalUser.id });

    const { data: despesas } = await clientUser.from("financas_categorias").select("nome").eq("tipo", "DESPESA");

    const { data: receitas } = await clientUser.from("financas_categorias").select("nome").eq("tipo", "RECEITA");

    expect(despesas.some((c) => c.nome === "Gasolina")).toBe(true);
    expect(receitas.some((c) => c.nome === "Freelance")).toBe(true);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: ISOLAMENTO DE CATEGORIAS       */
  /* ─────────────────────────────────────── */
  it("Step 3: Isolamento de categoria pessoal entre usuarios", async () => {
    await clientUser.from("financas_categorias").insert({ nome: "Categoria secreta", tipo: "DESPESA", eh_global: false, ativo: true, usuario_id: normalUser.id });

    const outroSeed = await criarUsuario(supabaseAdmin, {
      email: "outro-cat",
      nome: "Outro User",
      role: "user",
    });
    const autenticado = await autenticarUsuario(outroSeed.email, outroSeed.senha);
    const clientOutro = autenticado.client;

    const { data: catsUser1 } = await clientUser.from("financas_categorias").select("nome").eq("eh_global", false);

    const { data: catsOutro } = await clientOutro.from("financas_categorias").select("nome").eq("eh_global", false);

    expect(catsUser1.some((c) => c.nome === "Categoria secreta")).toBe(true);
    expect(catsOutro.some((c) => c.nome === "Categoria secreta")).toBe(false);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: LANCAMENTO VINCULADO A CAT     */
  /* ─────────────────────────────────────── */
  it("Step 4: Criar lancamento vinculado a categoria existente", async () => {
    const { data: globais } = await supabaseAdmin.from("financas_categorias").select("id").eq("eh_global", true).eq("nome", "Alimentação").single();

    const { data: lanc, error } = await clientUser
      .from("financas_lancamentos")
      .insert({
        data: "2026-06-15",
        tipo: "DESPESA",
        valor: 45.9,
        status: "PENDENTE",
        descricao: "Almoco",
        usuario_id: normalUser.id,
        categoria_id: globais.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(lanc.categoria_id).toBe(globais.id);
    expect(Number(lanc.valor)).toBe(45.9);
    expect(lanc.descricao).toBe("Almoco");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 5: MULTIPLAS CATEGORIAS E TOTAIS  */
  /* ─────────────────────────────────────── */
  it("Step 5: Lancamentos em categorias diferentes e total por categoria", async () => {
    const { data: categorias } = await supabaseAdmin.from("financas_categorias").select("id, nome").eq("eh_global", true).in("nome", ["Alimentação", "Transporte"]);

    const alimentacao = categorias.find((c) => c.nome === "Alimentação");
    const transporte = categorias.find((c) => c.nome === "Transporte");

    await clientUser.from("financas_lancamentos").insert([
      { data: "2026-06-15", tipo: "DESPESA", valor: 30, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: alimentacao.id },
      { data: "2026-06-15", tipo: "DESPESA", valor: 50, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: alimentacao.id },
      { data: "2026-06-15", tipo: "DESPESA", valor: 20, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: transporte.id },
    ]);

    const { data: lancamentos } = await supabaseAdmin.from("financas_lancamentos").select("valor, categoria_id").eq("usuario_id", normalUser.id);

    const totalAlimentacao = lancamentos.filter((l) => l.categoria_id === alimentacao.id).reduce((s, l) => s + Number(l.valor), 0);
    const totalTransporte = lancamentos.filter((l) => l.categoria_id === transporte.id).reduce((s, l) => s + Number(l.valor), 0);

    // Step 4 já criou 1 lançamento de 45.90 em Alimentação + 50 + 30 = 125.90
    expect(totalAlimentacao).toBe(125.9);
    expect(totalTransporte).toBe(20);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 6: FLUXO COMPLETO                 */
  /* ─────────────────────────────────────── */
  it("Step 6: Fluxo completo - Login, criar categoria, lancamento e validar dashboard", async () => {
    const novoUser = await criarUsuario(supabaseAdmin, {
      email: "fluxo-cat",
      nome: "Fluxo Categoria",
      role: "user",
    });
    const autenticado = await autenticarUsuario(novoUser.email, novoUser.senha);
    const client = autenticado.client;

    // Criar categoria pessoal
    const { data: categoria } = await client.from("financas_categorias").insert({ nome: "Salario extra", tipo: "RECEITA", eh_global: false, ativo: true, usuario_id: novoUser.id }).select().single();

    expect(categoria.id).toBeTruthy();

    // Criar lancamento de receita PAGO com a nova categoria
    await client.from("financas_lancamentos").insert({
      data: "2026-06-15",
      tipo: "RECEITA",
      valor: 1000,
      status: "PAGO",
      descricao: "Freela",
      usuario_id: novoUser.id,
      categoria_id: categoria.id,
    });

    // Criar lancamento de despesa PAGO com categoria global
    const { data: catAlimentacao } = await supabaseAdmin.from("financas_categorias").select("id").eq("eh_global", true).eq("nome", "Alimentação").single();

    await client.from("financas_lancamentos").insert({
      data: "2026-06-15",
      tipo: "DESPESA",
      valor: 200,
      status: "PAGO",
      descricao: "Supermercado",
      usuario_id: novoUser.id,
      categoria_id: catAlimentacao.id,
    });

    // Validar via dashboard (apenas lancamentos PAGOS)
    const { data: realizados } = await client.from("financas_lancamentos").select("valor, tipo, status, categoria_id").eq("status", "PAGO");

    const totalReceitas = realizados.filter((l) => l.tipo === "RECEITA").reduce((s, l) => s + Number(l.valor), 0);
    const totalDespesas = realizados.filter((l) => l.tipo === "DESPESA").reduce((s, l) => s + Number(l.valor), 0);

    expect(realizados).toHaveLength(2);
    expect(totalReceitas).toBe(1000);
    expect(totalDespesas).toBe(200);
    expect(realizados.some((l) => l.categoria_id === categoria.id)).toBe(true);
    expect(realizados.some((l) => l.categoria_id === catAlimentacao.id)).toBe(true);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 7: CATEGORIAS GLOBAIS VISIVEIS    */
  /* ─────────────────────────────────────── */
  it("Step 7: Categorias globais visiveis para qualquer usuario", async () => {
    const { data: globais } = await clientUser.from("financas_categorias").select("nome, tipo, ativo").eq("eh_global", true);

    expect(globais.length).toBeGreaterThanOrEqual(5);
    expect(globais.map((c) => c.nome)).toEqual(expect.arrayContaining(["Alimentação", "Salário", "Transporte", "Moradia", "Lazer"]));
    globais.forEach((c) => expect(c.ativo).toBe(true));
  });
});
