/**
 * @file Página de dashboard com gráficos financeiros.
 */

import { clearAuthSession, ensureAuthenticated, getAccessToken } from "./auth-guard.js";

const _cleanups = [];

window.addEventListener("beforeunload", () => {
  _cleanups.forEach((fn) => fn());
  _cleanups.length = 0;
});

// Gráficos
let chartMensal, chartCategorias, chartSaldo;

// Dados
let dadosDashboard = [];
let _carregarSeq = 0;
let _todasCategorias = [];

// Inicialização
document.addEventListener("DOMContentLoaded", async function () {
  const auth = await ensureAuthenticated();
  if (!auth) {
    return;
  }

  await carregarCategorias();
  await popularAnos();
  await carregarDashboard();

  // Event listeners ANTES de popularMeses() para garantir que
  // sempre sejam registrados, mesmo se popularMeses() falhar
  adicionarEventListeners();

  try {
    popularMeses();
  } catch (e) {
    window.electronAPI?.logError("dashboard", "Erro ao popular meses", e);
  }

  restaurarFiltrosDashboard();

  configurarLogout();
  configurarTipoPessoaToggle();
});

/**
 * @returns {void}
 */
function configurarLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    const token = getAccessToken();
    if (token) {
      try {
        await window.electronAPI.logout(token);
      } catch {
        // ignora
      }
    }

    clearAuthSession();
    window.location.href = "login.html";
  });
}

const STORAGE_KEY_TIPO_PESSOA = "fnc:v1:tipo_pessoa";
const STORAGE_KEY_FILTRO_DASH = "fnc:v1:dashboard_filtros";

function salvarFiltrosDashboard() {
  try {
    const estado = {
      ano: document.getElementById("filtroAno")?.value || "all",
      mes: document.getElementById("filtroMes")?.value || "all",
      categoria: document.getElementById("filtroCategoria")?.value || "all",
      tipoGrafico: document.getElementById("filtroTipoGrafico")?.value || "DESPESA",
    };
    localStorage.setItem(STORAGE_KEY_FILTRO_DASH, JSON.stringify(estado));
  } catch {
    /* ignora */
  }
}

function restaurarFiltrosDashboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILTRO_DASH);
    if (!raw) return;
    const estado = JSON.parse(raw);
    const map = { ano: "filtroAno", mes: "filtroMes", categoria: "filtroCategoria", tipoGrafico: "filtroTipoGrafico" };
    for (const [campo, id] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && estado[campo] && Array.from(el.options).some((o) => o.value === String(estado[campo]))) {
        el.value = estado[campo];
      }
    }
  } catch {
    /* ignora */
  }
}

function configurarTipoPessoaToggle() {
  const container = document.getElementById("tipoPessoaToggle");
  if (!container) return;

  const salvo = localStorage.getItem(STORAGE_KEY_TIPO_PESSOA);
  if (salvo) atualizarToggle(container, salvo);

  container.addEventListener("click", async () => {
    const atual = container.dataset.tp;
    const novoTp = atual === "PF" ? "PJ" : "PF";
    atualizarToggle(container, novoTp);
    localStorage.setItem(STORAGE_KEY_TIPO_PESSOA, novoTp);
    await window.electronAPI.setTipoPessoa(novoTp);
    await carregarCategorias();
    await popularAnos();
    await carregarDashboard();
    popularMeses();
  });

  _cleanups.push(
    window.electronAPI.onTipoPessoaChanged(async (value) => {
      if (value) {
        atualizarToggle(container, value);
        localStorage.setItem(STORAGE_KEY_TIPO_PESSOA, value);
      }
      await carregarCategorias();
      await popularAnos();
      await carregarDashboard();
      popularMeses();
    }),
  );

  window.electronAPI.getTipoPessoa().then((value) => {
    if (value) {
      atualizarToggle(container, value);
      localStorage.setItem(STORAGE_KEY_TIPO_PESSOA, value);
    }
  });

  if (typeof window.electronAPI?.onUsarPjChanged === "function") {
    _cleanups.push(
      window.electronAPI.onUsarPjChanged(async (value) => {
        container.hidden = !value;
        if (!value) {
          localStorage.setItem(STORAGE_KEY_TIPO_PESSOA, "PF");
          await carregarCategorias();
          await popularAnos();
          await carregarDashboard();
          popularMeses();
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

function atualizarToggle(container, tp) {
  container.dataset.tp = tp;
  const span = container.querySelector("span");
  if (span) span.textContent = tp === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
}

// Adicionar event listeners para atualização automática
/**
 * @returns {void}
 */
function adicionarEventListeners() {
  // Atualizar ao mudar ano
  document.getElementById("filtroAno").addEventListener("change", async function () {
    salvarFiltrosDashboard();
    document.getElementById("filtroMes").value = "all";
    await carregarDashboard();
    popularMeses();
  });

  // Atualizar ao mudar mês
  document.getElementById("filtroMes").addEventListener("change", async function () {
    salvarFiltrosDashboard();
    await carregarDashboard();
  });

  // Atualizar ao mudar categoria
  document.getElementById("filtroCategoria").addEventListener("change", async function () {
    salvarFiltrosDashboard();
    const mesAtual = document.getElementById("filtroMes").value;
    await carregarDashboard();
    popularMeses();
    const select = document.getElementById("filtroMes");
    if ([...select.options].some((o) => o.value === mesAtual)) {
      select.value = mesAtual;
    }
  });

  // O filtro tipo gráfico já tem onchange no HTML para renderizarGraficoCategorias()
  // Mas também vamos atualizar todos os gráficos se quiser
  document.getElementById("filtroTipoGrafico").addEventListener("change", async function () {
    salvarFiltrosDashboard();
    // Atualiza apenas o gráfico de categorias (já está configurado)
    renderizarGraficoCategorias();
  });
}

// Carregar categorias para o filtro
/**
 * @returns {Promise<void>}
 */
async function carregarCategorias() {
  try {
    const categorias = await window.electronAPI.getCategorias();
    _todasCategorias = categorias;

    const select = document.getElementById("filtroCategoria");

    // Limpar options existentes (mantendo apenas "Todas")
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }

    categorias.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat.id;
      option.textContent = cat.nome;
      select.appendChild(option);
    });
  } catch (error) {
    window.electronAPI?.logError("dashboard", "Erro ao carregar categorias", error);
  }
}

// Filtrar categorias para mostrar apenas as com lançamentos nos dados carregados
/**
 * @returns {void}
 */
function filtrarCategoriasComLancamentos() {
  const select = document.getElementById("filtroCategoria");
  if (!dadosDashboard?.lancamentos?.length || !_todasCategorias.length) return;

  const idsComLancamentos = new Set(
    dadosDashboard.lancamentos
      .filter((l) => l.categoria_id)
      .map((l) => String(l.categoria_id)),
  );

  const valorAtual = select.value;

  if (valorAtual !== "all" && _todasCategorias.some((c) => String(c.id) === String(valorAtual))) {
    idsComLancamentos.add(valorAtual);
  }

  const filtradas = _todasCategorias.filter((cat) => idsComLancamentos.has(String(cat.id)));

  while (select.children.length > 1) {
    select.removeChild(select.lastChild);
  }

  filtradas.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.nome;
    select.appendChild(opt);
  });

  if (valorAtual !== "all" && [...select.options].some((o) => o.value === valorAtual)) {
    select.value = valorAtual;
  } else {
    select.value = "all";
  }
}

// Popular seletor de anos com base nos dados existentes
/**
 * @returns {Promise<void>}
 */
async function popularAnos() {
  try {
    const anos = await window.electronAPI.getAnosDisponiveis();
    const select = document.getElementById("filtroAno");
    const valorAtual = select.value;

    select.innerHTML = "";

    anos.forEach((ano) => {
      const opt = document.createElement("option");
      opt.value = String(ano);
      opt.textContent = String(ano);
      select.appendChild(opt);
    });

    if (anos.length > 0) {
      if (valorAtual && anos.includes(Number(valorAtual))) {
        select.value = valorAtual;
      } else {
        select.value = String(anos[0]);
      }
    }
  } catch (error) {
    window.electronAPI?.logError("dashboard", "Erro ao carregar anos disponíveis", error);
  }
}

// Popular seletor de meses com base nos dados carregados do dashboard
/**
 * @returns {void}
 */
function popularMeses() {
  const select = document.getElementById("filtroMes");
  const mesesDisponiveis = [];

  dadosDashboard.lancamentos?.forEach((item) => {
    const mes = item.data.substring(5, 7);
    if (!mesesDisponiveis.includes(mes)) {
      mesesDisponiveis.push(mes);
    }
  });

  mesesDisponiveis.sort();

  select.innerHTML = '<option value="all">Todos</option>';

  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  mesesDisponiveis.forEach((mes) => {
    const opt = document.createElement("option");
    opt.value = mes;
    opt.textContent = nomes[parseInt(mes) - 1];
    select.appendChild(opt);
  });
}

// Carregar dados do dashboardFFFFFS
/**
 * @returns {Promise<void>}
 */
async function carregarDashboard() {
  try {
    const ano = document.getElementById("filtroAno").value;
    const mes = document.getElementById("filtroMes").value;
    const categoria = document.getElementById("filtroCategoria").value;

    mostrarLoading();

    const seq = ++_carregarSeq;
    const dados = await window.electronAPI.getDashboardDados(ano, mes && mes !== "all" ? mes : undefined, categoria && categoria !== "all" ? categoria : undefined);

    if (seq !== _carregarSeq) return;
    if (dados?.error) {
      const mensagem = dados.detalhe || dados.error;
      window.electronAPI?.logError("dashboard", "Erro retornado pelo backend", mensagem);
      esconderLoading();
      return;
    }
    dadosDashboard = dados;
    filtrarCategoriasComLancamentos();
    renderizarGraficos();

    // Esconder loading
    esconderLoading();
  } catch (error) {
    window.electronAPI?.logError("dashboard", "Erro ao carregar dashboard", error);
    esconderLoading();
  }
}

// Funções de loading (opcional, mas melhora UX)
/**
 * @returns {void}
 */
function mostrarLoading() {
  // Criar overlay de loading se quiser
  const charts = document.querySelectorAll(".chart-wrapper");
  charts.forEach((chart) => {
    chart.classList.add("loading");
  });
}

/**
 * @returns {void}
 */
function esconderLoading() {
  const charts = document.querySelectorAll(".chart-wrapper");
  charts.forEach((chart) => {
    chart.classList.remove("loading");
  });
}

// Renderizar todos os gráficos
/**
 * @returns {void}
 */
function renderizarGraficos() {
  renderizarGraficoMensal();
  renderizarGraficoCategorias();
  renderizarGraficoSaldo();
}

// Configuração comum para todos os gráficos
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 12,
        font: {
          size: 11,
        },
      },
    },
  },
};

// 1. Gráfico Mensal
function renderizarGraficoMensal() {
  const ctx = document.getElementById("chartMensal").getContext("2d");

  if (chartMensal) chartMensal.destroy();

  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const receitas = new Array(12).fill(0);
  const despesas = new Array(12).fill(0);

  dadosDashboard.lancamentos?.forEach((item) => {
    // PARSE MANUAL para evitar problemas de fuso horário
    const [, mesStr] = item.data.split("-");
    const mes = parseInt(mesStr) - 1; // Convertendo 01-12 para 0-11

    if (mes >= 0 && mes < 12) {
      if (item.tipo === "RECEITA" && !item.transferencia_grupo_id) {
        receitas[mes] += Number(item.valor);
      } else if (item.tipo === "DESPESA" && !item.transferencia_grupo_id) {
        despesas[mes] += Number(item.valor);
      }
    }
  });

  chartMensal = new Chart(ctx, {
    type: "line",
    data: {
      labels: meses,
      datasets: [
        {
          label: "Despesas",
          data: despesas,
          backgroundColor: "rgba(239, 68, 68, 0.7)",
          borderColor: "rgba(239, 68, 68, 1)",
          borderWidth: 1,
        },
        {
          label: "Receitas",
          data: receitas,
          backgroundColor: "rgba(34, 197, 94, 0.2)",
          borderColor: "rgba(34, 197, 94, 1)",
          borderWidth: 2,
          tension: 0.4,
        },
      ],
    },
    options: {
      ...chartOptions,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return "R$ " + value.toLocaleString("pt-BR");
            },
            font: {
              size: 10,
            },
          },
        },
        x: {
          ticks: {
            font: {
              size: 10,
            },
          },
        },
      },
    },
  });
}

// 2. Gráfico por Categoria
function renderizarGraficoCategorias() {
  const ctx = document.getElementById("chartCategorias").getContext("2d");
  const tipoFiltro = document.getElementById("filtroTipoGrafico").value;

  if (chartCategorias) chartCategorias.destroy();

  const categoriasMap = {};

  dadosDashboard.lancamentos?.forEach((item) => {
    // Filtra pelo tipo selecionado
    if (item.tipo === tipoFiltro && !item.transferencia_grupo_id && item.categoria) {
      const categoriaNome = item.categoria.nome;
      if (!categoriasMap[categoriaNome]) {
        categoriasMap[categoriaNome] = 0;
      }
      categoriasMap[categoriaNome] += Number(item.valor);
    }
  });

  // Se quiser um seletor para tipo (despesa/receita)
  const categoriasOrdenadas = Object.entries(categoriasMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  const categorias = categoriasOrdenadas.map(([nome]) => nome);
  const valores = categoriasOrdenadas.map(([, valor]) => valor);

  chartCategorias = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: categorias,
      datasets: [
        {
          data: valores,
          backgroundColor: ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"],
          label: tipoFiltro === "DESPESA" ? "Despesas por Categoria" : "Receitas por Categoria",
        },
      ],
    },
    options: {
      ...chartOptions,
      cutout: "60%",
      plugins: {
        ...chartOptions.plugins,
        title: {
          display: true,
          text: tipoFiltro === "DESPESA" ? "Despesas por Categoria" : "Receitas por Categoria",
          color: "#e2e8f0",
          font: { size: 14 },
        },
      },
    },
  });
}

// 3. Gráfico de Evolução do Saldo
function renderizarGraficoSaldo() {
  const ctx = document.getElementById("chartSaldo").getContext("2d");
  const anoSelecionado = parseInt(document.getElementById("filtroAno").value);

  if (chartSaldo) chartSaldo.destroy();

  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const saldos = new Array(12).fill(0);

  // Processar todos os lançamentos - USANDO PARSE MANUAL PARA EVITAR FUSO HORÁRIO
  const lancamentosPorMes = new Array(12).fill().map(() => ({ receita: 0, despesa: 0 }));

  dadosDashboard.lancamentos?.forEach((item) => {
    // PARSE MANUAL para evitar problemas de fuso horário
    // Formato esperado: "YYYY-MM-DD"
    const [anoStr, mesStr] = item.data.split("-");
    const anoItem = parseInt(anoStr);
    const mesItem = parseInt(mesStr) - 1; // Convertendo 01-12 para 0-11
    const valor = Number(item.valor);

    // Verificar se é do ano correto
    if (anoItem === anoSelecionado && mesItem >= 0 && mesItem < 12) {
      if (item.tipo === "RECEITA" && !item.transferencia_grupo_id) {
        lancamentosPorMes[mesItem].receita += valor;
      } else if (item.tipo === "DESPESA" && !item.transferencia_grupo_id) {
        lancamentosPorMes[mesItem].despesa += valor;
      }
    }
  });

  // Calcular saldo acumulado
  let saldoAcumulado = 0;

  for (let mes = 0; mes < 12; mes++) {
    const saldoMes = lancamentosPorMes[mes].receita - lancamentosPorMes[mes].despesa;
    saldoAcumulado += saldoMes;
    saldos[mes] = saldoAcumulado;
  }

  chartSaldo = new Chart(ctx, {
    type: "line",
    data: {
      labels: meses.map((mes) => `${mes}/${anoSelecionado.toString().slice(-2)}`),
      datasets: [
        {
          label: "Saldo Acumulado",
          data: saldos,
          borderColor: "rgba(59, 130, 246, 1)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          borderWidth: 2,
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      ...chartOptions,
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function (value) {
              return "R$ " + value.toLocaleString("pt-BR");
            },
            font: {
              size: 10,
            },
          },
        },
        x: {
          ticks: {
            font: {
              size: 10,
            },
          },
        },
      },
    },
  });
}

export {
  adicionarEventListeners,
  carregarCategorias,
  carregarDashboard,
  esconderLoading,
  filtrarCategoriasComLancamentos,
  mostrarLoading,
  popularAnos,
  popularMeses,
  renderizarGraficoCategorias,
  renderizarGraficoMensal,
  renderizarGraficos,
  renderizarGraficoSaldo,
};

window.filtrarCategoriasComLancamentos = filtrarCategoriasComLancamentos;
window.renderizarGraficoCategorias = renderizarGraficoCategorias;
