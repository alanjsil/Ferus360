/**
 * @file Testes do serviço de log CSV (services/logger.ts).
 * @description Valida init, error, warn, escrita de CSV e casos de borda.
 * @module test/unitarios/services/logger.test.js
 * @changelog
 * [2026-06-17] - Criação
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
const csvPath = path.join(dirTmp, "logs", "financas-erros.csv");

describe("logger (serviço de log CSV)", () => {
  let logger;

  beforeEach(async () => {
    vi.resetModules();
    // Limpa diretório entre testes
    if (fs.existsSync(dirTmp)) {
      fs.rmSync(dirTmp, { recursive: true, force: true });
    }
    logger = await import("../../../services/logger.js");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(dirTmp)) {
        fs.rmSync(dirTmp, { recursive: true, force: true });
      }
    } catch { /* ok */ }
  });

  describe("init", () => {
    it("cria diretório logs quando não existe", () => {
      logger.init(dirTmp);

      expect(fs.existsSync(path.join(dirTmp, "logs"))).toBe(true);
    });

    it("cria arquivo CSV com cabeçalho quando não existe", () => {
      logger.init(dirTmp);

      const conteudo = fs.readFileSync(csvPath, "utf-8");
      expect(conteudo).toBe("timestamp,level,context,message,stack\n");
    });

    it("não recria cabeçalho se CSV já existe", () => {
      logger.init(dirTmp);
      fs.appendFileSync(csvPath, "extra\n", "utf-8");

      logger.init(dirTmp);

      const conteudo = fs.readFileSync(csvPath, "utf-8");
      expect(conteudo.split("\n").length).toBe(3);
    });
  });

  describe("error", () => {
    it("escreve linha ERROR no CSV", () => {
      logger.init(dirTmp);

      logger.error("auth", "falha ao logar", new Error("token inválido"));

      const conteudo = fs.readFileSync(csvPath, "utf-8");
      expect(conteudo).toContain("ERROR");
      expect(conteudo).toContain("auth");
      expect(conteudo).toContain("falha ao logar");
    });
  });

  describe("warn", () => {
    it("escreve linha WARN no CSV", () => {
      logger.init(dirTmp);

      logger.warn("sync", "fallback ativado");

      const conteudo = fs.readFileSync(csvPath, "utf-8");
      expect(conteudo).toContain("WARN");
      expect(conteudo).toContain("sync");
      expect(conteudo).toContain("fallback ativado");
    });
  });

  describe("escape CSV", () => {
    it("escapa campos com aspas duplas", () => {
      logger.init(dirTmp);

      logger.error("ctx", 'mensagem com "aspas"');

      const conteudo = fs.readFileSync(csvPath, "utf-8");
      expect(conteudo).toContain('"mensagem com ""aspas"""');
    });

    it("trata err não-Error (string)", () => {
      logger.init(dirTmp);

      logger.error("ctx", "erro", "string-error");

      const conteudo = fs.readFileSync(csvPath, "utf-8");
      expect(conteudo).toContain("string-error");
    });

    it("tem stack vazio quando err é undefined", () => {
      logger.init(dirTmp);

      logger.error("ctx", "msg");

      const conteudo = fs.readFileSync(csvPath, "utf-8");
      const partes = conteudo.trim().split("\n")[1].split(",");
      expect(partes[4]).toBe("");
    });
  });

  describe("sem init", () => {
    it("não escreve se init nunca foi chamado", () => {
      logger.error("ctx", "msg");

      expect(fs.existsSync(csvPath)).toBe(false);
    });
  });
});
