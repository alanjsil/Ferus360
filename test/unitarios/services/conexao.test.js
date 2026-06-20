/**
 * @file Testes do gerenciador de conexão Supabase (services/conexao.ts).
 * @description Valida monitoramento de conectividade, detecção online/offline e fallback.
 * @module test/unitarios/services/conexao.test.js
 * @changelog
 * [2026-06-17] - Criação
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MOCK_FETCH_OK = vi.fn().mockResolvedValue({ status: 200, ok: true });
const _MOCK_FETCH_FAIL = vi.fn().mockRejectedValue(new Error("network error"));

describe("conexao (serviço de conectividade Supabase)", () => {
  let conexao;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("setInterval", vi.fn(() => 999));
    vi.stubGlobal("clearInterval", vi.fn());
    global.fetch = MOCK_FETCH_OK;
    conexao = await import("../../../services/conexao.js");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("estaOnline", () => {
    it("retorna true quando fetch responde <500", async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 200 });

      const result = await conexao.estaOnline();

      expect(result).toBe(true);
    });

    it("retorna false quando fetch falha", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

      const result = await conexao.estaOnline();

      expect(result).toBe(false);
    });

    it("retorna false quando status >= 500", async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 503 });

      const result = await conexao.estaOnline();

      expect(result).toBe(false);
    });
  });

  describe("isOnline", () => {
    it("retorna false inicialmente (_online = false)", () => {
      expect(conexao.isOnline()).toBe(false);
    });
  });

  describe("onStatusChange", () => {
    it("dispara callback com status quando conectividade muda", async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 200 });

      const callback = vi.fn();
      conexao.onStatusChange(callback);
      conexao.iniciarMonitoramento();

      await new Promise((r) => setTimeout(r, 50));

      expect(callback).toHaveBeenCalled();
    });
  });

  describe("monitoramento", () => {
    it("iniciarMonitoramento cria interval", () => {
      conexao.iniciarMonitoramento();
      expect(setInterval).toHaveBeenCalled();
    });

    it("pararMonitoramento limpa interval", () => {
      conexao.iniciarMonitoramento();
      conexao.pararMonitoramento();
      expect(clearInterval).toHaveBeenCalledWith(999);
    });
  });

  describe("fetch global null", () => {
    it("estaOnline retorna false se fetch falha", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("no fetch"));

      const result = await conexao.estaOnline();

      expect(result).toBe(false);
    });
  });
});
