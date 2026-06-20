/**
 * @file Testes da página de login (public/login.html).
 * @description Valida o fluxo de autenticação, captcha, recuperação de senha e indicadores de loading.
 * @module test/unitarios/pages/login.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(
  path.resolve(__dirname, "../../../public/login.html"),
  "utf-8"
);

HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();

let locationHref;

beforeEach(() => {
  locationHref = "";
  Object.defineProperty(window, "location", {
    value: { href: locationHref },
    writable: true,
  });

  document.body.innerHTML = html;

  window.electronAPI = {
    login: vi.fn(),
    solicitarRecuperacao: vi.fn(),
    renovarAuth: vi.fn().mockRejectedValue(new Error("no session")),
    verificarAuth: vi.fn().mockRejectedValue(new Error("no token")),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login (página de autenticação)", () => {
  let login;

  beforeEach(async () => {
    vi.useFakeTimers();
    const module = await import("../../../public/js/login.js");
    login = module;
    document.dispatchEvent(new Event("DOMContentLoaded"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("inicialização (DOMContentLoaded)", () => {
    it("deve tentar restaurar sessao e permanecer na pagina", () => {
      // Assert
      expect(window.location.href).toBe("");
    });

    it("deve redirecionar para index.html se sessao for restaurada", async () => {
      // Arrange
      locationHref = "";
      document.body.innerHTML = html;
      window.electronAPI = {
        login: vi.fn(),
        solicitarRecuperacao: vi.fn(),
        renovarAuth: vi.fn().mockResolvedValue({
          token: "access-token",
          usuario: { id: "user-1", nome: "User", email: "u@t.com", role: "user" },
        }),
        verificarAuth: vi.fn().mockRejectedValue(new Error("no token")),
      };
      localStorage.setItem(
        "financas.refresh_token",
        "refresh:user-1:session-1"
      );

      // Act
      await import("../../../public/js/login.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.runAllTimersAsync();

      // Assert
      expect(window.location.href).toBe("index.html");
    });
  });

  describe("fazerLogin", () => {
    function criarEvento() {
      return { preventDefault: vi.fn() };
    }

    it("deve chamar login API e redirecionar ao sucesso", async () => {
      // Arrange
      document.getElementById("email").value = "admin@test.com";
      document.getElementById("senha").value = "Senha1";
      document.getElementById("lembrarMe").checked = false;
      window.electronAPI.login.mockResolvedValue({
        token: "access-token",
        refreshToken: "refresh-token",
        usuario: { id: "user-1", nome: "Admin", email: "a@a.com", role: "admin" },
      });

      // Act
      await login.fazerLogin(criarEvento());

      // Assert
      expect(window.electronAPI.login).toHaveBeenCalledWith(
        "admin@test.com",
        "Senha1"
      );
      expect(window.location.href).toBe("admin.html");
    });

    it("deve armazenar refreshToken no localStorage quando rememberMe=true", async () => {
      // Arrange
      document.getElementById("email").value = "user@test.com";
      document.getElementById("senha").value = "Senha1";
      document.getElementById("lembrarMe").checked = true;
      window.electronAPI.login.mockResolvedValue({
        token: "access-token",
        refreshToken: "refresh-token",
        usuario: { id: "user-1", nome: "User", email: "u@u.com", role: "user" },
      });

      // Act
      await login.fazerLogin(criarEvento());

      // Assert
      expect(localStorage.getItem("financas.refresh_token")).toBe("refresh-token");
    });

    it("nao deve armazenar refreshToken quando rememberMe=false", async () => {
      // Arrange
      document.getElementById("email").value = "user@test.com";
      document.getElementById("senha").value = "Senha1";
      document.getElementById("lembrarMe").checked = false;
      window.electronAPI.login.mockResolvedValue({
        token: "access-token",
        refreshToken: "refresh-token",
        usuario: { id: "user-1", nome: "User", email: "u@u.com", role: "user" },
      });

      // Act
      await login.fazerLogin(criarEvento());

      // Assert
      expect(localStorage.getItem("financas.refresh_token")).toBeNull();
    });

    it("deve exibir mensagem de erro quando login falha", async () => {
      // Arrange
      document.getElementById("email").value = "admin@test.com";
      document.getElementById("senha").value = "senha-errada";
      window.electronAPI.login.mockResolvedValue({ error: "CREDENCIAIS_INVALIDAS" });

      // Act
      await login.fazerLogin(criarEvento());

      // Assert
      const msg = document.getElementById("loginMessage");
      expect(msg.textContent).toBe("Email ou senha incorretos");
      expect(msg.style.color).toBe("rgb(252, 165, 165)");
    });

  });

  describe("fazerLogin com erros especificos", () => {
    let loginLocal;

    beforeEach(async () => {
      vi.resetModules();
      vi.useFakeTimers();
      document.body.innerHTML = html;
      window.electronAPI = {
        login: vi.fn(),
        solicitarRecuperacao: vi.fn(),
        renovarAuth: vi.fn().mockRejectedValue(new Error("no session")),
        verificarAuth: vi.fn().mockRejectedValue(new Error("no token")),
      };
      const module = await import("../../../public/js/login.js");
      loginLocal = module;
      document.dispatchEvent(new Event("DOMContentLoaded"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("deve exibir mensagem de usuario inativo quando usuario inativado", async () => {
      // Arrange
      document.getElementById("email").value = "inativo@test.com";
      document.getElementById("senha").value = "senha123";
      window.electronAPI.login.mockResolvedValue({ error: "USUARIO_INATIVO" });

      // Act
      await loginLocal.fazerLogin({ preventDefault: vi.fn() });

      // Assert
      const msg = document.getElementById("loginMessage");
      expect(msg.textContent).toBe("Usuário inativado. Entre em contato com o administrador.");
    });

    it("deve exibir mensagem de email nao confirmado", async () => {
      // Arrange
      document.getElementById("email").value = "nao-confirmado@test.com";
      document.getElementById("senha").value = "senha123";
      window.electronAPI.login.mockResolvedValue({ error: "EMAIL_NAO_CONFIRMADO" });

      // Act
      await loginLocal.fazerLogin({ preventDefault: vi.fn() });

      // Assert
      const msg = document.getElementById("loginMessage");
      expect(msg.textContent).toBe("Email não confirmado. Verifique sua caixa de entrada.");
    });

    it("deve exibir mensagem de rate limit", async () => {
      // Arrange
      document.getElementById("email").value = "rate@test.com";
      document.getElementById("senha").value = "senha123";
      window.electronAPI.login.mockResolvedValue({ error: "RATE_LIMIT" });

      // Act
      await loginLocal.fazerLogin({ preventDefault: vi.fn() });

      // Assert
      const msg = document.getElementById("loginMessage");
      expect(msg.textContent).toBe("Muitas tentativas. Aguarde um momento.");
    });
  });

  describe("fazerLogin (captcha)", () => {
    let loginLocal;

    beforeEach(async () => {
      vi.resetModules();
      vi.useFakeTimers();
      document.body.innerHTML = html;
      window.electronAPI = {
        login: vi.fn(),
        solicitarRecuperacao: vi.fn(),
        renovarAuth: vi.fn().mockRejectedValue(new Error("no session")),
        verificarAuth: vi.fn().mockRejectedValue(new Error("no token")),
      };
      const module = await import("../../../public/js/login.js");
      loginLocal = module;
      document.dispatchEvent(new Event("DOMContentLoaded"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("nao deve redirecionar quando login falha", async () => {
      // Arrange
      document.getElementById("email").value = "admin@test.com";
      document.getElementById("senha").value = "senha-errada";
      window.electronAPI.login.mockResolvedValue({ error: "CREDENCIAIS_INVALIDAS" });

      // Act
      await loginLocal.fazerLogin({ preventDefault: vi.fn() });

      // Assert
      expect(window.location.href).toBe("");
    });

    it("deve exibir captcha apos 3 falhas consecutivas e resetar ao acertar", async () => {
      // Arrange
      document.getElementById("email").value = "u@u.com";
      document.getElementById("senha").value = "x";
      window.electronAPI.login.mockResolvedValue({ error: "erro" });
      const ev = { preventDefault: vi.fn() };

      // Act
      for (let i = 0; i < 3; i++) {
        await loginLocal.fazerLogin(ev);
      }

      // Assert
      expect(document.getElementById("captchaBox").hidden).toBe(false);
      expect(document.getElementById("captchaPergunta").textContent).toMatch(
        /Quanto é \d \+ \d\?/
      );

      // Arrange (prepara acerto)
      document.getElementById("captchaResposta").value = loginLocal.captchaResposta;
      window.electronAPI.login.mockResolvedValue({
        token: "t",
        refreshToken: "rt",
        usuario: { id: "1", nome: "U", email: "u@u.com", role: "user" },
      });

      // Act
      await loginLocal.fazerLogin(ev);

      // Assert
      expect(document.getElementById("captchaBox").hidden).toBe(true);
    });
  });

  describe("setLoading", () => {
    it("deve desabilitar campos e mostrar spinner quando loading=true", () => {
      // Act
      login.setLoading(true);

      // Assert
      expect(document.getElementById("email").disabled).toBe(true);
      expect(document.getElementById("senha").disabled).toBe(true);
      expect(document.getElementById("loginSubmit").disabled).toBe(true);
      expect(document.getElementById("loginSubmit").innerHTML).toContain("spinner");
      expect(document.getElementById("loginSubmit").innerHTML).toContain("Entrando...");
    });

    it("deve reabilitar campos e restaurar texto quando loading=false", () => {
      // Act
      login.setLoading(true);
      login.setLoading(false);

      // Assert
      expect(document.getElementById("email").disabled).toBe(false);
      expect(document.getElementById("senha").disabled).toBe(false);
      expect(document.getElementById("loginSubmit").disabled).toBe(false);
      expect(document.getElementById("loginSubmit").innerHTML).toBe("Entrar");
    });
  });

  describe("mostrarMensagem", () => {
    it("deve exibir texto e cor de erro", () => {
      // Act
      login.mostrarMensagem("Erro de teste");

      // Assert
      const msg = document.getElementById("loginMessage");
      expect(msg.textContent).toBe("Erro de teste");
      expect(msg.style.color).toBe("rgb(252, 165, 165)");
    });

    it("deve exibir texto e cor de sucesso quando erro=false", () => {
      // Act
      login.mostrarMensagem("Sucesso!", false);

      // Assert
      const msg = document.getElementById("loginMessage");
      expect(msg.textContent).toBe("Sucesso!");
      expect(msg.style.color).toBe("rgb(134, 239, 172)");
    });

    it("deve adicionar classe shake no card em caso de erro", () => {
      // Arrange
      const card = document.querySelector(".login-card");
      expect(card.classList.contains("shake")).toBe(false);

      // Act
      login.mostrarMensagem("Erro");

      // Assert
      expect(card.classList.contains("shake")).toBe(true);
    });

    it("deve remover classe shake apos 500ms", () => {
      // Arrange
      const card = document.querySelector(".login-card");
      login.mostrarMensagem("Erro");
      expect(card.classList.contains("shake")).toBe(true);

      // Act
      vi.advanceTimersByTime(500);

      // Assert
      expect(card.classList.contains("shake")).toBe(false);
    });

    it("nao deve adicionar shake para mensagem vazia", () => {
      // Arrange
      const card = document.querySelector(".login-card");

      // Act
      login.mostrarMensagem("");

      // Assert
      expect(card.classList.contains("shake")).toBe(false);
    });
  });

  describe("captcha", () => {
    it("deve bloquear submit com captcha errado", async () => {
      // Arrange
      document.getElementById("email").value = "u@u.com";
      document.getElementById("senha").value = "Senha1";
      login.gerarCaptcha();
      document.getElementById("captchaResposta").value = "resposta-errada";
      window.electronAPI.login.mockResolvedValue({ token: "t" });

      // Act
      await login.fazerLogin({ preventDefault: vi.fn() });

      // Assert
      expect(window.electronAPI.login).not.toHaveBeenCalled();
      expect(document.getElementById("loginMessage").textContent).toBe(
        "Captcha inválido."
      );
    });

    it("deve permitir submit com captcha correto", async () => {
      // Arrange
      document.getElementById("email").value = "u@u.com";
      document.getElementById("senha").value = "Senha1";
      login.gerarCaptcha();
      document.getElementById("captchaResposta").value = login.captchaResposta;
      window.electronAPI.login.mockResolvedValue({
        token: "t",
        refreshToken: "rt",
        usuario: { id: "1", nome: "U", email: "u@u.com", role: "user" },
      });

      // Act
      await login.fazerLogin({ preventDefault: vi.fn() });

      // Assert
      expect(window.electronAPI.login).toHaveBeenCalled();
    });
  });

  describe("configurarRecuperacao", () => {
    it("deve abrir dialog ao clicar em Esqueci minha senha", () => {
      // Act
      document.getElementById("abrirRecuperacao").click();

      // Assert
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    });

    it("deve fechar dialog ao clicar em Cancelar", () => {
      // Act
      document.getElementById("fecharRecuperacao").click();

      // Assert
      expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    });

    it("deve chamar solicitarRecuperacao ao submeter form", async () => {
      // Arrange
      window.electronAPI.solicitarRecuperacao.mockResolvedValue({
        success: true,
      });
      document.getElementById("recuperacaoEmail").value = "user@test.com";

      // Act
      const form = document.getElementById("recuperacaoForm");
      form.dispatchEvent(new Event("submit"));
      await vi.runAllTimersAsync();

      // Assert
      expect(window.electronAPI.solicitarRecuperacao).toHaveBeenCalledWith(
        "user@test.com"
      );
      expect(document.getElementById("recuperacaoMessage").textContent).toBe(
        "Se o email existir, você receberá um link de recuperação."
      );
    });

    it("deve exibir mensagem de erro na recuperacao", async () => {
      // Arrange
      window.electronAPI.solicitarRecuperacao.mockRejectedValue(
        new Error("ERRO")
      );
      document.getElementById("recuperacaoEmail").value = "user@test.com";

      // Act
      const form = document.getElementById("recuperacaoForm");
      form.dispatchEvent(new Event("submit"));
      await vi.runAllTimersAsync();

      // Assert
      expect(document.getElementById("recuperacaoMessage").textContent).toBe(
        "Não foi possível processar a recuperação."
      );
    });
  });

  describe("gerarCaptcha / limparCaptcha", () => {
    it("deve gerar pergunta e mostrar box", () => {
      // Act
      login.gerarCaptcha();

      // Assert
      expect(document.getElementById("captchaBox").hidden).toBe(false);
      expect(document.getElementById("captchaPergunta").textContent).toMatch(
        /Quanto é \d \+ \d\?/
      );
    });

    it("deve limpar captcha", () => {
      // Act
      login.gerarCaptcha();
      login.limparCaptcha();

      // Assert
      expect(document.getElementById("captchaBox").hidden).toBe(true);
      expect(login.captchaAtual).toBeNull();
      expect(login.captchaResposta).toBeNull();
    });
  });

  describe("Enter no campo senha", () => {
    it("deve disparar submit do form ao pressionar Enter", () => {
      // Arrange
      const form = document.getElementById("loginForm");
      const submitSpy = vi.fn();
      form.requestSubmit = submitSpy;

      // Act
      const event = new KeyboardEvent("keydown", { key: "Enter" });
      document.getElementById("senha").dispatchEvent(event);

      // Assert
      expect(submitSpy).toHaveBeenCalled();
    });
  });
});
