/**
 * @file Testes da página de visualizar cliente (admin).
 * @description Valida cálculo de orçamento, comparação, resumo, filtros e renderização de tabela.
 * @module test/unitarios/pages/visualizar-cliente.test.js
 * @changelog
 * [2026-06-17] - Criação
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(
  path.resolve(__dirname, "../../../public/visualizar-cliente.html"),
  "utf-8"
);

HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();

vi.mock("../../../public/js/auth-guard.js", () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue({
    token: "t",
    usuario: { id: "admin-1", nome: "Admin", role: "admin" },
  }),
  escapeHtml: (str) => {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },
  clearAuthSession: vi.fn(),
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../../../public/js/helper.js", () => ({
  formatarMoeda: vi.fn((v) => String(v)),
}));

function baseMocks() {
  return {
    getCategorias: vi.fn().mockResolvedValue([]),
    getSubcategorias: vi.fn().mockResolvedValue([]),
    adminGetContasCliente: vi.fn().mockResolvedValue([]),
    adminGetTransacoesCliente: vi.fn().mockResolvedValue([]),
    adminGetOrcamentoCliente: vi.fn().mockResolvedValue([]),
    logError: vi.fn(),
    logout: vi.fn(),
    getTipoPessoa: vi.fn().mockResolvedValue("PF"),
    setTipoPessoa: vi.fn().mockResolvedValue({ success: true }),
    onTipoPessoaChanged: vi.fn(),
    getUsarPj: vi.fn().mockResolvedValue(true),
    onUsarPjChanged: vi.fn(),
  };
}

describe("visualizar-cliente (página de visualização de cliente pelo admin)", () => {
  let mod;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = html;
    window.electronAPI = baseMocks();
    vi.resetModules();
    mod = await import("../../../public/js/visualizar-cliente.js");
  });

  describe("calcularTotaisOrcamento", () => {
    it("soma receitas e despesas planejadas", () => {
      const filtroAno = document.getElementById("filtroAno");
      filtroAno.innerHTML = '<option value="all">Todos</option><option value="2026">2026</option>';
      filtroAno.value = "2026";
      document.getElementById("filtroMes").value = "all";

      const orcamentoData = [
        { data: "2026-01-01", tipo: "RECEITA", valor_planejado: 5000, valor_realizado: 4800 },
        { data: "2026-01-01", tipo: "DESPESA", valor_planejado: 3000, valor_realizado: 2500 },
      ];

      const totais = mod.calcularTotaisOrcamento(orcamentoData);

      expect(totais.receitas_planejadas).toBe(5000);
      expect(totais.receitas_realizadas).toBe(4800);
      expect(totais.despesas_planejadas).toBe(3000);
      expect(totais.despesas_realizadas).toBe(2500);
    });

    it("filtra por mês selecionado", () => {
      const filtroAno = document.getElementById("filtroAno");
      filtroAno.innerHTML = '<option value="all">Todos</option><option value="2026">2026</option>';
      filtroAno.value = "2026";
      const filtroMes = document.getElementById("filtroMes");
      filtroMes.innerHTML = '<option value="all">Todos</option><option value="02">Fevereiro</option>';
      filtroMes.value = "02";

      const orcamentoData = [
        { data: "2026-01-15", tipo: "RECEITA", valor_planejado: 1000, valor_realizado: 0 },
        { data: "2026-02-10", tipo: "RECEITA", valor_planejado: 2000, valor_realizado: 0 },
      ];

      const totais = mod.calcularTotaisOrcamento(orcamentoData);

      expect(totais.receitas_planejadas).toBe(2000);
    });
  });

  describe("atualizarComparacao", () => {
    it("atualiza DOM com valores formatados", () => {
      const totais = {
        receitas_planejadas: 5000,
        despesas_planejadas: 3000,
        receitas_realizadas: 4500,
        despesas_realizadas: 2800,
      };

      mod.atualizarComparacao(totais);

      expect(document.getElementById("receitasPlanejadas").textContent).toBe("5000");
      expect(document.getElementById("receitasRealizadas").textContent).toBe("4500");
      expect(document.getElementById("despesasPlanejadas").textContent).toBe("3000");
      expect(document.getElementById("despesasRealizadas").textContent).toBe("2800");
    });

    it("calcula diferença positiva para receitas", () => {
      const totais = {
        receitas_planejadas: 5000, despesas_planejadas: 3000,
        receitas_realizadas: 5500, despesas_realizadas: 2800,
      };

      mod.atualizarComparacao(totais);

      const diff = document.getElementById("diffReceitas");
      expect(diff.textContent).toBe("500");
      expect(diff.classList.contains("positive")).toBe(true);
    });

    it("calcula diferença negativa para despesas", () => {
      const totais = {
        receitas_planejadas: 5000, despesas_planejadas: 3000,
        receitas_realizadas: 4500, despesas_realizadas: 3200,
      };

      mod.atualizarComparacao(totais);

      const diff = document.getElementById("diffDespesas");
      expect(diff.textContent).toBe("200");
      expect(diff.classList.contains("negative")).toBe(true);
    });

    it("atualiza barras de progresso", () => {
      const totais = {
        receitas_planejadas: 10000, despesas_planejadas: 2000,
        receitas_realizadas: 5000, despesas_realizadas: 1000,
      };

      mod.atualizarComparacao(totais);

      expect(document.getElementById("progressReceitas").style.width).toBe("50%");
      expect(document.getElementById("progressDespesas").style.width).toBe("50%");
    });
  });

  describe("atualizarResumo", () => {
    it("atualiza totais no DOM", () => {
      mod.lancamentos.length = 0;
      mod.lancamentos.push(
        { data: "2026-01-15", tipo: "RECEITA", status: "PAGO", valor: 5000 },
        { data: "2026-01-15", tipo: "DESPESA", status: "PAGO", valor: 2000 },
      );

      const filtroAno = document.getElementById("filtroAno");
      filtroAno.innerHTML = '<option value="all">Todos</option><option value="2026">2026</option>';
      filtroAno.value = "2026";
      document.getElementById("filtroMes").value = "all";

      mod.atualizarResumo();

      expect(document.getElementById("totalReceitas").textContent).toBe("5000");
      expect(document.getElementById("totalDespesas").textContent).toBe("2000");
    });

    it("adiciona classe saldo-positive quando saldo > 0", () => {
      mod.lancamentos.length = 0;
      mod.lancamentos.push(
        { data: "2026-01-15", tipo: "RECEITA", status: "PAGO", valor: 5000 },
      );

      const filtroAno = document.getElementById("filtroAno");
      filtroAno.innerHTML = '<option value="all">Todos</option><option value="2026">2026</option>';
      filtroAno.value = "all";
      document.getElementById("filtroMes").value = "all";

      mod.atualizarResumo();

      expect(document.getElementById("headerSaldo").classList.contains("saldo-positive")).toBe(true);
    });

    it("adiciona classe saldo-negative quando saldo < 0", () => {
      mod.lancamentos.length = 0;
      mod.lancamentos.push(
        { data: "2026-01-15", tipo: "DESPESA", status: "PAGO", valor: 3000 },
      );

      const filtroAno = document.getElementById("filtroAno");
      filtroAno.innerHTML = '<option value="all">Todos</option>';
      filtroAno.value = "all";
      document.getElementById("filtroMes").value = "all";

      mod.atualizarResumo();

      expect(document.getElementById("headerSaldo").classList.contains("saldo-negative")).toBe(true);
    });

    it("adiciona classe saldo-zero quando saldo é 0", () => {
      mod.lancamentos.length = 0;

      document.getElementById("filtroAno").value = "all";
      document.getElementById("filtroMes").value = "all";

      mod.atualizarResumo();

      expect(document.getElementById("headerSaldo").classList.contains("saldo-zero")).toBe(true);
    });
  });

  describe("formatDate", () => {
    it("formata data ISO para pt-BR", () => {
      const result = mod.formatDate("2026-03-15");
      expect(result).toBe("15/03/2026");
    });
  });

  describe("formatCurrency", () => {
    it("delega para formatarMoeda", () => {
      const result = mod.formatCurrency(1234.5);
      expect(result).toBe("1234.5");
    });
  });

  describe("renderizarTabela", () => {
    it("mostra estado vazio quando não há lançamentos", () => {
      mod.lancamentos.length = 0;

      mod.renderizarTabela();

      expect(document.getElementById("tabelaLancamentos").innerHTML).toContain("Nenhum lançamento encontrado");
    });

    it("filtra lançamentos por ano e mês", () => {
      mod.lancamentos.length = 0;
      mod.lancamentos.push(
        { data: "2026-01-15", tipo: "RECEITA", status: "PAGO", valor: 100, descricao: "Salário", categoria_id: null, subcategoria_id: null, conta_origem_id: null, conta_destino_id: null },
        { data: "2026-02-10", tipo: "DESPESA", status: "PAGO", valor: 50, descricao: "Mercado", categoria_id: null, subcategoria_id: null, conta_origem_id: null, conta_destino_id: null },
      );

      const filtroAno = document.getElementById("filtroAno");
      filtroAno.innerHTML = '<option value="all">Todos</option><option value="2026">2026</option>';
      filtroAno.value = "2026";
      const filtroMes = document.getElementById("filtroMes");
      filtroMes.innerHTML = '<option value="all">Todos</option><option value="01">Janeiro</option>';
      filtroMes.value = "01";

      mod.renderizarTabela();

      expect(document.getElementById("tabelaLancamentos").innerHTML).toContain("Salário");
    });

    it("renderiza contador de lançamentos", () => {
      mod.lancamentos.length = 0;
      mod.lancamentos.push(
        { data: "2026-01-15", tipo: "RECEITA", status: "PAGO", valor: 100, descricao: "Salário", categoria_id: null, subcategoria_id: null, conta_origem_id: null, conta_destino_id: null },
      );

      mod.renderizarTabela();

      expect(document.getElementById("contadorLancamentos").textContent).toContain("1 lançamento");
    });
  });
});
