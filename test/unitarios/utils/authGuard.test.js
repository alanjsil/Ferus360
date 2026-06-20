/**
 * @file Testes do guardião de autenticação (public/js/auth-guard.js).
 * @description Valida store/clear/get de sessão, ensureAuthenticated, restoreSession, renewFromRefreshToken e escapeHtml.
 * @module test/unitarios/utils/authGuard.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ACCESS_TOKEN_KEY,
  clearAuthSession,
  ensureAuthenticated,
  escapeHtml,
  getAccessToken,
  getRefreshToken,
  REFRESH_TOKEN_KEY,
  restoreSession,
  renewFromRefreshToken,
  storeAuthSession,
} from "../../../public/js/auth-guard.js";

const SESSION = {
  token: "access:user-1:session-1:alan@example.com:user",
  refreshToken: "refresh:user-1:session-1:alan@example.com:user",
  usuario: { id: "user-1", nome: "Alan", email: "alan@example.com", role: "user" },
};

describe("auth-guard (guardião de autenticação)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.electronAPI = {
      renovarAuth: vi.fn().mockResolvedValue({ ...SESSION }),
      verificarAuth: vi.fn().mockResolvedValue({ ...SESSION.usuario }),
    };
    vi.stubGlobal("location", { href: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* ── store / clear / get ── */

  it("stores and clears auth session keys", () => {
    // Act
    storeAuthSession({ ...SESSION, rememberMe: true });

    // Assert
    expect(getAccessToken()).toBe(SESSION.token);
    expect(getRefreshToken()).toBe(SESSION.refreshToken);

    // Act
    clearAuthSession();

    // Assert
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("storeAuthSession without rememberMe does not persist refresh token", () => {
    // Act
    storeAuthSession({ ...SESSION, rememberMe: false });

    // Assert
    expect(getRefreshToken()).toBeNull();
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe(SESSION.token);
  });

  it("storeAuthSession without refreshToken does not store it", () => {
    // Act
    storeAuthSession({ token: SESSION.token, usuario: SESSION.usuario, rememberMe: true });

    // Assert
    expect(getRefreshToken()).toBeNull();
  });

  it("getAccessToken falls back to localStorage", () => {
    // Arrange
    localStorage.setItem(ACCESS_TOKEN_KEY, SESSION.token);

    // Act & Assert
    expect(getAccessToken()).toBe(SESSION.token);
  });

  it("getAccessToken falls back to legacy 'token' key", () => {
    // Arrange
    localStorage.setItem("token", SESSION.token);

    // Act & Assert
    expect(getAccessToken()).toBe(SESSION.token);
  });

  it("getAccessToken prefers sessionStorage over localStorage", () => {
    // Arrange
    sessionStorage.setItem(ACCESS_TOKEN_KEY, "session-token");
    localStorage.setItem(ACCESS_TOKEN_KEY, "local-token");

    // Act & Assert
    expect(getAccessToken()).toBe("session-token");
  });

  /* ── ensureAuthenticated ── */

  it("returns session when token is valid", async () => {
    // Arrange
    sessionStorage.setItem(ACCESS_TOKEN_KEY, SESSION.token);
    sessionStorage.setItem("token", SESSION.token);

    // Act
    const result = await ensureAuthenticated({ redirectOnFailure: false });

    // Assert
    expect(result.token).toBe(SESSION.token);
    expect(result.usuario.role).toBe("user");
  });

  it("renews token via refresh token when access token is missing", async () => {
    // Arrange
    localStorage.setItem(REFRESH_TOKEN_KEY, SESSION.refreshToken);

    // Act
    const result = await ensureAuthenticated({ redirectOnFailure: false });

    // Assert
    expect(window.electronAPI.renovarAuth).toHaveBeenCalledWith(SESSION.refreshToken);
    expect(result.token).toBe(SESSION.token);
  });

  it("renews token when verificarAuth fails", async () => {
    // Arrange
    window.electronAPI.verificarAuth.mockRejectedValue(new Error("expired"));
    localStorage.setItem(REFRESH_TOKEN_KEY, SESSION.refreshToken);
    sessionStorage.setItem(ACCESS_TOKEN_KEY, SESSION.token);

    // Act
    const result = await ensureAuthenticated({ redirectOnFailure: false });

    // Assert
    expect(window.electronAPI.renovarAuth).toHaveBeenCalled();
    expect(result.token).toBe(SESSION.token);
  });

  it("redirects to login when unauthenticated", async () => {
    // Act
    await ensureAuthenticated({ redirectTo: "login.html", redirectOnFailure: true });

    // Assert
    expect(window.location.href).toBe("login.html");
  });

  it("returns null without redirect when redirectOnFailure is false", async () => {
    // Act
    const result = await ensureAuthenticated({ redirectOnFailure: false });

    // Assert
    expect(result).toBeNull();
    expect(window.location.href).toBe("");
  });

  it("blocks non-admin when requireAdmin is true", async () => {
    // Arrange
    sessionStorage.setItem(ACCESS_TOKEN_KEY, SESSION.token);
    sessionStorage.setItem("token", SESSION.token);

    // Act
    const result = await ensureAuthenticated({ requireAdmin: true, redirectOnFailure: false });

    // Assert
    expect(result).toBeNull();
  });

  it("redirects non-admin to index.html when requireAdmin is true", async () => {
    // Arrange
    sessionStorage.setItem(ACCESS_TOKEN_KEY, SESSION.token);
    sessionStorage.setItem("token", SESSION.token);

    // Act
    await ensureAuthenticated({ requireAdmin: true, redirectOnFailure: true });

    // Assert
    expect(window.location.href).toBe("index.html");
  });

  it("allows admin user when requireAdmin is true", async () => {
    // Arrange
    const adminSession = {
      ...SESSION,
      usuario: { ...SESSION.usuario, role: "admin" },
    };
    window.electronAPI.verificarAuth.mockResolvedValue(adminSession.usuario);
    sessionStorage.setItem(ACCESS_TOKEN_KEY, adminSession.token);
    sessionStorage.setItem("token", adminSession.token);

    // Act
    const result = await ensureAuthenticated({ requireAdmin: true, redirectOnFailure: false });

    // Assert
    expect(result.usuario.role).toBe("admin");
  });

  it("returns null when renewFromRefreshToken also fails", async () => {
    // Arrange
    window.electronAPI.renovarAuth.mockRejectedValue(new Error("fail"));
    localStorage.setItem(REFRESH_TOKEN_KEY, SESSION.refreshToken);

    // Act
    const result = await ensureAuthenticated({ redirectOnFailure: false });

    // Assert
    expect(result).toBeNull();
  });

  /* ── restoreSession ── */

  it("restores session from refresh token", async () => {
    // Arrange
    localStorage.setItem(REFRESH_TOKEN_KEY, SESSION.refreshToken);

    // Act
    const restored = await restoreSession();

    // Assert
    expect(window.electronAPI.renovarAuth).toHaveBeenCalledWith(SESSION.refreshToken);
    expect(restored.usuario.role).toBe("user");
    expect(getAccessToken()).toBe(SESSION.token);
  });

  it("restoreSession returns null when no refresh token", async () => {
    // Act
    const restored = await restoreSession();

    // Assert
    expect(restored).toBeNull();
  });

  /* ── renewFromRefreshToken ── */

  it("renewFromRefreshToken renews and stores session", async () => {
    // Arrange
    localStorage.setItem(REFRESH_TOKEN_KEY, SESSION.refreshToken);

    // Act
    const result = await renewFromRefreshToken();

    // Assert
    expect(result.token).toBe(SESSION.token);
    expect(getAccessToken()).toBe(SESSION.token);
  });

  it("renewFromRefreshToken returns null when no refresh token", async () => {
    // Act
    const result = await renewFromRefreshToken();

    // Assert
    expect(result).toBeNull();
  });

  /* ── escapeHtml ── */

  it("escapeHtml replaces special characters", () => {
    // Act & Assert
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
    expect(escapeHtml("it's a test")).toBe("it&#39;s a test");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapeHtml returns empty string for null/undefined", () => {
    // Act & Assert
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("escapeHtml converts non-string to string", () => {
    // Act & Assert
    expect(escapeHtml(42)).toBe("42");
  });
});
