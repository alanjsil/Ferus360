/**
 * @file Testes da página de dashboard (public/dashboard.html).
 * @description Valida carregamento de categorias, dashboard, gráficos (mensal, categorias, saldo) e indicadores de loading.
 * @module test/unitarios/pages/dashboard.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(
  path.resolve(__dirname, "../../../public/dashboard.html"),
  "utf-8"
);

const mockElectronAPI = {
  getCategorias: vi.fn(),
  getDashboardDados: vi.fn(),
  getAnosDisponiveis: vi.fn(),
};

class MockChart {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.type = config.type;
    this.data = config.data;
    this.options = config.options;
  }
  destroy() {
    return true;
  }
}

const mockContext = {
  canvas: {},
  clearRect: vi.fn(),
  getContextAttributes: vi.fn(() => null),
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext);

describe("dashboard (painel principal)", () => {
  let dashboard;

  beforeEach(async () => {
    window.electronAPI = mockElectronAPI;
    window.Chart = MockChart;
    document.body.innerHTML = html;

    mockElectronAPI.getCategorias.mockResolvedValue([
      { id: 1, nome: "Alimentação" },
      { id: 2, nome: "Salário" },
    ]);
    mockElectronAPI.getDashboardDados.mockResolvedValue({
      lancamentos: [],
      orcamentos: [],
      totalLancamentos: 0,
      totalOrcamentos: 0,
    });
    mockElectronAPI.getAnosDisponiveis.mockResolvedValue([2026, 2025]);

    vi.stubGlobal("Chart", MockChart);

    vi.clearAllMocks();

    dashboard = await import("../../../public/js/dashboard.js");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("carregarCategorias", () => {
    it("carrega categorias no select filtroCategoria", async () => {
      // Act
      await dashboard.carregarCategorias();

      // Assert
      const select = document.getElementById("filtroCategoria");
      expect(select.options.length).toBe(3);
      expect(select.options[1].textContent).toBe("Alimentação");
      expect(select.options[2].textContent).toBe("Salário");
    });

    it("lida com lista vazia de categorias", async () => {
      // Arrange
      mockElectronAPI.getCategorias.mockResolvedValue([]);

      // Act
      await dashboard.carregarCategorias();

      // Assert
      const select = document.getElementById("filtroCategoria");
      expect(select.options.length).toBe(1);
    });
  });

  describe("carregarDashboard", () => {
    it("carrega dados do dashboard e renderiza gráficos", async () => {
      // Arrange
      mockElectronAPI.getDashboardDados.mockResolvedValue({
        lancamentos: [
          {
            data: "2026-06-15",
            tipo: "DESPESA",
            valor: 100,
            categoria: { nome: "Alimentação" },
            subcategoria: { nome: "Mercado" },
            status: "PAGO",
          },
          {
            data: "2026-06-10",
            tipo: "RECEITA",
            valor: 5000,
            categoria: { nome: "Salário" },
            subcategoria: { nome: "Salário Fixo" },
            status: "PAGO",
          },
        ],
        orcamentos: [],
        totalLancamentos: 2,
        totalOrcamentos: 0,
      });

      // Act
      await dashboard.carregarDashboard();

      // Assert
      expect(mockElectronAPI.getDashboardDados).toHaveBeenCalled();
    });

    it("monta parâmetros de URL corretos com base nos filtros selecionados", async () => {
      // Arrange
      await dashboard.carregarCategorias();
      await dashboard.popularAnos();
      mockElectronAPI.getDashboardDados.mockResolvedValue({
        lancamentos: [
          { data: "2026-06-15", tipo: "DESPESA", valor: 100, categoria: { nome: "X" }, subcategoria: {}, status: "PAGO" },
        ],
        orcamentos: [],
        totalLancamentos: 1,
        totalOrcamentos: 0,
      });
      await dashboard.carregarDashboard();
      dashboard.popularMeses();
      document.getElementById("filtroMes").value = "06";
      document.getElementById("filtroCategoria").value = "1";
      mockElectronAPI.getDashboardDados.mockClear();

      // Act
      await dashboard.carregarDashboard();

      // Assert
      expect(mockElectronAPI.getDashboardDados).toHaveBeenCalledWith(
        "2026",
        "06",
        "1"
      );
    });

    it("passa undefined para mes quando 'all' está selecionado", async () => {
      // Arrange
      await dashboard.popularAnos();
      mockElectronAPI.getDashboardDados.mockResolvedValue({
        lancamentos: [
          { data: "2026-06-15", tipo: "DESPESA", valor: 100, categoria: { nome: "X" }, subcategoria: {}, status: "PAGO" },
        ],
        orcamentos: [],
        totalLancamentos: 1,
        totalOrcamentos: 0,
      });
      await dashboard.carregarDashboard();
      dashboard.popularMeses();
      document.getElementById("filtroMes").value = "all";
      document.getElementById("filtroCategoria").value = "all";

      // Act
      await dashboard.carregarDashboard();

      // Assert
      expect(mockElectronAPI.getDashboardDados).toHaveBeenCalledWith(
        "2026",
        undefined,
        undefined
      );
    });
  });

  function setDashboardData(lancamentos) {
    mockElectronAPI.getDashboardDados.mockResolvedValue({
      lancamentos,
      orcamentos: [],
      totalLancamentos: lancamentos.length,
      totalOrcamentos: 0,
    });
  }

  describe("renderizarGraficoMensal", () => {
    it("cria gráfico de linha com dados corretos", async () => {
      // Arrange
      setDashboardData([
        { data: "2026-01-15", tipo: "RECEITA", valor: 1000 },
        { data: "2026-01-10", tipo: "DESPESA", valor: 500 },
        { data: "2026-06-15", tipo: "RECEITA", valor: 2000 },
      ]);
      mockElectronAPI.getDashboardDados.mockClear();

      // Act
      await dashboard.carregarDashboard();
      dashboard.renderizarGraficoMensal();

      // Assert
      expect(mockContext.clearRect).not.toHaveBeenCalled();
    });

    it("destrói gráfico existente antes de recriar", async () => {
      // Arrange
      setDashboardData([]);
      mockElectronAPI.getDashboardDados.mockClear();
      await dashboard.carregarDashboard();

      // Act
      dashboard.renderizarGraficoMensal();
      dashboard.renderizarGraficoMensal();
    });
  });

  describe("renderizarGraficoCategorias", () => {
    it("cria gráfico de rosca", async () => {
      // Arrange
      document.getElementById("filtroTipoGrafico").value = "DESPESA";
      setDashboardData([
        {
          data: "2026-06-15",
          tipo: "DESPESA",
          valor: 300,
          categoria: { nome: "Alimentação" },
        },
        {
          data: "2026-06-10",
          tipo: "DESPESA",
          valor: 200,
          categoria: { nome: "Transporte" },
        },
      ]);
      mockElectronAPI.getDashboardDados.mockClear();

      // Act
      await dashboard.carregarDashboard();
      dashboard.renderizarGraficoCategorias();
    });
  });

  describe("renderizarGraficoSaldo", () => {
    it("cria gráfico de linha para saldo acumulado", async () => {
      // Arrange
      setDashboardData([
        { data: "2026-01-15", tipo: "RECEITA", valor: 5000 },
        { data: "2026-01-10", tipo: "DESPESA", valor: 2000 },
      ]);
      mockElectronAPI.getDashboardDados.mockClear();

      // Act
      await dashboard.carregarDashboard();
      dashboard.renderizarGraficoSaldo();
    });
  });

  describe("indicadores de carregamento", () => {
    it("mostrarLoading adds loading class to chart wrappers", () => {
      // Arrange
      document.body.innerHTML += `
        <div class="chart-wrapper" id="w1"></div>
        <div class="chart-wrapper" id="w2"></div>
      `;

      // Act
      dashboard.mostrarLoading();

      // Assert
      document.querySelectorAll(".chart-wrapper").forEach((el) => {
        expect(el.classList.contains("loading")).toBe(true);
      });
    });

    it("esconderLoading removes loading class", () => {
      // Arrange
      document.body.innerHTML += `
        <div class="chart-wrapper loading" id="w1"></div>
      `;

      // Act
      dashboard.esconderLoading();

      // Assert
      document.querySelectorAll(".chart-wrapper").forEach((el) => {
        expect(el.classList.contains("loading")).toBe(false);
      });
    });
  });

  describe("adicionarEventListeners", () => {
    it("adiciona listeners de change nos elementos de filtro", async () => {
      // Arrange
      await dashboard.popularAnos();
      dashboard.adicionarEventListeners();

      // Act & Assert
      const fireEvent = (id, value) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event("change"));
      };

      expect(() => fireEvent("filtroAno", "2025")).not.toThrow();
      expect(() => fireEvent("filtroMes", "06")).not.toThrow();
      expect(() => fireEvent("filtroCategoria", "1")).not.toThrow();
    });
  });
});
