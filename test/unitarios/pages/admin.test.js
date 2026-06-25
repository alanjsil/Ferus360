/**
 * @file Testes da página de administração (public/admin.html).
 * @description Valida o fluxo de dashboard, clientes, chamados, categorias globais e redefinição de senha do admin.
 * @module test/unitarios/pages/admin.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * - Adicionados comentários AAA.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(path.resolve(__dirname, "../../../public/admin.html"), "utf-8");

HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();

vi.mock("../../../public/js/auth-guard.js", () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue({
    token: "token",
    usuario: { id: "admin-1", nome: "Admin", email: "admin@t.com", role: "admin" },
  }),
  escapeHtml: (str) => {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
  clearAuthSession: vi.fn(),
  getAccessToken: vi.fn(() => "token"),
}));

function baseMocks() {
  return {
    adminGetDashboard: vi.fn().mockResolvedValue({
      totalReceitas: 10000,
      totalDespesas: 5000,
      saldo: 5000,
      totalUsuariosAtivos: 10,
    }),
    adminGetClientes: vi.fn().mockResolvedValue({ dados: [], total: 0, pagina: 1, totalPaginas: 0, itensPorPagina: 10 }),
    adminToggleCliente: vi.fn(),
    adminGetResumoCliente: vi.fn(),
    adminGetTransacoesCliente: vi.fn(),

    adminResetSenha: vi.fn(),
    adminGetChamados: vi.fn().mockResolvedValue([]),
    adminResponderChamado: vi.fn(),
    adminUpdateChamado: vi.fn(),
    adminGetAuditoria: vi.fn().mockResolvedValue([]),
    adminCriarUsuario: vi.fn(),
    listarCategorias: vi.fn().mockResolvedValue([]),
    updateCategoria: vi.fn(),
    criarCategoria: vi.fn(),
    toggleCategoriaAtivo: vi.fn(),
    logout: vi.fn(),
  };
}

async function loadModule() {
  vi.resetModules();
  await import("../../../public/js/admin.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));
}

describe("admin (página administrativa)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = html;
    window.electronAPI = baseMocks();
    vi.stubGlobal("alert", vi.fn());
  });

  describe("inicialização", () => {
    beforeEach(async () => {
      await loadModule();
    });

    it("chama ensureAuthenticated com requireAdmin", async () => {
      // Assert
      const auth = await import("../../../public/js/auth-guard.js");
      expect(auth.ensureAuthenticated).toHaveBeenCalledWith({ requireAdmin: true });
    });

    it("carrega dashboard", () => {
      expect(window.electronAPI.adminGetDashboard).toHaveBeenCalled();
    });

    it("carrega clientes", () => {
      expect(window.electronAPI.adminGetClientes).toHaveBeenCalled();
    });

    it("carrega chamados", () => {
      expect(window.electronAPI.adminGetChamados).toHaveBeenCalled();
    });

    it("carrega categorias globais", () => {
      expect(window.electronAPI.listarCategorias).toHaveBeenCalled();
    });
  });

  describe("dashboard", () => {
    beforeEach(async () => {
      await loadModule();
    });

    it("exibe valores dos cards", async () => {
      await vi.waitFor(() => {
        expect(document.getElementById("dashReceitas").textContent).toContain("10.000,00");
        expect(document.getElementById("dashDespesas").textContent).toContain("5.000,00");
        expect(document.getElementById("dashSaldo").textContent).toContain("5.000,00");
        expect(document.getElementById("dashUsuarios").textContent).toBe("10");
      });
    });

    it("aplica classes positivo/negativo corretamente", async () => {
      await vi.waitFor(() => {
        expect(document.getElementById("dashReceitas").className).toContain("positivo");
        expect(document.getElementById("dashDespesas").className).toContain("negativo");
        expect(document.getElementById("dashSaldo").className).toContain("positivo");
      });
    });
  });

  describe("navegação por abas", () => {
    beforeEach(async () => {
      await loadModule();
    });

    it("ativa aba ao clicar nav-item", () => {
      const tabBtn = document.querySelector('[data-tab="clientes"]');
      tabBtn.click();
      expect(tabBtn.classList.contains("active")).toBe(true);
      expect(document.getElementById("tab-dashboard").classList.contains("active")).toBe(false);
      expect(document.getElementById("tab-clientes").classList.contains("active")).toBe(true);
    });
  });

  describe("clientes", () => {
    it("renderiza clientes na tabela", async () => {
      // Arrange
      window.electronAPI.adminGetClientes = vi.fn().mockResolvedValue({
        dados: [
          { id: "u1", nome: "João", email: "joao@t.com", criado_em: "2025-01-01T10:00:00Z", ativo: true },
          { id: "u2", nome: "Maria", email: "maria@t.com", criado_em: "2025-02-01T10:00:00Z", ativo: false },
        ],
        total: 2, pagina: 1, totalPaginas: 1, itensPorPagina: 10,
      });
      // Act
      await loadModule();
      // Assert
      await vi.waitFor(() => {
        const rows = document.querySelectorAll("#clientesBody tr");
        expect(rows.length).toBe(2);
        expect(rows[0].textContent).toContain("João");
      });
    });

    it("mostra empty state quando não há clientes", async () => {
      await loadModule();
      await vi.waitFor(() => {
        expect(document.getElementById("clientesEmpty").hidden).toBe(false);
      });
    });

    it("mostra erro ao carregar clientes", async () => {
      window.electronAPI.adminGetClientes = vi.fn().mockRejectedValue(new Error("fail"));
      await loadModule();
      await vi.waitFor(() => {
        expect(document.getElementById("clientesBody").innerHTML).toContain("Erro");
      });
    });

    it("abre resumo ao clicar Visualizar", async () => {
      // Arrange
      window.electronAPI.adminGetClientes = vi.fn().mockResolvedValue({
        dados: [{ id: "u1", nome: "João", email: "joao@t.com", criado_em: "2025-01-01T10:00:00Z", ativo: true }],
        total: 1, pagina: 1, totalPaginas: 1, itensPorPagina: 10,
      });
      window.electronAPI.adminGetResumoCliente = vi.fn().mockResolvedValue({
        lancamentos: [],
        orcamento: [],
      });
      // Act
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-visualizar]")).toBeTruthy();
      });
      document.querySelector("[data-visualizar]").click();
      // Assert
      await vi.waitFor(() => {
        expect(window.electronAPI.adminGetResumoCliente).toHaveBeenCalledWith("u1", "PF");
      });
    });
  });

  describe("categorias globais", () => {
    it("abre formulário inline", async () => {
      await loadModule();
      expect(document.getElementById("inlineCatGlobal").hidden).toBe(true);
      document.getElementById("novaCatGlobalBtn").click();
      expect(document.getElementById("inlineCatGlobal").hidden).toBe(false);
    });

    it("fecha formulário ao cancelar", async () => {
      await loadModule();
      document.getElementById("novaCatGlobalBtn").click();
      document.getElementById("cancelarCatGlobal").click();
      expect(document.getElementById("inlineCatGlobal").hidden).toBe(true);
    });

    it("mostra erro se nome tem menos de 2 caracteres", async () => {
      await loadModule();
      document.getElementById("novaCatGlobalBtn").click();
      document.getElementById("newCatGlobalNome").value = "A";
      document.getElementById("salvarCatGlobal").click();
      expect(document.getElementById("catGlobalMessage").textContent).toBe("Nome precisa ter entre 2 e 40 caracteres.");
    });

    it("cria categoria global via API", async () => {
      // Arrange
      window.electronAPI.criarCategoria = vi.fn().mockResolvedValue({
        id: "cg1",
        nome: "Global",
        tipo: "RECEITA",
        eh_global: true,
        ativo: true,
      });
      // Act
      await loadModule();
      document.getElementById("novaCatGlobalBtn").click();
      document.getElementById("newCatGlobalNome").value = "Global";
      document.getElementById("salvarCatGlobal").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.criarCategoria).toHaveBeenCalledWith({
          nome: "Global",
          tipo: "RECEITA",
          eh_global: true,
        });
      });
    });

    it("renderiza categorias globais com badge Ativo/Inativo", async () => {
      window.electronAPI.listarCategorias = vi.fn().mockResolvedValue([
        { id: "cg1", nome: "Global A", tipo: "RECEITA", eh_global: true, ativo: true },
        { id: "cg2", nome: "Global B", tipo: "DESPESA", eh_global: true, ativo: false },
      ]);
      await loadModule();
      await vi.waitFor(() => {
        const rows = document.querySelectorAll("#catGlobalBody tr");
        expect(rows.length).toBe(2);
      });
    });
  });

  describe("redefinição de senha", () => {
    it("mostra empty se busca está vazia", async () => {
      await loadModule();
      document.getElementById("buscaRedefinir").value = "";
      document.getElementById("btnBuscarRedefinir").click();
      expect(document.getElementById("redefinirEmpty").hidden).toBe(false);
    });

    it("busca usuários e exibe resultados", async () => {
      window.electronAPI.adminGetClientes = vi.fn().mockResolvedValue({ dados: [{ id: "u1", nome: "João", email: "joao@t.com", role: "user" }], total: 1, pagina: 1, totalPaginas: 1, itensPorPagina: 500 });
      await loadModule();
      document.getElementById("buscaRedefinir").value = "João";
      document.getElementById("btnBuscarRedefinir").click();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-reset]")).toBeTruthy();
      });
      expect(document.querySelector(".user-card").textContent).toContain("João");
    });

    it("chama adminResetSenha ao clicar Redefinir", async () => {
      window.electronAPI.adminGetClientes = vi.fn().mockResolvedValue({ dados: [{ id: "u1", nome: "João", email: "joao@t.com", role: "user" }], total: 1, pagina: 1, totalPaginas: 1, itensPorPagina: 500 });
      window.electronAPI.adminResetSenha = vi.fn().mockResolvedValue({
        success: true,
        message: "Email de recuperação enviado",
      });
      await loadModule();
      document.getElementById("buscaRedefinir").value = "João";
      document.getElementById("btnBuscarRedefinir").click();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-reset]")).toBeTruthy();
      });
      document.querySelector("[data-reset]").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.adminResetSenha).toHaveBeenCalledWith("u1");
      });
    });
  });

  describe("chamados", () => {
    it("renderiza chamados na tabela", async () => {
      window.electronAPI.adminGetChamados = vi
        .fn()
        .mockResolvedValue([
          { id: "ch1", usuario_nome: "João", usuario_email: "joao@t.com", titulo: "Ajuda", status: "aberto", criado_em: "2025-01-01T10:00:00Z", descricao: "Preciso de ajuda", respostas: [] },
        ]);
      await loadModule();
      await vi.waitFor(() => {
        const rows = document.querySelectorAll("#chamadosBody tr");
        expect(rows.length).toBe(1);
      });
    });

    it("mostra badge com contagem de chamados abertos", async () => {
      window.electronAPI.adminGetChamados = vi.fn().mockResolvedValue([
        { id: "ch1", usuario_nome: "João", titulo: "Ajuda", status: "aberto" },
        { id: "ch2", usuario_nome: "Maria", titulo: "Bug", status: "em_andamento" },
        { id: "ch3", usuario_nome: "José", titulo: "Ok", status: "resolvido" },
      ]);
      await loadModule();
      await vi.waitFor(() => {
        const badge = document.getElementById("chamadosCount");
        expect(badge.textContent).toBe("2");
        expect(badge.hidden).toBe(false);
      });
    });

    it("oculta badge quando não há chamados abertos", async () => {
      await loadModule();
      await vi.waitFor(() => {
        const badge = document.getElementById("chamadosCount");
        expect(badge.textContent).toBe("0");
        expect(badge.hidden).toBe(true);
      });
    });

    it("abre atendimento ao clicar Atender", async () => {
      window.electronAPI.adminGetChamados = vi
        .fn()
        .mockResolvedValue([
          { id: "ch1", usuario_nome: "João", usuario_email: "joao@t.com", titulo: "Ajuda", status: "aberto", criado_em: "2025-01-01T10:00:00Z", descricao: "Preciso de ajuda", respostas: [] },
        ]);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-atender]")).toBeTruthy();
      });
      document.querySelector("[data-atender]").click();
      expect(document.getElementById("chamadoDialog").showModal).toHaveBeenCalled();
      expect(document.getElementById("chamadoUsuario").textContent).toBe("João");
    });

    it("enviarRespostaChamado mostra erro sem mensagem", async () => {
      window.electronAPI.adminGetChamados = vi
        .fn()
        .mockResolvedValue([{ id: "ch1", usuario_nome: "João", usuario_email: "joao@t.com", titulo: "Ajuda", status: "aberto", criado_em: "2025-01-01T10:00:00Z", descricao: "Ajuda", respostas: [] }]);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-atender]")).toBeTruthy();
      });
      document.querySelector("[data-atender]").click();
      document.getElementById("chamadoRespostaInput").value = "";
      document.getElementById("chamadoNovoStatus").value = "em_andamento";
      document.getElementById("enviarRespostaChamado").click();
      expect(document.getElementById("chamadoMessage").textContent).toBe("Escreva uma resposta ou marque como resolvido.");
    });

    it("enviarRespostaChamado envia resposta e atualiza status", async () => {
      window.electronAPI.adminGetChamados = vi
        .fn()
        .mockResolvedValue([{ id: "ch1", usuario_nome: "João", usuario_email: "joao@t.com", titulo: "Ajuda", status: "aberto", criado_em: "2025-01-01T10:00:00Z", descricao: "Ajuda", respostas: [] }]);
      window.electronAPI.adminResponderChamado = vi.fn().mockResolvedValue({ success: true });
      window.electronAPI.adminUpdateChamado = vi.fn().mockResolvedValue({ success: true });
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-atender]")).toBeTruthy();
      });
      document.querySelector("[data-atender]").click();
      document.getElementById("chamadoRespostaInput").value = "Respondido";
      document.getElementById("enviarRespostaChamado").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.adminResponderChamado).toHaveBeenCalledWith("ch1", "Respondido");
      });
    });

    it("enviarRespostaChamado fecha dialog ao enviar resposta", async () => {
      window.electronAPI.adminGetChamados = vi
        .fn()
        .mockResolvedValue([{ id: "ch1", usuario_nome: "João", titulo: "Ajuda", status: "aberto", criado_em: "2025-01-01T10:00:00Z", descricao: "Ajuda", respostas: [] }]);
      window.electronAPI.adminResponderChamado = vi.fn().mockResolvedValue({ success: true });
      window.electronAPI.adminUpdateChamado = vi.fn().mockResolvedValue({ success: true });
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-atender]")).toBeTruthy();
      });
      document.querySelector("[data-atender]").click();
      document.getElementById("chamadoRespostaInput").value = "Resposta";
      document.getElementById("enviarRespostaChamado").click();
      await vi.waitFor(() => {
        expect(document.getElementById("chamadoDialog").close).toHaveBeenCalled();
      });
    });

    it("exibe histórico de respostas ao abrir chamado", async () => {
      window.electronAPI.adminGetChamados = vi.fn().mockResolvedValue([
        {
          id: "ch1",
          usuario_nome: "João",
          titulo: "Ajuda",
          status: "aberto",
          criado_em: "2025-01-01T10:00:00Z",
          descricao: "Ajuda",
          respostas: [{ admin_nome: "Admin", mensagem: "Ok", criado_em: "2025-01-02T10:00:00Z" }],
        },
      ]);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-atender]")).toBeTruthy();
      });
      document.querySelector("[data-atender]").click();
      expect(document.getElementById("chamadoHistorico").hidden).toBe(false);
      expect(document.getElementById("chamadoHistoricoLista").textContent).toContain("Ok");
    });

    it("oculta histórico quando não há respostas", async () => {
      window.electronAPI.adminGetChamados = vi
        .fn()
        .mockResolvedValue([{ id: "ch1", usuario_nome: "João", titulo: "Ajuda", status: "aberto", criado_em: "2025-01-01T10:00:00Z", descricao: "Ajuda", respostas: [] }]);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-atender]")).toBeTruthy();
      });
      document.querySelector("[data-atender]").click();
      expect(document.getElementById("chamadoHistorico").hidden).toBe(true);
    });
  });

  describe("toggle cliente", () => {
    it("chama adminToggleCliente ao clicar Inativar", async () => {
      window.electronAPI.adminGetClientes = vi.fn().mockResolvedValue({ dados: [{ id: "u1", nome: "João", email: "joao@t.com", criado_em: "2025-01-01T10:00:00Z", ativo: true }], total: 1, pagina: 1, totalPaginas: 1, itensPorPagina: 10 });
      window.electronAPI.adminToggleCliente = vi.fn().mockResolvedValue({ success: true });
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-toggle]")).toBeTruthy();
      });
      document.querySelector("[data-toggle]").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.adminToggleCliente).toHaveBeenCalledWith("u1");
      });
    });
  });

  describe("categoria global editar", () => {
    it("entra em modo edição ao clicar Editar", async () => {
      window.electronAPI.listarCategorias = vi.fn().mockResolvedValue([{ id: "cg1", nome: "Global A", tipo: "RECEITA", eh_global: true, ativo: true }]);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-edit-cat-global")).toBeTruthy();
      });
      document.querySelector(".btn-edit-cat-global").click();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-save-cat-global")).toBeTruthy();
        expect(document.querySelector(".btn-cancel-cat-global")).toBeTruthy();
      });
    });

    it("salva edição de categoria global via API", async () => {
      window.electronAPI.listarCategorias = vi.fn().mockResolvedValue([{ id: "cg1", nome: "Global A", tipo: "RECEITA", eh_global: true, ativo: true }]);
      window.electronAPI.updateCategoria = vi.fn().mockResolvedValue({ id: "cg1", nome: "Global Editado", tipo: "DESPESA", eh_global: true, ativo: true });
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-edit-cat-global")).toBeTruthy();
      });
      document.querySelector(".btn-edit-cat-global").click();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-save-cat-global")).toBeTruthy();
      });
      document.getElementById("editCatGlobalNome_cg1").value = "Global Editado";
      document.querySelector(".btn-save-cat-global").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.updateCategoria).toHaveBeenCalledWith("cg1", { nome: "Global Editado", tipo: "RECEITA" });
      });
    });

    it("cancela edição de categoria global", async () => {
      window.electronAPI.listarCategorias = vi.fn().mockResolvedValue([{ id: "cg1", nome: "Global A", tipo: "RECEITA", eh_global: true, ativo: true }]);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-edit-cat-global")).toBeTruthy();
      });
      document.querySelector(".btn-edit-cat-global").click();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-cancel-cat-global")).toBeTruthy();
      });
      document.querySelector(".btn-cancel-cat-global").click();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-edit-cat-global")).toBeTruthy();
        expect(document.querySelector(".btn-save-cat-global")).toBeFalsy();
      });
    });

    it("chama toggleCategoriaAtivo ao clicar Desativar", async () => {
      window.electronAPI.listarCategorias = vi.fn().mockResolvedValue([{ id: "cg1", nome: "Global A", tipo: "RECEITA", eh_global: true, ativo: true }]);
      window.electronAPI.toggleCategoriaAtivo = vi.fn().mockResolvedValue({ id: "cg1", ativo: false });
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector(".btn-toggle-cat-global")).toBeTruthy();
      });
      document.querySelector(".btn-toggle-cat-global").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.toggleCategoriaAtivo).toHaveBeenCalledWith("cg1");
      });
    });
  });

  /* ─────────── NOVO USUÁRIO ─────────── */

  describe("novo usuário", () => {
    beforeEach(async () => {
      window.electronAPI.adminCriarUsuario = vi.fn().mockResolvedValue({ id: "u-new", nome: "João", email: "joao@t.com" });
      await loadModule();
    });

    it("abre modal ao clicar em Novo usuário", () => {
      // Arrange
      const dialog = document.getElementById("novoUsuarioDialog");
      dialog.showModal = vi.fn();

      // Act
      document.getElementById("novoUsuarioBtn").click();

      // Assert
      expect(dialog.showModal).toHaveBeenCalled();
    });

    it("fecha modal ao clicar em Cancelar", () => {
      // Arrange
      const dialog = document.getElementById("novoUsuarioDialog");
      dialog.close = vi.fn();
      dialog.showModal();

      // Act
      document.getElementById("cancelarNovoUsuario").click();

      // Assert
      expect(dialog.close).toHaveBeenCalled();
    });

    it("fecha modal ao clicar no X", () => {
      // Arrange
      const dialog = document.getElementById("novoUsuarioDialog");
      dialog.close = vi.fn();
      dialog.showModal();

      // Act
      document.getElementById("fecharNovoUsuario").click();

      // Assert
      expect(dialog.close).toHaveBeenCalled();
    });

    it("cria usuario via electronAPI e recarrega clientes", async () => {
      // Arrange
      const dialog = document.getElementById("novoUsuarioDialog");
      dialog.showModal = vi.fn();
      dialog.close = vi.fn();

      // Act — abre modal (limpa campos), preenche e salva
      document.getElementById("novoUsuarioBtn").click();
      document.getElementById("novoUsuarioNome").value = "João";
      document.getElementById("novoUsuarioEmail").value = "joao@t.com";
      document.getElementById("salvarNovoUsuario").click();

      // Assert
      await vi.waitFor(() => {
        expect(window.electronAPI.adminCriarUsuario).toHaveBeenCalledWith("João", "joao@t.com");
        expect(dialog.close).toHaveBeenCalled();
        expect(window.electronAPI.adminGetClientes).toHaveBeenCalled();
      });
    });
  });

  describe("helpers", () => {
    it("statusLabel retorna label correto", async () => {
      await loadModule();
      const admin = await import("../../../public/js/admin.js");
      expect(admin.statusLabel("aberto")).toBe("Aberto");
      expect(admin.statusLabel("em_andamento")).toBe("Em andamento");
      expect(admin.statusLabel("resolvido")).toBe("Resolvido");
      expect(admin.statusLabel("desconhecido")).toBe("desconhecido");
    });

    it("formatarData formata ISO corretamente", async () => {
      await loadModule();
      const admin = await import("../../../public/js/admin.js");
      const result = admin.formatarData("2025-01-01T10:00:00Z");
      expect(result).toContain("01/01/2025");
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it("formatarData retorna — para null", async () => {
      await loadModule();
      const admin = await import("../../../public/js/admin.js");
      expect(admin.formatarData(null)).toBe("—");
    });
  });
});
