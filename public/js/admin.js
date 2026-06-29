/**
 * @file Página administrativa do sistema.
 */

import { clearAuthSession, ensureAuthenticated, escapeHtml } from "./auth-guard.js";
import { formatarMoeda } from "./helper.js";
import { exibirToast } from "./toast.js";

let chamados = [];
let categoriasGlobais = [];
let editingCatGlobalId = null;
let clienteVisualizadoId = null;
let tipoPessoaResumo = "PF";
let tipoPessoaDetalhes = "PF";
let paginaAtualClientes = 1;
let clienteUsarPj = false;

document.addEventListener("DOMContentLoaded", async () => {
  const auth = await ensureAuthenticated({ requireAdmin: true });
  if (!auth) return;

  preencherSelectsFiltro();
  configurarNavegacao();
  configurarLogout();
  carregarDashboard();
  carregarChamados();
  carregarCategoriasGlobais();
  configurarClientes();
  configurarCategoriasGlobais();
  configurarRedefinirSenha();
  configurarChamados();
  configurarNovoUsuario();
  configurarTipoPessoaToggle();
  configurarAuditoria();
});

/**
 * @returns {void}
 */
function preencherSelectsFiltro() {
  const mesSelect = document.getElementById("detalhesMes");
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = String(m).padStart(2, "0");
    mesSelect.appendChild(opt);
  }
  const anoSelect = document.getElementById("detalhesAno");
  for (let a = 2024; a <= 2030; a++) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    anoSelect.appendChild(opt);
  }
}

async function carregarClientePerfil(id) {
  try {
    const perfil = await window.electronAPI.adminGetClientePerfil(id);
    clienteUsarPj = perfil?.usar_pj === true;
  } catch {
    clienteUsarPj = false;
  }
}

function configurarTipoPessoaToggle() {
  document.querySelectorAll("#tipoPessoaResumo .pill-button, #tipoPessoaDetalhes .pill-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parent = btn.closest(".pill-tipo-pessoa");
      parent.querySelectorAll(".pill-button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tipo = btn.dataset.tipo;
      if (parent.id === "tipoPessoaResumo") {
        tipoPessoaResumo = tipo;
        if (clienteVisualizadoId) {
          mostrarSplashToggle();
          visualizarCliente(clienteVisualizadoId, "");
          esconderSplashToggle();
        }
      } else {
        tipoPessoaDetalhes = tipo;
        if (clienteVisualizadoId) {
          mostrarSplashToggle();
          abrirDetalhesCliente(clienteVisualizadoId);
          esconderSplashToggle();
        }
      }
    });
  });
}

function configurarNavegacao() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".admin-tab").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function configurarLogout() {
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await window.electronAPI.logout();
    } catch {
      /* ok */
    }
    clearAuthSession();
    window.location.href = "login.html";
  });
}

/* ---------- ABA 1 — DASHBOARD ---------- */

async function carregarDashboard() {
  try {
    const data = await window.electronAPI.adminGetDashboard();
    if (data?.error) return;

    document.getElementById("dashReceitas").textContent = `R$ ${formatarMoeda(data.totalReceitas)}`;
    document.getElementById("dashReceitas").className = "dash-card-value positivo";

    document.getElementById("dashDespesas").textContent = `R$ ${formatarMoeda(data.totalDespesas)}`;
    document.getElementById("dashDespesas").className = "dash-card-value negativo";

    const saldo = Number(data.saldo || 0);
    const saldoEl = document.getElementById("dashSaldo");
    saldoEl.textContent = `R$ ${formatarMoeda(saldo)}`;
    saldoEl.className = `dash-card-value ${saldo >= 0 ? "positivo" : "negativo"}`;

    document.getElementById("dashUsuarios").textContent = data.totalUsuariosAtivos;
    document.getElementById("dashUsuarios").className = "dash-card-value";
  } catch {
    /* ignore */
  }
}

/* ---------- ABA 2 — CLIENTES ---------- */

function configurarClientes() {
  document.getElementById("filtroStatusCliente").addEventListener("change", () => {
    paginaAtualClientes = 1;
    carregarClientes();
  });
  document.getElementById("buscaCliente").addEventListener("input", () => {
    paginaAtualClientes = 1;
    carregarClientes();
  });
  document.getElementById("fecharResumo").addEventListener("click", () => {
    document.getElementById("resumoDialog").close();
  });
  document.getElementById("fecharDetalhes").addEventListener("click", () => {
    document.getElementById("detalhesDialog").close();
  });

  document.getElementById("btnFiltrarDetalhes").addEventListener("click", () => {
    abrirDetalhesCliente(clienteVisualizadoId);
  });

  carregarClientes();
}

async function carregarClientes() {
  const body = document.getElementById("clientesBody");
  const empty = document.getElementById("clientesEmpty");
  const paginacao = document.getElementById("clientesPaginacao");

  try {
    const data = await window.electronAPI.adminGetClientes(paginaAtualClientes);
    if (data?.error) {
      body.innerHTML = "";
      empty.hidden = false;
      paginacao.innerHTML = "";
      return;
    }

    const clientes = data.dados || [];
    const filtroStatus = document.getElementById("filtroStatusCliente").value;
    const busca = document.getElementById("buscaCliente").value.toLowerCase();

    const filtered = clientes.filter((c) => {
      if (filtroStatus === "ativo" && !c.ativo) return false;
      if (filtroStatus === "inativo" && c.ativo) return false;
      if (busca && !c.nome.toLowerCase().includes(busca) && !c.email.toLowerCase().includes(busca)) return false;
      return true;
    });

    if (filtered.length === 0 && data.total === 0) {
      body.innerHTML = "";
      empty.hidden = false;
      paginacao.innerHTML = "";
      return;
    }

    empty.hidden = true;
    body.innerHTML = filtered
      .map(
        (c) => `
        <tr>
          <td>${escapeHtml(c.nome)}</td>
          <td>${escapeHtml(c.email)}</td>
          <td>${formatarData(c.criado_em)}</td>
          <td>${formatarData(c.ultimo_login)}</td>
          <td><span class="${c.ativo ? "badge-ativo" : "badge-inativo"}">${c.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="actions-cell">
            <button type="button" class="btn-secondary" data-visualizar="${c.id}" data-nome="${escapeHtml(c.nome)}">Visualizar</button>
            <button type="button" class="${c.ativo ? "btn-danger" : "btn-primary"}" data-toggle="${c.id}">
              ${c.ativo ? "Inativar" : "Ativar"}
            </button>
          </td>
        </tr>`,
      )
      .join("");

    body.querySelectorAll("[data-visualizar]").forEach((btn) => {
      btn.addEventListener("click", () => visualizarCliente(btn.dataset.visualizar, btn.dataset.nome));
    });

    body.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.toggle;
        btn.disabled = true;
        try {
          await window.electronAPI.adminToggleCliente(id);
          carregarClientes();
        } catch {
          /* ignore */
        }
      });
    });

    renderizarPaginacaoClientes(data);
  } catch {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Erro ao carregar clientes.</td></tr>';
    empty.hidden = true;
    paginacao.innerHTML = "";
  }
}

function renderizarPaginacaoClientes(data) {
  const paginacao = document.getElementById("clientesPaginacao");
  const { pagina, totalPaginas, total, itensPorPagina } = data;

  if (totalPaginas <= 1) {
    paginacao.innerHTML = `<span class="paginacao-info">${total} cliente${total !== 1 ? "s" : ""}</span>`;
    return;
  }

  const inicio = (pagina - 1) * itensPorPagina + 1;
  const fim = Math.min(pagina * itensPorPagina, total);

  paginacao.innerHTML = `
    <span class="paginacao-info">${inicio}–${fim} de ${total}</span>
    <div class="paginacao-botoes">
      <button type="button" class="btn-secondary btn-pagina" data-pagina="${pagina - 1}" ${pagina <= 1 ? "disabled" : ""}>Anterior</button>
      <button type="button" class="btn-secondary btn-pagina" data-pagina="${pagina + 1}" ${pagina >= totalPaginas ? "disabled" : ""}>Próximo</button>
    </div>`;

  paginacao.querySelectorAll(".btn-pagina").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      paginaAtualClientes = Number(btn.dataset.pagina);
      carregarClientes();
    });
  });
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

async function visualizarCliente(id, nome) {
  clienteVisualizadoId = id;

  await carregarClientePerfil(id);

  const resumoGroup = document.getElementById("tipoPessoaResumo");
  if (resumoGroup) {
    resumoGroup.querySelectorAll(".pill-button").forEach((btn) => {
      btn.hidden = btn.dataset.tipo === "PJ" && !clienteUsarPj;
    });
    if (!clienteUsarPj) {
      tipoPessoaResumo = "PF";
      resumoGroup.querySelector(".pill-button[data-tipo='PF']").classList.add("active");
      resumoGroup.querySelector(".pill-button[data-tipo='PJ']").classList.remove("active");
    }
  }

  const dialog = document.getElementById("resumoDialog");
  const body = document.getElementById("resumoBody");
  const footer = document.getElementById("resumoFooter");
  try {
    const resumo = await window.electronAPI.adminGetResumoCliente(id, tipoPessoaResumo);
    if (resumo?.error) {
      body.innerHTML = '<p class="empty-state">Erro ao carregar resumo.</p>';
      dialog.showModal();
      return;
    }

    const totalReceitas = (resumo.lancamentos || []).filter((l) => l.tipo === "RECEITA" && l.status === "PAGO").reduce((s, l) => s + Number(l.valor), 0);

    const totalDespesas = (resumo.lancamentos || []).filter((l) => l.tipo === "DESPESA" && l.status === "PAGO").reduce((s, l) => s + Number(l.valor), 0);

    document.getElementById("resumoTitulo").textContent = "Resumo Financeiro";
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="background:#0f172a;padding:14px;border-radius:8px;text-align:center">
          <div style="color:#4ade80;font-size:1.5rem;font-weight:700">R$ ${formatarMoeda(totalReceitas)}</div>
          <div style="color:#94a3b8;font-size:0.75rem">Receitas pagas</div>
        </div>
        <div style="background:#0f172a;padding:14px;border-radius:8px;text-align:center">
          <div style="color:#f87171;font-size:1.5rem;font-weight:700">R$ ${formatarMoeda(totalDespesas)}</div>
          <div style="color:#94a3b8;font-size:0.75rem">Despesas pagas</div>
        </div>
      </div>
      <div style="background:#0f172a;padding:10px 14px;border-radius:6px;font-size:0.85rem">
        <span style="color:#94a3b8">Total de lançamentos:</span> ${(resumo.lancamentos || []).length}
        &middot;
        <span style="color:#94a3b8">Total de orçamentos:</span> ${(resumo.orcamento || []).length}

      </div>
      <div style="margin-top:16px;text-align:right">
        <button type="button" class="btn-primary" id="verDetalhesBtn">Ver detalhes</button>
        <button type="button" class="btn-secondary" id="fecharResumoBtn">Fechar</button>
      </div>`;
    document.getElementById("fecharResumoBtn").addEventListener("click", () => dialog.close());
    document.getElementById("verDetalhesBtn").addEventListener("click", () => {
      dialog.close();
      window.location.href = `visualizar-cliente.html?usuarioId=${id}&nome=${encodeURIComponent(nome || "")}`;
    });
    footer.hidden = false;
    dialog.showModal();
  } catch {
    body.innerHTML = '<p class="empty-state">Erro ao carregar resumo.</p>';
    dialog.showModal();
  }
}

async function abrirDetalhesCliente(id) {
  await carregarClientePerfil(id);

  const detalhesGroup = document.getElementById("tipoPessoaDetalhes");
  if (detalhesGroup) {
    detalhesGroup.querySelectorAll(".pill-button").forEach((btn) => {
      btn.hidden = btn.dataset.tipo === "PJ" && !clienteUsarPj;
    });
    if (!clienteUsarPj) {
      tipoPessoaDetalhes = "PF";
      detalhesGroup.querySelector(".pill-button[data-tipo='PF']").classList.add("active");
      detalhesGroup.querySelector(".pill-button[data-tipo='PJ']").classList.remove("active");
    }
  }

  const dialog = document.getElementById("detalhesDialog");
  const body = document.getElementById("detalhesBody");
  const empty = document.getElementById("detalhesEmpty");
  const mes = document.getElementById("detalhesMes")?.value || "";
  const ano = document.getElementById("detalhesAno")?.value || "";
  document.getElementById("detalhesTitulo").textContent = "Carregando transações...";
  body.innerHTML = '<p class="empty-state">Carregando...</p>';
  dialog.showModal();
  document.getElementById("detalhesTitulo").textContent = `Transações${ano ? ` de ${ano}${mes ? `/${mes}` : ""}` : ""}`;

  try {
    const transacoes = await window.electronAPI.adminGetTransacoesCliente(id, mes || null, ano || null, tipoPessoaDetalhes);

    const tableBody = document.getElementById("detalhesBody");

    if (!transacoes || transacoes.length === 0) {
      body.innerHTML = '<p class="empty-state">Nenhum dado encontrado.</p>';
      return;
    }

    empty.hidden = true;
    tableBody.innerHTML = transacoes
      .map(
        (t) => `
          <tr>
            <td>${formatarData(t.data)}</td>
            <td><span class="badge-status ${t.tipo}">${t.tipo}</span></td>
            <td>R$ ${formatarMoeda(t.valor)}</td>
            <td>${escapeHtml(t.categoria?.nome || "—")}</td>
            <td><span class="badge-status ${t.status.toLowerCase()}">${t.status}</span></td>
          </tr>`,
      )
      .join("");
  } catch {
    body.innerHTML = '<p class="empty-state">Erro ao carregar detalhes.</p>';
  }
}

/* ---------- ABA 3 — CATEGORIAS GLOBAIS ---------- */

function configurarCategoriasGlobais() {
  document.getElementById("filtroCatGlobal").addEventListener("change", renderizarCatGlobais);
  document.getElementById("novaCatGlobalBtn").addEventListener("click", () => {
    document.getElementById("inlineCatGlobal").hidden = false;
    document.getElementById("newCatGlobalNome").value = "";
    document.getElementById("newCatGlobalTipo").value = "RECEITA";
    document.getElementById("newCatGlobalNome").focus();
  });
  document.getElementById("cancelarCatGlobal").addEventListener("click", () => {
    document.getElementById("inlineCatGlobal").hidden = true;
    document.getElementById("catGlobalMessage").textContent = "";
  });
  document.getElementById("salvarCatGlobal").addEventListener("click", salvarCatGlobal);
  document.getElementById("newCatGlobalNome").addEventListener("keydown", (e) => {
    if (e.key === "Enter") salvarCatGlobal();
  });
}

async function carregarCategoriasGlobais() {
  try {
    const data = await window.electronAPI.listarCategorias();
    if (data?.error) return;
    categoriasGlobais = (data || []).filter((c) => c.eh_global);
    renderizarCatGlobais();
  } catch {
    /* ignore */
  }
}

function renderizarCatGlobais() {
  const tipo = document.getElementById("filtroCatGlobal").value;
  const filtered = tipo ? categoriasGlobais.filter((c) => c.tipo === tipo) : categoriasGlobais;
  const body = document.getElementById("catGlobalBody");
  const empty = document.getElementById("catGlobalEmpty");

  if (filtered.length === 0) {
    body.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  body.innerHTML = filtered
    .map((c) =>
      editingCatGlobalId === c.id
        ? editingCatGlobalRow(c)
        : `
      <tr>
        <td>${escapeHtml(c.nome)}</td>
        <td><span class="badge-status ${c.tipo}">${escapeHtml(c.tipo)}</span></td>
        <td><span class="${c.ativo ? "badge-ativo" : "badge-inativo"}">${c.ativo ? "Ativo" : "Inativo"}</span></td>
        <td class="actions-cell">
          <button type="button" class="btn-secondary btn-edit-cat-global" data-id="${c.id}">Editar</button>
          <button type="button" class="${c.ativo ? "btn-danger" : "btn-primary"} btn-toggle-cat-global" data-id="${c.id}">
            ${c.ativo ? "Desativar" : "Ativar"}
          </button>
        </td>
      </tr>`,
    )
    .join("");

  body.querySelectorAll(".btn-edit-cat-global").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCatGlobalId = btn.dataset.id;
      renderizarCatGlobais();
    });
  });

  body.querySelectorAll(".btn-save-cat-global").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const nome = document.getElementById(`editCatGlobalNome_${id}`).value.trim();
      const tipo = document.getElementById(`editCatGlobalTipo_${id}`).value;
      if (nome.length < 2 || nome.length > 40) return;
      try {
        const data = await window.electronAPI.updateCategoria(id, { nome, tipo });
        if (data && !data.error) {
          Object.assign(
            categoriasGlobais.find((c) => c.id === id),
            data,
          );
          editingCatGlobalId = null;
          carregarCategoriasGlobais();
        }
      } catch {
        /* ignore */
      }
    });
  });

  body.querySelectorAll(".btn-cancel-cat-global").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCatGlobalId = null;
      renderizarCatGlobais();
    });
  });

  body.querySelectorAll(".btn-toggle-cat-global").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const data = await window.electronAPI.toggleCategoriaAtivo(btn.dataset.id);
        if (data && data.error) {
          exibirToast(data.error, "error");
          btn.disabled = false;
          return;
        }
        if (data && !data.error) {
          Object.assign(
            categoriasGlobais.find((c) => c.id === btn.dataset.id),
            data,
          );
          carregarCategoriasGlobais();
        }
      } catch {
        /* ignore */
      }
    });
  });
}

function editingCatGlobalRow(c) {
  return `<tr>
    <td>
      <input id="editCatGlobalNome_${c.id}" type="text" value="${escapeHtml(c.nome)}" maxlength="40" style="padding:4px 8px;background:#0f172a;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:0.85rem;width:100%" />
    </td>
    <td>
      <select id="editCatGlobalTipo_${c.id}" style="padding:4px 8px;background:#0f172a;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:0.85rem">
        <option value="RECEITA" ${c.tipo === "RECEITA" ? "selected" : ""}>Receita</option>
        <option value="DESPESA" ${c.tipo === "DESPESA" ? "selected" : ""}>Despesa</option>
        <option value="TRANSFERENCIA" ${c.tipo === "TRANSFERENCIA" ? "selected" : ""}>Transferência</option>
      </select>
    </td>
    <td><span class="${c.ativo ? "badge-ativo" : "badge-inativo"}">${c.ativo ? "Ativo" : "Inativo"}</span></td>
    <td class="actions-cell">
      <button type="button" class="btn-primary btn-save-cat-global" data-id="${c.id}">Salvar</button>
      <button type="button" class="btn-secondary btn-cancel-cat-global" data-id="${c.id}">Cancelar</button>
    </td>
  </tr>`;
}

async function salvarCatGlobal() {
  const nome = document.getElementById("newCatGlobalNome").value.trim();
  const tipo = document.getElementById("newCatGlobalTipo").value;
  if (nome.length < 2 || nome.length > 40) {
    document.getElementById("catGlobalMessage").textContent = "Nome precisa ter entre 2 e 40 caracteres.";
    return;
  }
  try {
    const btn = document.getElementById("salvarCatGlobal");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Salvando...';
    const data = await window.electronAPI.criarCategoria({ nome, tipo, eh_global: true });
    if (data?.error) {
      document.getElementById("catGlobalMessage").textContent = data.error;
      return;
    }
    categoriasGlobais.push(data);
    carregarCategoriasGlobais();
    document.getElementById("inlineCatGlobal").hidden = true;
    document.getElementById("catGlobalMessage").textContent = "";
  } catch (err) {
    document.getElementById("catGlobalMessage").textContent = err.message;
  } finally {
    const btn = document.getElementById("salvarCatGlobal");
    btn.disabled = false;
    btn.textContent = "Salvar";
  }
}

/* ---------- ABA 4 — REDEFINIÇÃO DE SENHAS ---------- */

function configurarRedefinirSenha() {
  document.getElementById("btnBuscarRedefinir").addEventListener("click", buscarParaRedefinir);
  document.getElementById("buscaRedefinir").addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscarParaRedefinir();
  });
}

async function buscarParaRedefinir() {
  const busca = document.getElementById("buscaRedefinir").value.trim().toLowerCase();
  const results = document.getElementById("redefinirResults");
  const empty = document.getElementById("redefinirEmpty");

  if (!busca) {
    empty.hidden = false;
    results.innerHTML = "";
    return;
  }

  try {
    const data = await window.electronAPI.adminGetClientes(1, 500);
    if (data?.error) {
      results.innerHTML = '<p class="empty-state">Erro na busca.</p>';
      return;
    }

    const usuarios = (data.dados || []).filter((u) => u.nome.toLowerCase().includes(busca) || u.email.toLowerCase().includes(busca));

    if (usuarios.length === 0) {
      results.innerHTML = '<p class="empty-state">Nenhum usuário encontrado.</p>';
      empty.hidden = true;
      return;
    }

    empty.hidden = true;
    results.innerHTML = usuarios
      .map(
        (u) => `
        <div class="user-card">
          <div class="user-card-info">
            <strong>${escapeHtml(u.nome)}</strong>
            <span>${escapeHtml(u.email)} ${u.role === "admin" ? "· Admin" : ""}</span>
          </div>
          <div class="user-card-actions">
            <button type="button" class="btn-primary" data-reset="${u.id}" data-nome="${escapeHtml(u.nome)}">Redefinir senha</button>
          </div>
        </div>`,
      )
      .join("");

    results.querySelectorAll("[data-reset]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Redefinindo...';
        try {
          const result = await window.electronAPI.adminResetSenha(btn.dataset.reset);
          if (result?.error) {
            exibirToast("Erro ao redefinir senha.", "error");
            btn.disabled = false;
            btn.textContent = "Redefinir senha";
            return;
          }
          exibirToast(`Email de recuperação enviado para ${btn.dataset.nome}.`, "success");
        } catch {
          exibirToast("Erro ao redefinir senha.", "error");
        }
        btn.disabled = false;
        btn.textContent = "Redefinir senha";
      });
    });
  } catch {
    results.innerHTML = '<p class="empty-state">Erro na busca.</p>';
  }
}

/* ---------- ABA 5 — CHAMADOS ---------- */

function configurarChamados() {
  document.getElementById("filtroStatusChamado").addEventListener("change", renderizarChamados);
  document.getElementById("fecharChamado").addEventListener("click", () => {
    document.getElementById("chamadoDialog").close();
  });
  document.getElementById("enviarRespostaChamado").addEventListener("click", enviarRespostaChamado);
  document.getElementById("chamadosBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-atender]");
    if (btn) abrirAtendimento(btn.dataset.atender);
  });
}

async function carregarChamados() {
  try {
    const data = await window.electronAPI.adminGetChamados();
    if (data?.error) return;
    chamados = data || [];
    atualizarBadgeChamados();
    renderizarChamados();
  } catch {
    /* ignore */
  }
}

function atualizarBadgeChamados() {
  const abertos = chamados.filter((c) => c.status === "aberto" || c.status === "em_andamento").length;
  const badge = document.getElementById("chamadosCount");
  badge.textContent = abertos;
  badge.hidden = abertos === 0;
}

function renderizarChamados() {
  const filtro = document.getElementById("filtroStatusChamado").value;
  const filtered = filtro ? chamados.filter((c) => c.status === filtro) : chamados;
  const body = document.getElementById("chamadosBody");
  const empty = document.getElementById("chamadosEmpty");

  if (filtered.length === 0) {
    body.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  body.innerHTML = filtered
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.usuario_nome)}<br/><span style="color:#64748b;font-size:0.75rem">${escapeHtml(c.usuario_email)}</span></td>
        <td>${escapeHtml(c.titulo)}</td>
        <td><span class="badge-status ${c.status}">${statusLabel(c.status)}</span></td>
        <td>${formatarData(c.criado_em)}</td>
        <td><button type="button" class="btn-secondary" data-atender="${c.id}">Atender</button></td>
      </tr>`,
    )
    .join("");
}

function abrirAtendimento(id) {
  const c = chamados.find((x) => x.id === id);
  if (!c) return;

  document.getElementById("chamadoUsuario").textContent = c.usuario_nome;
  document.getElementById("chamadoEmail").textContent = c.usuario_email;
  document.getElementById("chamadoTitulo").textContent = c.titulo;
  const statusEl = document.getElementById("chamadoStatus");
  statusEl.innerHTML = "";
  const statusSpan = document.createElement("span");
  statusSpan.className = `badge-status ${c.status}`;
  statusSpan.textContent = statusLabel(c.status);
  statusEl.appendChild(statusSpan);
  document.getElementById("chamadoDescricao").textContent = c.descricao || "Sem descrição.";
  document.getElementById("chamadoRespostaInput").value = "";
  document.getElementById("chamadoNovoStatus").value = c.status === "resolvido" ? "resolvido" : "em_andamento";
  document.getElementById("chamadoMessage").textContent = "";
  document.getElementById("enviarRespostaChamado").dataset.id = id;

  const respostas = c.respostas || [];
  const historicoDiv = document.getElementById("chamadoHistorico");
  const historicoLista = document.getElementById("chamadoHistoricoLista");
  if (respostas.length > 0) {
    historicoDiv.hidden = false;
    historicoLista.innerHTML = respostas
      .map(
        (r) => `
        <div class="historico-item">
          <span class="admin-tag">${escapeHtml(r.admin_nome || "Admin")}</span>
          <div class="msg">${escapeHtml(r.mensagem)}</div>
          <div class="data">${formatarData(r.criado_em)}</div>
        </div>`,
      )
      .join("");
  } else {
    historicoDiv.hidden = true;
    historicoLista.innerHTML = "";
  }

  document.getElementById("chamadoDialog").showModal();
}

async function enviarRespostaChamado() {
  const id = document.getElementById("enviarRespostaChamado").dataset.id;
  const msg = document.getElementById("chamadoRespostaInput").value.trim();
  const novoStatus = document.getElementById("chamadoNovoStatus").value;

  if (!msg && novoStatus !== "resolvido") {
    document.getElementById("chamadoMessage").textContent = "Escreva uma resposta ou marque como resolvido.";
    return;
  }

  const btn = document.getElementById("enviarRespostaChamado");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Enviando...';

  try {
    if (msg) {
      await window.electronAPI.adminResponderChamado(id, msg);
    }
    if (novoStatus) {
      await window.electronAPI.adminUpdateChamado(id, novoStatus);
    }
    document.getElementById("chamadoDialog").close();
    carregarChamados();
  } catch {
    document.getElementById("chamadoMessage").textContent = "Erro ao processar chamado.";
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Enviar resposta";
  }
}

/* ---------- NOVO USUÁRIO ---------- */

function configurarNovoUsuario() {
  const dialog = document.getElementById("novoUsuarioDialog");
  const btnAbrir = document.getElementById("novoUsuarioBtn");
  const btnFechar = document.getElementById("fecharNovoUsuario");
  const btnCancelar = document.getElementById("cancelarNovoUsuario");
  const btnSalvar = document.getElementById("salvarNovoUsuario");
  const msg = document.getElementById("novoUsuarioMessage");

  btnAbrir.addEventListener("click", () => {
    document.getElementById("novoUsuarioNome").value = "";
    document.getElementById("novoUsuarioEmail").value = "";
    msg.textContent = "";
    dialog.showModal();
  });

  btnFechar.addEventListener("click", () => dialog.close());
  btnCancelar.addEventListener("click", () => dialog.close());

  btnSalvar.addEventListener("click", async () => {
    const nome = document.getElementById("novoUsuarioNome").value.trim();
    const email = document.getElementById("novoUsuarioEmail").value.trim();

    if (!nome || !email) {
      msg.textContent = "Preencha todos os campos.";
      return;
    }

    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<span class="spinner"></span>Criando...';

    try {
      const result = await window.electronAPI.adminCriarUsuario(nome, email);
      if (result?.error) {
        msg.textContent = result.error;
        return;
      }
      dialog.close();
      exibirToast(`Usuário ${nome} criado com sucesso.`, "success");
      carregarClientes();
    } catch (err) {
      msg.textContent = err.message || "Erro ao criar usuário.";
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Criar usuário";
    }
  });
}

/* ---------- ABA 6 — AUDITORIA ---------- */

function configurarAuditoria() {
  document.getElementById("btnFiltrarAuditoria").addEventListener("click", carregarAuditoria);
  document.getElementById("filtroAuditoriaAcao").addEventListener("change", carregarAuditoria);
}

async function carregarAuditoria() {
  const tbody = document.getElementById("auditoriaBody");
  const empty = document.getElementById("auditoriaEmpty");
  const filtros = {
    acao: document.getElementById("filtroAuditoriaAcao").value || undefined,
    usuarioId: document.getElementById("filtroAuditoriaUsuario").value.trim() || undefined,
    de: document.getElementById("filtroAuditoriaDe").value || undefined,
    ate: document.getElementById("filtroAuditoriaAte").value || undefined,
    limite: 100,
  };

  try {
    const data = await window.electronAPI.adminGetAuditoria(filtros);
    if (data?.error) {
      tbody.innerHTML = "";
      empty.hidden = false;
      empty.textContent = "Erro ao carregar auditoria.";
      return;
    }

    if (!data?.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
      empty.textContent = "Nenhum registro de auditoria encontrado.";
      return;
    }

    empty.hidden = true;
    tbody.innerHTML = data
      .map(
        (r) =>
          `<tr>
            <td>${formatarData(r.criado_em)}</td>
            <td>${r.usuario?.nome ? escapeHtml(r.usuario.nome) + " (" + escapeHtml(r.usuario.email) + ")" : "—"}</td>
            <td><span class="tag tag-${r.acao.toLowerCase()}">${escapeHtml(r.acao)}</span></td>
            <td>${escapeHtml(r.entidade || "—")}</td>
            <td style="font-size:11px;font-family:monospace">${escapeHtml(r.entidade_id?.slice(0, 8) || "—")}</td>
            <td>${escapeHtml(r.ip || "—")}</td>
            <td>${escapeHtml(r.contexto || "—")}</td>
          </tr>`,
      )
      .join("");
  } catch {
    tbody.innerHTML = "";
    empty.hidden = false;
    empty.textContent = "Erro ao carregar auditoria.";
  }
}

/* ---------- HELPERS ---------- */

/**
 * @param {string} status
 * @returns {string}
 */
function statusLabel(status) {
  const map = { aberto: "Aberto", em_andamento: "Em andamento", resolvido: "Resolvido" };
  return map[status] || status;
}

/**
 * @param {string} iso
 * @returns {string}
 */
function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export { formatarData, preencherSelectsFiltro, statusLabel };
