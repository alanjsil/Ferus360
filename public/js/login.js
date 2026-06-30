/**
 * @file Fluxo de login do renderer.
 */
import { restoreSession, storeAuthSession } from "./auth-guard.js";
import { iniciarToggleSenha } from "./password-utils.js";

const CAPTCHA_LIMIT = 3;

let falhasConsecutivas = 0;
let captchaResposta = null;
let captchaAtual = null;

/**
 * @returns {void}
 */
function gerarCaptcha() {
  const numeroA = Math.floor(Math.random() * 9) + 1;
  const numeroB = Math.floor(Math.random() * 9) + 1;
  captchaAtual = { numeroA, numeroB };
  captchaResposta = String(numeroA + numeroB);

  const pergunta = document.getElementById("captchaPergunta");
  const box = document.getElementById("captchaBox");
  const input = document.getElementById("captchaResposta");

  pergunta.textContent = `Quanto é ${numeroA} + ${numeroB}?`;
  box.hidden = false;
  input.value = "";
}

/**
 * @returns {void}
 */
function limparCaptcha() {
  const box = document.getElementById("captchaBox");
  const input = document.getElementById("captchaResposta");
  box.hidden = true;
  input.value = "";
  captchaAtual = null;
  captchaResposta = null;
}

/**
 * @param {string} texto
 * @param {boolean} [erro=true]
 */
function mostrarMensagem(texto, erro = true) {
  const message = document.getElementById("loginMessage");
  message.textContent = texto;
  message.style.color = erro ? "#fca5a5" : "#86efac";

  if (erro && texto) {
    const card = document.querySelector(".login-card");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    setTimeout(() => card.classList.remove("shake"), 500);
  }
}

/**
 * @param {boolean} loading
 */
function setLoading(loading) {
  const form = document.getElementById("loginForm");
  const submit = document.getElementById("loginSubmit");
  Array.from(form.elements).forEach((element) => {
    if (element.tagName !== "BUTTON") {
      element.disabled = loading;
    }
  });
  submit.disabled = loading;
  submit.innerHTML = loading ? '<span class="spinner"></span> Entrando...' : "Entrar";
}

/**
 * @returns {{ email: string, senha: string, lembrarMe: boolean, captcha: string }}
 */
function getFormValues() {
  return {
    email: document.getElementById("email").value.trim(),
    senha: document.getElementById("senha").value,
    lembrarMe: document.getElementById("lembrarMe").checked,
    captcha: document.getElementById("captchaResposta").value.trim(),
  };
}

/**
 * @param {Event} event
 */
async function fazerLogin(event) {
  event.preventDefault();
  mostrarMensagem("");

  const { email, senha, lembrarMe, captcha } = getFormValues();

  if (captchaAtual && captcha !== captchaResposta) {
    mostrarMensagem("Captcha inválido.");
    return;
  }

  setLoading(true);

  try {
    const result = await window.electronAPI.login(email, senha);

    if (result.error) {
      falhasConsecutivas += 1;
      const codigo = result.error;
      if (codigo === "USUARIO_INATIVO") {
        mostrarMensagem("Usuário inativado. Entre em contato com o administrador.");
      } else if (codigo === "EMAIL_NAO_CONFIRMADO") {
        mostrarMensagem("Email não confirmado. Verifique sua caixa de entrada.");
      } else if (codigo === "RATE_LIMIT") {
        mostrarMensagem("Muitas tentativas. Aguarde um momento.");
      } else {
        mostrarMensagem("Email ou senha incorretos");
      }
      if (falhasConsecutivas >= CAPTCHA_LIMIT) {
        gerarCaptcha();
      }
      return;
    }

    storeAuthSession({
      ...result,
      rememberMe: lembrarMe,
    });
    falhasConsecutivas = 0;
    limparCaptcha();
    window.location.href = result.usuario.role === "admin" ? "admin.html" : "index.html";
  } finally {
    setLoading(false);
  }
}

/**
 * @returns {Promise<{ token: string, usuario: import("../../src/types").Usuario } | null>}
 */
async function tentarRestaurarSessao() {
  const restored = await restoreSession();
  if (restored) {
    const role = restored.usuario.role;
    window.location.href = role === "admin" ? "admin.html" : "index.html";
  }

  return restored;
}

async function verificarTrial() {
  try {
    const status = await window.electronAPI.getTrialStatus();
    if (!status || !status.diasTrial) return;

    const banner = document.getElementById("trialBanner");
    if (!banner) return;

    if (status.expirado) {
      banner.className = "trial-banner expirado";
      banner.innerHTML = '<i class="fa-regular fa-clock"></i> Período de teste expirado. Entre em contato com o suporte.';
      document.getElementById("loginSubmit").disabled = true;
    } else if (status.diasRestantes <= 5) {
      banner.className = "trial-banner aviso";
      banner.innerHTML = `<i class="fa-regular fa-hourglass-half"></i> Faltam ${status.diasRestantes} dia(s) de teste.`;
    }
  } catch {
    // Ignora falhas (modo dev sem trial)
  }
}

function configurarRecuperacao() {
  const dialog = document.getElementById("recuperacaoDialog");
  const abrir = document.getElementById("abrirRecuperacao");
  const fechar = document.getElementById("fecharRecuperacao");
  const form = document.getElementById("recuperacaoForm");
  const mensagem = document.getElementById("recuperacaoMessage");

  abrir.addEventListener("click", () => {
    mensagem.textContent = "";
    dialog.showModal();
  });

  fechar.addEventListener("click", () => {
    dialog.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("recuperacaoEmail").value.trim();
    mensagem.textContent = "Enviando...";

    try {
      await window.electronAPI.solicitarRecuperacao(email);
      mensagem.style.color = "#86efac";
      mensagem.textContent = "Se o email existir, você receberá um link de recuperação.";
    } catch {
      mensagem.style.color = "#fca5a5";
      mensagem.textContent = "Não foi possível processar a recuperação.";
    }
  });
}

function configurarAutoUpdater() {
  const dialog = document.getElementById("updateDialog");
  const statusText = document.getElementById("updateStatusText");
  const progressWrapper = document.getElementById("updateProgressWrapper");
  const progressFill = document.getElementById("updateProgressFill");
  const progressText = document.getElementById("updateProgressText");
  let _limparListener = null;

  if (!dialog || !statusText) return;

  function mostrarDialog() {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }

  function fecharDialog() {
    if (typeof dialog.close === "function") {
      dialog.close();
    }
  }

  _limparListener = window.electronAPI.onUpdateStatus((data) => {
    switch (data.status) {
      case "checking":
        statusText.textContent = "Verificando atualizações...";
        progressWrapper.hidden = true;
        mostrarDialog();
        break;

      case "update-available":
        statusText.textContent = "Atualização disponível. Baixando...";
        progressWrapper.hidden = false;
        progressFill.style.width = "0%";
        progressText.textContent = "0%";
        break;

      case "downloading":
        progressFill.style.width = (data.percent || 0) + "%";
        progressText.textContent = (data.percent || 0) + "%";
        break;

      case "downloaded":
        statusText.textContent = "Atualização baixada! Reiniciando...";
        progressFill.style.width = "100%";
        progressText.textContent = "100%";
        break;

      case "no-update":
        fecharDialog();
        break;

      case "error":
        fecharDialog();
        break;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  configurarAutoUpdater();

  const restored = await tentarRestaurarSessao();
  if (restored) {
    return;
  }

  await verificarTrial();

  iniciarToggleSenha();
  document.getElementById("loginForm").addEventListener("submit", fazerLogin);
  document.getElementById("senha").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("loginForm").requestSubmit();
    }
  });

  configurarRecuperacao();

  const triggerContato = document.getElementById("contatoTrigger");
  const popoverContato = document.getElementById("contatoPopover");
  if (triggerContato && popoverContato) {
    triggerContato.addEventListener("click", (e) => {
      e.stopPropagation();
      popoverContato.hidden = !popoverContato.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!triggerContato.contains(e.target) && !popoverContato.contains(e.target)) {
        popoverContato.hidden = true;
      }
    });
  }

  const splash = document.getElementById("splashScreen");
  if (splash) {
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 500);
  }
});

export { CAPTCHA_LIMIT, captchaAtual, captchaResposta, falhasConsecutivas, fazerLogin, gerarCaptcha, limparCaptcha, mostrarMensagem, setLoading };
