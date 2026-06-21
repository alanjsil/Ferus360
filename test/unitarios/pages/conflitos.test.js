/**
 * @file Testes da página de conflitos de sincronia (public/conflitos.html).
 * @description Valida renderização de conflitos, merge dialog, resolução e forçar sync.
 * @module test/unitarios/pages/conflitos.test.js
 * @changelog
 * [2026-06-17] - Criação
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(
  path.resolve(__dirname, "../../../public/conflitos.html"),
  "utf-8"
);

HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();

vi.mock("../../../public/js/auth-guard.js", () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue({ token: "t", usuario: { id: "u1" } }),
}));

vi.mock("../../../public/js/toast.js", () => ({
  exibirToast: vi.fn(),
}));

vi.mock("../../../public/js/helper.js", () => ({
  formatarMoeda: vi.fn((v) => String(v)),
}));

function baseMocks() {
  return {
    getConflitos: vi.fn().mockResolvedValue([]),
    resolverConflito: vi.fn().mockResolvedValue({ success: true }),
    forcarSync: vi.fn().mockResolvedValue({}),
    logError: vi.fn(),
    logWarn: vi.fn(),
  };
}

async function loadModule() {
  vi.resetModules();
  await import("../../../public/js/conflitos.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));
}

describe("conflitos (página de conflitos de sincronia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = html;
    window.electronAPI = baseMocks();
  });

  describe("inicialização", () => {
    it("carrega conflitos ao iniciar", async () => {
      await loadModule();
      expect(window.electronAPI.getConflitos).toHaveBeenCalled();
    });

    it("mostra empty state quando não há conflitos", async () => {
      await loadModule();
      const empty = document.getElementById("emptyState");
      expect(empty.hidden).toBe(false);
    });
  });

  describe("renderizarCards", () => {
    it("cria cards para cada conflito", async () => {
      const { renderizarCards } = await import("../../../public/js/conflitos.js");
      const conflitos = [
        {
          id: "c1",
          entidade: "financas_lancamentos",
          local_data: JSON.stringify({ descricao: "local", valor: 100 }),
          remote_data: JSON.stringify({ descricao: "remote", valor: 200 }),
          created_at: "2026-01-15T10:00:00Z",
        },
      ];

      renderizarCards(conflitos);

      const cards = document.querySelectorAll(".conflito-card");
      expect(cards).toHaveLength(1);
      expect(cards[0].querySelector(".entidade")?.textContent).toContain("Lançamento");
    });

    it("esconde empty state quando há conflitos", async () => {
      const { renderizarCards } = await import("../../../public/js/conflitos.js");
      const conflitos = [
        {
          id: "c1",
          entidade: "financas_contas",
          local_data: "{}",
          remote_data: "{}",
          created_at: "2026-01-15T10:00:00Z",
        },
      ];

      renderizarCards(conflitos);

      expect(document.getElementById("emptyState").hidden).toBe(true);
    });

    it("inclui ações no card: local, remoto e mesclar", async () => {
      const { renderizarCards } = await import("../../../public/js/conflitos.js");
      const conflitos = [
        {
          id: "c1",
          entidade: "test",
          local_data: "{}",
          remote_data: "{}",
          created_at: null,
        },
      ];

      renderizarCards(conflitos);

      const card = document.querySelector(".conflito-card");
      expect(card.querySelector(".btn-keep-local")).not.toBeNull();
      expect(card.querySelector(".btn-accept-remote")).not.toBeNull();
      expect(card.querySelector(".btn-merge")).not.toBeNull();
    });
  });

  describe("atualizarBadge", () => {
    it("salva contagem no localStorage", async () => {
      const { atualizarBadge } = await import("../../../public/js/conflitos.js");

      atualizarBadge(5);

      expect(localStorage.getItem("fnc:v1:conflitos_count")).toBe("5");
    });
  });

  describe("resolver", () => {
    it("chama resolverConflito via electronAPI", async () => {
      const { resolver } = await import("../../../public/js/conflitos.js");
      const conflito = { id: "c1", entidade: "test" };

      await resolver("local", conflito, null);

      expect(window.electronAPI.resolverConflito).toHaveBeenCalledWith("c1", "local", null);
    });

    it("força sync após resolver", async () => {
      const { resolver } = await import("../../../public/js/conflitos.js");
      const conflito = { id: "c1", entidade: "test" };

      await resolver("local", conflito, null);

      expect(window.electronAPI.forcarSync).toHaveBeenCalled();
    });

    it("remove card com animação ao resolver", async () => {
      const { resolver, renderizarCards } = await import("../../../public/js/conflitos.js");
      const conflito = { id: "c1", entidade: "test", local_data: "{}", remote_data: "{}", created_at: "2026-01-15T10:00:00Z" };
      renderizarCards([conflito]);

      await resolver("local", conflito, null, document.querySelector(".conflito-card"));

      await new Promise((r) => setTimeout(r, 500));
      expect(document.querySelectorAll(".conflito-card").length).toBe(0);
    }, 2000);
  });

  describe("merge dialog", () => {
    it("abre dialogo com campos do conflito", async () => {
      const { renderizarCards, abrirMergeDialog } = await import("../../../public/js/conflitos.js");
      const conflito = { id: "c1", entidade: "test", local_data: "{}", remote_data: "{}", created_at: null };
      renderizarCards([conflito]);
      const local = { descricao: "local", valor: 100 };
      const remote = { descricao: "remote", valor: 200 };
      const diffs = [
        { chave: "descricao", valorLocal: "local", valorRemote: "remote", diferente: true },
      ];

      abrirMergeDialog(conflito, local, remote, diffs);

      expect(document.getElementById("mergeDialog").showModal).toHaveBeenCalled();
      expect(document.querySelector("#mergeForm input")).not.toBeNull();
    });
  });
});
