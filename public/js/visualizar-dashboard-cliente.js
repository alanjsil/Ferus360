/**
 * @file Página de dashboard do cliente visualizado pelo admin.
 */

import { clearAuthSession, ensureAuthenticated, getAccessToken } from "./auth-guard.js";

let chartMensal, chartCategorias, chartSaldo;
let dadosDashboard = [];
let usuarioIdCliente = null;

document.addEventListener("DOMContentLoaded", async function () {
  const auth = await ensureAuthenticated({ requireAdmin: true });
  if (!auth) return;

  const urlParams = new URLSearchParams(window.location.search);
  usuarioIdCliente = urlParams.get("usuarioId");
  const nomeCliente = urlParams.get("nome") || "Cliente";

  const titulo = document.getElementById("dashboardTitulo");
  if (titulo) titulo.textContent = `Dashboard - ${nomeCliente}`;

  const btnVoltar = document.getElementById("btnVoltarDashboard");
  if (btnVoltar) {
    btnVoltar.href = `visualizar-cliente.html?usuarioId=${usuarioIdCliente}&nome=${encodeURIComponent(nomeCliente)}`;
  }

  await carregarCategorias();
  await popularAnos();
  await carregarDashboard();
  popularMeses();

  adicionarEventListeners();
  configurarLogout();
});

function configurarLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    const token = getAccessToken();
    if (token) {
      try { await window.electronAPI.logout(token); } catch { /* ok */ }
    }
    clearAuthSession();
    window.location.href = "login.html";
  });
}

function adicionarEventListeners() {
  document.getElementById("filtroAno").addEventListener("change", async function () {
    document.getElementById("filtroMes").value = "all";
    await carregarDashboard();
    popularMeses();
  });

  document.getElementById("filtroMes").addEventListener("change", async function () {
    await carregarDashboard();
  });

  document.getElementById("filtroCategoria").addEventListener("change", async function () {
    await carregarDashboard();
  });

  document.getElementById("filtroTipoGrafico").addEventListener("change", function () {
    renderizarGraficoCategorias();
  });
}

async function carregarCategorias() {
  try {
    const categorias = await window.electronAPI.getCategorias();
    const select = document.getElementById("filtroCategoria");
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
    window.electronAPI?.logError("dashboard-cliente", "Erro ao carregar categorias", error);
  }
}

async function popularAnos() {
  try {
    const anos = await window.electronAPI.adminGetAnosDisponiveisCliente(usuarioIdCliente);
    const select = document.getElementById("filtroAno");
    select.innerHTML = "";
    anos.forEach((ano) => {
      const opt = document.createElement("option");
      opt.value = String(ano);
      opt.textContent = String(ano);
      select.appendChild(opt);
    });
    if (anos.length > 0) {
      select.value = String(anos[0]);
    }
  } catch (error) {
    window.electronAPI?.logError("dashboard-cliente", "Erro ao carregar anos", error);
  }
}

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

  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril",
    "Maio", "Junho", "Julho", "Agosto",
    "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  mesesDisponiveis.forEach((mes) => {
    const opt = document.createElement("option");
    opt.value = mes;
    opt.textContent = nomes[parseInt(mes) - 1];
    select.appendChild(opt);
  });
}

async function carregarDashboard() {
  try {
    const ano = document.getElementById("filtroAno").value;
    const mes = document.getElementById("filtroMes").value;
    const categoria = document.getElementById("filtroCategoria").value;

    mostrarLoading();

    const dados = await window.electronAPI.adminGetDashboardDadosCliente(
      usuarioIdCliente,
      ano,
      mes !== "all" ? mes : undefined,
      categoria !== "all" ? categoria : undefined,
    );

    dadosDashboard = dados;
    renderizarGraficos();
    esconderLoading();
  } catch (error) {
    window.electronAPI?.logError("dashboard-cliente", "Erro ao carregar dashboard", error);
    esconderLoading();
  }
}

function mostrarLoading() {
  document.querySelectorAll(".chart-wrapper").forEach((chart) => {
    chart.classList.add("loading");
  });
}

function esconderLoading() {
  document.querySelectorAll(".chart-wrapper").forEach((chart) => {
    chart.classList.remove("loading");
  });
}

function renderizarGraficos() {
  renderizarGraficoMensal();
  renderizarGraficoCategorias();
  renderizarGraficoSaldo();
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 12,
        font: { size: 11 },
      },
    },
  },
};

function renderizarGraficoMensal() {
  const ctx = document.getElementById("chartMensal").getContext("2d");
  if (chartMensal) chartMensal.destroy();

  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const receitas = new Array(12).fill(0);
  const despesas = new Array(12).fill(0);

  dadosDashboard.lancamentos?.forEach((item) => {
    const [, mesStr] = item.data.split("-");
    const mes = parseInt(mesStr) - 1;
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
            font: { size: 10 },
          },
        },
        x: {
          ticks: { font: { size: 10 } },
        },
      },
    },
  });
}

function renderizarGraficoCategorias() {
  const ctx = document.getElementById("chartCategorias").getContext("2d");
  const tipoFiltro = document.getElementById("filtroTipoGrafico").value;
  if (chartCategorias) chartCategorias.destroy();

  const categoriasMap = {};
  dadosDashboard.lancamentos?.forEach((item) => {
    if (item.tipo === tipoFiltro && !item.transferencia_grupo_id && item.categoria) {
      const categoriaNome = item.categoria.nome;
      if (!categoriasMap[categoriaNome]) {
        categoriasMap[categoriaNome] = 0;
      }
      categoriasMap[categoriaNome] += Number(item.valor);
    }
  });

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

function renderizarGraficoSaldo() {
  const ctx = document.getElementById("chartSaldo").getContext("2d");
  const anoSelecionado = parseInt(document.getElementById("filtroAno").value);
  if (chartSaldo) chartSaldo.destroy();

  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const saldos = new Array(12).fill(0);
  const lancamentosPorMes = new Array(12).fill().map(() => ({ receita: 0, despesa: 0 }));

  dadosDashboard.lancamentos?.forEach((item) => {
    const [anoStr, mesStr] = item.data.split("-");
    const anoItem = parseInt(anoStr);
    const mesItem = parseInt(mesStr) - 1;
    const valor = Number(item.valor);

    if (anoItem === anoSelecionado && mesItem >= 0 && mesItem < 12) {
      if (item.tipo === "RECEITA" && !item.transferencia_grupo_id) {
        lancamentosPorMes[mesItem].receita += valor;
      } else if (item.tipo === "DESPESA" && !item.transferencia_grupo_id) {
        lancamentosPorMes[mesItem].despesa += valor;
      }
    }
  });

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
            font: { size: 10 },
          },
        },
        x: {
          ticks: { font: { size: 10 } },
        },
      },
    },
  });
}

export {
  carregarCategorias,
  popularAnos,
  popularMeses,
  carregarDashboard,
  renderizarGraficoMensal,
  renderizarGraficoCategorias,
  renderizarGraficoSaldo,
  renderizarGraficos,
  mostrarLoading,
  esconderLoading,
  adicionarEventListeners,
  dadosDashboard,
};

window.renderizarGraficoCategorias = renderizarGraficoCategorias;
