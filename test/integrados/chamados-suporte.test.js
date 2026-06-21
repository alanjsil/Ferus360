/**
 * @file Teste integrado: Fluxo de Login → Chamados (Suporte)
 *
 * Valida:
 * 1. Login e abertura de chamado
 * 2. Listar chamados do usuário
 * 3. Isolamento de chamados entre usuários
 * 4. Atualizar chamado (resposta, status)
 * @module test/integrados/chamados-suporte.test.js
 * @changelog
 * [2026-06-10] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, createAndLoginUser } from "./helpers.js";
import * as repo from "../../services/repository.js";
import { construirAuthService } from "../../services/auth.js";

describe("Fluxo Integrado: Login → Chamados (Suporte)", () => {
  let _auth;
  let mockSupabase;
  let usuario;

  beforeEach(async () => {
    mockSupabase = createMockSupabase();
    repo.__setSupabase(mockSupabase);

    _auth = construirAuthService({
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
  /* TESTE 1: ABRIR CHAMADO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Abrir chamado de suporte com sucesso", async () => {
    const chamado = await repo.criarChamado({
      usuario_id: usuario.id,
      titulo: "Erro ao gerar relatório",
      descricao: "O relatório de junho não está gerando.",
      status: "ABERTO",
    });

    expect(chamado.id).toBeTruthy();
    expect(chamado.titulo).toBe("Erro ao gerar relatório");
    expect(chamado.descricao).toBe("O relatório de junho não está gerando.");
    expect(chamado.status).toBe("ABERTO");
    expect(chamado.usuario_id).toBe(usuario.id);
    expect(Array.isArray(chamado.respostas)).toBe(true);
    expect(chamado.respostas).toHaveLength(0);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: LISTAR CHAMADOS DO USUÁRIO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Listar todos os chamados abertos pelo usuário", async () => {
    const chamados = [
      { titulo: "Bug no dashboard", descricao: "Valores errados" },
      { titulo: "Dúvida sobre orçamento", descricao: "Como importar?" },
      { titulo: "Sugestão de feature", descricao: "Adicionar gráfico" },
    ];

    for (const c of chamados) {
      await repo.criarChamado({
        ...c,
        usuario_id: usuario.id,
        status: "ABERTO",
      });
    }

    const meusChamados = await repo.getChamados(usuario.id);

    expect(meusChamados).toHaveLength(3);
    expect(meusChamados.map((c) => c.titulo)).toContain("Bug no dashboard");
    expect(meusChamados.map((c) => c.titulo)).toContain("Dúvida sobre orçamento");
    expect(meusChamados.map((c) => c.titulo)).toContain("Sugestão de feature");
    expect(meusChamados.every((c) => c.status === "ABERTO")).toBe(true);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: ISOLAMENTO DE CHAMADOS ENTRE USUÁRIOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Isolamento de chamados entre usuários", async () => {
    // Usuário 1 abre chamado
    await repo.criarChamado({
      titulo: "Chamado do User1",
      descricao: "Problema A",
      usuario_id: usuario.id,
      status: "ABERTO",
    });

    // Criar outro usuário
    const outroUser = await createAndLoginUser(mockSupabase, {
      email: "outro@test.com",
      name: "Outro",
    });

    // Usuário 2 abre chamado
    await repo.criarChamado({
      titulo: "Chamado do User2",
      descricao: "Problema B",
      usuario_id: outroUser.user.id,
      status: "ABERTO",
    });

    const chamadosUser1 = await repo.getChamados(usuario.id);
    const chamadosUser2 = await repo.getChamados(outroUser.user.id);

    expect(chamadosUser1).toHaveLength(1);
    expect(chamadosUser2).toHaveLength(1);
    expect(chamadosUser1[0].titulo).toBe("Chamado do User1");
    expect(chamadosUser2[0].titulo).toBe("Chamado do User2");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: ATUALIZAR STATUS DO CHAMADO */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Atualizar status do chamado (ABERTO → EM_ANDAMENTO → RESOLVIDO)", async () => {
    const chamado = await repo.criarChamado({
      titulo: "Bug crítico",
      descricao: "Sistema quebrado",
      usuario_id: usuario.id,
      status: "ABERTO",
    });

    const chamadoId = chamado.id;

    // Avançar para EM_ANDAMENTO
    const emAndamento = await repo.updateChamado(chamadoId, { status: "EM_ANDAMENTO" });
    expect(emAndamento.status).toBe("EM_ANDAMENTO");

    // Avançar para RESOLVIDO com resposta
    const resolvido = await repo.updateChamado(chamadoId, {
      status: "RESOLVIDO",
      respostas: [
        {
          autor: "Suporte",
          mensagem: "Bug corrigido na versão 2.1",
          data: new Date().toISOString(),
        },
      ],
    });

    expect(resolvido.status).toBe("RESOLVIDO");
    expect(resolvido.respostas).toHaveLength(1);
    expect(resolvido.respostas[0].autor).toBe("Suporte");
    expect(resolvido.respostas[0].mensagem).toBe("Bug corrigido na versão 2.1");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: MÚLTIPLOS CHAMADOS COM DIFERENTES STATUS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 5: Filtrar chamados por status", async () => {
    const dados = [
      { titulo: "Bug 1", status: "ABERTO" },
      { titulo: "Bug 2", status: "EM_ANDAMENTO" },
      { titulo: "Bug 3", status: "RESOLVIDO" },
      { titulo: "Bug 4", status: "ABERTO" },
    ];

    for (const d of dados) {
      await repo.criarChamado({
        ...d,
        descricao: "Descrição " + d.titulo,
        usuario_id: usuario.id,
      });
    }

    const chamados = await repo.getChamados(usuario.id);

    const abertos = chamados.filter((c) => c.status === "ABERTO");
    const andamento = chamados.filter((c) => c.status === "EM_ANDAMENTO");
    const resolvidos = chamados.filter((c) => c.status === "RESOLVIDO");

    expect(abertos).toHaveLength(2);
    expect(andamento).toHaveLength(1);
    expect(resolvidos).toHaveLength(1);
  });
});
