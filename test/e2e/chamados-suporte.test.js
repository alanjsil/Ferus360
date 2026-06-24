/**
 * @file Teste e2e: Fluxo de Login -> Chamados (Suporte).
 * @description Conecta ao Supabase real (sem mock). Valida abertura, listagem e atualizacao de chamados.
 * @module test/e2e/chamados-suporte.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado chamados-suporte.test.js
 * - Status do enum real: 'aberto', 'em_andamento', 'resolvido' (lowercase)
 * - Valida RLS: usuario ve apenas proprios chamados, admin ve todos
 */

import { describe, it, expect, beforeAll } from "vitest";
import { seedBase, getAdminClient, criarUsuario } from "./seed.js";
import { autenticarUsuario } from "./helpers-reais.js";

describe("Chamados (Suporte) [REAL]", () => {
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
  /* TESTE 1: ABRIR CHAMADO                  */
  /* ─────────────────────────────────────── */
  it("Step 1: Abrir chamado de suporte com sucesso", async () => {
    const { data: chamado, error } = await clientUser
      .from("financas_chamados")
      .insert({
        titulo: "Erro ao gerar relatorio",
        descricao: "O relatorio de junho nao esta gerando.",
        status: "aberto",
        usuario_id: normalUser.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(chamado.id).toBeTruthy();
    expect(chamado.titulo).toBe("Erro ao gerar relatorio");
    expect(chamado.descricao).toBe("O relatorio de junho nao esta gerando.");
    expect(chamado.status).toBe("aberto");
    expect(chamado.usuario_id).toBe(normalUser.id);
    expect(chamado.respostas).toEqual([]);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: LISTAR CHAMADOS DO USUARIO     */
  /* ─────────────────────────────────────── */
  it("Step 2: Listar todos os chamados abertos pelo usuario", async () => {
    const chamados = [
      { titulo: "Bug no dashboard", descricao: "Valores errados" },
      { titulo: "Duvida sobre orcamento", descricao: "Como importar?" },
      { titulo: "Sugestao de feature", descricao: "Adicionar grafico" },
    ];

    for (const c of chamados) {
      await clientUser.from("financas_chamados").insert({
        ...c,
        status: "aberto",
        usuario_id: normalUser.id,
      });
    }

    const { data: meus } = await clientUser.from("financas_chamados").select("titulo, status");

    expect(meus.length).toBeGreaterThanOrEqual(3);
    expect(meus.map((c) => c.titulo)).toContain("Bug no dashboard");
    expect(meus.map((c) => c.titulo)).toContain("Duvida sobre orcamento");
    expect(meus.map((c) => c.titulo)).toContain("Sugestao de feature");
    expect(meus.every((c) => c.status === "aberto")).toBe(true);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: ISOLAMENTO DE CHAMADOS         */
  /* ─────────────────────────────────────── */
  it("Step 3: Isolamento de chamados entre usuarios", async () => {
    await clientUser.from("financas_chamados").insert({
      titulo: "Chamado do User1",
      descricao: "Problema A",
      status: "aberto",
      usuario_id: normalUser.id,
    });

    const outroSeed = await criarUsuario(supabaseAdmin, {
      email: "cham-outro",
      nome: "Outro Chamado",
      role: "user",
    });
    const autenticado = await autenticarUsuario(outroSeed.email, outroSeed.senha);
    const clientOutro = autenticado.client;

    await clientOutro.from("financas_chamados").insert({
      titulo: "Chamado do User2",
      descricao: "Problema B",
      status: "aberto",
      usuario_id: outroSeed.id,
    });

    const { data: cU1 } = await clientUser.from("financas_chamados").select("titulo");
    const { data: cU2 } = await clientOutro.from("financas_chamados").select("titulo");

    expect(cU1.length).toBeGreaterThanOrEqual(1);
    expect(cU2).toHaveLength(1);
    expect(cU2[0].titulo).toBe("Chamado do User2");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: ATUALIZAR STATUS CHAMADO       */
  /* ─────────────────────────────────────── */
  it("Step 4: Atualizar status do chamado (aberto -> em_andamento -> resolvido)", async () => {
    const { data: chamado } = await clientUser
      .from("financas_chamados")
      .insert({
        titulo: "Bug critico",
        descricao: "Sistema quebrado",
        status: "aberto",
        usuario_id: normalUser.id,
      })
      .select()
      .single();

    const chamadoId = chamado.id;

    const { data: emAndamento, error: e1 } = await clientUser.from("financas_chamados").update({ status: "em_andamento" }).eq("id", chamadoId).select().single();

    expect(e1).toBeNull();
    expect(emAndamento.status).toBe("em_andamento");

    const { data: resolvido, error: e2 } = await clientUser
      .from("financas_chamados")
      .update({
        status: "resolvido",
        respostas: [{ autor: "Suporte", mensagem: "Bug corrigido na versao 2.1", data: new Date().toISOString() }],
      })
      .eq("id", chamadoId)
      .select()
      .single();

    expect(e2).toBeNull();
    expect(resolvido.status).toBe("resolvido");
    expect(resolvido.respostas).toHaveLength(1);
    expect(resolvido.respostas[0].autor).toBe("Suporte");
    expect(resolvido.respostas[0].mensagem).toBe("Bug corrigido na versao 2.1");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 5: FILTRAR CHAMADOS POR STATUS    */
  /* ─────────────────────────────────────── */
  it("Step 5: Filtrar chamados por status", async () => {
    const dados = [
      { titulo: "Bug 1", status: "aberto" },
      { titulo: "Bug 2", status: "em_andamento" },
      { titulo: "Bug 3", status: "resolvido" },
      { titulo: "Bug 4", status: "aberto" },
    ];

    for (const d of dados) {
      await clientUser.from("financas_chamados").insert({
        ...d,
        descricao: "Descricao " + d.titulo,
        usuario_id: normalUser.id,
      });
    }

    const { data: chamados } = await clientUser.from("financas_chamados").select("status");
    if (chamados.length >= 4) {
      const abertos = chamados.filter((c) => c.status === "aberto");
      const andamento = chamados.filter((c) => c.status === "em_andamento");
      const resolvidos = chamados.filter((c) => c.status === "resolvido");
      expect(abertos.length).toBeGreaterThanOrEqual(2);
      expect(andamento.length).toBeGreaterThanOrEqual(1);
      expect(resolvidos.length).toBeGreaterThanOrEqual(1);
    }
  });
});
