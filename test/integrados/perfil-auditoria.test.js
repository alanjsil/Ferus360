/**
 * @file Teste integrado: Fluxo de Login → Perfil → Auditoria
 *
 * Valida:
 * 1. Login e visualização do perfil
 * 2. Alteração de dados do perfil (nome, email)
 * 3. Registro de auditoria nas alterações
 * 4. Filtros e consulta do log de auditoria
 * 5. Isolamento dos logs entre usuários
 * @module test/integrados/perfil-auditoria.test.js
 * @changelog
 * [2026-06-10] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, createAndLoginUser } from "./helpers.js";
import * as repo from "../../services/repository.js";
import { construirAuthService } from "../../services/auth.js";

describe("Fluxo Integrado: Login → Perfil → Auditoria", () => {
  let auth;
  let mockSupabase;
  let usuario;

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
      name: "Nome Original",
    });
    usuario = loginResult.user;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 1: VISUALIZAR PERFIL APÓS LOGIN */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Login e visualização de dados do perfil", async () => {
    const loginResult = await auth.login("usuario@test.com", "senha");

    expect(loginResult.usuario).toBeDefined();
    expect(loginResult.usuario.email).toBe("usuario@test.com");
    expect(loginResult.usuario.nome).toBe("Nome Original");
    expect(loginResult.usuario.id).toBe(usuario.id);
    expect(loginResult.usuario.role).toBe("user");
    expect(loginResult.usuario.ativo).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: ALTERAR NOME DO PERFIL */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Alterar nome do perfil e validar persistência", async () => {
    // Atualizar nome via repositório
    const perfilAtualizado = await repo.updatePerfil(usuario.id, {
      nome: "Nome Atualizado",
    });

    expect(perfilAtualizado.nome).toBe("Nome atualizado");
    expect(perfilAtualizado.email).toBe("usuario@test.com");

    // Relogin deve refletir o novo nome
    const loginResult = await auth.login("usuario@test.com", "senha");
    expect(loginResult.usuario.nome).toBe("Nome atualizado");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: REGISTRAR LOG DE AUDITORIA */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Criar registro de auditoria e validar conteúdo", async () => {
    const auditEntry = await repo.logAuditoria(usuario.id, "PERFIL_ATUALIZADO", {
      entidade: "usuarios",
      entidade_id: usuario.id,
      dados_anteriores: { nome: "Nome Original" },
      dados_novos: { nome: "Nome Atualizado" },
      contexto: "user",
    });

    expect(auditEntry.id).toBeTruthy();
    expect(auditEntry.acao).toBe("PERFIL_ATUALIZADO");
    expect(auditEntry.entidade).toBe("usuarios");
    expect(auditEntry.entidade_id).toBe(usuario.id);
    expect(auditEntry.usuario_id).toBe(usuario.id);
    expect(auditEntry.dados_anteriores).toEqual({ nome: "Nome Original" });
    expect(auditEntry.dados_novos).toEqual({ nome: "Nome Atualizado" });
    expect(auditEntry.contexto).toBe("user");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: LISTAR LOGS DE AUDITORIA DO USUÁRIO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Listar logs de auditoria com filtro por usuário e ação", async () => {
    // Criar múltiplos logs
    const acoes = [
      { acao: "LOGIN", entidade: "auth" },
      { acao: "PERFIL_ATUALIZADO", entidade: "usuarios" },
      { acao: "LOGOUT", entidade: "auth" },
    ];

    for (const a of acoes) {
      await repo.logAuditoria(usuario.id, a.acao, {
        entidade: a.entidade,
        entidade_id: a.entidade === "usuarios" ? usuario.id : null,
        contexto: "user",
      });
    }

    const logs = await repo.getAuditoria({ usuarioId: usuario.id });

    expect(logs).toHaveLength(3);

    const acoesRegistradas = logs.map((l) => l.acao);
    expect(acoesRegistradas).toContain("LOGIN");
    expect(acoesRegistradas).toContain("PERFIL_ATUALIZADO");
    expect(acoesRegistradas).toContain("LOGOUT");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: ISOLAMENTO DE LOGS ENTRE USUÁRIOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 5: Isolamento de logs de auditoria entre usuários", async () => {
    // Log do usuário 1
    await repo.logAuditoria(usuario.id, "LOGIN", {
      entidade: "auth",
      contexto: "user",
    });

    // Criar outro usuário
    const outroUser = await createAndLoginUser(mockSupabase, {
      email: "outro@test.com",
      name: "Outro",
    });

    // Log do usuário 2
    await repo.logAuditoria(outroUser.user.id, "LOGIN", {
      entidade: "auth",
      contexto: "user",
    });

    const logsUser1 = await repo.getAuditoria({ usuarioId: usuario.id });
    const logsUser2 = await repo.getAuditoria({ usuarioId: outroUser.user.id });

    expect(logsUser1).toHaveLength(1);
    expect(logsUser2).toHaveLength(1);
    expect(logsUser1[0].usuario_id).toBe(usuario.id);
    expect(logsUser2[0].usuario_id).toBe(outroUser.user.id);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 6: LOGS DE AUDITORIA COM DADOS ANTERIORES E NOVOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 6: Auditoria com dados anteriores e novos completos", async () => {
    // Simular alteração de e-mail
    const dadosAntigos = {
      nome: "Nome Original",
      email: "usuario@test.com",
      avatar_url: null,
    };

    const dadosNovos = {
      nome: "Nome Original",
      email: "novo@test.com",
      avatar_url: "https://avatar.com/novo.png",
    };

    await repo.logAuditoria(usuario.id, "EMAIL_ALTERADO", {
      entidade: "usuarios",
      entidade_id: usuario.id,
      dados_anteriores: dadosAntigos,
      dados_novos: dadosNovos,
      contexto: "user",
    });

    // Aplicar a alteração no banco via repositório
    const perfilAtualizado = await repo.updatePerfil(usuario.id, {
      email: "novo@test.com",
      avatar_url: "https://avatar.com/novo.png",
    });

    const logs = await repo.getAuditoria({
      usuarioId: usuario.id,
      acao: "EMAIL_ALTERADO",
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].dados_anteriores.email).toBe("usuario@test.com");
    expect(logs[0].dados_novos.email).toBe("novo@test.com");
    expect(logs[0].dados_novos.avatar_url).toBe("https://avatar.com/novo.png");

    // Validar que o dado foi atualizado
    expect(perfilAtualizado.email).toBe("novo@test.com");
  });
});
