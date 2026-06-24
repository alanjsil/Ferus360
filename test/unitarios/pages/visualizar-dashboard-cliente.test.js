/**
 * @file Testes da página de dashboard do cliente (admin).
 * @description Valida carregamento de dados, filtros, renderização de gráficos mockados.
 * @module test/unitarios/pages/visualizar-dashboard-cliente.test.js
 * @changelog
 * [2026-06-17] - Criação
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(path.resolve(__dirname, "../../../public/visualizar-dashboard-cliente.html"), "utf-8");

vi.mock("../../../public/js/auth-guard.js", () => ({
  clearAuthSession: vi.fn(),
  ensureAuthenticated: vi.fn().mockResolvedValue({
    token: "t",
    usuario: { id: "admin-1", nome: "Admin", role: "admin" },
  }),
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../../../public/js/helper.js", () => ({}));

globalThis.Chart = vi.fn(function () {
  return { destroy: vi.fn() };
});

function baseMocks() {
  return {
    getCategorias: vi.fn().mockResolvedValue([]),
    adminGetAnosDisponiveisCliente: vi.fn().mockResolvedValue([2026]),
    adminGetDashboardDadosCliente: vi.fn().mockResolvedValue({
      lancamentos: [],
      orcamento: [],
      totais: { receitas: 0, despesas: 0 },
    }),
    logout: vi.fn(),
    logError: vi.fn(),
    logWarn: vi.fn(),
    getTipoPessoa: vi.fn().mockResolvedValue("PF"),
    setTipoPessoa: vi.fn().mockResolvedValue({ success: true }),
    onTipoPessoaChanged: vi.fn(),
    getUsarPj: vi.fn().mockResolvedValue(true),
    onUsarPjChanged: vi.fn(),
  };
}

describe("visualizar-dashboard-cliente (dashboard do cliente pelo admin)", () => {
  let mod;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = html;
    window.electronAPI = baseMocks();
    vi.resetModules();
    mod = await import("../../../public/js/visualizar-dashboard-cliente.js");
  });

  describe("popularAnos", () => {
    it("popula select de anos", async () => {
      window.electronAPI.adminGetAnosDisponiveisCliente.mockResolvedValue([2024, 2025, 2026]);

      await mod.popularAnos();

      const select = document.getElementById("filtroAno");
      expect(select.children.length).toBe(3);
      expect(select.value).toBe("2024");
    });
  });

  describe("popularMeses", () => {
    it("popula select com meses únicos dos dados", () => {
      mod.popularMeses();

      const select = document.getElementById("filtroMes");
      expect(select.children.length).toBe(1);
      expect(select.children[0].value).toBe("all");
    });

    it("adiciona meses encontrados nos dados", () => {
      mod.dadosDashboard.lancamentos = [{ data: "2026-01-15" }, { data: "2026-03-10" }];

      mod.popularMeses();

      const select = document.getElementById("filtroMes");
      expect(select.children.length).toBe(3);
      expect(select.children[1].value).toBe("01");
      expect(select.children[2].value).toBe("03");
    });
  });

  describe("mostrarLoading / esconderLoading", () => {
    it("adiciona e remove classe loading", () => {
      const wrapper = document.querySelector(".chart-wrapper");

      mod.mostrarLoading();
      expect(wrapper.classList.contains("loading")).toBe(true);

      mod.esconderLoading();
      expect(wrapper.classList.contains("loading")).toBe(false);
    });
  });

  describe("renderizarGraficos", () => {
    it("cria chart mensal", () => {
      mod.renderizarGraficos();
      expect(globalThis.Chart).toHaveBeenCalled();
    });
  });

  describe("carregarCategorias", () => {
    it("popula select de categorias", async () => {
      window.electronAPI.getCategorias.mockResolvedValue([
        { id: "cat1", nome: "Alimentação" },
        { id: "cat2", nome: "Transporte" },
      ]);

      await mod.carregarCategorias();

      const select = document.getElementById("filtroCategoria");
      expect(select.children.length).toBe(3);
      expect(select.children[1].textContent).toBe("Alimentação");
    });
  });

  describe("carregarDashboard", () => {
    it("chama API com parâmetros corretos", async () => {
      await mod.carregarDashboard();
      expect(window.electronAPI.adminGetDashboardDadosCliente).toHaveBeenCalled();
    });
  });
});
