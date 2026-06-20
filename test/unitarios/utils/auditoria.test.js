/**
 * @file Testes do sistema de auditoria (SPEC-11).
 * @description Valida que auth.js e admin.js disparam logs de auditoria corretamente nas ações de login, logout, troca de senha e admin.
 * @module test/unitarios/utils/auditoria.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, vi } from "vitest";

describe("auditoria (spec-11)", () => {
  /* ─────────── auth.js calls logAuditoria ─────────── */

  describe("auth.js chama logAuditoria", () => {
    it("chama logAuditoria no LOGIN bem-sucedido", async () => {
      // Arrange
      const logSpy = vi.fn().mockResolvedValue({});

      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: {
              user: { id: "user-1" },
              session: { access_token: "at", refresh_token: "rt" },
            },
            error: null,
          }),
          signOut: vi.fn(),
          getSession: vi.fn(),
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "user-1", nome: "A", email: "a@t.com", role: "user", ativo: true },
            error: null,
          }),
        })),
      };

      const mod = await import("../../../services/auth.js");
      const auth = mod.buildAuthService({
        supabase: mockSupabase,
        logAuditoria: logSpy,
        onLogin: vi.fn(),
        onLogout: vi.fn(),
      });

      // Act
      await auth.login("a@t.com", "pw");

      // Assert
      expect(logSpy).toHaveBeenCalledWith("user-1", "LOGIN");
    });

    it("chama logAuditoria no LOGIN_FAILED", async () => {
      // Arrange
      const logSpy = vi.fn().mockResolvedValue({});

      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Invalid login credentials" },
          }),
        },
        from: vi.fn(),
      };

      const mod = await import("../../../services/auth.js");
      const auth = mod.buildAuthService({
        supabase: mockSupabase,
        logAuditoria: logSpy,
      });

      // Act & Assert
      await expect(auth.login("wrong@t.com", "badpw")).rejects.toThrow("CREDENCIAIS_INVALIDAS");
      expect(logSpy).toHaveBeenCalledWith(null, "LOGIN_FAILED", {
        dados_novos: { email: "wrong@t.com" },
      });
    });

    it("chama logAuditoria no LOGOUT", async () => {
      // Arrange
      const loggedCalls = [];
      const fakeLogger = async (uid, acao, meta) => {
        loggedCalls.push({ uid, acao, meta });
        return {};
      };

      const signOutSpy = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { user: { id: "user-1" } } },
          }),
          signOut: signOutSpy,
        },
        from: vi.fn(),
      };

      const mod = await import("../../../services/auth.js");
      const auth = mod.buildAuthService({
        supabase: mockSupabase,
        logAuditoria: fakeLogger,
        onLogout: vi.fn(),
      });

      // Act
      const result = await auth.logout();

      // Assert
      expect(mockSupabase.auth.getSession).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      expect(loggedCalls).toHaveLength(1);
      expect(loggedCalls[0].acao).toBe("LOGOUT");
      expect(signOutSpy).toHaveBeenCalled();
    });

    it("chama logAuditoria no SENHA_TROCADA", async () => {
      // Arrange
      const logSpy = vi.fn().mockResolvedValue({});

      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { user: { email: "a@t.com" } } },
          }),
          signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
          updateUser: vi.fn().mockResolvedValue({ error: null }),
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };

      const mockCreateClient = vi.fn(() => ({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      }));

      const mod = await import("../../../services/auth.js");
      const auth = mod.buildAuthService({
        supabase: mockSupabase,
        createClient: mockCreateClient,
        logAuditoria: logSpy,
      });

      // Act
      await auth.trocarSenha("user-1", "old", "new");

      // Assert
      expect(logSpy).toHaveBeenCalledWith("user-1", "SENHA_TROCADA");
    });
  });

  /* ─────────── admin.js getAuditoria ─────────── */

  describe("admin getAuditoria", () => {
    it("retorna logs filtrados", async () => {
      // Arrange
      const mockRepo = {
        getAuditoria: vi.fn().mockResolvedValue([
          { id: "aud-1", acao: "LOGIN", usuario_id: "00000000-0000-0000-0000-000000000001" },
        ]),
      };
      const mockAuth = {
        verificarSessao: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }),
      };

      const mod = await import("../../../services/admin.js");
      const admin = mod.buildAdminService({
        repository: mockRepo,
        auth: mockAuth,
      });

      // Act
      const result = await admin.getAuditoria({ acao: "LOGIN" });

      // Assert
      expect(mockRepo.getAuditoria).toHaveBeenCalledWith({ acao: "LOGIN" });
      expect(result).toHaveLength(1);
      expect(result[0].acao).toBe("LOGIN");
    });

    it("lança UNAUTHORIZED para não-admin", async () => {
      // Arrange
      const mockAuth = {
        verificarSessao: vi.fn().mockRejectedValue(new Error("UNAUTHORIZED")),
      };

      const mod = await import("../../../services/admin.js");
      const admin = mod.buildAdminService({
        repository: { getAuditoria: vi.fn() },
        auth: mockAuth,
      });

      // Act & Assert
      await expect(admin.getAuditoria()).rejects.toThrow("UNAUTHORIZED");
    });
  });

  /* ─────────── admin.js logAuditoria calls ─────────── */

  describe("admin.js chama logAuditoria", () => {
    it("toggleCliente registra ADMIN_TOGGLE_USUARIO", async () => {
      // Arrange
      const logSpy = vi.fn().mockResolvedValue({});
      const mockRepo = {
        toggleClienteStatus: vi.fn().mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001", ativo: false }),
        logAuditoria: logSpy,
      };
      const mockAuth = {
        verificarSessao: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }),
      };

      const mod = await import("../../../services/admin.js");
      const admin = mod.buildAdminService({
        repository: mockRepo,
        auth: mockAuth,
      });

      // Act
      await admin.toggleCliente("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(logSpy).toHaveBeenCalledWith("admin-1", "ADMIN_TOGGLE_USUARIO", {
        entidade: "usuarios",
        entidade_id: "00000000-0000-0000-0000-000000000001",
        dados_novos: { ativo: false },
        contexto: "admin",
      });
    });

    it("resetSenha registra ADMIN_RESET_SENHA", async () => {
      // Arrange
      const logSpy = vi.fn().mockResolvedValue({});
      const mockRepo = {
        getPerfil: vi.fn().mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001", email: "user@t.com" }),
        logAuditoria: logSpy,
      };
      const mockAuth = {
        verificarSessao: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }),
        solicitarRecuperacao: vi.fn(),
      };

      const mod = await import("../../../services/admin.js");
      const admin = mod.buildAdminService({
        repository: mockRepo,
        auth: mockAuth,
      });

      // Act
      await admin.resetSenha("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(logSpy).toHaveBeenCalledWith("admin-1", "ADMIN_RESET_SENHA", {
        entidade: "usuarios",
        entidade_id: "00000000-0000-0000-0000-000000000001",
        dados_novos: { email: "user@t.com" },
        contexto: "admin",
      });
    });
  });
});
