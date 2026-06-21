/**
 * @file Página de configurações do usuário.
 */

import { clearAuthSession, ensureAuthenticated, escapeHtml, getAccessToken } from "./auth-guard.js";
import { converterParaCSV, gerarTemplateCSV } from "./csv.js";
import { avaliarRequisitos, iniciarToggleSenha } from "./password-utils.js";
import { confirmDialog, exibirToast, promptDialog } from "./toast.js";

let usuarioAuth = null;
let categorias = [];
let contas = [];
let pessoas = [];
let editingCatId = null;
let editingSubcatId = null;
let currentSubcatCatId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const auth = await ensureAuthenticated();
  if (!auth) return;

  usuarioAuth = auth.usuario;
  configurarNavegacao();
  configurarLogout();
  await carregarPerfil();
  await carregarSessoes();
  configurarFormPerfil();
  configurarFormSenha();
  iniciarToggleSenha();

  const novaSenhaInput = document.getElementById("novaSenha");
  if (novaSenhaInput) {
    novaSenhaInput.addEventListener("input", () => avaliarRequisitos(novaSenhaInput.value));
  }

  configurarSessoes();
  configurarExportar();
  configurarExcluirConta();
  configurarCompartilharCategorias();
  configurarUsarPj();
  configurarTipoPessoaToggle();
  configurarCategorias();
});

function configurarLogout() {
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
      await window.electronAPI.logout();
    } catch {
      /* ok */
    }
    clearAuthSession();
    window.location.href = "login.html";
  });
}

function configurarNavegacao() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".config-section").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      const section = document.getElementById(`section-${btn.dataset.section}`);
      section.classList.add("active");
      if (btn.dataset.section === "cadastro") {
        const firstSub = section.querySelector(".sub-nav-item.active") || section.querySelector(".sub-nav-item");
        if (firstSub) {
          section.querySelectorAll(".subsection").forEach((s) => s.classList.remove("active"));
          document.getElementById(`subsection-${firstSub.dataset.subsection}`).classList.add("active");
        }
      }
    });
  });

  document.querySelectorAll(".sub-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parent = btn.closest(".config-section");
      parent.querySelectorAll(".sub-nav-item").forEach((b) => b.classList.remove("active"));
      parent.querySelectorAll(".subsection").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`subsection-${btn.dataset.subsection}`).classList.add("active");
    });
  });
}

async function carregarPerfil() {
  try {
    const perfil = await window.electronAPI.getPerfil();
    const emailInput = document.getElementById("perfilEmail");
    document.getElementById("perfilNome").value = perfil.nome || "";
    emailInput.value = perfil.email || "";

    if (perfil.avatar_url) {
      document.getElementById("avatarPreview").src = perfil.avatar_url;
    }
    const usarPjToggle = document.getElementById("usarPjToggle");
    if (usarPjToggle) {
      usarPjToggle.checked = perfil.usar_pj !== false;
    }
    if (usuarioAuth?.role === "admin") {
      emailInput.removeAttribute("readonly");
      emailInput.title = "Admin — você pode alterar seu email";
    }
  } catch {
    mostrarMensagem("perfilMessage", "Erro ao carregar perfil.", false);
  }
}

function configurarFormPerfil() {
  document.getElementById("avatarInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      mostrarMensagem("perfilMessage", "Arquivo excede 2 MB.", false);
      e.target.value = "";
      return;
    }

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      mostrarMensagem("perfilMessage", "Formato inválido. Use PNG ou JPG.", false);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById("avatarPreview").src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("perfilForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("perfilSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Salvando...';

    try {
      const payload = {
        nome: document.getElementById("perfilNome").value.trim(),
      };
      if (usuarioAuth?.role === "admin") {
        payload.email = document.getElementById("perfilEmail").value.trim();
      }

      const avatarInput = document.getElementById("avatarInput");
      if (avatarInput.files?.[0]) {
        const reader = new FileReader();
        payload.avatar_url = await new Promise((resolve) => {
          reader.onload = (ev) => resolve(ev.target.result);
          reader.readAsDataURL(avatarInput.files[0]);
        });
      }

      const result = await window.electronAPI.updatePerfil(payload);
      if (result?.error) {
        mostrarMensagem("perfilMessage", "Erro ao salvar perfil.", false);
      } else {
        mostrarMensagem("perfilMessage", "Perfil atualizado com sucesso.", true);
      }
    } catch {
      mostrarMensagem("perfilMessage", "Erro ao salvar perfil.", false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Salvar alterações";
    }
  });
}

function configurarFormSenha() {
  document.getElementById("senhaForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("senhaSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Trocando...';

    const novaSenha = document.getElementById("novaSenha").value;
    const confirmarSenha = document.getElementById("confirmarSenha").value;

    if (novaSenha !== confirmarSenha) {
      mostrarMensagem("senhaMessage", "Nova senha e confirmação não conferem.", false);
      submitBtn.disabled = false;
      submitBtn.textContent = "Trocar senha";
      return;
    }

    try {
      const token = getAccessToken();
      if (!token) {
        mostrarMensagem("senhaMessage", "Sessão expirada.", false);
        submitBtn.disabled = false;
        submitBtn.textContent = "Trocar senha";
        return;
      }

      const auth = await window.electronAPI.verificarAuth(token);
      await window.electronAPI.trocarSenha(auth.id, novaSenha);
      mostrarMensagem("senhaMessage", "Senha alterada com sucesso.", true);
      document.getElementById("senhaForm").reset();
      avaliarRequisitos("");
    } catch (err) {
      const msg = err?.code === "SENHA_FRACA" ? "A senha deve ter 8+ caracteres, 1 maiúscula e 1 número." : err?.code === "SENHA_ATUAL_INCORRETA" ? "Senha atual incorreta." : "Erro ao trocar senha.";
      mostrarMensagem("senhaMessage", msg, false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Trocar senha";
    }
  });
}

async function carregarSessoes() {
  const list = document.getElementById("sessoesList");
  try {
    const sessoes = await window.electronAPI.getSessoes();
    if (!sessoes || sessoes.length === 0) {
      list.innerHTML = '<p class="empty-state">Nenhuma sessão ativa.</p>';
      return;
    }

    const token = getAccessToken();
    const sessaoAtualId = token ? extrairSid(token) : null;

    list.innerHTML = sessoes
      .map(
        (s) => `
          <div class="sessao-card${s.id === sessaoAtualId ? " current" : ""}">
            <div class="sessao-info">
              <strong>
                ${s.user_agent ? formatarUserAgent(s.user_agent) : "Desconhecido"}
                ${s.id === sessaoAtualId ? '<span class="sessao-badge">Atual</span>' : ""}
              </strong>
              <span>IP: ${s.ip || "N/A"} &middot; ${formatarData(s.criado_em)}</span>
            </div>
            ${s.id !== sessaoAtualId ? `<button class="btn-danger" data-sessao-id="${s.id}">Encerrar</button>` : ""}
          </div>`,
      )
      .join("");
  } catch {
    list.innerHTML = '<p class="empty-state">Erro ao carregar sessões.</p>';
  }
}

function configurarSessoes() {
  document.getElementById("sessoesList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-sessao-id]");
    if (!btn) return;
    btn.disabled = true;

    try {
      await window.electronAPI.encerrarSessao(btn.dataset.sessaoId);
      await carregarSessoes();
    } catch {
      mostrarMensagem("sessoesMessage", "Erro ao encerrar sessão.", false);
    }
  });

  document.getElementById("encerrarTodasBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("encerrarTodasBtn");
    btn.disabled = true;
    btn.textContent = "Encerrando...";

    try {
      const result = await window.electronAPI.revogarOutrasSessoes();
      await carregarSessoes();
      mostrarMensagem("sessoesMessage", `${result.encerradas || "Outras"} sessões encerradas com sucesso.`, true);
    } catch {
      mostrarMensagem("sessoesMessage", "Erro ao encerrar sessões.", false);
    } finally {
      btn.disabled = false;
      btn.textContent = "Encerrar todas as outras sessões";
    }
  });
}

function achatarLancamento(l) {
  const fmtData = (d) => (d ? d.split("T")[0] : "");
  return {
    data: l.data || "",
    tipo: l.tipo || "",
    valor: Number(l.valor || 0)
      .toFixed(2)
      .replace(".", ","),
    status: l.status || "",
    descricao: l.descricao || "",
    categoria: l.categoria?.nome || "",
    subcategoria: l.subcategoria?.nome || "",
    conta_origem: l.conta_origem?.nome || "",
    conta_destino: l.conta_destino?.nome || "",
    pessoa: l.pessoa?.nome || "",
    data_pagamento: fmtData(l.data_pagamento),
    criado_em: fmtData(l.criado_em),
  };
}

function baixarArquivo(conteudo, nomeArquivo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function configurarExportar() {
  document.getElementById("exportarBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("exportarBtn");
    btn.disabled = true;
    btn.textContent = "Exportando...";

    try {
      const dados = await window.electronAPI.exportarDados();
      const achatados = dados.lancamentos.map(achatarLancamento);
      const csv = converterParaCSV(achatados);
      baixarArquivo(csv, `financas-dados-${new Date().toISOString().split("T")[0]}.csv`, "text/csv;charset=utf-8");
      mostrarMensagem("contaMessage", "Dados exportados com sucesso.", true);
    } catch {
      mostrarMensagem("contaMessage", "Erro ao exportar dados.", false);
    } finally {
      btn.disabled = false;
      btn.textContent = "Exportar";
    }
  });

  document.getElementById("templateBtn")?.addEventListener("click", () => {
    const cabecalhos = ["data", "descricao", "tipo", "valor", "categoria", "subcategoria", "recorrente"];
    const csv = gerarTemplateCSV(cabecalhos);
    baixarArquivo(csv, `financas-template-importacao-${new Date().toISOString().split("T")[0]}.csv`, "text/csv;charset=utf-8");
    mostrarMensagem("contaMessage", "Template baixado com sucesso.", true);
  });
}

function configurarExcluirConta() {
  const dialog = document.getElementById("excluirDialog");

  document.getElementById("excluirContaBtn")?.addEventListener("click", () => {
    document.getElementById("excluirEmail").value = "";
    document.getElementById("excluirMessage").textContent = "";
    dialog.showModal();
  });

  document.getElementById("cancelarExcluir")?.addEventListener("click", () => dialog.close());

  document.getElementById("excluirForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("confirmarExcluir");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Excluindo...';

    const email = document.getElementById("excluirEmail").value.trim();

    const perfil = await window.electronAPI.getPerfil();
    if (email !== perfil.email) {
      mostrarMensagem("excluirMessage", "Email não corresponde ao cadastrado.", false);
      submitBtn.disabled = false;
      submitBtn.textContent = "Excluir";
      return;
    }

    try {
      await window.electronAPI.excluirConta();
      clearAuthSession();
      window.location.href = "login.html";
    } catch {
      mostrarMensagem("excluirMessage", "Erro ao excluir conta.", false);
      submitBtn.disabled = false;
      submitBtn.textContent = "Excluir";
    }
  });
}

function configurarCompartilharCategorias() {
  const toggle = document.getElementById("compartilharCategoriasToggle");
  if (!toggle) return;

  toggle.addEventListener("change", async () => {
    await window.electronAPI.setCompartilharCategorias(toggle.checked);
  });
}

function configurarUsarPj() {
  const toggle = document.getElementById("usarPjToggle");
  if (!toggle) return;

  toggle.addEventListener("change", async () => {
    await window.electronAPI.setUsarPj(toggle.checked);
  });
}

function configurarTipoPessoaToggle() {
  const container = document.getElementById("tipoPessoaToggle");
  if (!container) return;

  container.addEventListener("click", async () => {
    const atual = container.dataset.tp;
    const novoTp = atual === "PF" ? "PJ" : "PF";
    container.dataset.tp = novoTp;
    const span = container.querySelector("span");
    if (span) span.textContent = novoTp === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
    await window.electronAPI.setTipoPessoa(novoTp);
    await recarregarCadastros();
  });

  if (typeof window.electronAPI?.onTipoPessoaChanged === "function") {
    window.electronAPI.onTipoPessoaChanged(async (value) => {
      if (value) {
        container.dataset.tp = value;
        const span = container.querySelector("span");
        if (span) span.textContent = value === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
      }
      await recarregarCadastros();
    });
  }

  if (typeof window.electronAPI?.getTipoPessoa === "function") {
    window.electronAPI.getTipoPessoa().then((value) => {
      if (!value) return;
      container.dataset.tp = value;
      const span = container.querySelector("span");
      if (span) span.textContent = value === "PF" ? "Pessoa Física" : "Pessoa Jurídica";
    });
  }

  if (typeof window.electronAPI?.onUsarPjChanged === "function") {
    window.electronAPI.onUsarPjChanged(async (value) => {
      container.hidden = !value;
      if (!value) {
        await recarregarCadastros();
      }
    });
  }

  if (typeof window.electronAPI?.getUsarPj === "function") {
    window.electronAPI.getUsarPj().then((value) => {
      container.hidden = !value;
    });
  }
}

async function recarregarCadastros() {
  const catBody = document.getElementById("catBody");
  const catEmpty = document.getElementById("catEmpty");
  const contasBody = document.getElementById("contasBody");
  const contasEmpty = document.getElementById("contasEmpty");
  const pessoasBody = document.getElementById("pessoasBody");
  const pessoasEmpty = document.getElementById("pessoasEmpty");

  await Promise.all([
    carregarCategorias(catBody, catEmpty),
    loadContas(contasBody, contasEmpty),
    loadPessoas(pessoasBody, pessoasEmpty),
  ]);
}

/* ===== Categorias ===== */
function configurarCategorias() {
  const filtroTipo = document.getElementById("filtroTipo");
  const novaCategoriaBtn = document.getElementById("novaCategoriaBtn");
  const salvarNovaCat = document.getElementById("salvarNovaCat");
  const cancelarNovaCat = document.getElementById("cancelarNovaCat");
  const newCatNome = document.getElementById("newCatNome");
  const newCatTipo = document.getElementById("newCatTipo");
  const newCatMessage = document.getElementById("newCatMessage");
  const subcatPanel = document.getElementById("subcatPanel");
  const subcatTitle = document.getElementById("subcatTitle");
  const subcatBody = document.getElementById("subcatBody");
  const fecharSubcat = document.getElementById("fecharSubcat");
  const salvarSubcat = document.getElementById("salvarSubcat");
  const newSubcatNome = document.getElementById("newSubcatNome");
  const subcatMessage = document.getElementById("subcatMessage");
  const catBody = document.getElementById("catBody");
  const catEmpty = document.getElementById("catEmpty");
  const inlineForm = document.getElementById("inlineForm");

  filtroTipo.addEventListener("change", () => renderizarCategorias);

  novaCategoriaBtn.addEventListener("click", () => {
    inlineForm.hidden = false;
    newCatNome.value = "";
    newCatTipo.value = "RECEITA";
    newCatMessage.textContent = "";
    newCatNome.focus();
  });

  cancelarNovaCat.addEventListener("click", () => {
    inlineForm.hidden = true;
    newCatMessage.textContent = "";
  });

  salvarNovaCat.addEventListener("click", async () => {
    const nome = newCatNome.value.trim();
    const tipo = newCatTipo.value;
    if (nome.length < 2 || nome.length > 40) {
      newCatMessage.textContent = "Nome precisa ter entre 2 e 40 caracteres.";
      return;
    }
    try {
      salvarNovaCat.disabled = true;
      salvarNovaCat.innerHTML = '<span class="spinner"></span>Salvando...';
      const data = await window.electronAPI.criarCategoria({ nome, tipo });
      if (data && data.error) {
        newCatMessage.textContent = data.error;
        return;
      }
      categorias.push(data);
      renderizarCategorias;
      inlineForm.hidden = true;
    } catch (err) {
      newCatMessage.textContent = err.message;
    } finally {
      salvarNovaCat.disabled = false;
      salvarNovaCat.textContent = "Salvar";
    }
  });

  newCatNome.addEventListener("keydown", (e) => {
    if (e.key === "Enter") salvarNovaCat.click();
  });

  fecharSubcat.addEventListener("click", () => {
    subcatPanel.hidden = true;
    currentSubcatCatId = null;
  });

  salvarSubcat.addEventListener("click", async () => {
    const nome = newSubcatNome.value.trim();
    if (!nome || nome.length > 40) {
      subcatMessage.textContent = "Nome inválido.";
      return;
    }
    if (editingSubcatId) {
      try {
        salvarSubcat.disabled = true;
        const data = await window.electronAPI.updateSubcategoria(editingSubcatId, { nome });
        if (data && data.error) {
          subcatMessage.textContent = data.error;
          editingSubcatId = null;
          salvarSubcat.textContent = "Adicionar";
          newSubcatNome.value = "";
          await carregarSubcategorias(currentSubcatCatId, subcatBody, subcatTitle, subcatMessage, newSubcatNome, salvarSubcat);
          return;
        }
        editingSubcatId = null;
        salvarSubcat.textContent = "Adicionar";
        newSubcatNome.value = "";
        subcatMessage.textContent = "";
        await carregarSubcategorias(currentSubcatCatId, subcatBody, subcatTitle, subcatMessage, newSubcatNome, salvarSubcat);
      } catch (err) {
        subcatMessage.textContent = err.message;
      } finally {
        salvarSubcat.disabled = false;
      }
      return;
    }
    try {
      salvarSubcat.disabled = true;
      salvarSubcat.innerHTML = '<span class="spinner"></span>Adicionando...';
      const data = await window.electronAPI.criarSubcategoria({ categoria_id: currentSubcatCatId, nome });
      if (data && data.error) {
        subcatMessage.textContent = data.error;
        return;
      }
      newSubcatNome.value = "";
      subcatMessage.textContent = "";
      await carregarSubcategorias(currentSubcatCatId, subcatBody, subcatTitle, subcatMessage, newSubcatNome, salvarSubcat);
    } catch (err) {
      subcatMessage.textContent = err.message;
    } finally {
      salvarSubcat.disabled = false;
      salvarSubcat.textContent = "Adicionar";
    }
  });

  newSubcatNome.addEventListener("keydown", (e) => {
    if (e.key === "Enter") salvarSubcat.click();
  });

  carregarCategorias(catBody, catEmpty);
  configurarContas();
  configurarPessoas();
}

/* ===== Contas ===== */
function configurarContas() {
  const novaContaBtn = document.getElementById("novaContaBtn");
  const salvarNovaConta = document.getElementById("salvarNovaConta");
  const cancelarNovaConta = document.getElementById("cancelarNovaConta");
  const newContaNome = document.getElementById("newContaNome");
  const newContaMessage = document.getElementById("newContaMessage");
  const contasBody = document.getElementById("contasBody");
  const contasEmpty = document.getElementById("contasEmpty");
  const inlineContaForm = document.getElementById("inlineContaForm");

  novaContaBtn.addEventListener("click", () => {
    inlineContaForm.hidden = false;
    newContaNome.value = "";
    newContaMessage.textContent = "";
    newContaNome.focus();
  });

  cancelarNovaConta.addEventListener("click", () => {
    inlineContaForm.hidden = true;
    newContaMessage.textContent = "";
  });

  salvarNovaConta.addEventListener("click", async () => {
    const nome = newContaNome.value.trim();
    if (!nome || nome.length > 40) {
      newContaMessage.textContent = "Nome inválido (máx. 40 caracteres).";
      return;
    }
    try {
      salvarNovaConta.disabled = true;
      salvarNovaConta.innerHTML = '<span class="spinner"></span>Salvando...';
      const data = await window.electronAPI.criarConta({ nome });
      if (data && data.error) {
        newContaMessage.textContent = data.error;
        return;
      }
      contas.push(data);
      renderizarContas(contasBody, contasEmpty);
      inlineContaForm.hidden = true;
    } catch (err) {
      newContaMessage.textContent = err.message;
    } finally {
      salvarNovaConta.disabled = false;
      salvarNovaConta.textContent = "Salvar";
    }
  });

  newContaNome.addEventListener("keydown", (e) => {
    if (e.key === "Enter") salvarNovaConta.click();
  });

  carregarContas(contasBody, contasEmpty);
}

async function carregarContas(contasBody, contasEmpty) {
  try {
    const data = await window.electronAPI.getContas();
    if (data && data.error) return;
    contas = data || [];
    renderizarContas(contasBody, contasEmpty);
  } catch {
    // ignore
  }
}

function renderizarContas(contasBody, contasEmpty) {
  if (contas.length === 0) {
    contasBody.innerHTML = "";
    contasEmpty.hidden = false;
    return;
  }
  contasEmpty.hidden = true;
  contasBody.innerHTML = contas
    .map(
      (c) => `
    <tr>
      <td>${escapeHtml(c.nome)}</td>
      <td class="actions-cell">
        <button type="button" class="btn-edit btn-edit-conta" data-id="${c.id}">Editar</button>
        <button type="button" class="btn-delete btn-del-conta" data-id="${c.id}">Excluir</button>
      </td>
    </tr>`,
    )
    .join("");

  contasBody.querySelectorAll(".btn-edit-conta").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const conta = contas.find((c) => c.id === btn.dataset.id);
      if (!conta) return;
      const newNome = await promptDialog("Editar nome da conta:", conta.nome);
      if (newNome && newNome.trim() && newNome.trim().length <= 40) {
        editarConta(btn.dataset.id, newNome.trim(), contasBody, contasEmpty);
      }
    });
  });

  contasBody.querySelectorAll(".btn-del-conta").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmDialog("Excluir esta conta?"))) return;
      try {
        const data = await window.electronAPI.deletarConta(btn.dataset.id);
        if (data && data.error) {
          exibirToast(data.error, "error");
          return;
        }
        contas = contas.filter((c) => c.id !== btn.dataset.id);
        renderizarContas(contasBody, contasEmpty);
      } catch (err) {
        exibirToast(err.message, "error");
      }
    });
  });
}

async function editarConta(id, nome, contasBody, contasEmpty) {
  try {
    const data = await window.electronAPI.updateConta(id, { nome });
    if (data && data.error) {
      exibirToast(data.error, "error");
      return;
    }
    const idx = contas.findIndex((c) => c.id === id);
    if (idx !== -1) contas[idx] = data;
    renderizarContas(contasBody, contasEmpty);
  } catch (err) {
    exibirToast(err.message, "error");
  }
}

/* ===== Pessoas ===== */
function configurarPessoas() {
  const novaPessoaBtn = document.getElementById("novaPessoaBtn");
  const salvarNovaPessoa = document.getElementById("salvarNovaPessoa");
  const cancelarNovaPessoa = document.getElementById("cancelarNovaPessoa");
  const newPessoaNome = document.getElementById("newPessoaNome");
  const newPessoaMessage = document.getElementById("newPessoaMessage");
  const pessoasBody = document.getElementById("pessoasBody");
  const pessoasEmpty = document.getElementById("pessoasEmpty");
  const inlinePessoaForm = document.getElementById("inlinePessoaForm");

  novaPessoaBtn.addEventListener("click", () => {
    inlinePessoaForm.hidden = false;
    newPessoaNome.value = "";
    newPessoaMessage.textContent = "";
    newPessoaNome.focus();
  });

  cancelarNovaPessoa.addEventListener("click", () => {
    inlinePessoaForm.hidden = true;
    newPessoaMessage.textContent = "";
  });

  salvarNovaPessoa.addEventListener("click", async () => {
    const nome = newPessoaNome.value.trim();
    if (!nome || nome.length > 40) {
      newPessoaMessage.textContent = "Nome inválido (máx. 40 caracteres).";
      return;
    }
    try {
      salvarNovaPessoa.disabled = true;
      salvarNovaPessoa.innerHTML = '<span class="spinner"></span>Salvando...';
      const data = await window.electronAPI.criarPessoa({ nome });
      if (data && data.error) {
        newPessoaMessage.textContent = data.error;
        return;
      }
      pessoas.push(data);
      renderizarPessoas(pessoasBody, pessoasEmpty);
      inlinePessoaForm.hidden = true;
    } catch (err) {
      newPessoaMessage.textContent = err.message;
    } finally {
      salvarNovaPessoa.disabled = false;
      salvarNovaPessoa.textContent = "Salvar";
    }
  });

  newPessoaNome.addEventListener("keydown", (e) => {
    if (e.key === "Enter") salvarNovaPessoa.click();
  });

  carregarPessoas(pessoasBody, pessoasEmpty);
}

async function carregarPessoas(pessoasBody, pessoasEmpty) {
  try {
    const data = await window.electronAPI.getPessoas();
    if (data && data.error) return;
    pessoas = data || [];
    renderizarPessoas(pessoasBody, pessoasEmpty);
  } catch {
    // ignore
  }
}

function renderizarPessoas(pessoasBody, pessoasEmpty) {
  if (pessoas.length === 0) {
    pessoasBody.innerHTML = "";
    pessoasEmpty.hidden = false;
    return;
  }
  pessoasEmpty.hidden = true;
  pessoasBody.innerHTML = pessoas
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.nome)}</td>
      <td class="actions-cell">
        <button type="button" class="btn-edit btn-edit-pessoa" data-id="${p.id}">Editar</button>
        <button type="button" class="btn-delete btn-del-pessoa" data-id="${p.id}">Excluir</button>
      </td>
    </tr>`,
    )
    .join("");

  pessoasBody.querySelectorAll(".btn-edit-pessoa").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pessoa = pessoas.find((p) => p.id === btn.dataset.id);
      if (!pessoa) return;
      const newNome = await promptDialog("Editar nome da pessoa:", pessoa.nome);
      if (newNome && newNome.trim() && newNome.trim().length <= 40) {
        editarPessoa(btn.dataset.id, newNome.trim(), pessoasBody, pessoasEmpty);
      }
    });
  });

  pessoasBody.querySelectorAll(".btn-del-pessoa").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmDialog("Excluir esta pessoa?"))) return;
      try {
        const data = await window.electronAPI.deletarPessoa(btn.dataset.id);
        if (data && data.error) {
          exibirToast(data.error, "error");
          return;
        }
        pessoas = pessoas.filter((p) => p.id !== btn.dataset.id);
        renderizarPessoas(pessoasBody, pessoasEmpty);
      } catch (err) {
        exibirToast(err.message, "error");
      }
    });
  });
}

async function editarPessoa(id, nome, pessoasBody, pessoasEmpty) {
  try {
    const data = await window.electronAPI.updatePessoa(id, { nome });
    if (data && data.error) {
      exibirToast(data.error, "error");
      return;
    }
    const idx = pessoas.findIndex((p) => p.id === id);
    if (idx !== -1) pessoas[idx] = data;
    renderizarPessoas(pessoasBody, pessoasEmpty);
  } catch (err) {
    exibirToast(err.message, "error");
  }
}

async function carregarCategorias(catBody, catEmpty) {
  try {
    const data = await window.electronAPI.listarCategorias();
    if (data && data.error) return;
    categorias = data || [];
    renderizarCategorias;
  } catch {
    // ignore
  }
}

function renderizarCategorias(catBody, catEmpty) {
  const tipo = document.getElementById("filtroTipo").value;
  const filtered = tipo ? categorias.filter((c) => c.tipo === tipo) : categorias;
  if (filtered.length === 0) {
    catBody.innerHTML = "";
    catEmpty.hidden = false;
    return;
  }
  catEmpty.hidden = true;
  catBody.innerHTML = filtered
    .map(
      (c) => `
    <tr>
      <td class="nome-cell">
        ${editingCatId === c.id ? editingCatRow(c) : escapeHtml(c.nome)}
        ${c.eh_global ? '<span class="badge-global">Global</span>' : ""}
      </td>
      <td>${editingCatId === c.id ? editTipoSelect(c) : `<span class="badge-tipo ${c.tipo}">${c.tipo}</span>`}</td>
      <td><button type="button" class="btn-subcat" data-cat-id="${c.id}"><i class="fa-regular fa-pen-to-square"></i> Gerenciar</button></td>
      <td>${editingCatId === c.id ? "" : ativoBadge(c.ativo)}</td>
      <td class="actions-cell">
        ${editingCatId === c.id ? editingCatActions(c) : editActions(c)}
      </td>
    </tr>`,
    )
    .join("");

  catBody.querySelectorAll(".btn-subcat").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentSubcatCatId = btn.dataset.catId;
      const cat = categorias.find((c) => c.id === currentSubcatCatId);
      const subcatTitle = document.getElementById("subcatTitle");
      subcatTitle.textContent = `Subcategorias — ${cat ? cat.nome : ""}`;
      document.getElementById("subcatMessage").textContent = "";
      document.getElementById("newSubcatNome").value = "";
      document.getElementById("subcatPanel").hidden = false;
      carregarSubcategorias(
        currentSubcatCatId,
        document.getElementById("subcatBody"),
        subcatTitle,
        document.getElementById("subcatMessage"),
        document.getElementById("newSubcatNome"),
        document.getElementById("salvarSubcat"),
      );
    });
  });

  catBody.querySelectorAll(".btn-edit-cat").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCatId = btn.dataset.id;
      renderizarCategorias;
      const nomeInput = document.getElementById(`editNome_${editingCatId}`);
      if (nomeInput) {
        nomeInput.focus();
        nomeInput.setSelectionRange(nomeInput.value.length, nomeInput.value.length);
      }
    });
  });

  catBody.querySelectorAll(".btn-save-edit").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const nomeInput = document.getElementById(`editNome_${id}`);
      const tipoSelect = document.getElementById(`editTipo_${id}`);
      const nome = nomeInput.value.trim();
      if (nome.length < 2 || nome.length > 40) return;
      try {
        const data = await window.electronAPI.updateCategoria(id, { nome, tipo: tipoSelect.value });
        if (data && data.error) return;
        Object.assign(
          categorias.find((c) => c.id === id),
          data,
        );
        editingCatId = null;
        renderizarCategorias;
      } catch {
        // ignore
      }
    });
  });

  catBody.querySelectorAll(".btn-cancel-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCatId = null;
      renderizarCategorias;
    });
  });

  catBody.querySelectorAll(".btn-toggle-cat").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        const data = await window.electronAPI.toggleCategoriaAtivo(id);
        if (data && data.error) {
          exibirToast(data.error, "error");
          return;
        }
        Object.assign(
          categorias.find((c) => c.id === id),
          data,
        );
        renderizarCategorias;
      } catch {
        // ignore
      }
    });
  });

  catBody.querySelectorAll(".edit-nome-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const id = input.dataset.id;
        const btn = catBody.querySelector(`.btn-save-edit[data-id="${id}"]`);
        if (btn) btn.click();
      }
      if (e.key === "Escape") {
        editingCatId = null;
        renderizarCategorias;
      }
    });
  });
}

function editingCatRow(c) {
  return `<span class="editing-inline">
    <input id="editNome_${c.id}" class="edit-nome-input" data-id="${c.id}" type="text" value="${escapeHtml(c.nome)}" maxlength="40" />
  </span>`;
}

function editTipoSelect(c) {
  return `<select id="editTipo_${c.id}" class="edit-tipo-select">
    <option value="RECEITA" ${c.tipo === "RECEITA" ? "selected" : ""}>Receita</option>
    <option value="DESPESA" ${c.tipo === "DESPESA" ? "selected" : ""}>Despesa</option>
    <option value="TRANSFERENCIA" ${c.tipo === "TRANSFERENCIA" ? "selected" : ""}>Transferência</option>
  </select>`;
}

function editingCatActions(c) {
  return `
    <button type="button" class="btn-primary btn-save-edit" data-id="${c.id}" style="padding:4px 10px;font-size:0.75rem">Salvar</button>
    <button type="button" class="btn-secondary btn-cancel-edit" data-id="${c.id}" style="padding:4px 10px;font-size:0.75rem">Cancelar</button>
  `;
}

function ativoBadge(ativo) {
  return ativo ? `<span style="color:#4ade80;font-weight:600">●</span>` : `<span style="color:#f87171;font-weight:600">●</span>`;
}

function editActions(c) {
  if (c.eh_global) return "";
  const ativoText = c.ativo ? "Desativar" : "Ativar";
  const ativoCls = c.ativo ? "" : "inactive";
  return `
    <button type="button" class="btn-edit btn-edit-cat" data-id="${c.id}">Editar</button>
    <button type="button" class="btn-toggle btn-toggle-cat ${ativoCls}" data-id="${c.id}">${ativoText}</button>
  `;
}

async function carregarSubcategorias(categoriaId, subcatBody, subcatTitle, subcatMessage, newSubcatNome, salvarSubcat) {
  try {
    subcatBody.innerHTML = '<p style="color:#64748b;text-align:center">Carregando...</p>';
    const data = await window.electronAPI.getSubcategorias(categoriaId);
    if (data && data.error) {
      subcatBody.innerHTML = `<p style="color:#f87171">${escapeHtml(data.error)}</p>`;
      return;
    }
    const subcats = data || [];
    if (subcats.length === 0) {
      subcatBody.innerHTML = '<p style="color:#64748b;text-align:center;padding:14px">Nenhuma subcategoria.</p>';
      return;
    }
    subcatBody.innerHTML = subcats
      .map(
        (s) => `
      <div class="subcat-item">
        ${editingSubcatId === s.id ? editingSubcatRow(s) : escapeHtml(s.nome)}
        <div class="subcat-actions">
          ${editingSubcatId === s.id ? "" : `<button type="button" class="btn-subcat-edit" data-id="${s.id}">Editar</button>`}
          ${editingSubcatId === s.id ? "" : `<button type="button" class="btn-subcat-del" data-id="${s.id}">Excluir</button>`}
        </div>
      </div>`,
      )
      .join("");

    subcatBody.querySelectorAll(".btn-subcat-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingSubcatId = btn.dataset.id;
        const subcat = subcats.find((s) => s.id === editingSubcatId);
        if (subcat) {
          newSubcatNome.value = subcat.nome;
          salvarSubcat.textContent = "Salvar";
          subcatMessage.textContent = "";
          newSubcatNome.focus();
        }
        carregarSubcategorias(categoriaId, subcatBody, subcatTitle, subcatMessage, newSubcatNome, salvarSubcat);
      });
    });

    subcatBody.querySelectorAll(".btn-subcat-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!(await confirmDialog("Excluir esta subcategoria?"))) return;
        try {
          const data = await window.electronAPI.deletarSubcategoria(btn.dataset.id);
          if (data && data.error) {
            subcatMessage.textContent = data.error;
            return;
          }
          editingSubcatId = null;
          salvarSubcat.textContent = "Adicionar";
          subcatMessage.textContent = "";
          await carregarSubcategorias(categoriaId, subcatBody, subcatTitle, subcatMessage, newSubcatNome, salvarSubcat);
        } catch (err) {
          subcatMessage.textContent = err.message;
        }
      });
    });

    subcatBody.querySelectorAll(".subcat-edit-input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") salvarSubcat.click();
        if (e.key === "Escape") {
          editingSubcatId = null;
          salvarSubcat.textContent = "Adicionar";
          newSubcatNome.value = "";
          carregarSubcategorias(categoriaId, subcatBody, subcatTitle, subcatMessage, newSubcatNome, salvarSubcat);
        }
      });
    });
  } catch {
    // ignore
  }
}

function editingSubcatRow(s) {
  return `<span class="subcat-editing">
    <input class="subcat-edit-input" type="text" value="${escapeHtml(s.nome)}" maxlength="40" />
  </span>`;
}

/**
 * @param {string} elId
 * @param {string} texto
 * @param {boolean} [sucesso]
 */
function mostrarMensagem(elId, texto, sucesso) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = texto;
  el.className = "message" + (sucesso ? " success" : "");
  if (texto) {
    setTimeout(() => {
      if (el.textContent === texto) el.textContent = "";
    }, 4000);
  }
}

/**
 * @param {string} token
 * @returns {string | null}
 */
function extrairSid(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sid || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} ua
 * @returns {string}
 */
function formatarUserAgent(ua) {
  if (/Chrome/.test(ua)) return "Chrome";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua)) return "Safari";
  if (/Edge/.test(ua)) return "Edge";
  if (/Electron/.test(ua)) return "Electron";
  return ua.split("/")[0] || ua;
}

/**
 * @param {string} iso
 * @returns {string}
 */
function formatarData(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export { extrairSid, formatarData, formatarUserAgent, mostrarMensagem };
