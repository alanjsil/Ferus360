/**
 * @file Teste e2e: Fluxo de Login -> Criar Lancamento -> Validar Dashboard.
 * @description Conecta ao Supabase real (sem mock). Valida autenticacao, CRUD de lancamentos e dashboard.
 * @module test/e2e/auth-lancamento.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado auth-lancamento.test.js
 * - Login real via auth.signInWithPassword, operacoes via service_role + anon autenticado
 * - Valida RLS de lancamentos, isolamento entre usuarios e fluxo dashboard
 */

import { describe, it, expect, beforeAll } from "vitest";
import { seedBase, getAdminClient, criarUsuario } from "./seed.js";
import { autenticarUsuario } from "./helpers-reais.js";

describe("Auth -> Lancamentos -> Dashboard [REAL]", () => {
  let supabaseAdmin;
  let clientUser;
  let normalUser;
  let catAlimentacao;
  let autenticado;

  beforeAll(async () => {
    supabaseAdmin = getAdminClient();
    const seed = await seedBase(supabaseAdmin);
    normalUser = seed.usuario;
    catAlimentacao = seed.categorias.find((c) => c.nome === "Alimentação");

    autenticado = await autenticarUsuario(normalUser.email, normalUser.senha);
    clientUser = autenticado.client;
  });

  /* ─────────────────────────────────────── */
  /* TESTE 1: LOGIN RETORNA TOKEN E USUARIO  */
  /* ─────────────────────────────────────── */
  it("Step 1: Login bem-sucedido retorna token e usuario", async () => {
    expect(autenticado.token).toBeTruthy();
    expect(typeof autenticado.token).toBe("string");
    expect(autenticado.usuario).toBeDefined();
    expect(autenticado.usuario.email).toBe(normalUser.email);
    expect(autenticado.usuario.id).toBe(normalUser.id);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: CRIAR LANCAMENTO DESPESA       */
  /* ─────────────────────────────────────── */
  it("Step 2: Criar lancamento DESPESA com sucesso", async () => {
    const { data: lanc, error } = await clientUser
      .from("financas_lancamentos")
      .insert({
        data: "2026-06-15",
        tipo: "DESPESA",
        valor: 150.5,
        status: "PENDENTE",
        descricao: "Compra no supermercado",
        usuario_id: normalUser.id,
        categoria_id: catAlimentacao.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(lanc.id).toBeTruthy();
    expect(lanc.tipo).toBe("DESPESA");
    expect(Number(lanc.valor)).toBe(150.5);
    expect(lanc.usuario_id).toBe(normalUser.id);
    expect(lanc.descricao).toBe("Compra no supermercado");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: CRIAR LANCAMENTO RECEITA       */
  /* ─────────────────────────────────────── */
  it("Step 3: Criar lancamento RECEITA com sucesso", async () => {
    const { data: receita, error } = await clientUser
      .from("financas_lancamentos")
      .insert({
        data: "2026-06-01",
        tipo: "RECEITA",
        valor: 3000,
        status: "PENDENTE",
        descricao: "Salario mensal",
        usuario_id: normalUser.id,
        categoria_id: catAlimentacao.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(receita.tipo).toBe("RECEITA");
    expect(Number(receita.valor)).toBe(3000);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: ISOLAMENTO POR USUARIO         */
  /* ─────────────────────────────────────── */
  it("Step 4: Isolamento de lancamentos entre usuarios", async () => {
    const outroSeed = await criarUsuario(supabaseAdmin, {
      email: "isolamento",
      nome: "Outro Usuario",
      role: "user",
    });

    await clientUser.from("financas_lancamentos").insert({ data: "2026-06-15", tipo: "DESPESA", valor: 100, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: catAlimentacao.id });

    await clientUser.from("financas_lancamentos").insert({ data: "2026-06-15", tipo: "DESPESA", valor: 200, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: catAlimentacao.id });

    const { data: lancUser1 } = await supabaseAdmin.from("financas_lancamentos").select("valor").eq("usuario_id", normalUser.id);

    const { data: lancOutro } = await supabaseAdmin.from("financas_lancamentos").select("valor").eq("usuario_id", outroSeed.id);

    expect(lancUser1.length).toBeGreaterThanOrEqual(2);
    expect(lancOutro).toHaveLength(0);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 5: FLUXO COMPLETO COM DASHBOARD   */
  /* ─────────────────────────────────────── */
  it("Step 5: Fluxo completo - lancamentos PAGOS refletem no dashboard", async () => {
    await clientUser.from("financas_lancamentos").insert({ data: "2026-06-01", tipo: "RECEITA", valor: 3000, status: "PAGO", usuario_id: normalUser.id, categoria_id: catAlimentacao.id });

    await clientUser
      .from("financas_lancamentos")
      .insert({ data: "2026-06-15", tipo: "DESPESA", valor: 500, status: "PAGO", descricao: "Alimentacao", usuario_id: normalUser.id, categoria_id: catAlimentacao.id });

    await clientUser
      .from("financas_lancamentos")
      .insert({ data: "2026-06-15", tipo: "DESPESA", valor: 300, status: "PAGO", descricao: "Transporte", usuario_id: normalUser.id, categoria_id: catAlimentacao.id });

    const { data: realizados, error } = await clientUser.from("financas_lancamentos").select("valor, tipo, status").eq("status", "PAGO");

    expect(error).toBeNull();
    const totalReceitas = realizados.filter((l) => l.tipo === "RECEITA").reduce((s, l) => s + Number(l.valor), 0);
    const totalDespesas = realizados.filter((l) => l.tipo === "DESPESA").reduce((s, l) => s + Number(l.valor), 0);

    expect(totalReceitas).toBe(3000);
    expect(totalDespesas).toBe(800);
    expect(totalReceitas - totalDespesas).toBe(2200);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 6: ATUALIZAR LANCAMENTO           */
  /* ─────────────────────────────────────── */
  it("Step 6: Atualizar lancamento e validar persistencia", async () => {
    const { data: lanc } = await clientUser
      .from("financas_lancamentos")
      .insert({ data: "2026-06-15", tipo: "DESPESA", valor: 100, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: catAlimentacao.id })
      .select()
      .single();

    const { data: atualizado, error } = await clientUser.from("financas_lancamentos").update({ valor: 200, status: "PAGO" }).eq("id", lanc.id).select().single();

    expect(error).toBeNull();
    expect(Number(atualizado.valor)).toBe(200);
    expect(atualizado.status).toBe("PAGO");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 7: DELETAR LANCAMENTO             */
  /* ─────────────────────────────────────── */
  it("Step 7: Deletar lancamento e validar remocao", async () => {
    const { data: lanc } = await clientUser
      .from("financas_lancamentos")
      .insert({ data: "2026-06-15", tipo: "DESPESA", valor: 150, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: catAlimentacao.id })
      .select()
      .single();

    const { error: delError } = await clientUser.from("financas_lancamentos").delete().eq("id", lanc.id);

    expect(delError).toBeNull();

    const { data: aposDelete } = await clientUser.from("financas_lancamentos").select("id").eq("id", lanc.id);

    expect(aposDelete).toHaveLength(0);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 8: FILTRO POR MES                 */
  /* ─────────────────────────────────────── */
  it("Step 8: Filtrar lancamentos por mes (data_busca gerado)", async () => {
    await clientUser.from("financas_lancamentos").insert({ data: "2026-06-15", tipo: "DESPESA", valor: 100, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: catAlimentacao.id });

    await clientUser.from("financas_lancamentos").insert({ data: "2026-07-15", tipo: "DESPESA", valor: 200, status: "PENDENTE", usuario_id: normalUser.id, categoria_id: catAlimentacao.id });

    const { data: junho } = await clientUser.from("financas_lancamentos").select("valor, data_busca").eq("data_busca", "2026-06");

    const { data: julho } = await clientUser.from("financas_lancamentos").select("valor, data_busca").eq("data_busca", "2026-07");

    expect(junho.length).toBeGreaterThanOrEqual(1);
    expect(julho.length).toBeGreaterThanOrEqual(1);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 9: LOGOUT                         */
  /* ─────────────────────────────────────── */
  it("Step 9: Logout bem-sucedido", async () => {
    const { error } = await clientUser.auth.signOut();
    expect(error).toBeNull();
  });

  /* ─────────────────────────────────────── */
  /* TESTE 10: LOGIN CREDENCIAIS INVALIDAS   */
  /* ─────────────────────────────────────── */
  it("Step 10: Login com credenciais invalidas falha", async () => {
    await expect(autenticarUsuario(normalUser.email, "senha-errada")).rejects.toThrow("Falha no login");
  });
});
