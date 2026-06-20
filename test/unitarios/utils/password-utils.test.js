/**
 * @file Testes de utilitários de senha (public/js/password-utils.js).
 * @description Valida avaliarRequisitos e iniciarToggleSenha (requisitos de senha e toggle visibilidade).
 * @module test/unitarios/utils/password-utils.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, beforeEach } from "vitest";

describe("password-utils (utilitários de senha)", () => {
  let utils;

  beforeEach(async () => {
    document.body.innerHTML = `
      <ul class="password-requirements">
        <li data-req="length">Mínimo de 8 caracteres</li>
        <li data-req="uppercase">Pelo menos 1 letra maiúscula</li>
        <li data-req="number">Pelo menos 1 número</li>
      </ul>
      <div class="password-wrapper">
        <input id="senhaTest" type="password" />
        <button type="button" class="toggle-password" data-target="senhaTest" aria-label="Mostrar senha">
          <i class="fa-regular fa-eye"></i>
        </button>
      </div>
    `;

    utils = await import("../../../public/js/password-utils.js");
  });

  describe("avaliarRequisitos", () => {
    it("adiciona classe met quando requisito é atendido", () => {
      // Act
      utils.avaliarRequisitos("Senha123");
      const lengthEl = document.querySelector('[data-req="length"]');
      const upperEl = document.querySelector('[data-req="uppercase"]');
      const numberEl = document.querySelector('[data-req="number"]');

      // Assert
      expect(lengthEl.classList.contains("met")).toBe(true);
      expect(upperEl.classList.contains("met")).toBe(true);
      expect(numberEl.classList.contains("met")).toBe(true);
    });

    it("remove classe met quando requisito não é atendido", () => {
      // Act
      utils.avaliarRequisitos("abc");
      const lengthEl = document.querySelector('[data-req="length"]');
      const upperEl = document.querySelector('[data-req="uppercase"]');
      const numberEl = document.querySelector('[data-req="number"]');

      // Assert
      expect(lengthEl.classList.contains("met")).toBe(false);
      expect(upperEl.classList.contains("met")).toBe(false);
      expect(numberEl.classList.contains("met")).toBe(false);
    });

    it("lida com campo de senha vazio", () => {
      // Act
      utils.avaliarRequisitos("");

      // Assert
      document.querySelectorAll("[data-req]").forEach((el) => {
        expect(el.classList.contains("met")).toBe(false);
      });
    });

    it("não lança erro quando elemento não existe", () => {
      // Arrange
      document.body.innerHTML = "";

      // Act & Assert
      expect(() => utils.avaliarRequisitos("Senha1")).not.toThrow();
    });
  });

  describe("iniciarToggleSenha", () => {
    it("alterna tipo do input entre password e text", () => {
      // Act
      utils.iniciarToggleSenha();
      const input = document.getElementById("senhaTest");
      const btn = document.querySelector(".toggle-password");

      // Assert
      expect(input.type).toBe("password");

      // Act
      btn.click();

      // Assert
      expect(input.type).toBe("text");

      // Act
      btn.click();

      // Assert
      expect(input.type).toBe("password");
    });

    it("alterna classe do ícone", () => {
      // Act
      utils.iniciarToggleSenha();
      const btn = document.querySelector(".toggle-password");
      const icon = btn.querySelector("i");

      // Assert
      expect(icon.className).toBe("fa-regular fa-eye");

      // Act
      btn.click();

      // Assert
      expect(icon.className).toBe("fa-regular fa-eye-slash");

      // Act
      btn.click();

      // Assert
      expect(icon.className).toBe("fa-regular fa-eye");
    });

    it("atualiza aria-label do botão", () => {
      // Act
      utils.iniciarToggleSenha();
      const btn = document.querySelector(".toggle-password");

      // Assert
      expect(btn.getAttribute("aria-label")).toBe("Mostrar senha");

      // Act
      btn.click();

      // Assert
      expect(btn.getAttribute("aria-label")).toBe("Esconder senha");
    });

    it("lida com target inexistente sem lançar erro", () => {
      // Arrange
      const btn = document.querySelector(".toggle-password");
      btn.dataset.target = "inexistente";

      // Act
      utils.iniciarToggleSenha();

      // Assert
      expect(() => btn.click()).not.toThrow();
    });

    it("funciona com múltiplos botões toggle", () => {
      // Arrange
      document.body.innerHTML += `
        <div class="password-wrapper">
          <input id="outroInput" type="password" />
          <button type="button" class="toggle-password" data-target="outroInput">
            <i class="fa-regular fa-eye"></i>
          </button>
        </div>
      `;

      // Act
      utils.iniciarToggleSenha();

      // Assert
      const botoes = document.querySelectorAll(".toggle-password");
      expect(botoes.length).toBe(2);

      // Act
      botoes[1].click();

      // Assert
      expect(document.getElementById("outroInput").type).toBe("text");
    });
  });
});
