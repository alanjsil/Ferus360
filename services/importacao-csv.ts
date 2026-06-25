/**
 * @file Serviço de importação de CSV — parser, normalização e persistência.
 * @module services/importacao-csv
 */

import type { Categoria, Subcategoria } from "../src/types";
import type { ImportarOrcamentoItem } from "../src/types";
import * as logger from "./logger";
import { getCategorias, getSubcategorias } from "./repository/categorias";
import { importarOrcamento } from "./repository/lancamentos";

const CABECALHOS_IMPORTACAO_ORCAMENTO = ["data", "descricao", "tipo", "valor", "categoria", "subcategoria", "recorrente"];

const SEPARADORES_IMPORTACAO = ["\t", ";", ","];

function normalizarTextoChave(texto: unknown): string {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function parsearLinhaDelimitada(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let campoAtual = "";
  let dentroAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const char = linha[i];
    const proximo = linha[i + 1];

    if (char === '"') {
      if (dentroAspas && proximo === '"') {
        campoAtual += '"';
        i += 1;
      } else {
        dentroAspas = !dentroAspas;
      }
      continue;
    }

    if (char === separador && !dentroAspas) {
      campos.push(campoAtual.trim());
      campoAtual = "";
      continue;
    }

    campoAtual += char;
  }

  campos.push(campoAtual.trim());
  return campos;
}

function detectarSeparadorImportacao(linhas: string[]): string | null {
  const linhaAmostra = linhas.find((linha) => linha.trim());
  if (!linhaAmostra) return null;

  let melhorSeparador: string | null = null;
  let maiorQuantidade = -1;

  SEPARADORES_IMPORTACAO.forEach((separador) => {
    const quantidade = parsearLinhaDelimitada(linhaAmostra, separador).length;
    if (quantidade > maiorQuantidade) {
      maiorQuantidade = quantidade;
      melhorSeparador = separador;
    }
  });

  return maiorQuantidade > 1 ? melhorSeparador : null;
}

function normalizarDataImportacao(valor: unknown): string | null {
  const texto = String(valor || "").trim();
  if (!texto) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const partes = texto.split("/");
  if (partes.length === 3) {
    const [dia, mes, ano] = partes.map((parte) => parte.trim());
    if (/^\d{2}$/.test(dia) && /^\d{2}$/.test(mes) && /^\d{4}$/.test(ano)) {
      return `${ano}-${mes}-${dia}`;
    }
  }

  return null;
}

function normalizarValorMonetario(valor: unknown): number {
  const textoOriginal = String(valor || "")
    .trim()
    .replace(/[R$\s]/g, "")
    .replace(/\u00A0/g, "");

  if (!textoOriginal) return NaN;

  let textoNormalizado = textoOriginal;
  const temVirgula = textoNormalizado.includes(",");
  const temPonto = textoNormalizado.includes(".");

  if (temVirgula && temPonto) {
    textoNormalizado = textoNormalizado.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    textoNormalizado = textoNormalizado.replace(",", ".");
  }

  return Number.parseFloat(textoNormalizado);
}

function analisarCSV(textoArquivo: string): { separador: string; itensBrutos: Array<Record<string, string>> } {
  const conteudo = String(textoArquivo || "").replace(/^\uFEFF/, "");
  const linhas = conteudo.split(/\r?\n/).filter((linha) => linha.trim());

  if (linhas.length === 0) {
    throw new Error("O arquivo está vazio.");
  }

  const separador = detectarSeparadorImportacao(linhas);
  if (!separador) {
    throw new Error("Não foi possível identificar o separador do arquivo.");
  }

  const cabecalhos = parsearLinhaDelimitada(linhas[0], separador).map(normalizarTextoChave);
  const indices = new Map(cabecalhos.map((cabecalho, indice) => [cabecalho, indice]));
  const camposObrigatorios = ["data", "descricao", "tipo", "valor"];

  if (!camposObrigatorios.every((campo) => indices.has(campo))) {
    throw new Error("Cabeçalho inválido. Use o template de orçamento baixado em Configurações.");
  }

  const itensBrutos: Array<Record<string, string>> = [];

  for (let i = 1; i < linhas.length; i += 1) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    const colunas = parsearLinhaDelimitada(linha, separador);
    const item: Record<string, string> = {};

    CABECALHOS_IMPORTACAO_ORCAMENTO.forEach((cabecalho) => {
      const indice = indices.has(cabecalho) ? indices.get(cabecalho)! : -1;
      item[cabecalho] = indice >= 0 ? (colunas[indice] || "") : "";
    });

    itensBrutos.push(item);
  }

  return { separador, itensBrutos };
}

async function obterCacheCategoriasSubcategorias(usuarioId: string): Promise<{
  categorias: Categoria[];
  subcategorias: Subcategoria[];
}> {
  const [categorias, subcategorias] = await Promise.all([
    getCategorias(usuarioId),
    getSubcategorias(usuarioId),
  ]);

  return { categorias: categorias || [], subcategorias: subcategorias || [] };
}

function transformarItens(
  itensBrutos: Array<Record<string, string>>,
  categorias: Categoria[],
  subcategorias: Subcategoria[],
): ImportarOrcamentoItem[] {
  const resultado: ImportarOrcamentoItem[] = [];

  for (const item of itensBrutos) {
    const dataNormalizada = normalizarDataImportacao(item.data);
    const valorNumerico = normalizarValorMonetario(item.valor);

    if (!dataNormalizada || !item.descricao || !item.tipo || Number.isNaN(valorNumerico)) {
      continue;
    }

    const categoriaTexto = normalizarTextoChave(item.categoria);
    const categoria = categoriaTexto
      ? categorias.find((cat) => normalizarTextoChave(cat.nome).includes(categoriaTexto))
      : null;

    const subNome = normalizarTextoChave(item.subcategoria);
    const subcategoriasFiltradas = subNome && categoria
      ? subcategorias.filter(
          (sub) => sub.categoria_id === categoria?.id && normalizarTextoChave(sub.nome).includes(subNome),
        )
      : [];
    const subcategoria = subcategoriasFiltradas[0];

    const recorrente = ["true", "1", "sim", "s", "yes"].includes(normalizarTextoChave(item.recorrente));

    resultado.push({
      data: dataNormalizada,
      descricao: item.descricao.trim(),
      tipo: String(item.tipo).trim().toUpperCase(),
      valor_planejado: valorNumerico,
      valor_realizado: 0,
      categoria_id: categoria?.id || undefined,
      subcategoria_id: subcategoria?.id || undefined,
      recorrente,
    });
  }

  return resultado;
}

export interface ResultadoImportacao {
  importados: number;
  erros: Array<{ linha: number; mensagem: string }>;
}

export async function processarImportacaoCSV(
  textoArquivo: string,
  usuarioId: string,
): Promise<ResultadoImportacao> {
  const { itensBrutos } = analisarCSV(textoArquivo);

  if (itensBrutos.length === 0) {
    return { importados: 0, erros: [] };
  }

  const { categorias, subcategorias } = await obterCacheCategoriasSubcategorias(usuarioId);

  const itensProcessados = transformarItens(itensBrutos, categorias, subcategorias);

  if (itensProcessados.length === 0) {
    return { importados: 0, erros: [{ linha: 0, mensagem: "Nenhum dado válido encontrado no arquivo." }] };
  }

  const resultado = await importarOrcamento(itensProcessados, usuarioId);

  return { importados: resultado.importados, erros: [] };
}
