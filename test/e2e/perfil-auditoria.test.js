/**
 * @file Teste e2e: Fluxo de Login -> Perfil -> Auditoria.
 * @description Conecta ao Supabase real (sem mock). Valida alteracao de perfil e registros de auditoria.
 * @module test/e2e/perfil-auditoria.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado perfil-auditoria.test.js
 * - acao_auditoria e um enum: INSERT, UPDATE, DELETE, LOGIN, LOGOUT, LOGIN_FAILED,
 *   SENHA_TROCADA, DADOS_EXPORTADOS, CONTA_EXCLUIDA, ADMIN_TOGGLE_USUARIO, ADMIN_RESET_SENHA
 * - "PERFIL_ATUALIZADO" e "EMAIL_ALTERADO" nao existem no enum real -> usa UPDATE no lugar
 */

import { describe, it, expect, beforeAll } from "vitest";
import { seedBase, getAdminClient, criarUsuario } from "./seed.js";
import { autenticarUsuario } from "./helpers-reais.js";

describe("Perfil -> Auditoria [REAL]", () => {
  let supabaseAdmin;
  let normalUser;

  beforeAll(async () => {
    supabaseAdmin = getAdminClient();
    const seed = await seedBase(supabaseAdmin);
    normalUser = seed.usuario;

    await autenticarUsuario(normalUser.email, normalUser.senha);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 1: LOGIN E VISUALIZACAO DE PERFIL */
  /* ─────────────────────────────────────── */
  it("Step 1: Login e visualizacao de dados do perfil", async () => {
    const autenticado = await autenticarUsuario(normalUser.email, normalUser.senha);

    expect(autenticado.usuario).toBeDefined();
    expect(autenticado.usuario.email).toBe(normalUser.email);
    expect(autenticado.usuario.id).toBe(normalUser.id);

    const { data: perfil } = await supabaseAdmin
      .from("financas_usuarios")
      .select("id, nome, email, role, ativo")
      .eq("id", normalUser.id)
      .single();

    expect(perfil.nome).toBe(normalUser.nome);
    expect(perfil.email).toBe(normalUser.email);
    expect(perfil.role).toBe("user");
    expect(perfil.ativo).toBe(true);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: ALTERAR NOME DO PERFIL         */
  /* ─────────────────────────────────────── */
  it("Step 2: Alterar nome do perfil e validar persistencia", async () => {
    const { data: atualizado, error } = await supabaseAdmin
      .from("financas_usuarios")
      .update({ nome: "Nome Atualizado" })
      .eq("id", normalUser.id)
      .select()
      .single();

    expect(error).toBeNull();
    expect(atualizado.nome).toBe("Nome Atualizado");
    expect(atualizado.email).toBe(normalUser.email);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: REGISTRAR LOG DE AUDITORIA     */
  /* ─────────────────────────────────────── */
  it("Step 3: Criar registro de auditoria e validar conteudo", async () => {
    const { data: audit, error } = await supabaseAdmin
      .from("financas_auditoria")
      .insert({
        usuario_id: normalUser.id,
        acao: "UPDATE",
        entidade: "usuarios",
        entidade_id: normalUser.id,
        dados_anteriores: { nome: "Nome Original" },
        dados_novos: { nome: "Nome Atualizado" },
        contexto: "user",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(audit.id).toBeTruthy();
    expect(audit.acao).toBe("UPDATE");
    expect(audit.entidade).toBe("usuarios");
    expect(audit.entidade_id).toBe(normalUser.id);
    expect(audit.usuario_id).toBe(normalUser.id);
    expect(audit.dados_anteriores).toEqual({ nome: "Nome Original" });
    expect(audit.dados_novos).toEqual({ nome: "Nome Atualizado" });
    expect(audit.contexto).toBe("user");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: LISTAR LOGS DE AUDITORIA       */
  /* ─────────────────────────────────────── */
  it("Step 4: Listar logs de auditoria com filtro por usuario e acao", async () => {
    const acoes = [
      { acao: "LOGIN", entidade: "auth" },
      { acao: "UPDATE", entidade: "usuarios" },
      { acao: "LOGOUT", entidade: "auth" },
    ];

    for (const a of acoes) {
      await supabaseAdmin.from("financas_auditoria").insert({
        usuario_id: normalUser.id,
        acao: a.acao,
        entidade: a.entidade,
        contexto: "user",
      });
    }

    const { data: logs } = await supabaseAdmin
      .from("financas_auditoria")
      .select("acao")
      .eq("usuario_id", normalUser.id);

    const acoesRegistradas = logs.map((l) => l.acao);
    expect(acoesRegistradas).toContain("LOGIN");
    expect(acoesRegistradas).toContain("UPDATE");
    expect(acoesRegistradas).toContain("LOGOUT");

    const { data: logsUpdate } = await supabaseAdmin
      .from("financas_auditoria")
      .select("id")
      .eq("usuario_id", normalUser.id)
      .eq("acao", "UPDATE");

    expect(logsUpdate.length).toBeGreaterThanOrEqual(1);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 5: ISOLAMENTO DE LOGS             */
  /* ─────────────────────────────────────── */
  it("Step 5: Isolamento de logs de auditoria entre usuarios", async () => {
    await supabaseAdmin.from("financas_auditoria").insert({
      usuario_id: normalUser.id, acao: "LOGIN", entidade: "auth", contexto: "user",
    });

    const outroSeed = await criarUsuario(supabaseAdmin, {
      email: "audit-outro",
      nome: "Outro Audit",
      role: "user",
    });

    await supabaseAdmin.from("financas_auditoria").insert({
      usuario_id: outroSeed.id, acao: "LOGIN", entidade: "auth", contexto: "user",
    });

    const { data: logsU1 } = await supabaseAdmin
      .from("financas_auditoria")
      .select("usuario_id")
      .eq("usuario_id", normalUser.id);

    const { data: logsU2 } = await supabaseAdmin
      .from("financas_auditoria")
      .select("usuario_id")
      .eq("usuario_id", outroSeed.id);

    expect(logsU1.length).toBeGreaterThanOrEqual(1);
    expect(logsU2.length).toBeGreaterThanOrEqual(1);
    logsU1.forEach((l) => expect(l.usuario_id).toBe(normalUser.id));
    logsU2.forEach((l) => expect(l.usuario_id).toBe(outroSeed.id));
  });

  /* ─────────────────────────────────────── */
  /* TESTE 6: AUDITORIA COM DADOS ANTERIORES */
  /* ─────────────────────────────────────── */
  it("Step 6: Auditoria com dados anteriores e novos completos", async () => {
    const dadosAntigos = { nome: "Nome Original", email: normalUser.email, avatar_url: null };
    const dadosNovos = { nome: "Nome Original", email: "novo@teste-integrado.com", avatar_url: "https://avatar.com/novo.png" };

    const { data: audit, error } = await supabaseAdmin
      .from("financas_auditoria")
      .insert({
        usuario_id: normalUser.id,
        acao: "UPDATE",
        entidade: "usuarios",
        entidade_id: normalUser.id,
        dados_anteriores: dadosAntigos,
        dados_novos: dadosNovos,
        contexto: "user",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(audit.dados_anteriores.email).toBe(normalUser.email);
    expect(audit.dados_novos.email).toBe("novo@teste-integrado.com");
    expect(audit.dados_novos.avatar_url).toBe("https://avatar.com/novo.png");
  });
});
