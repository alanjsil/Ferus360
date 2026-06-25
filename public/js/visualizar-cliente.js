/**
 * @file Página de visualização de cliente pelo admin.
 */

import { clearAuthSession, ensureAuthenticated, escapeHtml, getAccessToken } from "./auth-guard.js";
import { formatarMoeda } from "./helper.js";

const _cleanups = [];

window.addEventListener("beforeunload", () => {
  _cleanups.forEach((fn) => fn());
  _cleanups.length = 0;
});

let categoriasCache = [];
let subcategoriasCache = [];
let contasCache = [];
let lancamentos = [];
let usuarioIdCliente = null;
let filtroAtualTipo = "all";
let filtroAtualStatus = "all";
let filtroAtualAno = "all";
let filtroAtualMes = "all";
let tipoPessoa = "PF";
let clienteUsarPj = false;

function formatCurrency(value) {
  return formatarMoeda(value);
}

function formatDate(dateStr) {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString("pt-BR");
  }
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR");
}

// ====== EVENT LISTENERS ======
/**
 * @returns {void}
 */
function configurarEventListeners() {
  document.getElementById("filtroAno").addEventListener("change", async function () {
    filtroAtualAno = this.value;
    document.getElementById("filtroMes").value = "all";
    filtroAtualMes = "all";
    atualizarMesesFiltro();
    await carregarOrcamento();
    atualizarResumo();
    renderizarTabela();
  });

  document.getElementById("filtroMes").addEventListener("change", async function () {
    filtroAtualMes = this.value;
    await carregarOrcamento();
    atualizarResumo();
    renderizarTabela();
  });

  document.querySelectorAll(".pill-filter[data-filter-tipo]:not(.status-filter)").forEach((btn) => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".pill-filter[data-filter-tipo]:not(.status-filter)").forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      filtroAtualTipo = this.dataset.filterTipo || "all";
      atualizarResumo();
      renderizarTabela();
    });
  });

  document.querySelectorAll(".pill-filter.status-filter").forEach((btn) => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".pill-filter.status-filter").forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      filtroAtualStatus = this.dataset.filterStatus || "all";
      atualizarResumo();
      renderizarTabela();
    });
  });

  document.getElementById("logoutBtn")?.addEventListener("click", fazerLogout);
}

// ====== TIPO PESSOA ======
/**
 * @returns {void}
 */
const STORAGE_KEY_TIPO_PESSOA = "fnc:v1:tipo_pessoa";

function configurarTipoPessoaToggle() {
  const container = document.getElementById("tipoPessoaToggle");
  if (!container) return;

  container.hidden = !clienteUsarPj;

  const salvo = localStorage.getItem(STORAGE_KEY_TIPO_PESSOA);
  if (salvo) {
    tipoPessoa = salvo;
    container.dataset.tp = salvo;
    const span = container.querySelector("span");
    if (span) span.textContent = salvo === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
  }

  container.addEventListener("click", async () => {
    const novoTp = tipoPessoa === "PF" ? "PJ" : "PF";
    tipoPessoa = novoTp;
    container.dataset.tp = novoTp;
    const span = container.querySelector("span");
    if (span) span.textContent = novoTp === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
    localStorage.setItem(STORAGE_KEY_TIPO_PESSOA, novoTp);
    await window.electronAPI.setTipoPessoa(novoTp);

    mostrarSplashToggle();
    await recarregarDados();
    esconderSplashToggle();
  });

  if (typeof window.electronAPI?.onTipoPessoaChanged === "function") {
    _cleanups.push(
      window.electronAPI.onTipoPessoaChanged((value) => {
        if (!value) return;
        tipoPessoa = value;
        container.dataset.tp = value;
        const span = container.querySelector("span");
        if (span) span.textContent = value === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
        localStorage.setItem(STORAGE_KEY_TIPO_PESSOA, value);
      }),
    );
  }

  if (typeof window.electronAPI?.getTipoPessoa === "function") {
    window.electronAPI.getTipoPessoa().then((value) => {
      if (!value) return;
      tipoPessoa = value;
      container.dataset.tp = value;
      const span = container.querySelector("span");
      if (span) span.textContent = value === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
      localStorage.setItem(STORAGE_KEY_TIPO_PESSOA, value);
    });
  }
}

async function recarregarDados() {
  await carregarSubcategoriasCache();
  await carregarContas();
  await carregarCategorias();
  await carregarLancamentos();
  await carregarOrcamento();
}

function mostrarSplashToggle() {
  const splash = document.getElementById("splashToggle");
  if (splash) {
    splash.style.display = "flex";
    splash.classList.remove("fade-out");
  }
}

function esconderSplashToggle() {
  const splash = document.getElementById("splashToggle");
  if (splash) {
    splash.classList.add("fade-out");
    setTimeout(() => { splash.style.display = "none"; }, 500);
  }
}

/**
 * @returns {Promise<void>}
 */
async function fazerLogout() {
  const token = getAccessToken();
  if (token) {
    try {
      await window.electronAPI.logout(token);
    } catch {
      /* ok */
    }
  }
  clearAuthSession();
  window.location.href = "login.html";
}

// ====== LOADERS ======
/**
 * @returns {Promise<void>}
 */
async function carregarCategorias() {
  try {
    categoriasCache = await window.electronAPI.getCategorias();
  } catch (error) {
    window.electronAPI?.logError("visualizar-cliente", "Erro ao carregar categorias", error);
  }
}

/**
 * @returns {Promise<void>}
 */
async function carregarSubcategoriasCache() {
  try {
    subcategoriasCache = await window.electronAPI.getSubcategorias();
  } catch {
    subcategoriasCache = [];
  }
}

/**
 * @returns {Promise<void>}
 */
async function carregarContas() {
  try {
    contasCache = await window.electronAPI.adminGetContasCliente(usuarioIdCliente, tipoPessoa);
  } catch {
    contasCache = [];
  }
}

/**
 * @returns {Promise<void>}
 */
async function carregarLancamentos() {
  lancamentos = await window.electronAPI.adminGetTransacoesCliente(usuarioIdCliente, null, null, tipoPessoa);
  atualizarAnosFiltro();
  atualizarMesesFiltro();
  atualizarResumo();
  renderizarTabela();
}

/**
 * @returns {Promise<void>}
 */
async function carregarOrcamento() {
  try {
    const data = await window.electronAPI.adminGetOrcamentoCliente(usuarioIdCliente, tipoPessoa);
    const totaisOrcamento = calcularTotaisOrcamento(data);

    const ano = document.getElementById("filtroAno").value;
    const mes = document.getElementById("filtroMes").value;

    let receitasRealizadas = 0;
    let despesasRealizadas = 0;

    lancamentos.forEach((l) => {
      const anoKey = l.data.substring(0, 4);
      const mesKey = l.data.substring(5, 7);
      if (ano !== "all" && anoKey !== ano) return;
      if (mes !== "all" && mesKey !== mes) return;
      if (l.status !== "PAGO") return;
      if (l.tipo === "RECEITA" && !l.transferencia_grupo_id) receitasRealizadas += Number(l.valor);
      if (l.tipo === "DESPESA" && !l.transferencia_grupo_id) despesasRealizadas += Number(l.valor);
    });

    totaisOrcamento.receitas_realizadas = receitasRealizadas;
    totaisOrcamento.despesas_realizadas = despesasRealizadas;

    atualizarComparacao(totaisOrcamento);
  } catch (error) {
    window.electronAPI?.logError("visualizar-cliente", "Erro ao carregar orçamento", error);
  }
}

// ====== COMPARISON ======
function calcularTotaisOrcamento(orcamentoData) {
  const anoSelecionado = document.getElementById("filtroAno").value;
  const mesSelecionado = document.getElementById("filtroMes").value;

  let receitas_planejadas = 0;
  let despesas_planejadas = 0;
  let receitas_realizadas = 0;
  let despesas_realizadas = 0;

  orcamentoData.forEach((item) => {
    const anoItem = item.data.substring(0, 4);
    const mesItem = item.data.substring(5, 7);
    if (anoSelecionado !== "all" && anoItem !== anoSelecionado) return;
    if (mesSelecionado !== "all" && mesItem !== mesSelecionado) return;

    const valor_planejado = Number(item.valor_planejado) || 0;
    const valor_realizado = Number(item.valor_realizado) || 0;

    if (item.tipo === "RECEITA") {
      receitas_planejadas += valor_planejado;
      receitas_realizadas += valor_realizado;
    } else if (item.tipo === "DESPESA") {
      despesas_planejadas += valor_planejado;
      despesas_realizadas += valor_realizado;
    }
  });

  return { receitas_planejadas, despesas_planejadas, receitas_realizadas, despesas_realizadas };
}

function atualizarComparacao(totais) {
  document.getElementById("receitasPlanejadas").textContent = formatCurrency(totais.receitas_planejadas);
  document.getElementById("receitasRealizadas").textContent = formatCurrency(totais.receitas_realizadas);

  const diffReceitas = totais.receitas_realizadas - totais.receitas_planejadas;
  const diffReceitasElem = document.getElementById("diffReceitas");
  diffReceitasElem.textContent = formatCurrency(Math.abs(diffReceitas));
  diffReceitasElem.className = `value difference ${diffReceitas >= 0 ? "positive" : "negative"}`;

  const progressReceitas = totais.receitas_planejadas > 0 ? (totais.receitas_realizadas / totais.receitas_planejadas) * 100 : 0;
  document.getElementById("progressReceitas").style.width = `${Math.min(progressReceitas, 100)}%`;

  document.getElementById("despesasPlanejadas").textContent = formatCurrency(totais.despesas_planejadas);
  document.getElementById("despesasRealizadas").textContent = formatCurrency(totais.despesas_realizadas);

  const diffDespesas = totais.despesas_realizadas - totais.despesas_planejadas;
  const diffDespesasElem = document.getElementById("diffDespesas");
  diffDespesasElem.textContent = formatCurrency(Math.abs(diffDespesas));
  diffDespesasElem.className = `value difference ${diffDespesas <= 0 ? "positive" : "negative"}`;

  const progressDespesas = totais.despesas_planejadas > 0 ? (totais.despesas_realizadas / totais.despesas_planejadas) * 100 : 0;
  document.getElementById("progressDespesas").style.width = `${Math.min(progressDespesas, 100)}%`;
}

function atualizarResumo() {
  const filtroAno = document.getElementById("filtroAno").value;
  const filtroMes = document.getElementById("filtroMes").value;
  const filtroTipo = document.querySelector(".pill-filter.active[data-filter-tipo]")?.dataset.filterTipo;

  let receitas = 0;
  let despesas = 0;

  lancamentos.forEach((l) => {
    const anoKey = l.data.substring(0, 4);
    const mesKey = l.data.substring(5, 7);
    if (filtroAno !== "all" && anoKey !== filtroAno) return;
    if (filtroMes !== "all" && mesKey !== filtroMes) return;
    if (filtroTipo && filtroTipo !== "all" && l.tipo !== filtroTipo) return;
    if (l.status !== "PAGO") return;

    if (l.tipo === "RECEITA" && !l.transferencia_grupo_id) receitas += Number(l.valor);
    if (l.tipo === "DESPESA" && !l.transferencia_grupo_id) despesas += Number(l.valor);
  });

  const saldo = receitas - despesas;

  document.getElementById("totalReceitas").textContent = formatCurrency(receitas);
  document.getElementById("totalDespesas").textContent = formatCurrency(despesas);
  document.getElementById("saldoAtual").textContent = formatCurrency(saldo);

  document.getElementById("headerReceitas").textContent = `R$ ${formatCurrency(receitas)}`;
  document.getElementById("headerDespesas").textContent = `R$ ${formatCurrency(despesas)}`;
  document.getElementById("headerSaldo").textContent = `R$ ${formatCurrency(saldo)}`;

  const headerSaldoElem = document.getElementById("headerSaldo");
  headerSaldoElem.classList.remove("saldo-positive", "saldo-negative", "saldo-zero");
  if (saldo > 0) {
    headerSaldoElem.classList.add("saldo-positive");
  } else if (saldo < 0) {
    headerSaldoElem.classList.add("saldo-negative");
  } else {
    headerSaldoElem.classList.add("saldo-zero");
  }
}

// ====== FILTROS ======
function atualizarAnosFiltro() {
  const filtro = document.getElementById("filtroAno");
  const anosUnicos = new Set();
  lancamentos.forEach((l) => {
    const ano = l.data.substring(0, 4);
    if (ano) anosUnicos.add(ano);
  });

  const anosArray = Array.from(anosUnicos).sort((a, b) => b - a);
  const optionTodos = filtro.querySelector('option[value="all"]');
  filtro.innerHTML = "";
  filtro.appendChild(optionTodos);

  anosArray.forEach((ano) => {
    const opt = document.createElement("option");
    opt.value = ano;
    opt.textContent = ano;
    filtro.appendChild(opt);
  });
}

function atualizarMesesFiltro() {
  const filtro = document.getElementById("filtroMes");
  const anoSelecionado = filtroAtualAno;

  const mesesUnicos = new Set();
  lancamentos.forEach((l) => {
    const ano = l.data.substring(0, 4);
    const mes = l.data.substring(5, 7);
    if (anoSelecionado === "all" || ano === anoSelecionado) {
      if (mes) mesesUnicos.add(mes);
    }
  });

  const mesesArray = Array.from(mesesUnicos).sort();
  filtro.innerHTML = '<option value="all">Todos</option>';

  const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  mesesArray.forEach((mes) => {
    const opt = document.createElement("option");
    opt.value = mes;
    opt.textContent = nomesMeses[parseInt(mes) - 1];
    filtro.appendChild(opt);
  });
}

// ====== TABELA ======
function renderizarTabela() {
  const tbody = document.getElementById("tabelaLancamentos");
  tbody.innerHTML = "";

  const lista = lancamentos.filter((l) => {
    const anoKey = l.data.substring(0, 4);
    const mesKey = l.data.substring(5, 7);
    if (filtroAtualAno !== "all" && anoKey !== filtroAtualAno) return false;
    if (filtroAtualMes !== "all" && mesKey !== filtroAtualMes) return false;
    if (filtroAtualTipo !== "all" && l.tipo !== filtroAtualTipo) return false;
    if (filtroAtualStatus !== "all" && l.status !== filtroAtualStatus) return false;
    return true;
  });

  document.getElementById("contadorLancamentos").textContent = `${lista.length} lançamento${lista.length !== 1 ? "s" : ""}`;

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="7">
          <div class="empty-state">
            Nenhum lançamento encontrado com os filtros atuais.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  lista.forEach((l) => {
    const cat = categoriasCache.find((c) => c.id === l.categoria_id);
    const sub = subcategoriasCache.find((s) => s.id === l.subcategoria_id);
    const contaId = l.conta_origem_id || l.conta_destino_id;
    const conta = contasCache.find((c) => c.id === contaId);

    const tr = document.createElement("tr");

    const displayTipo = l.transferencia_grupo_id ? "TRANSFERÊNCIA" : l.tipo;

    tr.innerHTML = `
      <td>${escapeHtml(formatDate(l.data))}</td>
      <td><span class="tag-tipo ${escapeHtml(l.tipo)}">${escapeHtml(displayTipo)}</span></td>
      <td>${escapeHtml(l.descricao) || "-"}</td>
      <td>${escapeHtml(cat?.nome) || "-"} ${sub ? "/ " + escapeHtml(sub.nome) : ""}</td>
      <td>${escapeHtml(conta?.nome) || "-"}</td>
      <td><span class="tag-status ${escapeHtml(l.status)}">${escapeHtml(l.status)}</span></td>
      <td>
        <span class="pill-amount ${l.tipo === "DESPESA" ? "negative" : "positive"}"> R$ ${formatCurrency(l.valor)} </span>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// ====== EXPORTS (testes) ======
export { calcularTotaisOrcamento, atualizarComparacao, atualizarResumo, formatDate, formatCurrency, renderizarTabela, lancamentos, filtroAtualTipo, filtroAtualStatus, filtroAtualAno, filtroAtualMes };

// ====== INIT ======
document.addEventListener("DOMContentLoaded", async () => {
  const auth = await ensureAuthenticated({ requireAdmin: true });
  if (!auth) return;

  const urlParams = new URLSearchParams(window.location.search);
  usuarioIdCliente = urlParams.get("usuarioId");
  const nomeCliente = urlParams.get("nome") || "Cliente";

  const brandText = document.querySelector(".brand-text p");
  if (brandText) {
    brandText.textContent = `Visualizando: ${nomeCliente}`;
  }

  const btnDashboard = document.getElementById("btnDashboardCliente");
  if (btnDashboard) {
    btnDashboard.href = `visualizar-dashboard-cliente.html?usuarioId=${usuarioIdCliente}&nome=${encodeURIComponent(nomeCliente)}`;
  }

  await new Promise(requestAnimationFrame);

  try {
    const clientePerfil = await window.electronAPI.adminGetClientePerfil(usuarioIdCliente);
    clienteUsarPj = clientePerfil?.usar_pj === true;
  } catch {
    clienteUsarPj = false;
  }

  await carregarSubcategoriasCache();
  await carregarContas();
  await carregarCategorias();
  await carregarLancamentos();
  await carregarOrcamento();

  configurarEventListeners();
  configurarTipoPessoaToggle();

  const splash = document.getElementById("splashScreen");
  if (splash) {
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 500);
  }
});
