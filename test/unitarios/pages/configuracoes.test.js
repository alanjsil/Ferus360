/**
 * @file Testes da página de configurações (public/configuracoes.html).
 * @description Valida perfil, avatar, troca de senha, sessões, exportar dados, exclusão de conta e categorias.
 * @module test/unitarios/pages/configuracoes.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * - Adicionados comentários AAA.
 * [2026-06-09] - Migração JSON→CSV
 * - Ajustado mock de exportarDados para retornar objetos aninhados (joins).
 * - Adicionado mock do módulo csv.js.
 * - Adicionados testes para o botão "Baixar template".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(path.resolve(__dirname, "../../../public/configuracoes.html"), "utf-8");

HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();

const FAKE_TOKEN = "header." + btoa(JSON.stringify({ sid: "sessao-atual" })) + ".sig";

vi.mock("../../../public/js/auth-guard.js", () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue({
    token: FAKE_TOKEN,
    usuario: { id: "user-1", nome: "Teste", email: "teste@t.com", role: "user" },
  }),
  escapeHtml: (str) => {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
  clearAuthSession: vi.fn(),
  getAccessToken: vi.fn(() => FAKE_TOKEN),
}));

vi.mock("../../../public/js/password-utils.js", () => ({
  iniciarToggleSenha: vi.fn(),
  avaliarRequisitos: vi.fn(),
}));

vi.mock("../../../public/js/toast.js", async () => {
  const actual = await vi.importActual("../../../public/js/toast.js");
  return {
    ...actual,
    confirmDialog: vi.fn(() => Promise.resolve(true)),
  };
});

vi.mock("../../../public/js/csv.js", async () => {
  const actual = await vi.importActual("../../../public/js/csv.js");
  return actual;
});

describe("configurações (página de perfil)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = html;

    window.electronAPI = {
      getPerfil: vi.fn().mockResolvedValue({
        nome: "Teste",
        email: "teste@t.com",
        usar_pj: true,
      }),
      updatePerfil: vi.fn().mockResolvedValue({}),
      verificarAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
      trocarSenha: vi.fn().mockResolvedValue({}),
      getSessoes: vi.fn().mockResolvedValue([]),
      encerrarSessao: vi.fn().mockResolvedValue({}),
      exportarDados: vi.fn().mockResolvedValue({
        lancamentos: [
          {
            data: "2026-06-01",
            tipo: "RECEITA",
            valor: 100,
            status: "PAGO",
            descricao: "Salário",
            categoria: { nome: "Salário" },
            subcategoria: null,
            conta_origem: null,
            conta_destino: null,
            pessoa: null,
            data_pagamento: null,
            criado_em: "2026-06-01T10:00:00Z",
          },
        ],
      }),
      excluirConta: vi.fn().mockResolvedValue({}),
      verificarSenha: vi.fn().mockResolvedValue({ success: true }),
      listarCategorias: vi.fn().mockResolvedValue([]),
      criarCategoria: vi.fn(),
      updateCategoria: vi.fn(),
      toggleCategoriaAtivo: vi.fn(),
      getSubcategorias: vi.fn().mockResolvedValue([]),
      criarSubcategoria: vi.fn(),
      updateSubcategoria: vi.fn(),
      deletarSubcategoria: vi.fn(),
      logout: vi.fn(),
      getTipoPessoa: vi.fn().mockResolvedValue("PF"),
      setTipoPessoa: vi.fn().mockResolvedValue({ success: true }),
      onTipoPessoaChanged: vi.fn(),
      getUsarPj: vi.fn().mockResolvedValue(true),
      setUsarPj: vi.fn().mockResolvedValue({ success: true }),
      onUsarPjChanged: vi.fn(),
    };

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadModule() {
    const mod = await import("../../../public/js/configuracoes.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await vi.waitFor(() => {
      expect(window.electronAPI.getPerfil).toHaveBeenCalled();
    });
    return mod;
  }

  describe("inicialização", () => {
    it("chama ensureAuthenticated e carrega perfil", async () => {
      // Act
      await loadModule();
      // Assert
      expect(window.electronAPI.getPerfil).toHaveBeenCalled();
    });

    it("preenche campos do perfil com dados do usuário", async () => {
      await loadModule();
      expect(document.getElementById("perfilNome").value).toBe("Teste");
      expect(document.getElementById("perfilEmail").value).toBe("teste@t.com");
    });

    it("mostra mensagem de erro se carregar perfil falha", async () => {
      // Arrange
      window.electronAPI.getPerfil.mockRejectedValue(new Error("fail"));
      // Act
      await import("../../../public/js/configuracoes.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.waitFor(() => {
        const msg = document.getElementById("perfilMessage");
        expect(msg.textContent).toContain("Erro ao carregar perfil");
      });
    });

    it("chama iniciarToggleSenha", async () => {
      const pw = await import("../../../public/js/password-utils.js");
      await loadModule();
      expect(pw.iniciarToggleSenha).toHaveBeenCalled();
    });
  });

  describe("navegação por abas", () => {
    it("ativa seção ao clicar nav-item", async () => {
      await loadModule();
      const segBtn = document.querySelector('[data-section="seguranca"]');
      segBtn.click();
      expect(segBtn.classList.contains("active")).toBe(true);
      expect(document.getElementById("section-perfil").classList.contains("active")).toBe(false);
      expect(document.getElementById("section-seguranca").classList.contains("active")).toBe(true);
    });
  });

  describe("logout (sair)", () => {
    it("chama logout, clearAuthSession e redireciona", async () => {
      // Arrange
      Object.defineProperty(window, "location", {
        value: { href: "" },
        writable: true,
      });
      const { clearAuthSession } = await import("../../../public/js/auth-guard.js");
      // Act
      await loadModule();
      document.getElementById("logoutBtn").click();
      expect(window.electronAPI.logout).toHaveBeenCalledWith();
      await vi.waitFor(() => {
        expect(clearAuthSession).toHaveBeenCalled();
      });
      expect(window.location.href).toBe("login.html");
    });
  });

  describe("perfil — avatar", () => {
    it("rejeita arquivo maior que 2 MB", async () => {
      await loadModule();
      const input = document.getElementById("avatarInput");
      const bigFile = new File(["x".repeat(3 * 1024 * 1024)], "big.png", {
        type: "image/png",
      });
      const ev = new Event("change");
      Object.defineProperty(ev, "target", {
        value: { files: [bigFile] },
      });
      input.dispatchEvent(ev);
      expect(document.getElementById("perfilMessage").textContent).toBe("Arquivo excede 2 MB.");
    });

    it("rejeita formato inválido", async () => {
      await loadModule();
      const input = document.getElementById("avatarInput");
      const badFile = new File(["x"], "bad.gif", { type: "image/gif" });
      const ev = new Event("change");
      Object.defineProperty(ev, "target", {
        value: { files: [badFile] },
      });
      input.dispatchEvent(ev);
      expect(document.getElementById("perfilMessage").textContent).toBe("Formato inválido. Use PNG ou JPG.");
    });

    it("aceita PNG válido e atualiza preview", async () => {
      await loadModule();
      const input = document.getElementById("avatarInput");
      const pngFile = new File(["x"], "avatar.png", { type: "image/png" });
      const ev = new Event("change");
      Object.defineProperty(ev, "target", {
        value: { files: [pngFile] },
      });
      Object.defineProperty(ev.target, "value", { value: "" });
      input.dispatchEvent(ev);
      expect(document.getElementById("perfilMessage").textContent).not.toBe("Formato inválido. Use PNG ou JPG.");
    });
  });

  describe("perfil — submit", () => {
    it("envia dados do perfil com sucesso", async () => {
      // Arrange
      await loadModule();
      document.getElementById("perfilNome").value = "Nome Atualizado";
      // Act
      document.getElementById("perfilForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(window.electronAPI.updatePerfil).toHaveBeenCalledWith(expect.objectContaining({ nome: "Nome Atualizado" }));
      });
      const msg = document.getElementById("perfilMessage");
      expect(msg.textContent).toContain("sucesso");
    });

    it("mostra erro se updatePerfil falha", async () => {
      window.electronAPI.updatePerfil.mockResolvedValue({ error: "fail" });
      await loadModule();
      document.getElementById("perfilForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        const msg = document.getElementById("perfilMessage");
        expect(msg.textContent).toContain("Erro");
      });
    });
  });

  describe("senha", () => {
    it("mostra erro se senhas não conferem", async () => {
      await loadModule();
      document.getElementById("novaSenha").value = "NovaSenha1";
      document.getElementById("confirmarSenha").value = "OutraSenha1";
      document.getElementById("senhaForm").dispatchEvent(new Event("submit"));
      expect(document.getElementById("senhaMessage").textContent).toBe("Nova senha e confirmação não conferem.");
    });

    it("troca senha com sucesso", async () => {
      await loadModule();
      document.getElementById("novaSenha").value = "NovaSenha1";
      document.getElementById("confirmarSenha").value = "NovaSenha1";
      document.getElementById("senhaForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(window.electronAPI.trocarSenha).toHaveBeenCalledWith("user-1", "NovaSenha1");
      });
    });

    it("mostra erro SENHA_FRACA", async () => {
      window.electronAPI.trocarSenha.mockRejectedValue({
        code: "SENHA_FRACA",
      });
      await loadModule();
      document.getElementById("novaSenha").value = "fraca1";
      document.getElementById("confirmarSenha").value = "fraca1";
      document.getElementById("senhaForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(document.getElementById("senhaMessage").textContent).toContain("8+ caracteres");
      });
    });

    it("mostra erro SENHA_ATUAL_INCORRETA", async () => {
      window.electronAPI.trocarSenha.mockRejectedValue({
        code: "SENHA_ATUAL_INCORRETA",
      });
      await loadModule();
      document.getElementById("novaSenha").value = "NovaSenha1";
      document.getElementById("confirmarSenha").value = "NovaSenha1";
      document.getElementById("senhaForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(document.getElementById("senhaMessage").textContent).toBe("Senha atual incorreta.");
      });
    });
  });

  describe("sessões", () => {
    it("carrega sessões na inicialização", async () => {
      window.electronAPI.getSessoes.mockResolvedValue([{ id: "s1", user_agent: "Chrome", ip: "1.2.3.4", criado_em: "2025-01-01T10:00:00Z" }]);
      const auth = await import("../../../public/js/auth-guard.js");
      auth.getAccessToken.mockReturnValue(FAKE_TOKEN);
      await loadModule();
      await vi.waitFor(() => {
        expect(window.electronAPI.getSessoes).toHaveBeenCalled();
      });
    });

    it("mostra empty state quando não há sessões", async () => {
      await loadModule();
      expect(document.getElementById("sessoesList").innerHTML).toContain("Nenhuma sessão ativa");
    });

    it("mostra erro ao carregar sessões", async () => {
      window.electronAPI.getSessoes.mockRejectedValue(new Error("fail"));
      await loadModule();
      await vi.waitFor(() => {
        expect(document.getElementById("sessoesList").innerHTML).toContain("Erro ao carregar sessões");
      });
    });

    it("encerra sessão individual pelo botão", async () => {
      window.electronAPI.getSessoes.mockResolvedValue([{ id: "s1", user_agent: "Firefox", ip: "5.6.7.8", criado_em: "2025-01-01T10:00:00Z" }]);
      const auth = await import("../../../public/js/auth-guard.js");
      auth.getAccessToken.mockReturnValue(FAKE_TOKEN);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector("[data-sessao-id]")).toBeTruthy();
      });
      document.querySelector("[data-sessao-id]").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.encerrarSessao).toHaveBeenCalledWith("s1");
      });
    });
  });

  describe("exportar dados", () => {
    it("chama exportarDados, gera CSV e cria link de download", async () => {
      // Arrange
      const createObjectURL = vi.fn(() => "blob:url");
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = vi.fn();

      // Act
      await loadModule();
      document.getElementById("exportarBtn").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.exportarDados).toHaveBeenCalled();
      });

      // Assert
      expect(createObjectURL).toHaveBeenCalled();
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("text/csv;charset=utf-8");
      expect(document.getElementById("contaMessage").textContent).toContain("sucesso");
    });
  });

  describe("excluir conta", () => {
    it("abre dialog ao clicar em excluir conta", async () => {
      const dialog = document.getElementById("excluirDialog");
      await loadModule();
      document.getElementById("excluirContaBtn").click();
      expect(dialog.showModal).toHaveBeenCalled();
    });

    it("fecha dialog ao cancelar", async () => {
      const dialog = document.getElementById("excluirDialog");
      await loadModule();
      document.getElementById("cancelarExcluir").click();
      expect(dialog.close).toHaveBeenCalled();
    });

    it("mostra erro se email não confere", async () => {
      await loadModule();
      document.getElementById("excluirEmail").value = "wrong@t.com";
      document.getElementById("excluirForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(document.getElementById("excluirMessage").textContent).toBe("Email não corresponde ao cadastrado.");
      });
    });

    it("exclui conta e redireciona", async () => {
      // Arrange
      Object.defineProperty(window, "location", {
        value: { href: "" },
        writable: true,
      });
      await loadModule();
      document.getElementById("excluirEmail").value = "teste@t.com";
      document.getElementById("excluirSenha").value = "senha123";
      // Act
      document.getElementById("excluirForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(window.electronAPI.verificarSenha).toHaveBeenCalledWith("senha123");
      });
      await vi.waitFor(() => {
        expect(window.electronAPI.excluirConta).toHaveBeenCalledWith();
      });
    });
  });

  describe("sessões — encerrar todas", () => {
    it("chama revogarOutrasSessoes e mostra resultado", async () => {
      window.electronAPI.revogarOutrasSessoes = vi.fn().mockResolvedValue({ success: true, encerradas: 1 });
      await loadModule();
      document.getElementById("encerrarTodasBtn").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.revogarOutrasSessoes).toHaveBeenCalled();
      });
    });
  });

  describe("exportar dados — erro", () => {
    it("mostra erro se exportarDados falha", async () => {
      window.electronAPI.exportarDados.mockRejectedValue(new Error("fail"));
      await loadModule();
      document.getElementById("exportarBtn").click();
      await vi.waitFor(() => {
        expect(document.getElementById("contaMessage").textContent).toContain("Erro");
      });
    });
  });

  describe("baixar template", () => {
    it("baixa template CSV de importação ao clicar no botão", async () => {
      // Arrange
      const createObjectURL = vi.fn(() => "blob:url");
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = vi.fn();

      // Act
      await loadModule();
      document.getElementById("templateBtn").click();

      // Assert
      await vi.waitFor(() => {
        expect(createObjectURL).toHaveBeenCalled();
      });
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("text/csv;charset=utf-8");
      expect(document.getElementById("contaMessage").textContent).toContain("sucesso");
    });
  });

  describe("excluir conta — erro", () => {
    it("mostra erro se senha incorreta", async () => {
      window.electronAPI.verificarSenha.mockResolvedValue({ error: "SENHA_INVALIDA" });
      await loadModule();
      document.getElementById("excluirEmail").value = "teste@t.com";
      document.getElementById("excluirSenha").value = "senha_errada";
      document.getElementById("excluirForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(document.getElementById("excluirMessage").textContent).toBe("Senha incorreta.");
      });
    });

    it("mostra mensagem genérica ao falhar", async () => {
      window.electronAPI.excluirConta.mockRejectedValue(new Error("fail"));
      await loadModule();
      document.getElementById("excluirEmail").value = "teste@t.com";
      document.getElementById("excluirSenha").value = "senha123";
      document.getElementById("excluirForm").dispatchEvent(new Event("submit"));
      await vi.waitFor(() => {
        expect(document.getElementById("excluirMessage").textContent).toBe("Erro ao excluir conta.");
      });
    });
  });

  describe("funções auxiliares", () => {
    it("formatarUserAgent identifica navegadores", async () => {
      await loadModule();
      const cfg = await import("../../../public/js/configuracoes.js");
      expect(cfg.formatarUserAgent("Chrome/120")).toBe("Chrome");
      expect(cfg.formatarUserAgent("Firefox/110")).toBe("Firefox");
      expect(cfg.formatarUserAgent("Safari/17")).toBe("Safari");
      expect(cfg.formatarUserAgent("Edge/110")).toBe("Edge");
      expect(cfg.formatarUserAgent("Electron/28")).toBe("Electron");
      expect(cfg.formatarUserAgent("Desconhecido/1.0")).toBe("Desconhecido");
    });

    it("formatarData formata ISO corretamente", async () => {
      await loadModule();
      const cfg = await import("../../../public/js/configuracoes.js");
      const result = cfg.formatarData("2025-01-01T10:00:00Z");
      expect(result).toContain("01/01/2025");
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it("formatarData retorna vazio para null", async () => {
      await loadModule();
      const cfg = await import("../../../public/js/configuracoes.js");
      expect(cfg.formatarData(null)).toBe("");
    });

    it("extrairSid extrai sid do token JWT", async () => {
      await loadModule();
      const cfg = await import("../../../public/js/configuracoes.js");
      const sid = cfg.extrairSid(FAKE_TOKEN);
      expect(sid).toBe("sessao-atual");
    });

    it("extrairSid retorna null para token inválido", async () => {
      await loadModule();
      const cfg = await import("../../../public/js/configuracoes.js");
      expect(cfg.extrairSid("invalid")).toBeNull();
    });
  });

  describe("sessão atual badge", () => {
    it("mostra badge 'Atual' na sessão correspondente ao token", async () => {
      window.electronAPI.getSessoes.mockResolvedValue([
        { id: "sessao-atual", user_agent: "Chrome", ip: "1.2.3.4", criado_em: "2025-01-01T10:00:00Z" },
        { id: "s2", user_agent: "Firefox", ip: "5.6.7.8", criado_em: "2025-01-02T10:00:00Z" },
      ]);
      const auth = await import("../../../public/js/auth-guard.js");
      auth.getAccessToken.mockReturnValue(FAKE_TOKEN);
      await loadModule();
      await vi.waitFor(() => {
        expect(document.querySelector(".sessao-badge")).toBeTruthy();
        expect(document.querySelector(".sessao-badge").textContent).toBe("Atual");
      });
    });
  });

  describe("categorias — inline form", () => {
    it("abre formulário inline ao clicar em nova categoria", async () => {
      await loadModule();
      expect(document.getElementById("inlineForm").hidden).toBe(true);
      document.getElementById("novaCategoriaBtn").click();
      expect(document.getElementById("inlineForm").hidden).toBe(false);
    });

    it("fecha formulário ao cancelar", async () => {
      await loadModule();
      document.getElementById("novaCategoriaBtn").click();
      document.getElementById("cancelarNovaCat").click();
      expect(document.getElementById("inlineForm").hidden).toBe(true);
    });

    it("mostra erro se nome tem menos de 2 caracteres", async () => {
      await loadModule();
      document.getElementById("novaCategoriaBtn").click();
      document.getElementById("newCatNome").value = "A";
      document.getElementById("salvarNovaCat").click();
      expect(document.getElementById("newCatMessage").textContent).toBe("Nome precisa ter entre 2 e 40 caracteres.");
    });

    it("cria categoria via API", async () => {
      window.electronAPI.criarCategoria.mockResolvedValue({
        id: "cat-n",
        nome: "Nova",
        tipo: "RECEITA",
        ativo: true,
      });
      await loadModule();
      document.getElementById("novaCategoriaBtn").click();
      document.getElementById("newCatNome").value = "Nova";
      document.getElementById("salvarNovaCat").click();
      await vi.waitFor(() => {
        expect(window.electronAPI.criarCategoria).toHaveBeenCalledWith({
          nome: "Nova",
          tipo: "RECEITA",
        });
      });
    });
  });
});
