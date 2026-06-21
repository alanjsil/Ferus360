/**
 * @file Página de visualização e resolução de conflitos de sync.
 */

import { ensureAuthenticated } from "./auth-guard.js";
import { exibirToast } from "./toast.js";
import { formatarMoeda } from "./helper.js";

let conflitoAtual = null;

document.addEventListener("DOMContentLoaded", async () => {
  const auth = await ensureAuthenticated();
  if (!auth) return;

  await carregarConflitos();
  configurarEventos();
});

/**
 * @returns {Promise<void>}
 */
async function carregarConflitos() {
  try {
    const conflitos = await window.electronAPI.getConflitos();
    renderizarCards(conflitos || []);
    atualizarBadge(conflitos?.length || 0);
  } catch (err) {
    window.electronAPI?.logError("conflitos", "Erro ao carregar conflitos", err);
    exibirToast("Erro ao carregar conflitos", "error");
  }
}

/**
 * @param {import("../../src/types").ConflitoSync[]} conflitos
 */
function renderizarCards(conflitos) {
  const container = document.getElementById("conflitosContainer");
  const empty = document.getElementById("emptyState");

  container.innerHTML = "";
  container.appendChild(empty);

  if (!conflitos.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  conflitos.forEach((conflito) => {
    const card = criarCard(conflito);
    container.appendChild(card);
  });
}

const ENTIDADE_LABELS = {
  financas_lancamentos: "Lançamento",
  financas_contas: "Conta",
  financas_categorias: "Categoria",
  financas_subcategorias: "Subcategoria",
  financas_pessoas: "Pessoa",
  financas_orcamentos: "Orçamento",
};

/**
 * @param {string} entidade
 * @returns {string}
 */
function formatarEntidade(entidade) {
  return ENTIDADE_LABELS[entidade] || entidade.replace(/^financas_/, "").replace(/_/g, " ");
}

const EXCLUDED_FIELDS = new Set(["id", "created_at", "updated_at", "usuario_id", "sync_uuid"]);

/**
 * @param {string} chave
 * @param {unknown} valor
 * @returns {string}
 */
function formatarValor(chave, valor) {
  if (valor == null || valor === "") return "—";
  if (chave === "valor") {
    const num = Number(valor);
    return isNaN(num) ? valor : "R$ " + formatarMoeda(num);
  }
  if (chave === "data" && typeof valor === "string" && valor.length === 10) {
    const partes = valor.split("-");
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return String(valor);
}

/**
 * @param {Record<string, unknown>} local
 * @param {Record<string, unknown>} remote
 * @returns {Array<{ chave: string, valorLocal: string, valorRemote: string, rawLocal: unknown, rawRemote: unknown, diferente: boolean }>}
 */
function extrairDiferencas(local, remote) {
  const todasChaves = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  const diff = [];

  todasChaves.forEach((chave) => {
    if (EXCLUDED_FIELDS.has(chave)) return;
    const vLocal = local?.[chave];
    const vRemote = remote?.[chave];
    const diferente = String(vLocal ?? "") !== String(vRemote ?? "");

    diff.push({
      chave,
      valorLocal: formatarValor(chave, vLocal),
      valorRemote: formatarValor(chave, vRemote),
      rawLocal: vLocal,
      rawRemote: vRemote,
      diferente,
    });
  });

  return diff;
}

/**
 * @param {import("../../src/types").ConflitoSync} conflito
 * @returns {HTMLElement}
 */
function criarCard(conflito) {
  let local = {};
  let remote = {};

  try {
    local = typeof conflito.local_data === "string" ? JSON.parse(conflito.local_data) : conflito.local_data || {};
    remote = typeof conflito.remote_data === "string" ? JSON.parse(conflito.remote_data) : conflito.remote_data || {};
  } catch {
    /* JSON inválido */
  }

  const diffs = extrairDiferencas(local, remote);

  const dataFormatada = conflito.created_at ? new Date(conflito.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  const card = document.createElement("div");
  card.className = "conflito-card";
  card.dataset.conflitoId = conflito.id;

  card.innerHTML = `
    <div class="conflito-card-header">
      <span class="entidade"><i class="fa-solid fa-tag"></i> ${formatarEntidade(conflito.entidade)}</span>
      <span class="data"><i class="fa-regular fa-clock"></i> ${dataFormatada}</span>
    </div>
    <div class="conflito-card-body">
      <div class="diff-grid">
        <div class="diff-column">
          <div class="diff-column-header local"><i class="fa-solid fa-location-dot"></i> Local</div>
          ${diffs
            .map(
              (d) => `
            <div class="diff-field${d.diferente ? " differs local" : ""}">
              <span class="field-label">${d.chave}</span>
              <span class="field-value">${d.valorLocal}</span>
            </div>`,
            )
            .join("")}
        </div>
        <div class="diff-column">
          <div class="diff-column-header remote"><i class="fa-solid fa-cloud"></i> Remoto</div>
          ${diffs
            .map(
              (d) => `
            <div class="diff-field${d.diferente ? " differs remote" : ""}">
              <span class="field-label">${d.chave}</span>
              <span class="field-value">${d.valorRemote}</span>
            </div>`,
            )
            .join("")}
        </div>
      </div>
    </div>
    <div class="conflito-actions">
      <button type="button" class="btn-keep-local" data-acao="local">
        <i class="fa-solid fa-floppy-disk"></i> Manter Local
      </button>
      <button type="button" class="btn-accept-remote" data-acao="remoto">
        <i class="fa-solid fa-cloud-arrow-down"></i> Aceitar Remoto
      </button>
      <button type="button" class="btn-merge" data-acao="mesclar">
        <i class="fa-solid fa-pen-to-square"></i> Mesclar
      </button>
    </div>
  `;

  card.querySelectorAll("[data-acao]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const acao = btn.dataset.acao;
      if (acao === "mesclar") {
        abrirMergeDialog(conflito, local, remote, diffs);
      } else {
        resolver(acao, conflito, null, card);
      }
    });
  });

  return card;
}

/**
 * @param {"local" | "remoto" | "mesclar"} decisao
 * @param {import("../../src/types").ConflitoSync} conflito
 * @param {Record<string, unknown> | null} payloadMesclado
 * @param {HTMLElement} [cardEl]
 * @returns {Promise<void>}
 */
async function resolver(decisao, conflito, payloadMesclado, cardEl) {
  try {
    await window.electronAPI.resolverConflito(conflito.id, decisao, payloadMesclado);
    exibirToast("Conflito resolvido com sucesso", "success");

    if (cardEl) {
      cardEl.classList.add("removendo");
      setTimeout(() => {
        cardEl.remove();
        const container = document.getElementById("conflitosContainer");
        const cards = container.querySelectorAll(".conflito-card");
        if (!cards.length) {
          document.getElementById("emptyState").hidden = false;
        }
        atualizarBadge(cards.length);
      }, 400);
    }

    await window.electronAPI.forcarSync().catch(() => {});
  } catch (err) {
    window.electronAPI?.logError("conflitos", "Erro ao resolver conflito", err);
    exibirToast("Erro ao resolver conflito", "error");
  }
}

/**
 * @param {import("../../src/types").ConflitoSync} conflito
 * @param {Record<string, unknown>} local
 * @param {Record<string, unknown>} remote
 * @param {Array<{ chave: string, valorLocal: string, valorRemote: string, rawLocal: unknown, rawRemote: unknown, diferente: boolean }>} diffs
 */
function abrirMergeDialog(conflito, local, remote, diffs) {
  conflitoAtual = conflito;
  const form = document.getElementById("mergeForm");
  form.innerHTML = "";

  const chavesUsadas = diffs.map((d) => d.chave);

  chavesUsadas.forEach((chave) => {
    const valorLocal = local?.[chave] ?? "";
    const valorRemote = remote?.[chave] ?? "";
    const div = document.createElement("div");
    div.className = "merge-field";

    const label = document.createElement("label");
    label.htmlFor = `merge-${chave}`;
    label.textContent = chave;
    div.appendChild(label);

    const isLongText = String(valorLocal).length > 40 || (String(valorRemote).length > 40 && chave !== "valor" && chave !== "data");

    if (chave === "data") {
      const input = document.createElement("input");
      input.type = "date";
      input.id = `merge-${chave}`;
      input.name = chave;
      input.value = valorLocal ? String(valorLocal).substring(0, 10) : "";
      div.appendChild(input);
    } else if (chave === "valor") {
      const input = document.createElement("input");
      input.type = "number";
      input.id = `merge-${chave}`;
      input.name = chave;
      input.step = "0.01";
      input.value = valorLocal ?? "";
      div.appendChild(input);
    } else if (chave === "status") {
      const select = document.createElement("select");
      select.id = `merge-${chave}`;
      select.name = chave;
      ["PAGO", "PENDENTE", "CANCELADO"].forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        if (opt === (valorLocal || "PENDENTE")) option.selected = true;
        select.appendChild(option);
      });
      div.appendChild(select);
    } else if (chave === "tipo") {
      const select = document.createElement("select");
      select.id = `merge-${chave}`;
      select.name = chave;
      ["RECEITA", "DESPESA", "TRANSFERENCIA"].forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        if (opt === (valorLocal || "DESPESA")) option.selected = true;
        select.appendChild(option);
      });
      div.appendChild(select);
    } else if (isLongText) {
      const textarea = document.createElement("textarea");
      textarea.id = `merge-${chave}`;
      textarea.name = chave;
      textarea.value = valorLocal ?? "";
      textarea.rows = 3;
      div.appendChild(textarea);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.id = `merge-${chave}`;
      input.name = chave;
      input.value = valorLocal ?? "";
      div.appendChild(input);
    }

    form.appendChild(div);
  });

  document.getElementById("mergeDialog").showModal();
}

/**
 * @returns {void}
 */
function confirmarMerge() {
  if (!conflitoAtual) return;

  const form = document.getElementById("mergeForm");
  const inputs = form.querySelectorAll("input, select, textarea");
  const payload = {};

  inputs.forEach((input) => {
    const chave = input.name;
    if (chave === "valor") {
      payload[chave] = parseFloat(input.value) || 0;
    } else if (input.type === "date" && input.value) {
      payload[chave] = input.value;
    } else {
      payload[chave] = input.value;
    }
  });

  const card = document.querySelector(`.conflito-card[data-conflito-id="${conflitoAtual.id}"]`);
  resolver("mesclar", conflitoAtual, payload, card);
  fecharMergeDialog();
}

/**
 * @returns {void}
 */
function fecharMergeDialog() {
  document.getElementById("mergeDialog").close();
  conflitoAtual = null;
}

/**
 * @returns {void}
 */
function configurarEventos() {
  document.getElementById("forceSyncBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("forceSyncBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sincronizando...';

    try {
      await window.electronAPI.forcarSync();
      exibirToast("Sincronização concluída", "success");
      await carregarConflitos();
    } catch (err) {
      window.electronAPI?.logError("conflitos", "Erro no sync", err);
      exibirToast("Erro ao sincronizar", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Forçar Sync';
    }
  });

  document.getElementById("confirmarMergeBtn")?.addEventListener("click", confirmarMerge);
  document.getElementById("cancelarMergeBtn")?.addEventListener("click", fecharMergeDialog);
  document.getElementById("fecharMergeBtn")?.addEventListener("click", fecharMergeDialog);

  document.getElementById("mergeDialog")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharMergeDialog();
    }
  });
}

/**
 * @param {number} count
 */
function atualizarBadge(count) {
  try {
    localStorage.setItem("fnc:v1:conflitos_count", String(count));
  } catch {
    /* storage indisponível */
  }
}

export { carregarConflitos, renderizarCards, resolver, abrirMergeDialog, confirmarMerge, fecharMergeDialog, configurarEventos, atualizarBadge };
