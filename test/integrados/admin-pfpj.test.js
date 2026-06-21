/**
 * @file Teste integrado: Filtro PF/PJ nas funções admin-client
 *
 * Valida:
 * 1. Seed de dados PF e PJ para um mesmo cliente
 * 2. getResumoCliente filtra corretamente por tipo_pessoa
 * 3. getTransacoesCliente filtra corretamente por tipo_pessoa
 * 4. getContas filtra corretamente por tipo_pessoa
 * 5. getOrcamento filtra corretamente por tipo_pessoa
 * 6. getDashboardDados filtra corretamente por tipo_pessoa
 * 7. getAnosDisponiveis filtra corretamente por tipo_pessoa
 * 8. Sem filtro, retorna todos os dados independente de tipo_pessoa
 * @module test/integrados/admin-pfpj.test.js
 * @changelog
 * [2026-06-20] - Criação
 * - Testes de isolamento PF/PJ para todas as 6 funções admin-client
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as repo from "../../services/repository.js";
import { createAndLoginUser, createMockSupabase } from "./helpers.js";

describe("Fluxo Integrado: Admin → Filtro PF/PJ", () => {
  let mockSupabase;
  let cliente;
  const CAT_PF_DESPESA = 1;
  const CAT_PJ_RECEITA = 2;

  beforeEach(async () => {
    mockSupabase = createMockSupabase();
    repo.__setSupabase(mockSupabase);

    // Criar cliente que terá dados PF e PJ
    const result = await createAndLoginUser(mockSupabase, {
      email: "cliente@test.com",
      name: "Cliente PF/PJ",
    });
    cliente = result.user;

    const db = mockSupabase.__db();
    const hoje = new Date().toISOString();

    // ── Contas PF ──
    db.financas_contas.push(
      { id: "conta-pf-1", nome: "Conta PF Corrente", usuario_id: cliente.id, tipo_pessoa: "PF", ativa: true, saldo: 5000, criado_em: hoje },
      { id: "conta-pf-2", nome: "Conta PF Poupança", usuario_id: cliente.id, tipo_pessoa: "PF", ativa: true, saldo: 10000, criado_em: hoje },
    );

    // ── Contas PJ ──
    db.financas_contas.push(
      { id: "conta-pj-1", nome: "Conta PJ Corrente", usuario_id: cliente.id, tipo_pessoa: "PJ", ativa: true, saldo: 50000, criado_em: hoje },
      { id: "conta-pj-2", nome: "Conta PJ Aplicação", usuario_id: cliente.id, tipo_pessoa: "PJ", ativa: true, saldo: 100000, criado_em: hoje },
    );

    // ── Lançamentos PF ──
    db.financas_lancamentos.push(
      { id: "l-pf-1", usuario_id: cliente.id, tipo: "DESPESA", valor: 100, status: "PAGO", data: "2026-06-15", data_busca: "2026-06", tipo_pessoa: "PF", categoria_id: CAT_PF_DESPESA, criado_em: hoje },
      { id: "l-pf-2", usuario_id: cliente.id, tipo: "RECEITA", valor: 5000, status: "PAGO", data: "2026-06-01", data_busca: "2026-06", tipo_pessoa: "PF", categoria_id: CAT_PJ_RECEITA, criado_em: hoje },
      { id: "l-pf-3", usuario_id: cliente.id, tipo: "DESPESA", valor: 50, status: "PENDENTE", data: "2026-07-01", data_busca: "2026-07", tipo_pessoa: "PF", categoria_id: CAT_PF_DESPESA, criado_em: hoje },
    );

    // ── Lançamentos PJ ──
    db.financas_lancamentos.push(
      { id: "l-pj-1", usuario_id: cliente.id, tipo: "RECEITA", valor: 15000, status: "PAGO", data: "2026-06-10", data_busca: "2026-06", tipo_pessoa: "PJ", categoria_id: CAT_PJ_RECEITA, criado_em: hoje },
      { id: "l-pj-2", usuario_id: cliente.id, tipo: "DESPESA", valor: 3000, status: "PAGO", data: "2026-06-20", data_busca: "2026-06", tipo_pessoa: "PJ", categoria_id: CAT_PF_DESPESA, criado_em: hoje },
      { id: "l-pj-3", usuario_id: cliente.id, tipo: "DESPESA", valor: 500, status: "PENDENTE", data: "2026-07-05", data_busca: "2026-07", tipo_pessoa: "PJ", categoria_id: CAT_PF_DESPESA, criado_em: hoje },
    );

    // ── Orçamento PF ──
    db.financas_orcamento.push(
      { id: "o-pf-1", usuario_id: cliente.id, tipo: "RECEITA", valor_planejado: 5000, valor_realizado: 5000, data: "2026-06-01", data_busca: "2026-06", tipo_pessoa: "PF", categoria_id: CAT_PJ_RECEITA, criado_em: hoje },
      { id: "o-pf-2", usuario_id: cliente.id, tipo: "DESPESA", valor_planejado: 1500, valor_realizado: 150, data: "2026-06-01", data_busca: "2026-06", tipo_pessoa: "PF", categoria_id: CAT_PF_DESPESA, criado_em: hoje },
    );

    // ── Orçamento PJ ──
    db.financas_orcamento.push(
      { id: "o-pj-1", usuario_id: cliente.id, tipo: "RECEITA", valor_planejado: 30000, valor_realizado: 15000, data: "2026-06-01", data_busca: "2026-06", tipo_pessoa: "PJ", categoria_id: CAT_PJ_RECEITA, criado_em: hoje },
      { id: "o-pj-2", usuario_id: cliente.id, tipo: "DESPESA", valor_planejado: 10000, valor_realizado: 3000, data: "2026-06-01", data_busca: "2026-06", tipo_pessoa: "PJ", categoria_id: CAT_PF_DESPESA, criado_em: hoje },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 1: getResumoCliente — filtra lançamentos e orçamento  */
  /* ─────────────────────────────────────────────────────────── */

  it("getResumoCliente retorna apenas dados PF quando tipoPessoa=PF", async () => {
    const resumo = await repo.getResumoCliente(cliente.id, "PF");

    expect(resumo.lancamentos).toHaveLength(3);
    expect(resumo.lancamentos.every((l) => l.tipo_pessoa === "PF")).toBe(true);

    expect(resumo.orcamento).toHaveLength(2);
    expect(resumo.orcamento.every((o) => o.tipo_pessoa === "PF")).toBe(true);
  });

  it("getResumoCliente retorna apenas dados PJ quando tipoPessoa=PJ", async () => {
    const resumo = await repo.getResumoCliente(cliente.id, "PJ");

    expect(resumo.lancamentos).toHaveLength(3);
    expect(resumo.lancamentos.every((l) => l.tipo_pessoa === "PJ")).toBe(true);

    expect(resumo.orcamento).toHaveLength(2);
    expect(resumo.orcamento.every((o) => o.tipo_pessoa === "PJ")).toBe(true);
  });

  it("getResumoCliente sem filtro retorna todos os dados", async () => {
    const resumo = await repo.getResumoCliente(cliente.id);

    expect(resumo.lancamentos).toHaveLength(6);
    expect(resumo.orcamento).toHaveLength(4);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: getTransacoesCliente — filtra lançamentos           */
  /* ─────────────────────────────────────────────────────────── */

  it("getTransacoesCliente retorna apenas PF quando tipoPessoa=PF", async () => {
    const transacoes = await repo.getTransacoesCliente(cliente.id, undefined, undefined, "PF");

    expect(transacoes).toHaveLength(3);
    expect(transacoes.every((t) => t.tipo_pessoa === "PF")).toBe(true);
  });

  it("getTransacoesCliente retorna apenas PJ quando tipoPessoa=PJ", async () => {
    const transacoes = await repo.getTransacoesCliente(cliente.id, undefined, undefined, "PJ");

    expect(transacoes).toHaveLength(3);
    expect(transacoes.every((t) => t.tipo_pessoa === "PJ")).toBe(true);
  });

  it("getTransacoesCliente sem filtro retorna todos os dados", async () => {
    const transacoes = await repo.getTransacoesCliente(cliente.id);

    expect(transacoes).toHaveLength(6);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: getContas — filtra por tipo_pessoa                  */
  /* ─────────────────────────────────────────────────────────── */

  it("getContas retorna apenas contas PF quando tipoPessoa=PF", async () => {
    const contas = await repo.getContas(cliente.id, "PF");

    expect(contas).toHaveLength(2);
    expect(contas.every((c) => c.tipo_pessoa === "PF")).toBe(true);
  });

  it("getContas retorna apenas contas PJ quando tipoPessoa=PJ", async () => {
    const contas = await repo.getContas(cliente.id, "PJ");

    expect(contas).toHaveLength(2);
    expect(contas.every((c) => c.tipo_pessoa === "PJ")).toBe(true);
  });

  it("getContas sem filtro retorna todas as contas", async () => {
    const contas = await repo.getContas(cliente.id);

    expect(contas).toHaveLength(4);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: getOrcamento — filtra por tipo_pessoa               */
  /* ─────────────────────────────────────────────────────────── */

  it("getOrcamento retorna apenas orçamento PF quando tipoPessoa=PF", async () => {
    const orc = await repo.getOrcamento(undefined, cliente.id, "PF");

    expect(orc).toHaveLength(2);
    expect(orc.every((o) => o.tipo_pessoa === "PF")).toBe(true);
  });

  it("getOrcamento retorna apenas orçamento PJ quando tipoPessoa=PJ", async () => {
    const orc = await repo.getOrcamento(undefined, cliente.id, "PJ");

    expect(orc).toHaveLength(2);
    expect(orc.every((o) => o.tipo_pessoa === "PJ")).toBe(true);
  });

  it("getOrcamento sem filtro retorna todos os orçamentos", async () => {
    const orc = await repo.getOrcamento(undefined, cliente.id);

    expect(orc).toHaveLength(4);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: getDashboardDados — filtra por tipo_pessoa          */
  /* ─────────────────────────────────────────────────────────── */

  it("getDashboardDados retorna apenas dados PF quando tipoPessoa=PF", async () => {
    const dados = await repo.getDashboardDados(2026, undefined, undefined, cliente.id, "PF");

    expect(dados.lancamentos).toHaveLength(2);
    expect(dados.lancamentos.every((l) => l.tipo_pessoa === "PF")).toBe(true);
    expect(dados.orcamentos).toHaveLength(2);
    expect(dados.orcamentos.every((o) => o.tipo_pessoa === "PF")).toBe(true);
  });

  it("getDashboardDados retorna apenas dados PJ quando tipoPessoa=PJ", async () => {
    const dados = await repo.getDashboardDados(2026, undefined, undefined, cliente.id, "PJ");

    expect(dados.lancamentos).toHaveLength(2);
    expect(dados.lancamentos.every((l) => l.tipo_pessoa === "PJ")).toBe(true);
    expect(dados.orcamentos).toHaveLength(2);
    expect(dados.orcamentos.every((o) => o.tipo_pessoa === "PJ")).toBe(true);
  });

  it("getDashboardDados sem filtro retorna todos os dados", async () => {
    const dados = await repo.getDashboardDados(2026, undefined, undefined, cliente.id);

    expect(dados.lancamentos).toHaveLength(4);
    expect(dados.orcamentos).toHaveLength(4);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 6: getAnosDisponiveis — filtra por tipo_pessoa         */
  /* ─────────────────────────────────────────────────────────── */

  it("getAnosDisponiveis retorna anos PF quando tipoPessoa=PF", async () => {
    const anos = await repo.getAnosDisponiveis(cliente.id, "PF");

    expect(anos).toContain(2026);
    expect(anos).toHaveLength(1);
  });

  it("getAnosDisponiveis retorna anos PJ quando tipoPessoa=PJ", async () => {
    const anos = await repo.getAnosDisponiveis(cliente.id, "PJ");

    expect(anos).toContain(2026);
    expect(anos).toHaveLength(1);
  });

  it("getAnosDisponiveis sem filtro retorna anos de ambos", async () => {
    const anos = await repo.getAnosDisponiveis(cliente.id);

    expect(anos).toContain(2026);
    expect(anos).toHaveLength(1);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 7: Isolamento — dados PF não vazam para PJ            */
  /* ─────────────────────────────────────────────────────────── */

  it("Isolamento: getResumoCliente PJ não retorna dados PF", async () => {
    const resumoPJ = await repo.getResumoCliente(cliente.id, "PJ");
    const resumoPF = await repo.getResumoCliente(cliente.id, "PF");

    const idsPJ = new Set(resumoPJ.lancamentos.map((l) => l.id));
    const idsPF = new Set(resumoPF.lancamentos.map((l) => l.id));

    for (const id of idsPJ) {
      expect(idsPF.has(id)).toBe(false);
    }
  });

  it("Isolamento: getContas PJ não retorna contas PF", async () => {
    const contasPJ = await repo.getContas(cliente.id, "PJ");
    const contasPF = await repo.getContas(cliente.id, "PF");

    const nomesPJ = new Set(contasPJ.map((c) => c.nome));
    const nomesPF = new Set(contasPF.map((c) => c.nome));

    expect(nomesPJ.has("Conta PF Corrente")).toBe(false);
    expect(nomesPF.has("Conta PJ Corrente")).toBe(false);
  });
});
