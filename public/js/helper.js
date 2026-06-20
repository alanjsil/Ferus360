/**
 * @file Funções auxiliares compartilhadas entre páginas.
 * @module public/js/helper
 */

/**
 * @param {number | string | null | undefined} valor
 * @returns {string}
 */
export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
