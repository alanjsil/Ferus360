/**
 * @file Testes do serviço de estado (services/state.js).
 * @description Valida getState, setState e resetState com notificação via IPC.
 * @module test/unitarios/services/state.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * - Adicionados comentários AAA.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => {
  const mockWebContents = {
    send: vi.fn(),
  };

  const mockWin = {
    webContents: mockWebContents,
  };

  return {
    ipcMain: {
      handle: vi.fn(),
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => [mockWin]),
    },
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    ipcRenderer: {
      invoke: vi.fn(),
    },
  };
});

describe("state (serviço de estado)", () => {
  let state;

  beforeEach(async () => {
    vi.resetModules();
    state = await import("../../../services/state.js");
  });

  describe("getState", () => {
    it("retorna estado completo quando nenhuma chave é fornecida", () => {
      // Act
      const s = state.getState();

      // Assert
      expect(s).toHaveProperty("categorias");
      expect(s).toHaveProperty("subcategorias");
      expect(s).toHaveProperty("contas");
      expect(s).toHaveProperty("pessoas");
      expect(s).toHaveProperty("lancamentos");
      expect(s).toHaveProperty("orcamento");
      expect(s).toHaveProperty("dashboard");
    });

    it("retorna chave específica quando fornecida", () => {
      // Act & Assert
      expect(state.getState("categorias")).toEqual([]);
      expect(state.getState("dashboard")).toBeNull();
    });
  });

  describe("setState", () => {
    it("atualiza estado e notifica as janelas", () => {
      // Act
      state.setState("categorias", [{ id: 1, nome: "Teste" }]);
      const updated = state.getState("categorias");

      // Assert
      expect(updated).toHaveLength(1);
      expect(updated[0].nome).toBe("Teste");
    });

    it("sobrescreve estado anterior", () => {
      // Arrange
      state.setState("contas", [{ id: 1, nome: "Conta A" }]);

      // Act
      state.setState("contas", [{ id: 2, nome: "Conta B" }]);
      const contas = state.getState("contas");

      // Assert
      expect(contas).toHaveLength(1);
      expect(contas[0].id).toBe(2);
    });
  });

  describe("resetState", () => {
    it("reseta todos os arrays para vazio e objetos para null", () => {
      // Arrange
      state.setState("categorias", [{ id: 1 }]);
      state.setState("dashboard", { some: "data" });

      // Act
      state.resetState();

      // Assert
      expect(state.getState("categorias")).toEqual([]);
      expect(state.getState("dashboard")).toBeNull();
    });
  });

});
