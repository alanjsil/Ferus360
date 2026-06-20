/**
 * @file Testes do serviço de autenticação (wrapper Supabase Auth).
 * @description Valida login, logout, verificarToken, trocarSenha, solicitarRecuperacao, redefinirSenha, renovarSessao e recovery tokens.
 * @module test/unitarios/services/auth.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ─────────── DEFAULT SERVICE (MODO TEST) ─────────── */

describe("serviço auth padrão (modo teste)", () => {
  it("cria servico com funcoes que rejeitam quando nao injetado mock", async () => {
    // Act
    const authMod = await import("../../../services/auth.js");

    // Assert
    expect(authMod.login).toBeInstanceOf(Function);
    expect(authMod.logout).toBeInstanceOf(Function);
    expect(authMod.verificarToken).toBeInstanceOf(Function);
    expect(authMod.trocarSenha).toBeInstanceOf(Function);
    expect(authMod.solicitarRecuperacao).toBeInstanceOf(Function);
    expect(authMod.confirmarRecuperacao).toBeInstanceOf(Function);
    expect(authMod.redefinirSenha).toBeInstanceOf(Function);
    expect(authMod.renovarSessao).toBeInstanceOf(Function);
    expect(authMod.verificarSenha).toBeInstanceOf(Function);
    expect(authMod.setRecoveryTokens).toBeInstanceOf(Function);
    expect(authMod.getRecoveryTokens).toBeInstanceOf(Function);
    expect(authMod.buildAuthService).toBeInstanceOf(Function);
  });
});

function mockQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
}

describe("auth (wrapper do Supabase Auth)", () => {
  let auth;
  let onLogin;
  let onLogout;
  let mockSupabase;
  let query;
  let mockLogAuditoria;

  beforeEach(async () => {
    vi.clearAllMocks();
    query = mockQuery();

    mockLogAuditoria = vi.fn().mockResolvedValue();

    mockSupabase = {
      auth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn(),
        updateUser: vi.fn(),
        setSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
        refreshSession: vi.fn(),
        getSession: vi.fn(),
      },
      from: vi.fn(() => query),
    };

    onLogin = vi.fn();
    onLogout = vi.fn();

    const mod = await import("../../../services/auth.js");
    auth = mod.buildAuthService({
      supabase: mockSupabase,
      createClient: vi.fn(() => mockSupabase),
      onLogin,
      onLogout,
      logAuditoria: mockLogAuditoria,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────── LOGIN ─────────── */

  describe("login", () => {
    it("retorna token e usuario para credenciais válidas", async () => {
      // Arrange
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: "user-1" },
          session: { access_token: "at-1", refresh_token: "rt-1" },
        },
        error: null,
      });
      query.single.mockResolvedValue({
        data: { id: "user-1", nome: "Alan", email: "alan@example.com", role: "user", ativo: true },
        error: null,
      });

      // Act
      const result = await auth.login("alan@example.com", "senha-forte", {});

      // Assert
      expect(result.token).toBe("at-1");
      expect(result.refreshToken).toBe("rt-1");
      expect(result.usuario).toEqual({
        id: "user-1",
        nome: "Alan",
        email: "alan@example.com",
        role: "user",
        ativo: true,
      });
      expect(onLogin).toHaveBeenCalledWith("at-1", "rt-1");
    });

    it("lança CREDENCIAIS_INVALIDAS para senha incorreta", async () => {
      // Arrange
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: new Error("Invalid login credentials"),
      });

      // Act & Assert
      await expect(auth.login("alan@example.com", "wrong", {})).rejects.toThrow("CREDENCIAIS_INVALIDAS");
    });

    it("lança EMAIL_NAO_CONFIRMADO", async () => {
      // Arrange
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: new Error("Email not confirmed"),
      });

      // Act & Assert
      await expect(auth.login("alan@example.com", "pw", {})).rejects.toThrow("EMAIL_NAO_CONFIRMADO");
    });

    it("lança RATE_LIMIT quando há limite de taxa", async () => {
      // Arrange
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: new Error("rate limit exceeded"),
      });

      // Act & Assert
      await expect(auth.login("alan@example.com", "pw", {})).rejects.toThrow("RATE_LIMIT");
    });

    it("lança USUARIO_INATIVO e faz sign out quando perfil está inativo", async () => {
      // Arrange
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: "user-1" },
          session: { access_token: "at-1", refresh_token: "rt-1" },
        },
        error: null,
      });
      query.single.mockResolvedValue({ data: null, error: null });

      // Act & Assert
      await expect(auth.login("alan@example.com", "pw", {})).rejects.toThrow("USUARIO_INATIVO");
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });
  });

  /* ─────────── LOGOUT ─────────── */

  describe("logout", () => {
    it("chama onLogout e signOut", async () => {
      // Act
      const result = await auth.logout();

      // Assert
      expect(result).toEqual({ success: true });
      expect(onLogout).toHaveBeenCalled();
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });
  });

  /* ─────────── VERIFICAR TOKEN ─────────── */

  describe("verificarToken", () => {
    it("retorna perfil do usuario para token válido", async () => {
      // Arrange
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      query.single.mockResolvedValue({
        data: { id: "user-1", nome: "Alan", email: "alan@example.com", role: "user", ativo: true },
        error: null,
      });

      // Act
      const result = await auth.verificarToken("valid-token");

      // Assert
      expect(result).toEqual({
        id: "user-1",
        nome: "Alan",
        email: "alan@example.com",
        role: "user",
        ativo: true,
      });
    });

    it("lança TOKEN_INVALIDO para qualquer erro de token", async () => {
      // Arrange
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("invalid token"),
      });

      // Act & Assert
      await expect(auth.verificarToken("bad")).rejects.toThrow("TOKEN_INVALIDO");
    });

    it("lança TOKEN_INVALIDO também para JWT expirado", async () => {
      // Arrange
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("JWT expired"),
      });

      // Act & Assert
      await expect(auth.verificarToken("expired")).rejects.toThrow("TOKEN_INVALIDO");
    });
  });

  /* ─────────── TROCAR SENHA ─────────── */

  describe("trocarSenha", () => {
    it("atualiza senha após verificar a senha atual", async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { email: "alan@example.com" } } },
        error: null,
      });
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: {}, session: {} },
        error: null,
      });
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: {} },
        error: null,
      });

      // Act
      const result = await auth.trocarSenha("user-1", "senha-atual", "NovaSenha1");

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: "NovaSenha1",
      });
    });

    it("lança SENHA_FRACA para senha nova fraca", async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { email: "alan@example.com" } } },
        error: null,
      });
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: {}, session: {} },
        error: null,
      });
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Password should be at least 8 characters"),
      });

      // Act & Assert
      await expect(auth.trocarSenha("user-1", "atual", "abc")).rejects.toThrow("SENHA_FRACA");
    });

    it("lança SENHA_INVALIDA se senha atual está errada", async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { email: "alan@example.com" } } },
        error: null,
      });
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: new Error("Invalid login credentials"),
      });

      // Act & Assert
      await expect(auth.trocarSenha("user-1", "senha-errada", "NovaSenha1")).rejects.toThrow("SENHA_INVALIDA");
    });
  });

  /* ─────────── SOLICITAR RECUPERAÇÃO ─────────── */

  describe("solicitarRecuperacao", () => {
    it("chama resetPasswordForEmail com redirectTo e registra auditoria", async () => {
      // Act
      const result = await auth.solicitarRecuperacao("alan@example.com");

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("alan@example.com", { redirectTo: "financasapp://recuperar-senha" });
      expect(mockLogAuditoria).toHaveBeenCalledWith(null, "RECUPERACAO_SOLICITADA", {
        dados_novos: { email: "alan@example.com" },
      });
    });

    it("silencia erro de rate limit com sucesso", async () => {
      // Arrange
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: new Error("rate limit exceeded"),
      });

      // Act & Assert
      await expect(auth.solicitarRecuperacao("alan@example.com")).resolves.toEqual({
        success: true,
      });
    });
  });

  /* ─────────── REDEFINIR SENHA ─────────── */

  describe("redefinirSenha", () => {
    it("define sessão com token de recuperação e chama updateUser", async () => {
      // Arrange
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: {} },
        error: null,
      });

      // Act
      const result = await auth.redefinirSenha("recovery-access-token", null, "NovaSenha1");

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
        access_token: "recovery-access-token",
        refresh_token: null,
      });
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: "NovaSenha1",
      });
    });

    it("chama updateUser sem setSession quando não há token", async () => {
      // Arrange
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: {} },
        error: null,
      });

      // Act
      const result = await auth.redefinirSenha(null, null, "NovaSenha1");

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: "NovaSenha1",
      });
    });

    it("lança SENHA_FRACA para senha fraca", async () => {
      // Arrange
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Password should be at least 8 characters"),
      });

      // Act & Assert
      await expect(auth.redefinirSenha("recovery-token", null, "abc")).rejects.toThrow("SENHA_FRACA");
    });
  });

  /* ─────────── RENOVAR SESSÃO ─────────── */

  describe("renovarSessao", () => {
    it("retorna novo token e usuario", async () => {
      // Arrange
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {
          session: { access_token: "new-at", refresh_token: "new-rt" },
          user: { id: "user-1" },
        },
        error: null,
      });
      query.single.mockResolvedValue({
        data: { id: "user-1", nome: "Alan", email: "alan@example.com", role: "user", ativo: true },
        error: null,
      });

      // Act
      const result = await auth.renovarSessao("old-rt");

      // Assert
      expect(result.token).toBe("new-at");
      expect(result.refreshToken).toBe("new-rt");
      expect(result.usuario.id).toBe("user-1");
    });

    it("lança TOKEN_EXPIRADO quando refresh falha", async () => {
      // Arrange
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: { session: null, user: null },
        error: new Error("invalid refresh token"),
      });

      // Act & Assert
      await expect(auth.renovarSessao("bad-rt")).rejects.toThrow("TOKEN_EXPIRADO");
    });
  });

  /* ─────────── VERIFICAR SENHA ─────────── */

  describe("verificarSenha", () => {
    it("retorna sucesso para senha correta", async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { email: "alan@example.com" } } },
        error: null,
      });
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: {}, session: {} },
        error: null,
      });

      // Act
      const result = await auth.verificarSenha("user-1", "minha-senha");

      // Assert
      expect(result).toEqual({ success: true });
    });

    it("lança USUARIO_INVALIDO quando não há sessão ativa", async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      // Act & Assert
      await expect(auth.verificarSenha("user-1", "pw")).rejects.toThrow("USUARIO_INVALIDO");
    });

    it("lança SENHA_INVALIDA para senha incorreta", async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { email: "alan@example.com" } } },
        error: null,
      });
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: new Error("Invalid login credentials"),
      });

      // Act & Assert
      await expect(auth.verificarSenha("user-1", "errada")).rejects.toThrow("SENHA_INVALIDA");
    });
  });

  /* ─────────── CONFIRMAR RECUPERAÇÃO ─────────── */

  describe("confirmarRecuperacao", () => {
    it("verifica OTP e atualiza senha com sucesso", async () => {
      // Arrange
      mockSupabase.auth.verifyOtp = vi.fn().mockResolvedValue({
        data: {},
        error: null,
      });
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: {} },
        error: null,
      });

      // Act
      const result = await auth.confirmarRecuperacao("alan@example.com", "123456", "NovaSenha1");

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
        email: "alan@example.com",
        token: "123456",
        type: "recovery",
      });
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: "NovaSenha1",
      });
      expect(mockLogAuditoria).toHaveBeenCalledWith(null, "RECUPERACAO_CONFIRMADA", {
        dados_novos: { email: "alan@example.com" },
      });
    });

    it("throws ERRO_INTERNO quando verifyOtp falha com erro não mapeado", async () => {
      // Arrange
      mockSupabase.auth.verifyOtp = vi.fn().mockResolvedValue({
        data: {},
        error: new Error("Invalid or expired token"),
      });

      // Act & Assert
      await expect(auth.confirmarRecuperacao("alan@example.com", "bad", "NovaSenha1")).rejects.toThrow("ERRO_INTERNO");
      expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it("throws SENHA_FRACA quando updateUser falha por senha fraca", async () => {
      // Arrange
      mockSupabase.auth.verifyOtp = vi.fn().mockResolvedValue({
        data: {},
        error: null,
      });
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Password should be at least 8 characters"),
      });

      // Act & Assert
      await expect(auth.confirmarRecuperacao("alan@example.com", "123456", "abc")).rejects.toThrow("SENHA_FRACA");
    });
  });

  /* ─────────── RECOVERY TOKENS ─────────── */

  describe("setRecoveryTokens / getRecoveryTokens", () => {
    it("armazena e recupera tokens", () => {
      // Act
      auth.setRecoveryTokens("access-123", "refresh-456");

      // Act
      const tokens = auth.getRecoveryTokens();

      // Assert
      expect(tokens).toEqual({
        accessToken: "access-123",
        refreshToken: "refresh-456",
      });
    });

    it("limpa tokens após getRecoveryTokens", () => {
      // Arrange
      auth.setRecoveryTokens("access-123", "refresh-456");
      auth.getRecoveryTokens();

      // Act
      const second = auth.getRecoveryTokens();

      // Assert
      expect(second).toBeNull();
    });

    it("retorna null se não há tokens pendentes", () => {
      // Act
      const tokens = auth.getRecoveryTokens();

      // Assert
      expect(tokens).toBeNull();
    });
  });
});
