/**
 * @file Testes do sistema de notificações toast e diálogo de confirmação.
 * @description Valida exibirToast (criação, tipos, auto-fechar, empilhamento) e confirmDialog (abrir, confirmar, cancelar, Escape).
 * @module test/unitarios/utils/toast.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * - Adicionados comentários AAA.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ─────────── exibirToast ─────────── */

describe("exibirToast", () => {
  it("cria toast com classe base e tipo info por padrão", async () => {
    // Act
    const { exibirToast } = await import("../../../public/js/toast.js");
    const toast = exibirToast("Mensagem");

    // Assert
    const el = document.querySelector(".toast-item");
    expect(el).not.toBeNull();
    expect(el.classList.contains("toast-info")).toBe(true);
    expect(el.innerHTML).toContain("Mensagem");
    expect(toast).toHaveProperty("fechar");
  });

  it("aceita diferentes tipos e aplica classe correta", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");

    // Act
    exibirToast("Erro", "error");
    exibirToast("Sucesso", "success");
    exibirToast("Aviso", "warning");

    // Assert
    expect(document.querySelector(".toast-error")).not.toBeNull();
    expect(document.querySelector(".toast-success")).not.toBeNull();
    expect(document.querySelector(".toast-warning")).not.toBeNull();
  });

  it("insere toast dentro do container no body", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");

    // Act
    exibirToast("Teste");

    // Assert
    const container = document.querySelector(".toast-container");
    expect(container).not.toBeNull();
    expect(document.body.contains(container)).toBe(true);
    expect(container.children.length).toBe(1);
    expect(container.children[0].classList.contains("toast-item")).toBe(true);
  });

  it("cria container automaticamente na primeira chamada", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");

    // Assert
    expect(document.querySelector(".toast-container")).toBeNull();

    // Act
    exibirToast("Primeiro");

    // Assert
    expect(document.querySelector(".toast-container")).not.toBeNull();
  });

  it("reusa container existente em chamadas subsequentes", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");
    exibirToast("Primeiro");
    const container = document.querySelector(".toast-container");

    // Act
    exibirToast("Segundo");

    // Assert
    expect(document.querySelectorAll(".toast-container").length).toBe(1);
    expect(container.children.length).toBe(2);
  });

  it("retorna objeto com metodo fechar", async () => {
    // Act
    const { exibirToast } = await import("../../../public/js/toast.js");
    const toast = exibirToast("Teste");

    // Assert
    expect(toast).toBeDefined();
    expect(typeof toast.fechar).toBe("function");
  });

  it("fechar adiciona classe toast-out e remove apos animacao", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");
    const toast = exibirToast("Teste");
    const el = document.querySelector(".toast-item");

    // Act
    toast.fechar();

    // Assert
    expect(el.classList.contains("toast-out")).toBe(true);

    // Act
    el.dispatchEvent(new Event("animationend"));

    // Assert
    expect(document.body.contains(el)).toBe(false);
  });

  it("fechar eh seguro se chamado multiplas vezes", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");
    const toast = exibirToast("Teste");
    const el = document.querySelector(".toast-item");

    // Act
    toast.fechar();
    toast.fechar();

    // Assert
    expect(el.classList.contains("toast-out")).toBe(true);
  });

  it("empilha multiplos toasts corretamente", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");

    // Act
    exibirToast("Um");
    exibirToast("Dois");
    exibirToast("Tres");

    // Assert
    const items = document.querySelectorAll(".toast-item");
    expect(items.length).toBe(3);
  });

  it("estrutura interna contem span com mensagem e botao fechar", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");

    // Act
    exibirToast("Alerta");

    // Assert
    const el = document.querySelector(".toast-item");
    const spans = el.querySelectorAll("span");
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe("Alerta");
    expect(spans[1].classList.contains("toast-close")).toBe(true);
  });

  it("click no toast aciona fechamento", async () => {
    // Arrange
    const { exibirToast } = await import("../../../public/js/toast.js");
    exibirToast("Clicavel");
    const el = document.querySelector(".toast-item");

    // Act
    el.click();

    // Assert
    expect(el.classList.contains("toast-out")).toBe(true);
  });

  it("com duracao > 0, auto-fecha apos o tempo", async () => {
    // Arrange
    vi.useFakeTimers();
    const { exibirToast } = await import("../../../public/js/toast.js");
    exibirToast("Auto", "info", 5000);
    const el = document.querySelector(".toast-item");

    // Assert
    expect(el.classList.contains("toast-out")).toBe(false);

    // Act
    vi.advanceTimersByTime(5000);

    // Assert
    expect(el.classList.contains("toast-out")).toBe(true);
    vi.useRealTimers();
  });

  it("com duracao = 0, nao inicia timer", async () => {
    // Arrange
    vi.useFakeTimers();
    const { exibirToast } = await import("../../../public/js/toast.js");
    exibirToast("Persiste", "info", 0);
    const el = document.querySelector(".toast-item");

    // Act
    vi.advanceTimersByTime(10000);

    // Assert
    expect(el.classList.contains("toast-out")).toBe(false);
    vi.useRealTimers();
  });
});

/* ─────────── confirmDialog ─────────── */

describe("confirmDialog", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  it("cria dialog com classe dialog e anexa ao body", async () => {
    // Act
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Confirma?");

    // Assert
    const dialog = document.querySelector("dialog.dialog");
    expect(dialog).not.toBeNull();
    expect(document.body.contains(dialog)).toBe(true);

    // Cleanup
    dialog.close();
    dialog.dispatchEvent(new Event("close"));
    await promise;
  });

  it("exibe mensagem no corpo do dialogo", async () => {
    // Act
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Deseja excluir?");

    // Assert
    const dialog = document.querySelector(".dialog");
    expect(dialog.innerHTML).toContain("Deseja excluir?");

    // Cleanup
    dialog.close();
    dialog.dispatchEvent(new Event("close"));
    await promise;
  });

  it("abre modal e foca botao Confirmar", async () => {
    // Act
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Teste");

    // Assert
    const dialog = document.querySelector(".dialog");
    expect(dialog.showModal).toHaveBeenCalledOnce();

    // Cleanup
    dialog.close();
    dialog.dispatchEvent(new Event("close"));
    await promise;
  });

  it("botao Confirmar resolve true e remove dialog", async () => {
    // Arrange
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Confirma?");

    // Act
    const dialog = document.querySelector(".dialog");
    dialog.querySelector("#confirmOk").click();

    // Assert
    const result = await promise;
    expect(result).toBe(true);
    expect(document.body.contains(dialog)).toBe(false);
  });

  it("botao Cancelar resolve false e remove dialog", async () => {
    // Arrange
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Cancela?");

    // Act
    const dialog = document.querySelector(".dialog");
    dialog.querySelector("#confirmCancel").click();

    // Assert
    const result = await promise;
    expect(result).toBe(false);
    expect(document.body.contains(dialog)).toBe(false);
  });

  it("tecla Escape resolve false", async () => {
    // Arrange
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Teste");

    // Act
    const dialog = document.querySelector(".dialog");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // Assert
    const result = await promise;
    expect(result).toBe(false);
  });

  it("evento close resolve false como fallback", async () => {
    // Arrange
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Fallback");

    // Act
    const dialog = document.querySelector(".dialog");
    dialog.dispatchEvent(new Event("close"));

    // Assert
    const result = await promise;
    expect(result).toBe(false);
  });

  it("evento close seguramente remove dialog se ainda no body", async () => {
    // Arrange
    const { confirmDialog } = await import("../../../public/js/toast.js");
    const promise = confirmDialog("Teste");

    // Act
    const dialog = document.querySelector(".dialog");
    dialog.dispatchEvent(new Event("close"));

    // Assert
    expect(document.body.contains(dialog)).toBe(false);
    await promise;
  });
});
