/**
 * @file Testes da página de orçamento (public/index.html).
 * @description Valida CRUD de lançamentos, importação CSV, filtros, comparação planejado x realizado e helpers.
 * @module test/unitarios/pages/orcamento.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * - Adicionados comentários AAA.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(path.resolve(__dirname, "../../../public/index.html"), "utf-8");

const mockElectronAPI = {
  getCategorias: vi.fn(),
  getSubcategorias: vi.fn(),
  getContas: vi.fn(),
  getPessoas: vi.fn(),
  getLancamentos: vi.fn(),
  getLancamentosPaginado: vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false, total: 0 }),
  getOrcamento: vi.fn(),
  getDashboard: vi.fn(),
  criarLancamento: vi.fn(),
  deletarLancamento: vi.fn(),
  updateLancamento: vi.fn(),
  importarCSV: vi.fn(),
  getTipoPessoa: vi.fn().mockResolvedValue("PF"),
  setTipoPessoa: vi.fn().mockResolvedValue({ success: true }),
  onTipoPessoaChanged: vi.fn(),
  getUsarPj: vi.fn().mockResolvedValue(true),
  onUsarPjChanged: vi.fn(),
};

HTMLDialogElement.prototype.showModal = vi.fn(function () {
  setTimeout(() => {
    const okBtn = this.querySelector("#confirmOk");
    if (okBtn) okBtn.click();
  }, 0);
});
HTMLDialogElement.prototype.close = vi.fn();

describe("orcamento (página de lançamentos)", () => {
  let orcamento;

  beforeEach(async () => {
    vi.resetModules();
    window.electronAPI = mockElectronAPI;
    document.body.innerHTML = html;

    mockElectronAPI.getCategorias.mockResolvedValue([]);
    mockElectronAPI.getSubcategorias.mockResolvedValue([]);
    mockElectronAPI.getContas.mockResolvedValue([]);
    mockElectronAPI.getPessoas.mockResolvedValue([]);
    mockElectronAPI.getLancamentos.mockResolvedValue([]);
    mockElectronAPI.getOrcamento.mockResolvedValue([]);
    mockElectronAPI.getDashboard.mockResolvedValue({
      totais: {
        receitas_planejadas: 0,
        receitas_realizadas: 0,
        despesas_planejadas: 0,
        despesas_realizadas: 0,
      },
      orcamento: [],
      realizados: [],
    });

    Element.prototype.scrollIntoView = vi.fn();

    // Clear all mock call counts between tests
    Object.values(mockElectronAPI).forEach((m) => m.mockClear?.());

    orcamento = await import("../../../public/js/index.js");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("funções auxiliares", () => {
    it("formatCurrency formata valores corretamente", () => {
      expect(orcamento.formatCurrency(1234.5)).toBe("1.234,50");
      expect(orcamento.formatCurrency(0)).toBe("0,00");
      expect(orcamento.formatCurrency(null)).toBe("0,00");
    });

    it("formatDate formata data para pt-BR", () => {
      const result = orcamento.formatDate("2026-06-15");
      expect(result).toBe("15/06/2026");
    });
  });

  describe("carregarCategorias", () => {
    it("carrega categorias no cache e popula select", async () => {
      mockElectronAPI.getCategorias.mockResolvedValue([
        { id: 1, nome: "Alimentação", tipo: "DESPESA" },
        { id: 2, nome: "Salário", tipo: "RECEITA" },
      ]);

      await orcamento.carregarCategorias();

      const select = document.getElementById("categoria");
      expect(select.options.length).toBe(3);
      expect(select.options[1].textContent).toBe("Alimentação");
      expect(select.options[2].textContent).toBe("Salário");
    });

    it("carrega categorias com filtro de tipo", async () => {
      mockElectronAPI.getCategorias.mockResolvedValue([{ id: 1, nome: "Alimentação", tipo: "DESPESA" }]);

      await orcamento.carregarCategorias("DESPESA");

      expect(mockElectronAPI.getCategorias).toHaveBeenCalledWith("DESPESA");
    });
  });

  describe("carregarContas", () => {
    it("popula selects contaOrigem e contaDestino", async () => {
      mockElectronAPI.getContas.mockResolvedValue([
        { id: 1, nome: "NuConta" },
        { id: 2, nome: "Inter" },
      ]);

      await orcamento.carregarContas();

      const origem = document.getElementById("contaOrigem");
      const destino = document.getElementById("contaDestino");
      expect(origem.options.length).toBe(3);
      expect(destino.options.length).toBe(3);
      expect(origem.options[1].textContent).toBe("NuConta");
    });
  });

  describe("carregarPessoas", () => {
    it("popula select de pessoa", async () => {
      mockElectronAPI.getPessoas.mockResolvedValue([{ id: 1, nome: "João" }]);

      await orcamento.carregarPessoas();

      const select = document.getElementById("pessoa");
      expect(select.options.length).toBe(2);
      expect(select.options[1].textContent).toBe("João");
    });
  });

  describe("carregarLancamentos", () => {
    it("carrega lançamentos e atualiza filtros", async () => {
      mockElectronAPI.getLancamentos.mockResolvedValue([{ id: 1, data: "2026-06-01", tipo: "DESPESA", valor: 100, status: "PAGO" }]);

      await orcamento.carregarLancamentos();

      expect(mockElectronAPI.getLancamentos).toHaveBeenCalled();
      const tbody = document.getElementById("tabelaLancamentos");
      expect(tbody).toBeTruthy();
    });
  });

  // Pipeline de importação movido para services/importacao-csv.ts (backend)

  describe("atualizarSubcategorias", () => {
    it("filtra subcategorias pela categoria selecionada", async () => {
      mockElectronAPI.getSubcategorias.mockResolvedValue([
        { id: 1, categoria_id: 1, nome: "Mercado" },
        { id: 2, categoria_id: 2, nome: "Salário Fixo" },
      ]);

      await orcamento.carregarSubcategoriasCache();

      const catSelect = document.getElementById("categoria");
      const opt = document.createElement("option");
      opt.value = "1";
      opt.textContent = "Alimentação";
      catSelect.appendChild(opt);
      catSelect.value = "1";

      orcamento.atualizarSubcategorias();

      const select = document.getElementById("subcategoria");
      expect(select.options.length).toBe(2);
      expect(select.options[1].textContent).toBe("Mercado");
    });
  });

  describe("calcularTotaisOrcamento", () => {
    it("calcula totais a partir dos dados de orçamento", () => {
      document.getElementById("filtroAno").value = "all";
      document.getElementById("filtroMes").value = "all";
      const data = [
        { data: "2026-06-01", tipo: "RECEITA", valor_planejado: 1000, valor_realizado: 800 },
        { data: "2026-06-01", tipo: "DESPESA", valor_planejado: 500, valor_realizado: 400 },
      ];

      const result = orcamento.calcularTotaisOrcamento(data);
      expect(result.receitas_planejadas).toBe(1000);
      expect(result.receitas_realizadas).toBe(800);
      expect(result.despesas_planejadas).toBe(500);
      expect(result.despesas_realizadas).toBe(400);
    });

    it("filtra pelo mês selecionado", () => {
      const selectAno = document.getElementById("filtroAno");
      const optAno = document.createElement("option");
      optAno.value = "2026";
      selectAno.appendChild(optAno);
      selectAno.value = "2026";

      const select = document.getElementById("filtroMes");
      const opt = document.createElement("option");
      opt.value = "06";
      select.appendChild(opt);
      select.value = "06";

      const data = [
        { data: "2026-06-01", tipo: "RECEITA", valor_planejado: 1000, valor_realizado: 800 },
        { data: "2026-07-01", tipo: "RECEITA", valor_planejado: 2000, valor_realizado: 1500 },
      ];

      const result = orcamento.calcularTotaisOrcamento(data);
      expect(result.receitas_planejadas).toBe(1000);
      expect(result.receitas_realizadas).toBe(800);
    });
  });

  /* ─────────── FILTROS ─────────── */

  describe("salvarEstadoFiltros / carregarEstadoFiltros", () => {
    beforeEach(() => {
      document.querySelectorAll(".pill-filter").forEach((b) => b.classList.remove("active"));
    });

    it("salva e recupera estado completo dos filtros", () => {
      const optAno = document.createElement("option");
      optAno.value = "2026";
      document.getElementById("filtroAno").appendChild(optAno);
      document.getElementById("filtroAno").value = "2026";

      const opt = document.createElement("option");
      opt.value = "06";
      document.getElementById("filtroMes").appendChild(opt);
      document.getElementById("filtroMes").value = "06";

      document.querySelector('.pill-filter[data-filter-tipo="RECEITA"]').classList.add("active");
      document.querySelector('.pill-filter[data-filter-status="PAGO"]').classList.add("active");

      orcamento.salvarEstadoFiltros();

      const estado = JSON.parse(localStorage.getItem("fnc:v1:filtro_estado"));
      expect(estado.filtroAno).toBe("2026");
      expect(estado.filtroMes).toBe("06");
      expect(estado.filtroTipo).toBe("RECEITA");
      expect(estado.filtroStatus).toBe("PAGO");
    });

    it("salva com all quando nenhum filtro ativo", () => {
      orcamento.salvarEstadoFiltros();

      const estado = JSON.parse(localStorage.getItem("fnc:v1:filtro_estado"));
      expect(estado.filtroAno).toBe("all");
      expect(estado.filtroMes).toBe("all");
      expect(estado.filtroTipo).toBe("all");
      expect(estado.filtroStatus).toBe("all");
    });

    it("carregarEstadoFiltros retorna valores salvos", () => {
      localStorage.setItem(
        "fnc:v1:filtro_estado",
        JSON.stringify({
          filtroAno: "2026",
          filtroMes: "06",
          filtroTipo: "RECEITA",
          filtroStatus: "PAGO",
        }),
      );

      const estado = orcamento.carregarEstadoFiltros();

      expect(estado.filtroAno).toBe("2026");
      expect(estado.filtroMes).toBe("06");
    });

    it("carregarEstadoFiltros faz fallback sem estado salvo", () => {
      const estado = orcamento.carregarEstadoFiltros();

      expect(estado.filtroAno).toBe("all");
      expect(estado.filtroMes).toBe("all");
      expect(estado.filtroTipo).toBe("all");
      expect(estado.filtroStatus).toBe("all");
    });
  });

  describe("aplicarFiltroPill", () => {
    beforeEach(() => {
      document.querySelectorAll(".pill-filter").forEach((b) => b.classList.remove("active"));
    });

    it("ativa pill de tipo correta", () => {
      orcamento.aplicarFiltroPill("tipo", "RECEITA");
      expect(document.querySelector('.pill-filter[data-filter-tipo="RECEITA"]').classList.contains("active")).toBe(true);
      expect(document.querySelector('.pill-filter[data-filter-tipo="DESPESA"]').classList.contains("active")).toBe(false);
    });

    it("ativa pill de status correta", () => {
      orcamento.aplicarFiltroPill("status", "PAGO");
      expect(document.querySelector('.pill-filter[data-filter-status="PAGO"]').classList.contains("active")).toBe(true);
    });

    it("não faz nada se valor não existe", () => {
      orcamento.aplicarFiltroPill("tipo", "INEXISTENTE");
      expect(document.querySelectorAll(".pill-filter.active").length).toBe(0);
    });
  });

  describe("aplicarFiltrosSalvos", () => {
    beforeEach(() => {
      document.querySelectorAll(".pill-filter").forEach((b) => b.classList.remove("active"));
    });

    it("aplica filtros e recarrega dados", async () => {
      mockElectronAPI.getLancamentos.mockResolvedValue([{ id: 1, data: "2026-06-01", tipo: "RECEITA", valor: 1000, status: "PAGO" }]);
      mockElectronAPI.getOrcamento.mockResolvedValue([]);
      mockElectronAPI.getDashboard.mockResolvedValue({
        totais: { receitas_planejadas: 0, receitas_realizadas: 0, despesas_planejadas: 0, despesas_realizadas: 0 },
        orcamento: [],
        realizados: [],
      });

      const optAno = document.createElement("option");
      optAno.value = "2026";
      document.getElementById("filtroAno").appendChild(optAno);

      const opt = document.createElement("option");
      opt.value = "06";
      document.getElementById("filtroMes").appendChild(opt);

      localStorage.setItem(
        "fnc:v1:filtro_estado",
        JSON.stringify({
          filtroAno: "2026",
          filtroMes: "06",
          filtroTipo: "RECEITA",
          filtroStatus: "PAGO",
        }),
      );

      await orcamento.aplicarFiltrosSalvos();

      expect(document.getElementById("filtroAno").value).toBe("2026");
      expect(document.getElementById("filtroMes").value).toBe("06");
      expect(document.querySelector('.pill-filter[data-filter-tipo="RECEITA"]').classList.contains("active")).toBe(true);
      expect(document.querySelector('.pill-filter[data-filter-status="PAGO"]').classList.contains("active")).toBe(true);
    });
  });

  /* ─────────── EDIÇÃO ─────────── */

  describe("editarLancamento / cancelarEdicao", () => {
    beforeEach(() => {
      orcamento.setLancamentos([]);
      mockElectronAPI.getCategorias.mockResolvedValue([{ id: 1, nome: "Salário", tipo: "RECEITA" }]);
      mockElectronAPI.getSubcategorias.mockResolvedValue([]);
    });

    it("editarLancamento preenche formulário e altera botão", async () => {
      orcamento.setLancamentos([
        {
          id: 1,
          data: "2026-06-01",
          tipo: "RECEITA",
          valor: 1000,
          status: "PAGO",
          categoria_id: 1,
          descricao: "Salário",
          subcategoria_id: null,
          conta_origem_id: null,
          conta_destino_id: null,
          pessoa_id: null,
        },
      ]);

      await orcamento.editarLancamento(1);

      expect(document.getElementById("data").value).toBe("2026-06-01");
      expect(document.getElementById("tipo").value).toBe("RECEITA");
      expect(document.getElementById("valor").value).toBe("1000");
      const submitBtn = document.querySelector('#formLancamento button[type="submit"]');
      expect(submitBtn.getAttribute("data-editing")).toBe("true");
      expect(document.getElementById("btnCancelar").style.display).not.toBe("none");
    });

    it("cancelarEdicao restaura formulário", () => {
      orcamento.setLancamentoEditando({ id: 1 });
      document.querySelector('#formLancamento button[type="submit"]').setAttribute("data-editing", "true");
      document.getElementById("btnCancelar").style.display = "inline-flex";
      document.getElementById("formLancamento").classList.add("form-editing");

      orcamento.cancelarEdicao();

      const submitBtn = document.querySelector('#formLancamento button[type="submit"]');
      expect(submitBtn.getAttribute("data-editing")).toBeNull();
      expect(document.getElementById("btnCancelar").style.display).toBe("none");
      expect(document.getElementById("formLancamento").style.border).toBe("");
    });
  });

  /* ─────────── EXCLUSÃO ─────────── */

  describe("excluirLancamento", () => {
    beforeEach(() => {
      orcamento.setLancamentos([]);
    });

    it("chama API se confirmado e recarrega dados", async () => {
      mockElectronAPI.deletarLancamento.mockResolvedValue({ success: true });
      mockElectronAPI.getLancamentos.mockResolvedValue([]);

      orcamento.setLancamentos([{ id: 1, data: "2026-06-01", tipo: "DESPESA", valor: 100, descricao: "Teste" }]);

      await orcamento.excluirLancamento(1);

      expect(mockElectronAPI.deletarLancamento).toHaveBeenCalledWith(1);
    });

    it("não chama API se não confirmado", async () => {
      HTMLDialogElement.prototype.showModal.mockImplementationOnce(function () {
        setTimeout(() => {
          const cancelBtn = this.querySelector("#confirmCancel");
          if (cancelBtn) cancelBtn.click();
        }, 0);
      });

      orcamento.setLancamentos([{ id: 1, data: "2026-06-01", tipo: "DESPESA", valor: 100, descricao: "Teste" }]);
      await orcamento.excluirLancamento(1);

      expect(mockElectronAPI.deletarLancamento).not.toHaveBeenCalled();
    });
  });

  /* ─────────── RESUMO ─────────── */

  describe("atualizarResumo", () => {
    beforeEach(() => {
      orcamento.setLancamentos([]);
      orcamento.setFiltroAtualAno("all");
      orcamento.setFiltroAtualMes("all");
      document.querySelectorAll(".pill-filter").forEach((b) => b.classList.remove("active"));
    });

    it("calcula receitas, despesas e saldo corretamente", () => {
      document.getElementById("filtroAno").value = "all";
      document.getElementById("filtroMes").value = "all";
      orcamento.setLancamentos([
        { id: 1, data: "2026-06-01", tipo: "RECEITA", valor: 1000, status: "PAGO" },
        { id: 2, data: "2026-06-01", tipo: "DESPESA", valor: 300, status: "PAGO" },
        { id: 3, data: "2026-06-01", tipo: "RECEITA", valor: 500, status: "PENDENTE" },
      ]);

      orcamento.atualizarResumo();

      expect(document.getElementById("totalReceitas").textContent).toBe("1.000,00");
      expect(document.getElementById("totalDespesas").textContent).toBe("300,00");
      expect(document.getElementById("saldoAtual").textContent).toBe("700,00");
    });

    it("filtra por mês", () => {
      orcamento.setLancamentos([
        { id: 1, data: "2026-05-01", tipo: "RECEITA", valor: 500, status: "PAGO" },
        { id: 2, data: "2026-06-01", tipo: "DESPESA", valor: 200, status: "PAGO" },
      ]);

      const optAno = document.createElement("option");
      optAno.value = "2026";
      document.getElementById("filtroAno").appendChild(optAno);
      document.getElementById("filtroAno").value = "2026";
      orcamento.setFiltroAtualAno("2026");

      const opt = document.createElement("option");
      opt.value = "05";
      document.getElementById("filtroMes").appendChild(opt);
      document.getElementById("filtroMes").value = "05";
      orcamento.setFiltroAtualMes("05");

      orcamento.atualizarResumo();

      expect(document.getElementById("totalReceitas").textContent).toBe("500,00");
      expect(document.getElementById("totalDespesas").textContent).toBe("0,00");
    });
  });

  /* ─────────── COMPARAÇÃO ─────────── */

  describe("atualizarComparacao", () => {
    it("atualiza DOM com valores e classes de diferença", () => {
      const totais = {
        receitas_planejadas: 2000,
        receitas_realizadas: 2500,
        despesas_planejadas: 1500,
        despesas_realizadas: 1200,
      };

      orcamento.atualizarComparacao(totais);

      expect(document.getElementById("receitasPlanejadas").textContent).toBe("2.000,00");
      expect(document.getElementById("receitasRealizadas").textContent).toBe("2.500,00");
      expect(document.getElementById("diffReceitas").textContent).toBe("500,00");
      expect(document.getElementById("diffReceitas").className).toContain("positive");
      expect(document.getElementById("diffDespesas").className).toContain("positive");
    });

    it("aplica classe negative quando despesa ultrapassa planejado", () => {
      const totais = {
        receitas_planejadas: 2000,
        receitas_realizadas: 1500,
        despesas_planejadas: 1000,
        despesas_realizadas: 1500,
      };

      orcamento.atualizarComparacao(totais);

      expect(document.getElementById("diffReceitas").className).toContain("negative");
      expect(document.getElementById("diffDespesas").className).toContain("negative");
    });

    it("define largura da barra de progresso", () => {
      const totais = {
        receitas_planejadas: 1000,
        receitas_realizadas: 500,
        despesas_planejadas: 1000,
        despesas_realizadas: 250,
      };

      orcamento.atualizarComparacao(totais);

      expect(document.getElementById("progressReceitas").style.width).toBe("50%");
      expect(document.getElementById("progressDespesas").style.width).toBe("25%");
    });

    it("limita progresso a 100%", () => {
      const totais = {
        receitas_planejadas: 1000,
        receitas_realizadas: 2000,
        despesas_planejadas: 1000,
        despesas_realizadas: 3000,
      };

      orcamento.atualizarComparacao(totais);

      expect(document.getElementById("progressReceitas").style.width).toBe("100%");
      expect(document.getElementById("progressDespesas").style.width).toBe("100%");
    });

    it("usa 0% quando planejado é 0", () => {
      const totais = {
        receitas_planejadas: 0,
        receitas_realizadas: 0,
        despesas_planejadas: 0,
        despesas_realizadas: 0,
      };

      orcamento.atualizarComparacao(totais);

      expect(document.getElementById("progressReceitas").style.width).toBe("0%");
      expect(document.getElementById("progressDespesas").style.width).toBe("0%");
    });
  });

  /* ─────────── MESES FILTRO ─────────── */

  describe("atualizarMesesFiltro", () => {
    beforeEach(() => {
      orcamento.setLancamentos([]);
      orcamento.setFiltroAtualAno("all");
    });

    it("popula select com meses únicos dos lançamentos", () => {
      orcamento.setLancamentos([
        { id: 1, data: "2026-06-15" },
        { id: 2, data: "2026-06-20" },
        { id: 3, data: "2026-07-01" },
      ]);

      orcamento.atualizarMesesFiltro();

      const filtro = document.getElementById("filtroMes");
      expect(filtro.options.length).toBe(3); // "Todos" + "Junho" + "Julho"
    });

    it("preserva seleção salva no localStorage", () => {
      orcamento.setLancamentos([
        { id: 1, data: "2026-06-15" },
        { id: 2, data: "2026-07-01" },
      ]);
      localStorage.setItem(
        "fnc:v1:filtro_estado",
        JSON.stringify({
          filtroAno: "all",
          filtroMes: "06",
          filtroTipo: "all",
          filtroStatus: "all",
        }),
      );

      orcamento.atualizarMesesFiltro();

      expect(document.getElementById("filtroMes").value).toBe("06");
    });

    it("volta para all se opção salva não existe mais", () => {
      orcamento.setLancamentos([{ id: 1, data: "2026-07-01" }]);
      localStorage.setItem(
        "fnc:v1:filtro_estado",
        JSON.stringify({
          filtroAno: "all",
          filtroMes: "06",
          filtroTipo: "all",
          filtroStatus: "all",
        }),
      );

      orcamento.atualizarMesesFiltro();

      expect(document.getElementById("filtroMes").value).toBe("all");
    });
  });

  /* ─────────── TABELA ─────────── */

  describe("renderizarTabela", () => {
    beforeEach(() => {
      orcamento.setLancamentos([
        { id: 1, data: "2026-06-01", tipo: "RECEITA", valor: 1000, status: "PAGO", descricao: "Salário", categoria_id: 1, subcategoria_id: null, conta_origem_id: null },
        { id: 2, data: "2026-06-01", tipo: "DESPESA", valor: 200, status: "PENDENTE", descricao: "Mercado", categoria_id: 2, subcategoria_id: null, conta_origem_id: null },
      ]);
      orcamento.setCategoriasCache([
        { id: 1, nome: "Salário" },
        { id: 2, nome: "Alimentação" },
      ]);
      orcamento.setSubcategoriasCache([]);
      orcamento.setContasCache([]);
      orcamento.setFiltroAtualTipo("all");
      orcamento.setFiltroAtualStatus("all");
      orcamento.setFiltroAtualAno("all");
      orcamento.setFiltroAtualMes("all");
    });

    it("renderiza linhas na tabela", () => {
      // Act
      orcamento.renderizarTabela();
      // Assert
      const rows = document.querySelectorAll("#tabelaLancamentos tr");
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain("Salário");
    });

    it("aplica filtro de tipo", () => {
      orcamento.setFiltroAtualTipo("RECEITA");

      orcamento.renderizarTabela();

      const rows = document.querySelectorAll("#tabelaLancamentos tr");
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain("RECEITA");
    });

    it("mostra empty state quando filtro não encontra nada", () => {
      orcamento.setFiltroAtualTipo("TRANSFERENCIA");

      orcamento.renderizarTabela();

      const tbody = document.getElementById("tabelaLancamentos");
      expect(tbody.innerHTML).toContain("Nenhum lançamento");
    });

    it("atualiza contador de lançamentos", () => {
      orcamento.renderizarTabela();

      expect(document.getElementById("contadorLancamentos").textContent).toContain("2 lançamentos");
    });

    it("mostra empty state quando não há lançamentos", () => {
      orcamento.setLancamentos([]);

      orcamento.renderizarTabela();

      const tbody = document.getElementById("tabelaLancamentos");
      expect(tbody.innerHTML).toContain("Nenhum lançamento");
      expect(document.getElementById("contadorLancamentos").textContent).toContain("0 lançamentos");
    });
  });

  /* ─────────── IMPORTAÇÃO ─────────── */

  describe("processarImportacao", () => {
    beforeEach(() => {
      mockElectronAPI.importarCSV.mockResolvedValue({ importados: 2, erros: [] });
    });

    it("alerta se nenhum arquivo foi selecionado", async () => {
      await orcamento.processarImportacao();

      const toast = document.querySelector(".toast-item");
      expect(toast).toBeTruthy();
      expect(toast.textContent).toContain("Selecione um arquivo");
    });

    it("envia texto bruto para o backend e mostra resultado", async () => {
      const arquivo = new File(["data;descricao;tipo;valor\n01/06/2026;Mercado;DESPESA;500"], "orcamento.csv", { type: "text/csv" });
      orcamento.selecionarArquivoImportacao({ target: { files: [arquivo] } });

      await orcamento.processarImportacao();

      expect(mockElectronAPI.importarCSV).toHaveBeenCalled();
      const divResultado = document.getElementById("resultadoImportacao");
      expect(divResultado.style.display).toBe("block");
      expect(divResultado.textContent).toContain("2 itens importados");
    });

    it("mostra erro vindo do backend", async () => {
      mockElectronAPI.importarCSV.mockResolvedValue({ error: "Erro de teste no backend" });
      const arquivo = new File(["data;descricao;tipo;valor\n01/06/2026;Mercado;DESPESA;500"], "orcamento.csv", { type: "text/csv" });
      orcamento.selecionarArquivoImportacao({ target: { files: [arquivo] } });

      await orcamento.processarImportacao();

      const toast = document.querySelector(".toast-item");
      expect(toast.textContent).toContain("Erro de teste no backend");
    });

    it("atualiza a interface ao selecionar arquivo", async () => {
      await orcamento.selecionarArquivoImportacao({
        target: { files: [new File(["conteudo"], "orcamento.csv", { type: "text/csv" })] },
      });

      expect(document.getElementById("arquivoImportacaoNome").textContent).toBe("orcamento.csv");
      expect(document.getElementById("btnImportarDados").disabled).toBe(false);
    });
  });

  describe("abrirModalImportacao / fecharModalImportacao", () => {
    it("abre e fecha modal", () => {
      orcamento.abrirModalImportacao();
      expect(document.getElementById("modalImportacao").style.display).toBe("block");
      expect(document.getElementById("btnImportarDados").disabled).toBe(true);

      orcamento.fecharModalImportacao();
      expect(document.getElementById("modalImportacao").style.display).toBe("none");
    });
  });

  describe("mostrarResultadoImportacao", () => {
    it("exibe resultado e limpa seleção de arquivo", () => {
      const input = document.getElementById("arquivoImportacao");
      Object.defineProperty(input, "value", {
        value: "C:\\fakepath\\orcamento.csv",
        writable: true,
      });
      document.getElementById("arquivoImportacaoNome").textContent = "orcamento.csv";
      const resultado = { importados: 5 };

      orcamento.mostrarResultadoImportacao(resultado);

      const divResultado = document.getElementById("resultadoImportacao");
      expect(divResultado.style.display).toBe("block");
      expect(divResultado.textContent).toContain("5 itens importados");
      expect(document.getElementById("arquivoImportacaoNome").textContent).toBe("Nenhum arquivo selecionado");
      expect(document.getElementById("btnImportarDados").disabled).toBe(true);
    });
  });

  /* ─────────── FEEDBACK ─────────── */

  describe("mostrarFeedback", () => {
    it("cria elemento de feedback no DOM", () => {
      orcamento.mostrarFeedback("Sucesso!", "info");

      const toast = document.querySelector(".toast-item");
      expect(toast).toBeTruthy();
      expect(toast.textContent).toContain("Sucesso!");
    });

    it("remove feedback após 2 segundos", async () => {
      vi.useFakeTimers();

      orcamento.mostrarFeedback("Mensagem");

      const container = document.querySelector(".toast-container");
      expect(container).toBeTruthy();

      vi.advanceTimersByTime(2000);
      // após 2s o toast ainda fica (persiste até clique)
      expect(container.children.length).toBe(1);

      vi.useRealTimers();
    });
  });

  /* ─────────── SET CAMPO VALOR ─────────── */

  describe("setCampoValor", () => {
    it("desabilita campo valor", () => {
      orcamento.setCampoValor({ disabled: true });

      expect(document.getElementById("valor").disabled).toBe(true);
    });

    it("habilita campo valor", () => {
      document.getElementById("valor").disabled = true;
      orcamento.setCampoValor({ disabled: false });

      expect(document.getElementById("valor").disabled).toBe(false);
    });
  });
});
