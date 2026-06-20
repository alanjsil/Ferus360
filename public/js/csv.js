/**
 * @file Utilitários para exportar/importar CSV (delimitador tabulação)
 * @module public/js/csv
 */

/**
 * @param {unknown} valor
 * @returns {string}
 */
function escapeCSVCampo(valor) {
  if (valor === null || valor === undefined) return "";
  const str = String(valor);
  if (str.includes("\t") || str.includes("\n") || str.includes("\r") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {Record<string, unknown>[]} dados
 * @returns {string[]}
 */
function obterCabecalhos(dados) {
  if (!dados || dados.length === 0) return [];
  return Object.keys(dados[0]);
}

/**
 * Converte um array de objetos para CSV com delimitador tabulação.
 * Inclui BOM para acentos no Excel.
 */
/**
 * @param {Record<string, unknown>[]} dados
 * @returns {string}
 */
export function converterParaCSV(dados) {
  if (!dados || dados.length === 0) return "\uFEFF";

  const cabecalhos = obterCabecalhos(dados);
  const linhas = [cabecalhos.map(escapeCSVCampo).join("\t"), ...dados.map((linha) => cabecalhos.map((chave) => escapeCSVCampo(linha[chave])).join("\t"))];

  return "\uFEFF" + linhas.join("\n");
}

/**
 * Gera um CSV template com cabeçalhos + linhas de exemplo.
 * @param {string[]} cabecalhos
 * @param {number} linhasExemplo - quantidade de linhas de exemplo (default 3)
 */
export function gerarTemplateCSV(cabecalhos, linhasExemplo = 3) {
  const dummyRow = {};
  cabecalhos.forEach((h) => {
    dummyRow[h] = "";
  });

  const exemplos = [
    {
      data: "01/04/2026",
      tipo: "RECEITA",
      descricao: "Salário",
      valor: "5000,00",
      status: "PAGO",
      categoria: "Salário",
      subcategoria: "",
      conta_origem: "Nubank",
      conta_destino: "",
      pessoa: "",
      data_pagamento: "01/04/2026",
    },
    {
      data: "05/04/2026",
      tipo: "DESPESA",
      descricao: "Supermercado",
      valor: "350,00",
      status: "PENDENTE",
      categoria: "Alimentação",
      subcategoria: "Mercado",
      conta_origem: "",
      conta_destino: "Nubank",
      pessoa: "",
      data_pagamento: "",
    },
    {
      data: "10/04/2026",
      tipo: "TRANSFERENCIA",
      descricao: "Poupança",
      valor: "1000,00",
      status: "PAGO",
      categoria: "Transferência",
      subcategoria: "",
      conta_origem: "Nubank",
      conta_destino: "Caixa",
      pessoa: "",
      data_pagamento: "10/04/2026",
    },
  ];

  const linhas = [
    cabecalhos.map(escapeCSVCampo).join("\t"),
    ...Array.from({ length: Math.max(linhasExemplo, 1) }, (_, i) => {
      const exemplo = exemplos[i % exemplos.length];
      return cabecalhos.map((chave) => escapeCSVCampo(exemplo[chave] || "")).join("\t");
    }),
  ];

  return "\uFEFF" + linhas.join("\n");
}
