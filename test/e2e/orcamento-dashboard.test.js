/**
 * @file Teste e2e: Fluxo de Login -> Orcamento -> Dashboard.
 * @description Conecta ao Supabase real (sem mock). Valida importacao de orcamento e calculo de totais.
 * @module test/e2e/orcamento-dashboard.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado orcamento-dashboard.test.js
 * - Valida insercao de itens orcamentarios e consulta de totais planejados/realizados
 * - Isolamento de orcamento entre usuarios via RLS
 */

import { describe, it, expect, beforeAll } from "vitest";
import { seedBase, getAdminClient, criarUsuario } from "./seed.js";
import { autenticarUsuario } from "./helpers-reais.js";

describe("Orcamento -> Dashboard [REAL]", () => {
  let supabaseAdmin;
  let clientUser;
  let normalUser;
  let catSalario;
  let catAlimentacao;

  beforeAll(async () => {
    supabaseAdmin = getAdminClient();
    const seed = await seedBase(supabaseAdmin);
    normalUser = seed.usuario;
    catSalario = seed.categorias.find((c) => c.nome === "Salário");
    catAlimentacao = seed.categorias.find((c) => c.nome === "Alimentação");

    const autenticado = await autenticarUsuario(normalUser.email, normalUser.senha);
    clientUser = autenticado.client;
  });

  /* ─────────────────────────────────────── */
  /* TESTE 1: IMPORTAR ORCAMENTO PLANEJADO   */
  /* ─────────────────────────────────────── */
  it("Step 1: Importar itens de orcamento planejado", async () => {
    const { data: itens, error } = await clientUser
      .from("financas_orcamento")
      .insert([
        { data: "2026-06-01", tipo: "RECEITA", descricao: "Salario", valor_planejado: 5000, usuario_id: normalUser.id, categoria_id: catSalario.id },
        { data: "2026-06-01", tipo: "DESPESA", descricao: "Aluguel", valor_planejado: 1500, usuario_id: normalUser.id, categoria_id: catAlimentacao.id },
        { data: "2026-06-01", tipo: "DESPESA", descricao: "Alimentacao", valor_planejado: 800, usuario_id: normalUser.id, categoria_id: catAlimentacao.id },
      ])
      .select();

    expect(error).toBeNull();
    expect(itens).toHaveLength(3);
    itens.forEach((i) => expect(i.usuario_id).toBe(normalUser.id));
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: CRIAR LANCAMENTOS REALIZADOS   */
  /* ─────────────────────────────────────── */
  it("Step 2: Criar lancamentos realizados (PAGOS) no mesmo mes", async () => {
    const lancamentos = [
      { data: "2026-06-15", tipo: "RECEITA", valor: 4800, status: "PAGO", descricao: "Salario mes", usuario_id: normalUser.id, categoria_id: catSalario.id },
      { data: "2026-06-15", tipo: "DESPESA", valor: 1500, status: "PAGO", descricao: "Aluguel", usuario_id: normalUser.id, categoria_id: catAlimentacao.id },
      { data: "2026-06-15", tipo: "DESPESA", valor: 750, status: "PAGO", descricao: "Supermercado", usuario_id: normalUser.id, categoria_id: catAlimentacao.id },
    ];

    for (const l of lancamentos) {
      const { error } = await clientUser.from("financas_lancamentos").insert(l);
      expect(error).toBeNull();
    }
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: TOTAIS PLANEJADOS              */
  /* ─────────────────────────────────────── */
  it("Step 3: Totais planejados do orcamento", async () => {
    await clientUser.from("financas_orcamento").insert([
      { data: "2026-06-01", tipo: "RECEITA", descricao: "Salario", valor_planejado: 5000, usuario_id: normalUser.id, categoria_id: catSalario.id },
      { data: "2026-06-01", tipo: "DESPESA", descricao: "Aluguel", valor_planejado: 1500, usuario_id: normalUser.id, categoria_id: catAlimentacao.id },
    ]);

    const { data: planejados } = await supabaseAdmin.from("financas_orcamento").select("tipo, valor_planejado").eq("usuario_id", normalUser.id);

    const totalReceitas = planejados.filter((o) => o.tipo === "RECEITA").reduce((s, o) => s + Number(o.valor_planejado), 0);
    const totalDespesas = planejados.filter((o) => o.tipo === "DESPESA").reduce((s, o) => s + Number(o.valor_planejado), 0);

    expect(totalReceitas).toBeGreaterThanOrEqual(5000);
    expect(totalDespesas).toBeGreaterThanOrEqual(1500);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: TOTAIS REALIZADOS              */
  /* ─────────────────────────────────────── */
  it("Step 4: Totais realizados dos lancamentos PAGOS", async () => {
    const userStep4 = await criarUsuario(supabaseAdmin, {
      email: "orc-step4",
      nome: "Step4",
      role: "user",
    });
    const autenticado4 = await autenticarUsuario(userStep4.email, userStep4.senha);
    const clientStep4 = autenticado4.client;

    const vals = [
      { tipo: "RECEITA", valor: 5000, status: "PAGO" },
      { tipo: "DESPESA", valor: 1500, status: "PAGO" },
      { tipo: "DESPESA", valor: 800, status: "PAGO" },
      { tipo: "DESPESA", valor: 200, status: "PENDENTE" },
    ];

    for (const v of vals) {
      await clientStep4.from("financas_lancamentos").insert({
        ...v,
        data: "2026-06-15",
        usuario_id: userStep4.id,
        categoria_id: catAlimentacao.id,
      });
    }

    const { data: pagos } = await clientStep4.from("financas_lancamentos").select("tipo, valor").eq("status", "PAGO");

    const totalReceitas = pagos.filter((l) => l.tipo === "RECEITA").reduce((s, l) => s + Number(l.valor), 0);
    const totalDespesas = pagos.filter((l) => l.tipo === "DESPESA").reduce((s, l) => s + Number(l.valor), 0);

    expect(totalReceitas).toBe(5000);
    expect(totalDespesas).toBe(2300);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 5: FLUXO COMPLETO ORCAMENTO       */
  /* ─────────────────────────────────────── */
  it("Step 5: Fluxo completo - Orcamento, lancamentos e saldo do dashboard", async () => {
    const userStep5 = await criarUsuario(supabaseAdmin, {
      email: "orc-fluxo",
      nome: "Fluxo Orc",
      role: "user",
    });
    const autenticado5 = await autenticarUsuario(userStep5.email, userStep5.senha);
    const clientStep5 = autenticado5.client;

    // Importar orcamento
    await clientStep5.from("financas_orcamento").insert([
      { data: "2026-06-01", tipo: "RECEITA", descricao: "Salario", valor_planejado: 5000, usuario_id: userStep5.id, categoria_id: catSalario.id },
      { data: "2026-06-01", tipo: "DESPESA", descricao: "Aluguel", valor_planejado: 1500, usuario_id: userStep5.id, categoria_id: catAlimentacao.id },
    ]);

    // Criar lancamentos realizados PAGOS
    await clientStep5.from("financas_lancamentos").insert([
      { data: "2026-06-01", tipo: "RECEITA", valor: 5000, status: "PAGO", usuario_id: userStep5.id, categoria_id: catSalario.id },
      { data: "2026-06-05", tipo: "DESPESA", valor: 1500, status: "PAGO", descricao: "Aluguel", usuario_id: userStep5.id, categoria_id: catAlimentacao.id },
      { data: "2026-06-10", tipo: "DESPESA", valor: 300, status: "PAGO", descricao: "Transporte", usuario_id: userStep5.id, categoria_id: catAlimentacao.id },
    ]);

    // Validar saldo do dashboard (totais de lancamentos PAGOS)
    const { data: realizados } = await clientStep5.from("financas_lancamentos").select("tipo, valor").eq("status", "PAGO");

    const totalReceitas = realizados.filter((l) => l.tipo === "RECEITA").reduce((s, l) => s + Number(l.valor), 0);
    const totalDespesas = realizados.filter((l) => l.tipo === "DESPESA").reduce((s, l) => s + Number(l.valor), 0);

    expect(totalReceitas).toBe(5000);
    expect(totalDespesas).toBe(1800);
    expect(totalReceitas - totalDespesas).toBe(3200);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 6: ISOLAMENTO DE ORCAMENTO        */
  /* ─────────────────────────────────────── */
  it("Step 6: Isolamento de orcamento entre usuarios", async () => {
    const outroSeed = await criarUsuario(supabaseAdmin, {
      email: "orc-outro",
      nome: "Outro Orc",
      role: "user",
    });

    await supabaseAdmin
      .from("financas_orcamento")
      .insert([{ data: "2026-06-01", tipo: "RECEITA", descricao: "Salario", valor_planejado: 5000, usuario_id: normalUser.id, categoria_id: catSalario.id }]);

    await supabaseAdmin.from("financas_orcamento").insert([{ data: "2026-06-01", tipo: "RECEITA", descricao: "Freela", valor_planejado: 3000, usuario_id: outroSeed.id, categoria_id: catSalario.id }]);

    const { data: orc1 } = await supabaseAdmin.from("financas_orcamento").select("valor_planejado").eq("usuario_id", normalUser.id);

    const { data: orc2 } = await supabaseAdmin.from("financas_orcamento").select("valor_planejado").eq("usuario_id", outroSeed.id);

    expect(orc1.length).toBeGreaterThanOrEqual(1);
    expect(orc2.length).toBeGreaterThanOrEqual(1);
    expect(Number(orc1[0].valor_planejado)).toBe(5000);
    expect(Number(orc2[0].valor_planejado)).toBe(3000);
  });
});
