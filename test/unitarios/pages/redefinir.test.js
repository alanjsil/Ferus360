/**
 * @file Testes da página de redefinição de senha (public/redefinir.html).
 * @description Valida validações de formulário, chamada IPC com token de recuperação, fallback e mapeamento de erros.
 * @module test/unitarios/pages/redefinir.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(
  path.resolve(__dirname, "../../../public/redefinir.html"),
  "utf-8"
);

let locationHref;
let locationHash;

beforeEach(() => {
  locationHref = "";
  locationHash = "";
  Object.defineProperty(window, "location", {
    value: {
      href: locationHref,
      hash: locationHash,
    },
    writable: true,
  });

  document.body.innerHTML = html;

  window.electronAPI = {
    redefinirSenha: vi.fn(),
    temTokenRecuperacao: vi.fn().mockResolvedValue(false),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redefinir.js", () => {
  beforeAll(async () => {
    await import("../../../public/js/redefinir.js");
  });

  function importarPagina() {
    vi.useFakeTimers();
    document.dispatchEvent(new Event("DOMContentLoaded"));
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  function preencherForm({ senha, confirmacao }) {
    if (senha !== undefined) document.getElementById("senha").value = senha;
    if (confirmacao !== undefined)
      document.getElementById("confirmacao").value = confirmacao;
  }

  function submeterForm() {
    document.getElementById("redefinirForm").dispatchEvent(new Event("submit"));
  }

  function getMensagem() {
    return document.getElementById("redefinirMessage").textContent;
  }

  describe("validações do formulário", () => {
    beforeEach(() => {
      importarPagina();
    });

    it("exibe erro quando senha é menor que 8 caracteres", async () => {
      // Arrange
      preencherForm({ senha: "Curta1", confirmacao: "Curta1" });

      // Act
      submeterForm();
      await vi.runAllTimersAsync();

      // Assert
      expect(getMensagem()).toBe("A senha deve ter no mínimo 8 caracteres.");
      expect(window.electronAPI.redefinirSenha).not.toHaveBeenCalled();
    });

    it("exibe erro quando senhas não conferem", async () => {
      // Arrange
      preencherForm({ senha: "NovaSenha1", confirmacao: "OutraSenha1" });

      // Act
      submeterForm();
      await vi.runAllTimersAsync();

      // Assert
      expect(getMensagem()).toBe("As senhas não conferem.");
      expect(window.electronAPI.redefinirSenha).not.toHaveBeenCalled();
    });
  });

  describe("chamada IPC (com hash de recuperação)", () => {
    beforeEach(() => {
      window.location.hash = "#access_token=test-token&refresh_token=test-refresh";
      importarPagina();
    });

    it("chama redefinirSenha com a nova senha", async () => {
      // Arrange
      window.electronAPI.redefinirSenha.mockResolvedValue({ success: true });

      // Act
      preencherForm({ senha: "MinhaSenha1", confirmacao: "MinhaSenha1" });
      submeterForm();
      await vi.runAllTimersAsync();

      // Assert
      expect(window.electronAPI.redefinirSenha).toHaveBeenCalledWith("MinhaSenha1");
    });

    it("exibe sucesso e redireciona após 2 segundos", async () => {
      // Arrange
      window.electronAPI.redefinirSenha.mockResolvedValue({ success: true });

      // Act
      preencherForm({ senha: "NovaSenha1", confirmacao: "NovaSenha1" });
      submeterForm();
      await vi.runAllTimersAsync();

      // Assert
      expect(getMensagem()).toBe(
        "Senha redefinida com sucesso! Redirecionando..."
      );

      // Act
      vi.advanceTimersByTime(2000);

      // Assert
      expect(window.location.href).toBe("login.html");
    });
  });

  describe("sem token de recuperação (fallback manual)", () => {
    beforeEach(() => {
      document.body.innerHTML = html;
      importarPagina();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("mostra campos manuais quando não há token automático", async () => {
      // Act
      await vi.runAllTimersAsync();
      const fallback = document.getElementById("redefinirFallback");

      // Assert
      expect(fallback.style.display).toBe("block");
    });
  });

  describe("mapeamento de erros", () => {
    beforeEach(() => {
      window.location.hash = "#access_token=test-token&refresh_token=test-refresh";
      importarPagina();
    });

    it("exibe mensagem para SENHA_FRACA", async () => {
      // Arrange
      window.electronAPI.redefinirSenha.mockRejectedValue(
        new Error("SENHA_FRACA")
      );

      // Act
      preencherForm({ senha: "fracaSemMaiuscula", confirmacao: "fracaSemMaiuscula" });
      submeterForm();
      await vi.runAllTimersAsync();

      // Assert
      expect(getMensagem()).toBe(
        "A senha não atende os requisitos de segurança."
      );
    });

    it("exibe mensagem genérica para erro desconhecido", async () => {
      // Arrange
      window.electronAPI.redefinirSenha.mockRejectedValue(
        new Error("ERRO_DESCONHECIDO")
      );

      // Act
      preencherForm({ senha: "NovaSenha1", confirmacao: "NovaSenha1" });
      submeterForm();
      await vi.runAllTimersAsync();

      // Assert
      expect(getMensagem()).toBe("Erro ao redefinir senha.");
    });
  });
});
