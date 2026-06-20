/**
 * @file Teste integrado: Fluxo de Login → Excluir Conta (full cleanup)
 * @description Valida login, criação de dados em múltiplas tabelas, exclusão da conta
 * com RPC SECURITY DEFINER e isolamento de dados entre usuários.
 * @module test/integrados/excluir-conta.test.js
 * @changelog
 * [2026-06-09] - Criação
 * - Testes de fluxo completo: login, criação de dados, exclusão e verificação.
 * - Valida isolamento: dados de outro usuário não são afetados.
 * - Log de auditoria da exclusão é mantido.
 * [2026-06-09] - Exclusão de auth.users
 * - Adicionada verificação de que auth_users é limpo após exclusão.
 * - Step 1: confirma entrada em auth_users.
 * - Step 2: confirma remoção de auth_users.
 * - Step 3: confirma que auth_users de outro usuário permanece.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, createAndLoginUser } from "./helpers.js";
import * as repo from "../../services/repository.js";

describe("Fluxo Integrado: Login → Excluir Conta", () => {
  let _auth;
  let mockSupabase;
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

    const loginResult = await createAndLoginUser(mockSupabase, {
      email: "usuario@test.com",
      name: "Usuário Teste",
    });
    usuario = loginResult.user;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 1: CRIAR DADOS EM MÚLTIPLAS TABELAS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Criar dados do usuário em todas as tabelas", async () => {
    const db = mockSupabase.__db();

    // Lançamento
    await repo.createLancamento(
      { tipo: "DESPESA", valor: 100, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      usuario.id,
    );

    // Orçamento
    await repo.importarOrcamento(
      [{
        data: "2026-06-01",
        tipo: "DESPESA",
        descricao: "Aluguel",
        valor_planejado: 1500,
        valor_realizado: 0,
        categoria_id: 1,
        data_busca: "2026-06",
      }],
      usuario.id,
    );

    // Conta
    await repo.createConta(usuario.id, { nome: "NuBank" });

    // Pessoa
    await repo.createPessoa(usuario.id, { nome: "João" });

    // Verificar dados criados
    expect(db.financas_lancamentos).toHaveLength(1);
    expect(db.financas_orcamento).toHaveLength(1);
    expect(db.financas_contas).toHaveLength(1);
    expect(db.financas_pessoas).toHaveLength(1);
    expect(db.financas_usuarios.some((u) => u.id === usuario.id)).toBe(true);
    expect(db.auth_users.some((u) => u.id === usuario.id)).toBe(true);

    expect(db.financas_lancamentos[0].usuario_id).toBe(usuario.id);
    expect(db.financas_orcamento[0].usuario_id).toBe(usuario.id);
    expect(db.financas_contas[0].usuario_id).toBe(usuario.id);
    expect(db.financas_pessoas[0].usuario_id).toBe(usuario.id);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: EXCLUIR CONTA E VERIFICAR LIMPEZA */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Excluir conta remove todos os dados do usuário", async () => {
    const db = mockSupabase.__db();

    // Popular dados
    await repo.createLancamento(
      { tipo: "DESPESA", valor: 100, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      usuario.id,
    );
    await repo.importarOrcamento(
      [{ data: "2026-06-01", tipo: "DESPESA", valor_planejado: 500, categoria_id: 1, data_busca: "2026-06" }],
      usuario.id,
    );
    await repo.createConta(usuario.id, { nome: "NuBank" });
    await repo.createPessoa(usuario.id, { nome: "João" });

    // Excluir conta
    await repo.excluirConta();

    // Validar que tudo foi removido
    expect(db.financas_lancamentos).toHaveLength(0);
    expect(db.financas_orcamento).toHaveLength(0);
    expect(db.financas_contas).toHaveLength(0);
    expect(db.financas_pessoas).toHaveLength(0);
    expect(db.financas_usuarios.filter((u) => u.id === usuario.id)).toHaveLength(0);
    expect(db.auth_users.filter((u) => u.id === usuario.id)).toHaveLength(0);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: ISOLAMENTO - EXCLUSÃO NÃO AFETA OUTRO USUÁRIO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Exclusão de um usuário não afeta dados de outro", async () => {
    const db = mockSupabase.__db();

    // Usuário 1 cria dados
    await repo.createLancamento(
      { tipo: "DESPESA", valor: 100, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      usuario.id,
    );
    await repo.createConta(usuario.id, { nome: "Conta U1" });

    // Criar outro usuário
    const outroUser = await createAndLoginUser(mockSupabase, {
      email: "outro@test.com",
      name: "Outro",
    });

    // Usuário 2 cria dados
    await repo.createLancamento(
      { tipo: "DESPESA", valor: 999, data: "2026-06-15", status: "PENDENTE", data_busca: "2026-06", categoria_id: 1 },
      outroUser.user.id,
    );
    await repo.createConta(outroUser.user.id, { nome: "Conta U2" });

    // Restaurar sessão do usuário 1 e excluir
    mockSupabase.__setUser(usuario);
    await repo.excluirConta();

    // Dados do usuário 2 devem permanecer
    expect(db.financas_lancamentos).toHaveLength(1);
    expect(db.financas_contas).toHaveLength(1);
    expect(db.financas_lancamentos[0].usuario_id).toBe(outroUser.user.id);
    expect(db.financas_contas[0].usuario_id).toBe(outroUser.user.id);
    expect(db.financas_lancamentos[0].valor).toBe(999);
    expect(db.financas_contas[0].nome).toBe("Conta u2");
    expect(db.auth_users.some((u) => u.id === outroUser.user.id)).toBe(true);
    expect(db.auth_users.filter((u) => u.id === usuario.id)).toHaveLength(0);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: LOG DE AUDITORIA PERMANECE APÓS EXCLUSÃO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Log de auditoria da exclusão é mantido", async () => {
    // Criar auditoria antes da exclusão
    await repo.logAuditoria(usuario.id, "CONTA_EXCLUIDA", {
      entidade: "usuarios",
      entidade_id: usuario.id,
      dados_novos: { motivo: "Solicitação do usuário" },
      contexto: "user",
    });

    // Excluir conta
    mockSupabase.__setUser(usuario);
    await repo.excluirConta();

    // O log de auditoria da exclusão deve existir
    const logs = await repo.getAuditoria({ acao: "CONTA_EXCLUIDA" });
    const logExclusao = logs.find((l) => l.acao === "CONTA_EXCLUIDA");
    expect(logExclusao).toBeDefined();
    expect(logExclusao.entidade).toBe("usuarios");
    expect(logExclusao.dados_novos.motivo).toBe("Solicitação do usuário");
  });
});
