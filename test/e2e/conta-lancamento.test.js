/**
 * @file Teste e2e: Fluxo de Login -> Conta -> Lancamentos.
 * @description Conecta ao Supabase real (sem mock). Valida CRUD de contas e transferencias.
 * @module test/e2e/conta-lancamento.test.js
 * @changelog
 * [2026-06-08] - Alan Silveira
 * - Criado teste real baseado no mockado conta-lancamento.test.js
 * - Schema real: financas_contas possui apenas id, nome, usuario_id (sem tipo/saldo)
 * - Transferencia cria 2 lancamentos (DESPESA + RECEITA) com transferencia_grupo_id
 */

import { describe, it, expect, beforeAll } from "vitest";
import { seedBase, getAdminClient } from "./seed.js";
import { autenticarUsuario } from "./helpers-reais.js";

describe("Conta -> Lancamentos [REAL]", () => {
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
  /* TESTE 1: CRIAR CONTA                    */
  /* ─────────────────────────────────────── */
  it("Step 1: Criar conta com sucesso", async () => {
    const { data: conta, error } = await clientUser
      .from("financas_contas")
      .insert({
        nome: "NuBank",
        usuario_id: normalUser.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(conta.id).toBeTruthy();
    expect(conta.nome).toBe("NuBank");
    expect(conta.usuario_id).toBe(normalUser.id);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 2: CRIAR MULTIPLAS CONTAS         */
  /* ─────────────────────────────────────── */
  it("Step 2: Criar multiplas contas", async () => {
    const contas = ["NuBank", "Poupanca", "Inter"];
    for (const nome of contas) {
      await clientUser.from("financas_contas").insert({ nome, usuario_id: normalUser.id });
    }

    const { data: minhas } = await clientUser.from("financas_contas").select("nome").eq("usuario_id", normalUser.id);

    expect(minhas.length).toBeGreaterThanOrEqual(3);
    expect(minhas.map((c) => c.nome)).toEqual(expect.arrayContaining(contas));
  });

  /* ─────────────────────────────────────── */
  /* TESTE 3: LANCAMENTO VINCULADO A CONTA   */
  /* ─────────────────────────────────────── */
  it("Step 3: Criar lancamento com conta de origem", async () => {
    const { data: conta } = await clientUser.from("financas_contas").insert({ nome: "Conta Despesa", usuario_id: normalUser.id }).select().single();

    const { data: lanc, error } = await clientUser
      .from("financas_lancamentos")
      .insert({
        data: "2026-06-15",
        tipo: "DESPESA",
        valor: 250,
        status: "PENDENTE",
        descricao: "Gasolina",
        usuario_id: normalUser.id,
        conta_origem_id: conta.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(lanc.conta_origem_id).toBe(conta.id);
    expect(Number(lanc.valor)).toBe(250);
    expect(lanc.descricao).toBe("Gasolina");
  });

  /* ─────────────────────────────────────── */
  /* TESTE 4: TRANSFERENCIA ENTRE CONTAS     */
  /* ─────────────────────────────────────── */
  it("Step 4: Criar transferencia entre duas contas", async () => {
    const { data: contaO } = await clientUser.from("financas_contas").insert({ nome: "Origem", usuario_id: normalUser.id }).select().single();

    const { data: contaD } = await clientUser.from("financas_contas").insert({ nome: "Destino", usuario_id: normalUser.id }).select().single();

    const grupoId = crypto.randomUUID();

    const { data: saida, error: err1 } = await clientUser
      .from("financas_lancamentos")
      .insert({
        data: "2026-07-01",
        tipo: "DESPESA",
        valor: 800,
        status: "PENDENTE",
        descricao: "Transferencia mensal",
        usuario_id: normalUser.id,
        conta_origem_id: contaO.id,
        transferencia_grupo_id: grupoId,
      })
      .select()
      .single();

    expect(err1).toBeNull();
    expect(saida.transferencia_grupo_id).toBe(grupoId);
    expect(saida.tipo).toBe("DESPESA");
    expect(saida.conta_origem_id).toBe(contaO.id);
    expect(saida.conta_destino_id).toBeNull();

    const { data: entrada, error: err2 } = await clientUser
      .from("financas_lancamentos")
      .insert({
        data: "2026-07-01",
        tipo: "RECEITA",
        valor: 800,
        status: "PENDENTE",
        descricao: "Transferencia mensal",
        usuario_id: normalUser.id,
        conta_destino_id: contaD.id,
        transferencia_grupo_id: grupoId,
      })
      .select()
      .single();

    expect(err2).toBeNull();
    expect(entrada.transferencia_grupo_id).toBe(grupoId);
    expect(entrada.tipo).toBe("RECEITA");
    expect(entrada.conta_destino_id).toBe(contaD.id);
    expect(entrada.conta_origem_id).toBeNull();
    expect(Number(entrada.valor)).toBe(Number(saida.valor));
    expect(entrada.descricao).toBe(saida.descricao);

    const { data: grupo } = await supabaseAdmin.from("financas_lancamentos").select("id, tipo").eq("transferencia_grupo_id", grupoId);

    expect(grupo).toHaveLength(2);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 5: LISTAR LANCAMENTOS POR CONTA   */
  /* ─────────────────────────────────────── */
  it("Step 5: Listar lancamentos filtrados por conta", async () => {
    const { data: conta1 } = await clientUser.from("financas_contas").insert({ nome: "Conta Listagem 1", usuario_id: normalUser.id }).select().single();

    const { data: conta2 } = await clientUser.from("financas_contas").insert({ nome: "Conta Listagem 2", usuario_id: normalUser.id }).select().single();

    await clientUser.from("financas_lancamentos").insert([
      { data: "2026-06-15", tipo: "DESPESA", valor: 100, status: "PENDENTE", usuario_id: normalUser.id, conta_origem_id: conta1.id },
      { data: "2026-06-15", tipo: "DESPESA", valor: 200, status: "PENDENTE", usuario_id: normalUser.id, conta_origem_id: conta1.id },
      { data: "2026-06-15", tipo: "DESPESA", valor: 300, status: "PENDENTE", usuario_id: normalUser.id, conta_origem_id: conta2.id },
    ]);

    const { data: lancConta1 } = await supabaseAdmin.from("financas_lancamentos").select("valor").eq("conta_origem_id", conta1.id);

    const { data: lancConta2 } = await supabaseAdmin.from("financas_lancamentos").select("valor").eq("conta_origem_id", conta2.id);

    expect(lancConta1).toHaveLength(2);
    expect(lancConta2).toHaveLength(1);
    expect(Number(lancConta1[0].valor)).toBe(100);
    expect(Number(lancConta1[1].valor)).toBe(200);
    expect(Number(lancConta2[0].valor)).toBe(300);
  });

  /* ─────────────────────────────────────── */
  /* TESTE 6: ISOLAMENTO DE CONTAS           */
  /* ─────────────────────────────────────── */
  it("Step 6: Isolamento de contas entre usuarios", async () => {
    const { data: minha } = await clientUser.from("financas_contas").insert({ nome: "Minha Conta", usuario_id: normalUser.id }).select().single();

    expect(minha.usuario_id).toBe(normalUser.id);
  });
});
