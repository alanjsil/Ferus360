/**
 * @file Teste integrado: Fluxo de Login → Conta → Lançamentos
 *
 * Valida:
 * 1. Login e criação de conta
 * 2. Criar lançamento vinculado a conta de origem
 * 3. Criar transferência entre contas
 * 4. Listar lançamentos por conta
 * 5. Isolamento de contas entre usuários
 * @module test/integrados/conta-lancamento.test.js
 * @changelog
 * [2026-06-10] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, createAndLoginUser, createLancamentoPayload, createContaPayload } from "./helpers.js";
import * as repo from "../../services/repository.js";
import { construirAuthService } from "../../services/auth.js";

describe("Fluxo Integrado: Login → Conta → Lançamentos", () => {
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
  /* TESTE 1: CRIAR CONTA */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 1: Criar conta corrente com sucesso", async () => {
    const db = mockSupabase.__db();

    const conta = await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({
          nome: "NuBank",
          tipo: "CORRENTE",
          saldo: 5000,
        }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    expect(conta.data.id).toBeTruthy();
    expect(conta.data.nome).toBe("NuBank");
    expect(conta.data.tipo).toBe("CORRENTE");
    expect(conta.data.saldo).toBe(5000);
    expect(conta.data.usuario_id).toBe(usuario.id);
    expect(conta.data.ativa).toBe(true);

    expect(db.financas_contas).toHaveLength(1);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 2: CRIAR MÚLTIPLAS CONTAS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 2: Criar múltiplas contas de tipos diferentes", async () => {
    const contas = [
      { nome: "NuBank", tipo: "CORRENTE", saldo: 5000 },
      { nome: "Poupança", tipo: "POUPANCA", saldo: 10000 },
      { nome: "Cartão Crédito", tipo: "CARTAO", saldo: -1500 },
    ];

    for (const c of contas) {
      await mockSupabase
        .from("financas_contas")
        .insert({
          ...createContaPayload(c),
          usuario_id: usuario.id,
        })
        .select()
        .single();
    }

    const db = mockSupabase.__db();
    expect(db.financas_contas).toHaveLength(3);

    const meuNuBank = db.financas_contas.find((c) => c.nome === "NuBank");
    expect(meuNuBank.tipo).toBe("CORRENTE");
    expect(meuNuBank.saldo).toBe(5000);

    const totalSaldo = db.financas_contas.reduce((s, c) => s + c.saldo, 0);
    expect(totalSaldo).toBe(13500);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3: LANÇAMENTO VINCULADO A CONTA DE ORIGEM */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3: Criar lançamento com conta de origem", async () => {
    // Criar conta primeiro
    const conta = await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({ nome: "NuBank" }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    // Criar lançamento vinculado a esta conta
    const lancamento = await mockSupabase
      .from("financas_lancamentos")
      .insert({
        ...createLancamentoPayload({
          tipo: "DESPESA",
          valor: 250,
          descricao: "Gasolina",
          conta_origem_id: conta.data.id,
        }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    expect(lancamento.data.conta_origem_id).toBe(conta.data.id);
    expect(lancamento.data.valor).toBe(250);
    expect(lancamento.data.descricao).toBe("Gasolina");
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 3b: TRANSFERÊNCIA ENTRE CONTAS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 3b: Criar transferência entre duas contas via repository", async () => {
    const db = mockSupabase.__db();

    // Criar conta de origem e destino
    const contaOrigem = await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({ nome: "Conta Origem", saldo: 3000 }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    const contaDestino = await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({ nome: "Conta Destino", saldo: 0 }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    const payload = {
      data: "2026-07-01",
      status: "PENDENTE",
      valor: 800,
      descricao: "Transferência mensal",
      conta_origem_id: contaOrigem.data.id,
      conta_destino_id: contaDestino.data.id,
      categoria_id: 1,
    };

    const result = await repo.criarTransferencia(payload, usuario.id);

    expect(result).toHaveLength(2);
    expect(result[0].transferencia_grupo_id).toBeTruthy();
    expect(result[1].transferencia_grupo_id).toBe(result[0].transferencia_grupo_id);

    const grupoId = result[0].transferencia_grupo_id;
    const saida = result.find((l) => l.tipo === "DESPESA");
    const entrada = result.find((l) => l.tipo === "RECEITA");

    // Validar DESPESA (origem)
    expect(saida).toBeTruthy();
    expect(saida.conta_origem_id).toBe(contaOrigem.data.id);
    expect(saida.conta_destino_id).toBeNull();

    // Validar RECEITA (destino)
    expect(entrada).toBeTruthy();
    expect(entrada.conta_destino_id).toBe(contaDestino.data.id);
    expect(entrada.conta_origem_id).toBeNull();

    // Validar campos iguais em ambos
    expect(saida.valor).toBe(800);
    expect(entrada.valor).toBe(800);
    expect(saida.descricao).toBe("Transferência mensal");
    expect(entrada.descricao).toBe("Transferência mensal");
    expect(saida.data).toBe("2026-07-01");
    expect(entrada.data).toBe("2026-07-01");
    expect(saida.usuario_id).toBe(usuario.id);
    expect(entrada.usuario_id).toBe(usuario.id);

    // Validar persistência no banco em memória
    const persisted = db.financas_lancamentos.filter((l) => l.transferencia_grupo_id === grupoId);
    expect(persisted).toHaveLength(2);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 4: LANÇAMENTOS POR CONTA */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 4: Listar lançamentos filtrados por conta", async () => {
    const db = mockSupabase.__db();

    // Criar 2 contas
    const conta1 = await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({ nome: "NuBank" }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    const conta2 = await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({ nome: "Inter" }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    // Criar 2 lançamentos na conta1, 1 na conta2
    await mockSupabase
      .from("financas_lancamentos")
      .insert({
        ...createLancamentoPayload({
          valor: 100,
          conta_origem_id: conta1.data.id,
        }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    await mockSupabase
      .from("financas_lancamentos")
      .insert({
        ...createLancamentoPayload({
          valor: 200,
          conta_origem_id: conta1.data.id,
        }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    await mockSupabase
      .from("financas_lancamentos")
      .insert({
        ...createLancamentoPayload({
          valor: 300,
          conta_origem_id: conta2.data.id,
        }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    const lancConta1 = db.financas_lancamentos.filter((l) => l.conta_origem_id === conta1.data.id);
    const lancConta2 = db.financas_lancamentos.filter((l) => l.conta_origem_id === conta2.data.id);

    expect(lancConta1).toHaveLength(2);
    expect(lancConta2).toHaveLength(1);
    expect(lancConta1.reduce((s, l) => s + l.valor, 0)).toBe(300);
    expect(lancConta2[0].valor).toBe(300);
  });

  /* ─────────────────────────────────────────────────────────── */
  /* TESTE 5: ISOLAMENTO DE CONTAS ENTRE USUÁRIOS */
  /* ─────────────────────────────────────────────────────────── */

  it("Step 5: Isolamento de contas entre usuários", async () => {
    const db = mockSupabase.__db();

    // Usuário 1 cria conta
    await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({ nome: "Minha Conta" }),
        usuario_id: usuario.id,
      })
      .select()
      .single();

    // Criar outro usuário
    const outroUser = await createAndLoginUser(mockSupabase, {
      email: "outro@test.com",
      name: "Outro",
    });

    // Usuário 2 cria conta
    await mockSupabase
      .from("financas_contas")
      .insert({
        ...createContaPayload({ nome: "Outra Conta" }),
        usuario_id: outroUser.user.id,
      })
      .select()
      .single();

    const contasUser1 = db.financas_contas.filter((c) => c.usuario_id === usuario.id);
    const contasUser2 = db.financas_contas.filter((c) => c.usuario_id === outroUser.user.id);

    expect(contasUser1).toHaveLength(1);
    expect(contasUser2).toHaveLength(1);
    expect(contasUser1[0].nome).toBe("Minha Conta");
    expect(contasUser2[0].nome).toBe("Outra Conta");
  });
});
