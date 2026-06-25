/**
 * @file Página principal de orçamento (lançamentos financeiros).
 */

import { clearAuthSession, ensureAuthenticated, escapeHtml, getAccessToken } from "./auth-guard.js";
import { formatarMoeda } from "./helper.js";
import { confirmDialog, exibirToast } from "./toast.js";

const _cleanups = [];

window.addEventListener("beforeunload", () => {
  _cleanups.forEach((fn) => fn());
  _cleanups.length = 0;
});

function atualizarToggle(container, tp) {
  container.dataset.tp = tp;
  const span = container.querySelector("span");
  if (span) span.textContent = tp === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
}

function configurarTipoPessoaToggle() {
  const container = document.getElementById("tipoPessoaToggle");
  if (!container) return;

  // Restaura do localStorage imediatamente (síncrono)
  const salvo = localStorage.getItem(STORAGE_KEYS.TIPO_PESSOA);
  if (salvo) atualizarToggle(container, salvo);

  container.addEventListener("click", async () => {
    const atual = container.dataset.tp;
    const novoTp = atual === "PF" ? "PJ" : "PF";
    atualizarToggle(container, novoTp);
    localStorage.setItem(STORAGE_KEYS.TIPO_PESSOA, novoTp);
    await window.electronAPI.setTipoPessoa(novoTp);
    await recarregarTudo();
  });

  _cleanups.push(
    window.electronAPI.onTipoPessoaChanged(async (value) => {
      if (value) {
        atualizarToggle(container, value);
        localStorage.setItem(STORAGE_KEYS.TIPO_PESSOA, value);
      }
      await recarregarTudo();
    }),
  );

  window.electronAPI.getTipoPessoa().then((value) => {
    if (value) {
      atualizarToggle(container, value);
      localStorage.setItem(STORAGE_KEYS.TIPO_PESSOA, value);
    }
  });

  if (typeof window.electronAPI?.onUsarPjChanged === "function") {
    _cleanups.push(
      window.electronAPI.onUsarPjChanged(async (value) => {
        container.hidden = !value;
        if (!value) {
          localStorage.setItem(STORAGE_KEYS.TIPO_PESSOA, "PF");
          await recarregarTudo();
        }
      }),
    );
  }

  if (typeof window.electronAPI?.getUsarPj === "function") {
    window.electronAPI.getUsarPj().then((value) => {
      container.hidden = !value;
    });
  }
}

async function recarregarTudo() {
  await carregarSubcategoriasCache();
  await carregarContas();
  await carregarPessoas();
  await carregarCategorias(document.getElementById("tipo").value);
  await aplicarFiltrosSalvos();
}

let categoriasCache = [];
let subcategoriasCache = [];
let contasCache = [];
let lancamentos = [];
let lancamentoEditando = null;
let filtroAtualTipo = "all";
let filtroAtualStatus = "all";
let filtroAtualAno = "all";
let filtroAtualMes = "all";
let _importTimeoutId = null;
let arquivoImportacaoAtual = null;
// ====== SISTEMA DE FILTROS EM LOCALSTORAGE ======
const NS = "fnc:v1:";
const STORAGE_KEYS = {
  FILTRO_ANO: NS + "filtro_ano",
  FILTRO_MES: NS + "filtro_mes",
  FILTRO_TIPO: NS + "filtro_tipo",
  FILTRO_STATUS: NS + "filtro_status",
  FILTRO_ESTADO: NS + "filtro_estado",
  TIPO_PESSOA: NS + "tipo_pessoa",
};
// ====== FUNÇÕES DE GESTÃO DE FILTROS ======
/**
 * @returns {void}
 */
function salvarEstadoFiltros() {
  try {
    // Obter o filtro de status ativo
    const filtroStatusBtn = document.querySelector(".pill-filter.status-filter.active");
    const filtroStatus = filtroStatusBtn ? filtroStatusBtn.dataset.filterStatus || "all" : "all";

    const estadoFiltros = {
      filtroAno: document.getElementById("filtroAno")?.value || "all",
      filtroMes: document.getElementById("filtroMes")?.value || "all",
      filtroTipo: document.querySelector(".pill-filter.active[data-filter-tipo]")?.dataset.filterTipo || "all",
      filtroStatus: filtroStatus,
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEYS.FILTRO_ESTADO, JSON.stringify(estadoFiltros));
  } catch (error) {
    window.electronAPI?.logWarn("orcamento", "Erro ao salvar filtros", error);
  }
}

/**
 * @returns {void}
 */
function carregarEstadoFiltros() {
  try {
    const estadoSalvo = localStorage.getItem(STORAGE_KEYS.FILTRO_ESTADO);

    if (estadoSalvo) {
      const estado = JSON.parse(estadoSalvo);
      return estado;
    }

    return {
      filtroAno: localStorage.getItem(STORAGE_KEYS.FILTRO_ANO) || "all",
      filtroMes: localStorage.getItem(STORAGE_KEYS.FILTRO_MES) || "all",
      filtroTipo: localStorage.getItem(STORAGE_KEYS.FILTRO_TIPO) || "all",
      filtroStatus: localStorage.getItem(STORAGE_KEYS.FILTRO_STATUS) || "all",
    };
  } catch (error) {
    window.electronAPI?.logWarn("orcamento", "Erro ao carregar filtros", error);
    return { filtroAno: "all", filtroMes: "all", filtroTipo: "all", filtroStatus: "all" };
  }
}

async function aplicarFiltrosSalvos() {
  const estado = carregarEstadoFiltros();

  // Aplicar filtro de ano
  const selectAno = document.getElementById("filtroAno");
  if (selectAno && estado.filtroAno) {
    if (Array.from(selectAno.options).some((o) => o.value === estado.filtroAno)) {
      selectAno.value = estado.filtroAno;
      filtroAtualAno = estado.filtroAno;
    }
  }

  // Aplicar filtro de mês
  const selectMes = document.getElementById("filtroMes");
  if (selectMes && estado.filtroMes) {
    if (Array.from(selectMes.options).some((o) => o.value === estado.filtroMes)) {
      selectMes.value = estado.filtroMes;
      filtroAtualMes = estado.filtroMes;
    }
  }

  // Remover listeners temporariamente para evitar conflitos
  document.querySelectorAll(".pill-filter").forEach((btn) => {
    btn.classList.remove("active");
  });

  // Aplicar filtros de tipo e status
  aplicarFiltroPill("tipo", estado.filtroTipo);
  aplicarFiltroPill("status", estado.filtroStatus);

  // Recarregar dados
  await carregarLancamentos();
  await carregarOrcamento();
  await carregarDashboard();
  atualizarResumo();
  renderizarTabela();
}

/**
 * @param {string} tipo
 * @param {string} valor
 * @returns {void}
 */
function aplicarFiltroPill(tipo, valor) {
  const btn = document.querySelector(`.pill-filter[data-filter-${tipo}="${valor}"]`);
  if (btn) {
    btn.classList.add("active");
    if (tipo === "tipo") filtroAtualTipo = valor;
    if (tipo === "status") filtroAtualStatus = valor;
  }
}

// ====== CONFIGURAÇÃO DE EVENT LISTENERS ======
function configurarEventListeners() {
  // Filtro de ano
  document.getElementById("filtroAno").addEventListener("change", async function () {
    filtroAtualAno = this.value;
    salvarEstadoFiltros();
    document.getElementById("filtroMes").value = "all";
    filtroAtualMes = "all";
    atualizarMesesFiltro();
    await carregarOrcamento();
    await carregarDashboard();
    atualizarResumo();
    renderizarTabela();
  });

  // Filtro de mês
  document.getElementById("filtroMes").addEventListener("change", async function () {
    filtroAtualMes = this.value;
    salvarEstadoFiltros();
    await carregarOrcamento();
    await carregarDashboard();
    atualizarResumo();
    renderizarTabela();
  });

  // Filtros de tipo (pills)
  document.querySelectorAll(".pill-filter[data-filter-tipo]:not(.status-filter)").forEach((btn) => {
    btn.addEventListener("click", function () {
      // Remover active apenas dos filtros de tipo
      document.querySelectorAll(".pill-filter[data-filter-tipo]:not(.status-filter)").forEach((b) => {
        b.classList.remove("active");
      });
      this.classList.add("active");

      filtroAtualTipo = this.dataset.filterTipo || "all";
      salvarEstadoFiltros();
      atualizarResumo();
      renderizarTabela();
    });
  });

  document.querySelectorAll(".pill-filter.status-filter").forEach((btn) => {
    btn.addEventListener("click", function () {
      // Remover active apenas dos filtros de status
      document.querySelectorAll(".pill-filter.status-filter").forEach((b) => {
        b.classList.remove("active");
      });
      this.classList.add("active");

      filtroAtualStatus = this.dataset.filterStatus || "all";
      salvarEstadoFiltros();
      atualizarResumo();
      renderizarTabela();
    });
  });

  document.getElementById("tipo").addEventListener("change", async function () {
    const tipoSelecionado = this.value;
    await carregarCategorias(tipoSelecionado);
    document.getElementById("categoria").value = "";
    document.getElementById("subcategoria").innerHTML = '<option value="" disabled selected>Selecione...</option>';
    atualizarVisibilidadeCampos(tipoSelecionado);
  });

  document.getElementById("categoria").addEventListener("change", atualizarSubcategorias);

  document.querySelector('#formLancamento button[type="reset"]').addEventListener("click", function () {
    if (lancamentoEditando) {
      cancelarEdicao();
    }
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", fazerLogout);
  }

  // Botões de navegação e ações (substituem os antigos onclick)
  document.getElementById("btnImportar")?.addEventListener("click", abrirModalImportacao);
  document.getElementById("btnDashboard")?.addEventListener("click", ir_para_dashboard);
  document.getElementById("btnFecharModal")?.addEventListener("click", fecharModalImportacao);
  document.getElementById("btnCancelarImportacao")?.addEventListener("click", fecharModalImportacao);
  document.getElementById("btnSelecionarArquivoImportacao")?.addEventListener("click", () => {
    document.getElementById("arquivoImportacao")?.click();
  });
  document.getElementById("arquivoImportacao")?.addEventListener("change", selecionarArquivoImportacao);
  document.getElementById("btnCancelar")?.addEventListener("click", cancelarEdicao);
  document.getElementById("btnImportarDados")?.addEventListener("click", processarImportacao);
}
function ir_para_dashboard() {
  window.location.href = "dashboard.html";
}

async function fazerLogout() {
  const token = getAccessToken();
  if (token) {
    try {
      await window.electronAPI.logout(token);
    } catch {
      // limpa mesmo se a API falhar
    }
  }

  clearAuthSession();
  window.location.href = "login.html";
}

// ====== LOADERS ======
async function carregarPessoas() {
  let data = await window.electronAPI.getPessoas();
  if (!Array.isArray(data)) data = [];
  const select = document.getElementById("pessoa");
  select.innerHTML = '<option value="">(não especificar)</option>';

  data.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.nome;
    select.appendChild(opt);
  });
}

/**
 * @param {string | null} [tipoFiltro]
 * @returns {Promise<void>}
 */
async function carregarCategorias(tipoFiltro = null) {
  try {
    let data = await window.electronAPI.getCategorias(tipoFiltro);
    if (!Array.isArray(data)) data = [];

    if (tipoFiltro) {
      // Filtrar apenas as do tipo solicitado para o select
      const categoriasFiltradas = data.filter((cat) => cat.tipo === tipoFiltro).sort((a, b) => a.nome.localeCompare(b.nome));
      categoriasCache = [...categoriasCache.filter((cat) => cat.tipo !== tipoFiltro), ...categoriasFiltradas];

      const select = document.getElementById("categoria");
      select.innerHTML = '<option value="" disabled selected>Selecione...</option>';

      categoriasFiltradas.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.nome;
        select.appendChild(opt);
      });
    } else {
      // Quando não tem filtro, carrega todas e atualiza cache completo
      categoriasCache = data;

      const select = document.getElementById("categoria");
      select.innerHTML = '<option value="" disabled selected>Selecione...</option>';

      data
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .forEach((cat) => {
          const opt = document.createElement("option");
          opt.value = cat.id;
          opt.textContent = cat.nome;
          select.appendChild(opt);
        });
    }

    // Limpar subcategoria quando mudar a categoria
    document.getElementById("subcategoria").innerHTML = '<option value="" disabled selected>Selecione...</option>';
  } catch (error) {
    window.electronAPI?.logError("orcamento", "Erro ao carregar categorias", error);
    mostrarFeedback("Erro ao carregar categorias.");
  }
}

/**
 * @param {"RECEITA" | "DESPESA" | "TRANSFERENCIA"} tipo
 * @returns {void}
 */
function atualizarVisibilidadeCampos(tipo) {
  const contaDestinoRow = document.getElementById("contaDestino").closest(".form-row");
  const subcategoriaRow = document.getElementById("subcategoria").closest(".form-row");
  const selectCategoria = document.getElementById("categoria");

  if (tipo === "TRANSFERENCIA") {
    contaDestinoRow.style.display = "";
    subcategoriaRow.style.display = "none";
    document.getElementById("subcategoria").removeAttribute("required");
    selectCategoria.removeAttribute("required");

    // Popular #categoria com subcategorias da categoria Transferência
    const catTransferencia = categoriasCache.find((c) => c.tipo === "TRANSFERENCIA");
    selectCategoria.innerHTML = '<option value="" disabled selected>Selecione...</option>';
    if (catTransferencia) {
      subcategoriasCache
        .filter((s) => String(s.categoria_id) === String(catTransferencia.id))
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.nome;
          selectCategoria.appendChild(opt);
        });
    }
  } else {
    contaDestinoRow.style.display = "none";
    subcategoriaRow.style.display = "";
    document.getElementById("subcategoria").setAttribute("required", "");
    selectCategoria.setAttribute("required", "");

    // Restaurar #categoria com categorias do tipo selecionado
    selectCategoria.innerHTML = '<option value="" disabled selected>Selecione...</option>';
    categoriasCache
      .filter((c) => c.tipo === tipo)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.nome;
        selectCategoria.appendChild(opt);
      });
  }
}

async function carregarLancamentos() {
  // FIX: sem try/catch o usuário ficava com tela vazia sem feedback
  const tbody = document.getElementById("tabelaLancamentos");
  if (tbody) {
    tbody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="8">
          <div class="empty-state">Carregando lançamentos...</div>
        </td>
      </tr>`;
  }

  try {
    let data = await window.electronAPI.getLancamentos();
    if (!Array.isArray(data)) data = [];
    lancamentos = data;

    atualizarAnosFiltro();
    atualizarMesesFiltro();
    atualizarResumo();
    renderizarTabela();
  } catch (err) {
    window.electronAPI?.logError("index", "Erro ao carregar lançamentos", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr class="empty-state-row">
          <td colspan="8">
            <div class="empty-state" style="color:#f87171">
              Erro ao carregar lançamentos. Verifique sua conexão e recarregue.
            </div>
          </td>
        </tr>`;
    }
    exibirToast("Erro ao carregar lançamentos", "error");
  }
}

async function carregarSubcategoriasCache() {
  let data = await window.electronAPI.getSubcategorias();
  if (!Array.isArray(data)) data = [];
  subcategoriasCache = data;
}

async function carregarContas() {
  let data = await window.electronAPI.getContas();
  if (!Array.isArray(data)) data = [];
  contasCache = data;

  const origem = document.getElementById("contaOrigem");
  const destino = document.getElementById("contaDestino");

  origem.innerHTML = '<option value="" disabled selected>Selecione...</option>';
  destino.innerHTML = '<option value="">(nenhuma)</option>';

  data.forEach((c) => {
    const o1 = document.createElement("option");
    o1.value = c.id;
    o1.textContent = c.nome;
    origem.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = c.id;
    o2.textContent = c.nome;
    destino.appendChild(o2);
  });
}

async function carregarOrcamento() {
  const ano = document.getElementById("filtroAno").value;
  const mes = document.getElementById("filtroMes").value;

  // FIX: mês sem ano gerava chave inválida (ex: "03" em vez de "2024-03")
  // getOrcamento espera undefined ou formato "YYYY" ou "YYYY-MM"
  let chave;
  if (ano !== "all" && mes !== "all") {
    chave = `${ano}-${mes}`;
  } else if (ano !== "all") {
    chave = ano;
  }
  // se apenas mês selecionado sem ano: chave = undefined (sem filtro de data na API)

  const data = await window.electronAPI.getOrcamento(chave);
  const totaisOrcamento = calcularTotaisOrcamento(data);
  atualizarComparacao(totaisOrcamento);
}

async function carregarDashboard() {
  try {
    const ano = document.getElementById("filtroAno").value;
    const mes = document.getElementById("filtroMes").value;
    let chave;
    if (ano !== "all" && mes !== "all") {
      chave = `${ano}-${mes}`;
    } else if (ano !== "all") {
      chave = ano;
    }
    const data = await window.electronAPI.getDashboard(chave);

    if (data && data.totais) {
      atualizarComparacao(data.totais);
    }
  } catch (error) {
    window.electronAPI?.logError("orcamento", "Erro ao carregar dashboard", error);
    mostrarFeedback("Erro ao carregar dashboard.");
  }
}

// ====== ROTINAS ======
// Calcular totais do orçamento
/**
 * @param {import("../../src/types").LancamentoOrcamento[]} orcamentoData
 * @returns {{ receitas_planejadas: number, despesas_planejadas: number, receitas_realizadas: number, despesas_realizadas: number }}
 */
function calcularTotaisOrcamento(orcamentoData) {
  if (!Array.isArray(orcamentoData)) orcamentoData = [];
  const anoSelecionado = document.getElementById("filtroAno").value;
  const mesSelecionado = document.getElementById("filtroMes").value;

  let receitas_planejadas = 0;
  let despesas_planejadas = 0;
  let receitas_realizadas = 0;
  let despesas_realizadas = 0;

  orcamentoData.forEach((item) => {
    // Filtrar por ano/mês se não for "all"
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

  return {
    receitas_planejadas,
    despesas_planejadas,
    receitas_realizadas,
    despesas_realizadas,
  };
}

// Carrega as sub categorais do cache pra o front
async function atualizarSubcategorias() {
  const categoriaId = document.getElementById("categoria").value;
  const select = document.getElementById("subcategoria");

  select.innerHTML = '<option value="" disabled selected>Selecione...</option>';

  subcategoriasCache
    .filter((s) => String(s.categoria_id) === categoriaId)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.nome;
      select.appendChild(opt);
    });
}

/**
 * @returns {void}
 */
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

  // Atualizar cards principais
  document.getElementById("totalReceitas").textContent = formatCurrency(receitas);
  document.getElementById("totalDespesas").textContent = formatCurrency(despesas);
  document.getElementById("saldoAtual").textContent = formatCurrency(saldo);

  // ATUALIZAR TAMBÉM OS SALDOS NO CABEÇALHO
  document.getElementById("headerReceitas").textContent = `R$ ${formatCurrency(receitas)}`;
  document.getElementById("headerDespesas").textContent = `R$ ${formatCurrency(despesas)}`;
  document.getElementById("headerSaldo").textContent = `R$ ${formatCurrency(saldo)}`;

  // Atualizar cor do saldo no cabeçalho baseado no valor
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

/**
 * @param {{ receitas_planejadas: number, despesas_planejadas: number, receitas_realizadas: number, despesas_realizadas: number }} totais
 * @returns {void}
 */
function atualizarComparacao(totais) {
  // Receitas
  document.getElementById("receitasPlanejadas").textContent = formatCurrency(totais.receitas_planejadas);
  document.getElementById("receitasRealizadas").textContent = formatCurrency(totais.receitas_realizadas);

  const diffReceitas = totais.receitas_realizadas - totais.receitas_planejadas;
  const diffReceitasElem = document.getElementById("diffReceitas");
  diffReceitasElem.textContent = formatCurrency(Math.abs(diffReceitas));
  diffReceitasElem.className = `value difference ${diffReceitas >= 0 ? "positive" : "negative"}`;

  // Progresso receitas
  const progressReceitas = totais.receitas_planejadas > 0 ? (totais.receitas_realizadas / totais.receitas_planejadas) * 100 : 0;
  document.getElementById("progressReceitas").style.width = `${Math.min(progressReceitas, 100)}%`;

  // Despesas
  document.getElementById("despesasPlanejadas").textContent = formatCurrency(totais.despesas_planejadas);
  document.getElementById("despesasRealizadas").textContent = formatCurrency(totais.despesas_realizadas);

  const diffDespesas = totais.despesas_realizadas - totais.despesas_planejadas;
  const diffDespesasElem = document.getElementById("diffDespesas");
  diffDespesasElem.textContent = formatCurrency(Math.abs(diffDespesas));
  diffDespesasElem.className = `value difference ${diffDespesas <= 0 ? "positive" : "negative"}`;

  // Progresso despesas
  const progressDespesas = totais.despesas_planejadas > 0 ? (totais.despesas_realizadas / totais.despesas_planejadas) * 100 : 0;
  document.getElementById("progressDespesas").style.width = `${Math.min(progressDespesas, 100)}%`;

  // OPICIONAL: Atualizar também com valores planejados no cabeçalho
  // const saldoPlanejado = totais.receitas_planejadas - totais.despesas_planejadas;
  // const saldoRealizado = totais.receitas_realizadas - totais.despesas_realizadas;
}

// ====== EDIÇÃO DE LANÇAMENTOS ======
/**
 * @param {number | string} id
 * @param {Event | null} [event]
 * @returns {Promise<void>}
 */
async function editarLancamento(id, event = null) {
  if (event) event.stopPropagation();

  setCampoValor({ disabled: false, readOnly: false });

  const lancamento = lancamentos.find((l) => l.id === id);
  if (!lancamento) return;

  lancamentoEditando = lancamento;

  // Se for um dos registros de uma transferência (DESPESA ou RECEITA com grupo),
  // buscar o par para editar ambos juntos
  let tipoExibicao = lancamento.tipo;
  if (lancamento.transferencia_grupo_id) {
    tipoExibicao = "TRANSFERENCIA";
  }

  // Carregar categorias do tipo correto primeiro
  await carregarCategorias(tipoExibicao);

  // Preencher formulário com dados do lançamento
  document.getElementById("data").value = lancamento.data;
  document.getElementById("tipo").value = tipoExibicao;
  document.getElementById("valor").value = lancamento.valor;
  document.getElementById("status").value = lancamento.status;
  document.getElementById("descricao").value = lancamento.descricao || "";

  atualizarVisibilidadeCampos(tipoExibicao);

  if (tipoExibicao === "TRANSFERENCIA") {
    // #categoria contém subcategorias; seleciona pela subcategoria_id
    document.getElementById("categoria").value = lancamento.subcategoria_id;
  } else {
    document.getElementById("categoria").value = lancamento.categoria_id;
    await atualizarSubcategorias();
    document.getElementById("subcategoria").value = lancamento.subcategoria_id;
  }

  if (lancamento.transferencia_grupo_id) {
    // Encontrar o par para preencher ambas as contas
    const par = lancamentos.find((l) => l.transferencia_grupo_id === lancamento.transferencia_grupo_id && l.id !== lancamento.id);
    document.getElementById("contaOrigem").value = lancamento.tipo === "DESPESA" ? lancamento.conta_origem_id || "" : par?.conta_origem_id || "";
    document.getElementById("contaDestino").value = lancamento.tipo === "RECEITA" ? lancamento.conta_destino_id || "" : par?.conta_destino_id || "";
  } else {
    document.getElementById("contaOrigem").value = lancamento.conta_origem_id || "";
    document.getElementById("contaDestino").value = lancamento.conta_destino_id || "";
  }

  document.getElementById("pessoa").value = lancamento.pessoa_id || "";

  // Mudar o botão para "Atualizar"
  const submitBtn = document.querySelector('#formLancamento button[type="submit"]');
  submitBtn.innerHTML = "<span>💾 Atualizar Lançamento</span>";
  submitBtn.setAttribute("data-editing", "true");

  // Rolar até o formulário
  document.querySelector(".card").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  // Destacar o formulário
  document.getElementById("formLancamento").classList.add("form-editing");

  // Mostrar botão cancelar
  document.getElementById("btnCancelar").style.display = "inline-flex";
}

/**
 * @returns {Promise<void>}
 */
async function cancelarEdicao() {
  setCampoValor({ disabled: false, readOnly: false });

  lancamentoEditando = null;
  // Restaurar botão original
  const submitBtn = document.querySelector('#formLancamento button[type="submit"]');
  submitBtn.innerHTML = "<span>Salvar lançamento</span>";
  submitBtn.removeAttribute("data-editing");

  document.getElementById("btnCancelar").style.display = "none";

  const form = document.getElementById("formLancamento");
  form.reset();
  await carregarCategorias("DESPESA");
  atualizarVisibilidadeCampos("DESPESA");

  // 🔧 REARME EXPLÍCITO DO CAMPO VALOR
  const campoValor = document.getElementById("valor");
  campoValor.disabled = false;
  campoValor.readOnly = false;
  campoValor.value = "";
  campoValor.focus();

  document.getElementById("data").valueAsDate = new Date();
  // Remover destaque visual
  form.classList.remove("form-editing");
}

// ====== EXCLUSÃO DE LANÇAMENTOS ======
/**
 * @param {number | string} id
 * @param {Event | null} [event]
 * @returns {Promise<void>}
 */
async function excluirLancamento(id, event = null) {
  if (event) event.stopPropagation();

  const lancamento = lancamentos.find((l) => l.id === id);
  if (!lancamento) return;

  // Confirmação de exclusão
  const isTransferencia = !!lancamento.transferencia_grupo_id;
  const confirmMessage = isTransferencia
    ? `Tem certeza que deseja excluir esta transferência?\n\n` +
      `Data: ${formatDate(lancamento.data)}\n` +
      `Descrição: ${lancamento.descricao || "Sem descrição"}\n` +
      `Valor: R$ ${formatCurrency(lancamento.valor)}\n` +
      `Transferência: DESPESA (conta origem) + RECEITA (conta destino)\n\n` +
      `Ambos os lançamentos serão excluídos. Esta ação não pode ser desfeita.`
    : `Tem certeza que deseja excluir este lançamento?\n\n` +
      `Data: ${formatDate(lancamento.data)}\n` +
      `Descrição: ${lancamento.descricao || "Sem descrição"}\n` +
      `Valor: R$ ${formatCurrency(lancamento.valor)}\n` +
      `Tipo: ${lancamento.tipo}\n\n` +
      `Esta ação não pode ser desfeita.`;

  const confirmar = await confirmDialog(confirmMessage);

  if (!confirmar) return;

  try {
    if (lancamento.transferencia_grupo_id) {
      await window.electronAPI.deletarTransferencia(lancamento.transferencia_grupo_id);
    } else {
      await window.electronAPI.deletarLancamento(id);
    }

    // Recarregar os dados
    await carregarLancamentos();
    await carregarDashboard();

    // Feedback visual
    mostrarFeedbackExclusao("✅ Lançamento excluído com sucesso!");
  } catch (error) {
    exibirToast("Erro ao excluir lançamento: " + error.message, "error");
  }
}

/**
 * @param {string} mensagem
 */
function mostrarFeedbackExclusao(mensagem) {
  exibirToast(mensagem, "success");
}
// ====== FUNÇÕES DE IMPORTAÇÃO ======
async function selecionarArquivoImportacao(event) {
  const arquivo = event.target.files?.[0] || null;
  arquivoImportacaoAtual = arquivo;

  const nomeArquivo = document.getElementById("arquivoImportacaoNome");
  const btnImportar = document.getElementById("btnImportarDados");

  if (arquivo) {
    nomeArquivo.textContent = arquivo.name;
    btnImportar.disabled = false;
    return;
  }

  nomeArquivo.textContent = "Nenhum arquivo selecionado";
  btnImportar.disabled = true;
}

function limparSelecaoImportacao() {
  arquivoImportacaoAtual = null;
  const inputArquivo = document.getElementById("arquivoImportacao");
  const nomeArquivo = document.getElementById("arquivoImportacaoNome");
  const btnImportar = document.getElementById("btnImportarDados");

  if (inputArquivo) inputArquivo.value = "";
  if (nomeArquivo) nomeArquivo.textContent = "Nenhum arquivo selecionado";
  if (btnImportar) btnImportar.disabled = true;
}

async function processarImportacao() {
  const btn = document.getElementById("btnImportarDados");
  btn.disabled = true;
  btn.textContent = "Importando...";

  try {
    if (!arquivoImportacaoAtual) {
      exibirToast("Selecione um arquivo para importar.", "warning");
      return;
    }

    const leitor = new FileReader();
    const textoArquivo = await new Promise((resolve, reject) => {
      leitor.onload = () => resolve(String(leitor.result || ""));
      leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
      leitor.readAsText(arquivoImportacaoAtual, "UTF-8");
    });

    const resultado = await window.electronAPI.importarCSV(textoArquivo);

    if (resultado.error) {
      exibirToast(resultado.error, "error");
      return;
    }

    if (resultado.importados === 0) {
      exibirToast("Nenhum dado válido encontrado no arquivo.", "warning");
      return;
    }

    mostrarResultadoImportacao(resultado);
  } catch (error) {
    exibirToast("Erro: " + (error?.message || "falha ao importar"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "📤 Importar Dados";
  }
}

/**
 * @returns {void}
 */
function abrirModalImportacao() {
  const modal = document.getElementById("modalImportacao");
  modal.style.pointerEvents = "auto";
  modal.style.display = "block";
  document.getElementById("resultadoImportacao").style.display = "none";
  limparSelecaoImportacao();
  document.getElementById("btnSelecionarArquivoImportacao")?.focus();
}

/**
 * @returns {void}
 */
function fecharModalImportacao() {
  const modal = document.getElementById("modalImportacao");
  modal.style.pointerEvents = "none";
  modal.style.display = "none";
  limparSelecaoImportacao();
}
// Altera o rodape pra mostrar que a importaçaõ deu certo
/**
 * @param {{ importados: number, erros: Array<{ linha: number, mensagem: string }> }} resultado
 */
function mostrarResultadoImportacao(resultado) {
  const divResultado = document.getElementById("resultadoImportacao");
  divResultado.style.display = "block";
  divResultado.innerHTML = `
          <div style="background: var(--accent-soft); padding: 12px; border-radius: 8px; border: 1px solid rgba(34,197,94,0.3);">
            <div style="color: #bbf7d0; font-weight: 600; margin-bottom: 5px;">✅ Importação Concluída!</div>
            <div style="font-size: 12px; color: var(--text-muted);">
            ${resultado.importados} itens importados com sucesso.<br>
            Atualize a página para ver os dados no dashboard.
              </div>
            </div>
        `;

  limparSelecaoImportacao();

  // Recarregar dados após 3 segundos
  if (_importTimeoutId) clearTimeout(_importTimeoutId);
  _importTimeoutId = setTimeout(() => {
    _importTimeoutId = null;
    carregarOrcamento();
    carregarDashboard();
  }, 3000);
}
// ====== HELPERS ======
// Formatador de moeda
/**
 * @param {number | string} value
 * @returns {string}
 */
function formatCurrency(value) {
  return formatarMoeda(value);
}
// Formatador de data
/**
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  // Garante que a data seja tratada como data local (sem conversão de fuso)
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    // Cria a data explicitamente como local (ano, mês-1, dia)
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString("pt-BR");
  }

  // Fallback para o método antigo se o formato não for YYYY-MM-DD
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR");
}

/**
 * @param {string} mensagem
 * @param {"info" | "success" | "error"} [tipo="info"]
 * @returns {void}
 */
function mostrarFeedback(mensagem, tipo = "info") {
  const mapTipo = { info: "info", error: "error", warning: "warning", success: "info" };
  exibirToast(mensagem, mapTipo[tipo] || "info");
}

// ====== TABELA ======
// Coletar anos únicos dos lançamentos
/**
 * @returns {void}
 */
function atualizarAnosFiltro() {
  const filtro = document.getElementById("filtroAno");
  const estadoSalvo = carregarEstadoFiltros();
  const valorParaManter = estadoSalvo.filtroAno || "all";

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

  const opcaoExiste = Array.from(filtro.options).some((option) => option.value === valorParaManter);
  if (opcaoExiste) {
    filtro.value = valorParaManter;
    filtroAtualAno = valorParaManter;
  } else {
    filtro.value = "all";
    filtroAtualAno = "all";
    estadoSalvo.filtroAno = "all";
    salvarEstadoFiltros();
  }
}

// Coletar meses únicos dos lançamentos no ano selecionado
/**
 * @returns {void}
 */
function atualizarMesesFiltro() {
  const filtro = document.getElementById("filtroMes");
  const estadoSalvo = carregarEstadoFiltros();
  const valorParaManter = estadoSalvo.filtroMes || "all";
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

  const opcaoExiste = Array.from(filtro.options).some((option) => option.value === valorParaManter);
  if (opcaoExiste) {
    filtro.value = valorParaManter;
    filtroAtualMes = valorParaManter;
  } else {
    filtro.value = "all";
    filtroAtualMes = "all";
    estadoSalvo.filtroMes = "all";
    salvarEstadoFiltros();
  }
}

function renderizarTabela() {
  const tbody = document.getElementById("tabelaLancamentos");
  tbody.innerHTML = "";

  const lista = lancamentos.filter((l) => {
    const anoKey = l.data.substring(0, 4);
    const mesKey = l.data.substring(5, 7);

    // Aplicar filtro de ano
    if (filtroAtualAno !== "all" && anoKey !== filtroAtualAno) return false;

    // Aplicar filtro de mês
    if (filtroAtualMes !== "all" && mesKey !== filtroAtualMes) return false;

    // Aplicar filtro de tipo
    if (filtroAtualTipo !== "all" && l.tipo !== filtroAtualTipo) return false;

    // Aplicar filtro de status
    if (filtroAtualStatus !== "all" && l.status !== filtroAtualStatus) return false;

    return true;
  });

  document.getElementById("contadorLancamentos").textContent = `${lista.length} lançamento${lista.length !== 1 ? "s" : ""}`;

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="8">
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
    tr.style.cursor = "pointer";
    tr.setAttribute("data-lancamento-id", l.id);
    tr.setAttribute("data-tipo", l.tipo);
    tr.setAttribute("data-status", l.status);

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
      <td>
        <div class="table-actions">
          <button class="btn outline" data-acao="editar" style="padding: 3px 8px; font-size: 11px;"> ✏️ Editar </button>
          <button class="btn outline" data-acao="excluir" style="padding: 3px 8px; font-size: 11px; color: #f87171; border-color: #f87171;"> 🗑️ Excluir </button>
        </div>
      </td>
    `;

    tr.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) {
        editarLancamento(l.id);
        return;
      }
      const acao = btn.dataset.acao;
      if (acao === "editar") editarLancamento(l.id, e);
      if (acao === "excluir") excluirLancamento(l.id, e);
    });

    tbody.appendChild(tr);
  });
}
// ====== SUBMIT ======
document.getElementById("formLancamento").addEventListener("submit", async (e) => {
  setCampoValor({ disabled: false });

  e.preventDefault();
  const f = e.target;
  const isEditing = document.querySelector('#formLancamento button[type="submit"]').getAttribute("data-editing") === "true";

  const isTransferencia = f.tipo.value === "TRANSFERENCIA";
  const catTransferencia = isTransferencia ? categoriasCache.find((c) => c.tipo === "TRANSFERENCIA") : null;

  const payload = {
    data: f.data.value,
    tipo: f.tipo.value,
    status: f.status.value,
    valor: Number(f.valor.value),
    categoria_id: isTransferencia ? catTransferencia?.id || null : f.categoria.value,
    subcategoria_id: isTransferencia ? f.categoria.value : f.subcategoria.value,
    conta_origem_id: f.contaOrigem.value,
    conta_destino_id: f.contaDestino.value || null,
    pessoa_id: f.pessoa.value || null,
    descricao: f.descricao.value || null,
  };

  if (!payload.valor || payload.valor <= 0) {
    mostrarFeedback("Valor inválido", "warning");
    return;
  }

  if (isTransferencia && payload.conta_origem_id && payload.conta_destino_id && payload.conta_origem_id === payload.conta_destino_id) {
    mostrarFeedback("Conta de origem e destino devem ser diferentes", "warning");
    return;
  }

  try {
    if (isEditing && lancamentoEditando) {
      if (lancamentoEditando.transferencia_grupo_id) {
        await window.electronAPI.updateTransferencia(lancamentoEditando.transferencia_grupo_id, payload);
      } else {
        await window.electronAPI.updateLancamento(lancamentoEditando.id, payload);
      }
    } else if (isTransferencia) {
      await window.electronAPI.criarTransferencia(payload);
    } else {
      await window.electronAPI.criarLancamento(payload);
    }

    // Sucesso
    exibirToast(isEditing ? "Lançamento atualizado com sucesso!" : "Lançamento criado com sucesso!", "success");

    // Recarregar dados e resetar formulário
    await carregarLancamentos();
    await cancelarEdicao();
    await carregarDashboard();
    await atualizarSubcategorias();
  } catch (error) {
    exibirToast("Erro ao salvar lançamento: " + error.message, "error");
    setCampoValor({ disabled: false });
    await carregarLancamentos();
    await atualizarSubcategorias();
    await cancelarEdicao();
  }
});
// ====== FILTROS E INTERATIVIDADE ======
// Recarrega ao trocar o mês
document.getElementById("filtroMes").addEventListener("change", () => {
  atualizarResumo();
  renderizarTabela();
});
// Preencher data atual por padrão
document.getElementById("data").valueAsDate = new Date();

function setCampoValor({ disabled = false, readOnly = false } = {}) {
  const campo = document.getElementById("valor");
  if (!campo) return;
  campo.disabled = disabled;
  campo.readOnly = readOnly;
}

function desbloquearCampoValor() {
  const campo = document.getElementById("valor");
  if (!campo) return;

  campo.blur();
  campo.disabled = false;
  campo.readOnly = false;

  // força repaint + hit-test
  campo.style.pointerEvents = "none";
  campo.offsetHeight; // força reflow
  campo.style.pointerEvents = "auto";

  campo.focus();
}

function garantirCampoInterativo() {
  const campo = document.getElementById("valor");
  if (!campo) return;

  const tentar = () => {
    campo.disabled = false;
    campo.readOnly = false;
    campo.focus();
  };

  tentar();

  const obs = new MutationObserver(() => tentar());
  obs.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => obs.disconnect(), 5000);
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", async () => {
  const auth = await ensureAuthenticated();
  if (!auth) return;

  // 0. Carregar avatar do usuário
  try {
    const perfil = await window.electronAPI.getPerfil();
    const pill = document.getElementById("avatarPill");
    if (perfil?.avatar_url) {
      pill.innerHTML = `<img src="${escapeHtml(perfil.avatar_url)}" alt="Avatar">`;
      pill.classList.add("has-avatar");
    }
  } catch {
    /* sem avatar = fallback "F" */
  }

  // 1. Render inicial LIMPO
  await new Promise(requestAnimationFrame);

  // 2. Agora sim, dados
  await carregarSubcategoriasCache();
  await carregarContas();
  await carregarPessoas();

  // 3. Segundo frame (importantíssimo no Electron)
  await new Promise(requestAnimationFrame);

  await carregarCategorias();
  atualizarVisibilidadeCampos("DESPESA");
  await aplicarFiltrosSalvos();

  configurarEventListeners();

  // 4. Admin: exibir botão se for admin
  if (auth.usuario.role === "admin") {
    const header = document.querySelector(".header-controls");
    if (header) {
      const btn = document.createElement("a");
      btn.href = "admin.html";
      btn.className = "pill-button";
      btn.innerHTML = '<span class="icon">🔧</span><span>Admin</span>';
      const ref = header.querySelector('[href="configuracoes.html"]');
      if (ref) {
        header.insertBefore(btn, ref);
      } else {
        header.prepend(btn);
      }
    }
  }

  // 5. Tipo Pessoa toggle
  configurarTipoPessoaToggle();

  // 6. Forçar reativação do input
  desbloquearCampoValor();
  garantirCampoInterativo();

  // Remover splash
  const splash = document.getElementById("splashScreen");
  if (splash) {
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 500);
  }
});

// Test helpers (setters for ESM module-scoped variables)
function setLancamentos(data) {
  lancamentos = data;
}
function setCategoriasCache(data) {
  categoriasCache = data;
}
function setSubcategoriasCache(data) {
  subcategoriasCache = data;
}
function setContasCache(data) {
  contasCache = data;
}
function setFiltroAtualTipo(val) {
  filtroAtualTipo = val;
}
function setFiltroAtualStatus(val) {
  filtroAtualStatus = val;
}
function setFiltroAtualAno(val) {
  filtroAtualAno = val;
}
function setFiltroAtualMes(val) {
  filtroAtualMes = val;
}
function setLancamentoEditando(val) {
  lancamentoEditando = val;
}

export {
  abrirModalImportacao,
  aplicarFiltroPill,
  aplicarFiltrosSalvos,
  atualizarAnosFiltro,
  atualizarComparacao,
  atualizarMesesFiltro,
  atualizarResumo,
  atualizarSubcategorias,
  calcularTotaisOrcamento,
  cancelarEdicao,
  carregarCategorias,
  carregarContas,
  carregarDashboard,
  carregarEstadoFiltros,
  carregarLancamentos,
  carregarOrcamento,
  carregarPessoas,
  carregarSubcategoriasCache,
  editarLancamento,
  excluirLancamento,
  fecharModalImportacao,
  formatCurrency,
  formatDate,
  limparSelecaoImportacao,
  mostrarFeedback,
  mostrarResultadoImportacao,
  processarImportacao,
  renderizarTabela,
  selecionarArquivoImportacao,
  salvarEstadoFiltros,
  setCampoValor,
  setCategoriasCache,
  setContasCache,
  setFiltroAtualAno,
  setFiltroAtualMes,
  setFiltroAtualStatus,
  setFiltroAtualTipo,
  setLancamentoEditando,
  setLancamentos,
  setSubcategoriasCache,
};
