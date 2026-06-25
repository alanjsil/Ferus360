/**
 * @file Testes do utilitário de CSV (public/js/csv.js).
 * @description Valida converterParaCSV e gerarTemplateCSV.
 * @module test/unitarios/utils/csv.test.js
 * @changelog
 * [2026-06-17] - Criação
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("csv (utilitário CSV)", () => {
  let csvModule;

  beforeAll(async () => {
    csvModule = await import("../../../public/js/csv.js");
  });

  describe("converterParaCSV", () => {
    it("retorna BOM para array vazio", () => {
      const result = csvModule.converterParaCSV([]);
      expect(result).toBe("\uFEFF");
    });

    it("retorna BOM para null", () => {
      const result = csvModule.converterParaCSV(null);
      expect(result).toBe("\uFEFF");
    });

    it("inclui BOM e cabeçalhos", () => {
      const dados = [{ nome: "João", idade: 30 }];
      const result = csvModule.converterParaCSV(dados);

      expect(result.startsWith("\uFEFF")).toBe(true);
      expect(result).toContain("nome");
      expect(result).toContain("idade");
    });

    it("separa colunas com tabulação", () => {
      const dados = [{ nome: "João", idade: 30 }];
      const result = csvModule.converterParaCSV(dados);
      const linhas = result.replace("\uFEFF", "").split("\n");

      expect(linhas[0]).toBe("nome\tidade");
      expect(linhas[1]).toContain("João\t30");
    });

    it("escapa campo com tabulação", () => {
      const dados = [{ desc: "a\tb" }];
      const result = csvModule.converterParaCSV(dados);

      expect(result).toContain('"a\tb"');
    });

    it("escapa campo com aspas", () => {
      const dados = [{ desc: 'João "o" Silva' }];
      const result = csvModule.converterParaCSV(dados);

      expect(result).toContain('"João ""o"" Silva"');
    });

    it("escapa campo com quebra de linha", () => {
      const dados = [{ desc: "linha1\nlinha2" }];
      const result = csvModule.converterParaCSV(dados);

      expect(result).toContain('"linha1');
    });

    it("processa múltiplas linhas", () => {
      const dados = [
        { nome: "A", valor: 10 },
        { nome: "B", valor: 20 },
      ];
      const result = csvModule.converterParaCSV(dados);
      const linhas = result.replace("\uFEFF", "").split("\n");

      expect(linhas).toHaveLength(3);
    });
  });

  describe("gerarTemplateCSV", () => {
    it("cria template com cabeçalhos fornecidos", () => {
      const result = csvModule.gerarTemplateCSV(["data", "descricao", "valor"]);

      expect(result.startsWith("\uFEFF")).toBe(true);
      expect(result).toContain("data\tdescricao\tvalor");
    });

    it("usa linhasExemplo padrão (3)", () => {
      const result = csvModule.gerarTemplateCSV(["data", "descricao"]);
      const linhas = result.replace("\uFEFF", "").split("\n");

      expect(linhas).toHaveLength(4); // 1 header + 3 exemplos
    });

    it("respeita parâmetro linhasExemplo", () => {
      const result = csvModule.gerarTemplateCSV(["data"], 1);
      const linhas = result.replace("\uFEFF", "").split("\n");

      expect(linhas).toHaveLength(2); // 1 header + 1 exemplo
    });
  });

  describe("gerarTemplateOrcamentoCSV", () => {
    it("usa o cabeçalho padrão do orçamento na ordem esperada", () => {
      const result = csvModule.gerarTemplateOrcamentoCSV(1);
      const linhas = result.replace("\uFEFF", "").split("\n");

      expect(linhas[0]).toBe(csvModule.CABECALHOS_TEMPLATE_ORCAMENTO.join("\t"));
      expect(linhas).toHaveLength(2);
    });

    it("mantém apenas as colunas usadas pelo importador atual", () => {
      const result = csvModule.gerarTemplateOrcamentoCSV(1);

      expect(result).toContain("data\tdescricao\ttipo\tvalor\tcategoria\tsubcategoria\trecorrente");
      expect(result).not.toContain("conta_origem");
      expect(result).not.toContain("conta_destino");
      expect(result).not.toContain("pessoa");
      expect(result).not.toContain("observacoes");
    });
  });
});
