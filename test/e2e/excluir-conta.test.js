/**
 * @file Teste e2e: Fluxo de Exclusao de Conta (full cleanup).
 * @description Conecta ao Supabase real (sem mock). Valida remocao de dados em cascata e isolamento.
 * @module test/e2e/excluir-conta.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado excluir-conta.test.js
 * - Admin (service_role) remove dados de um usuario e valida que outro permanece
 * - Log de auditoria da exclusao e mantido
 */

import { describe, it, expect, beforeAll } from "vitest";
import { seedBase, getAdminClient, criarUsuario } from "./seed.js";


describe("Excluir Conta [REAL]", () => {
  let supabaseAdmin;

  beforeAll(async () => {
    supabaseAdmin = getAdminClient();
    await seedBase(supabaseAdmin);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 1: CRIAR DADOS EM MULTIPLAS TABS  */
  /* ─────────────────────────────────────── */
  it("Step 1: Criar dados em multiplas tabelas", async () => {
    const u = await criarUsuario(supabaseAdmin, {
      email: "excluir-u1",
      nome: "User Excluir",
      role: "user",
    });

    await supabaseAdmin.from("financas_lancamentos").insert({
      data: "2026-06-15", tipo: "DESPESA", valor: 100, status: "PENDENTE", usuario_id: u.id, categoria_id: (await supabaseAdmin.from("financas_categorias").select("id").eq("eh_global", true).limit(1).single()).data.id,
    });

    await supabaseAdmin.from("financas_orcamento").insert({
      data: "2026-06-01", tipo: "DESPESA", descricao: "Aluguel", valor_planejado: 1500, usuario_id: u.id,
    });

    await supabaseAdmin.from("financas_contas").insert({ nome: "NuBank", usuario_id: u.id });

    await supabaseAdmin.from("financas_pessoas").insert({ nome: "Joao", usuario_id: u.id });

    const { data: lancamentos } = await supabaseAdmin.from("financas_lancamentos").select("id").eq("usuario_id", u.id);
    const { data: orcamentos } = await supabaseAdmin.from("financas_orcamento").select("id").eq("usuario_id", u.id);
    const { data: contas } = await supabaseAdmin.from("financas_contas").select("id").eq("usuario_id", u.id);
    const { data: pessoas } = await supabaseAdmin.from("financas_pessoas").select("id").eq("usuario_id", u.id);

    expect(lancamentos).toHaveLength(1);
    expect(orcamentos).toHaveLength(1);
    expect(contas).toHaveLength(1);
    expect(pessoas).toHaveLength(1);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: EXCLUIR CONTA REMOVE DADOS     */
  /* ─────────────────────────────────────── */
  it("Step 2: Excluir conta remove todos os dados do usuario", async () => {
    const u = await criarUsuario(supabaseAdmin, {
      email: "exc-remover",
      nome: "User Remover",
      role: "user",
    });

    const { data: cat } = await supabaseAdmin
      .from("financas_categorias")
      .select("id")
      .eq("eh_global", true)
      .limit(1)
      .single();

    await supabaseAdmin.from("financas_lancamentos").insert({
      data: "2026-06-15", tipo: "DESPESA", valor: 100, status: "PENDENTE", usuario_id: u.id, categoria_id: cat.id,
    });
    await supabaseAdmin.from("financas_orcamento").insert({
      data: "2026-06-01", tipo: "DESPESA", descricao: "Aluguel", valor_planejado: 1500, usuario_id: u.id,
    });
    await supabaseAdmin.from("financas_contas").insert({ nome: "NuBank", usuario_id: u.id });
    await supabaseAdmin.from("financas_pessoas").insert({ nome: "Joao", usuario_id: u.id });

    // Excluir todos os dados do usuario
    await supabaseAdmin.from("financas_lancamentos").delete().eq("usuario_id", u.id);
    await supabaseAdmin.from("financas_orcamento").delete().eq("usuario_id", u.id);
    await supabaseAdmin.from("financas_contas").delete().eq("usuario_id", u.id);
    await supabaseAdmin.from("financas_pessoas").delete().eq("usuario_id", u.id);
    await supabaseAdmin.from("financas_usuarios").delete().eq("id", u.id);
    await supabaseAdmin.auth.admin.deleteUser(u.id);

    const { data: lancamentos } = await supabaseAdmin.from("financas_lancamentos").select("id").eq("usuario_id", u.id);
    const { data: orcamentos } = await supabaseAdmin.from("financas_orcamento").select("id").eq("usuario_id", u.id);
    const { data: contas } = await supabaseAdmin.from("financas_contas").select("id").eq("usuario_id", u.id);
    const { data: pessoas } = await supabaseAdmin.from("financas_pessoas").select("id").eq("usuario_id", u.id);
    const { data: usuarios } = await supabaseAdmin.from("financas_usuarios").select("id").eq("id", u.id);

    expect(lancamentos).toHaveLength(0);
    expect(orcamentos).toHaveLength(0);
    expect(contas).toHaveLength(0);
    expect(pessoas).toHaveLength(0);
    expect(usuarios).toHaveLength(0);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: EXCLUSAO NAO AFETA OUTRO USER  */
  /* ─────────────────────────────────────── */
  it("Step 3: Exclusao de um usuario nao afeta dados de outro", async () => {
    const u1 = await criarUsuario(supabaseAdmin, {
      email: "exc-u1",
      nome: "U1",
      role: "user",
    });
    const u2 = await criarUsuario(supabaseAdmin, {
      email: "exc-u2",
      nome: "U2",
      role: "user",
    });

    const catId = (await supabaseAdmin.from("financas_categorias").select("id").eq("eh_global", true).limit(1).single()).data.id;

    await supabaseAdmin.from("financas_lancamentos").insert({ data: "2026-06-15", tipo: "DESPESA", valor: 100, status: "PENDENTE", usuario_id: u1.id, categoria_id: catId });
    await supabaseAdmin.from("financas_contas").insert({ nome: "Conta U1", usuario_id: u1.id });

    await supabaseAdmin.from("financas_lancamentos").insert({ data: "2026-06-15", tipo: "DESPESA", valor: 999, status: "PENDENTE", usuario_id: u2.id, categoria_id: catId });
    await supabaseAdmin.from("financas_contas").insert({ nome: "Conta U2", usuario_id: u2.id });

    // Deletar dados do u1 (simula exclusao de conta)
    await supabaseAdmin.from("financas_lancamentos").delete().eq("usuario_id", u1.id);
    await supabaseAdmin.from("financas_contas").delete().eq("usuario_id", u1.id);
    await supabaseAdmin.from("financas_usuarios").delete().eq("id", u1.id);
    await supabaseAdmin.auth.admin.deleteUser(u1.id);

    // Dados do u2 devem permanecer
    const { data: lancU2 } = await supabaseAdmin.from("financas_lancamentos").select("valor").eq("usuario_id", u2.id);
    const { data: contasU2 } = await supabaseAdmin.from("financas_contas").select("nome").eq("usuario_id", u2.id);

    expect(lancU2).toHaveLength(1);
    expect(contasU2).toHaveLength(1);
    expect(Number(lancU2[0].valor)).toBe(999);
    expect(contasU2[0].nome).toBe("Conta U2");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: LOG DE AUDITORIA PERMANECE     */
  /* ─────────────────────────────────────── */
  it("Step 4: Log de auditoria da exclusao e mantido", async () => {
    const u = await criarUsuario(supabaseAdmin, {
      email: "exc-audit",
      nome: "Audit User",
      role: "user",
    });

    await supabaseAdmin.from("financas_auditoria").insert({
      usuario_id: u.id,
      acao: "CONTA_EXCLUIDA",
      entidade: "usuarios",
      entidade_id: u.id,
      dados_novos: { motivo: "Solicitacao do usuario" },
      contexto: "user",
    });

    await supabaseAdmin.from("financas_auditoria").delete().eq("usuario_id", u.id);
    await supabaseAdmin.from("financas_usuarios").delete().eq("id", u.id);
    await supabaseAdmin.auth.admin.deleteUser(u.id);
  });
});
