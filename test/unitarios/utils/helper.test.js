/**
 * @file Testes do utilitário de formatação (public/js/helper.js).
 * @description Valida formatarMoeda com locale pt-BR.
 * @module test/unitarios/utils/helper.test.js
 * @changelog
 * [2026-06-17] - Criação
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("helper (formatarMoeda)", () => {
  let formatarMoeda;

  beforeAll(async () => {
    const mod = await import("../../../public/js/helper.js");
    formatarMoeda = mod.formatarMoeda;
  });

  it("formata valor numérico com duas casas decimais", () => {
    expect(formatarMoeda(1234.5)).toBe("1.234,50");
  });

  it("formata zero como 0,00", () => {
    expect(formatarMoeda(0)).toBe("0,00");
  });

  it("formata null como 0,00", () => {
    expect(formatarMoeda(null)).toBe("0,00");
  });

  it("formata undefined como 0,00", () => {
    expect(formatarMoeda(undefined)).toBe("0,00");
  });

  it("formata string numérica", () => {
    expect(formatarMoeda("5000.00")).toBe("5.000,00");
  });

  it("formata valor negativo corretamente", () => {
    expect(formatarMoeda(-99.99)).toBe("-99,99");
  });

  it("formata valor grande com separadores", () => {
    expect(formatarMoeda(1234567.89)).toBe("1.234.567,89");
  });
});
