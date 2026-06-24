/**
 * @file Página de redefinição de senha.
 */

import { iniciarToggleSenha, avaliarRequisitos } from "./password-utils.js";

let modoManual = false;
let _recoveryInterval = null;
let _cleanupRecovery = null;

async function obterTokenRecuperacao() {
  const temToken = await window.electronAPI.temTokenRecuperacao();
  if (temToken) return { accessToken: true };
  return null;
}

/**
 * @returns {{ senha: string, confirmacao: string }}
 */
function getFormValues() {
  return {
    senha: document.getElementById("senha").value,
    confirmacao: document.getElementById("confirmacao").value,
  };
}

/**
 * @param {string} texto
 * @returns {string | null}
 */
function extrairTokenDoLink(texto) {
  try {
    const url = new URL(texto);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    /* pode ser apenas o token puro */
  }
  if (/^[a-f0-9]{40,}$/i.test(texto.trim())) {
    return texto.trim();
  }
  return null;
}

/**
 * @param {string} texto
 * @param {boolean} [erro=true]
 */
function mostrarMensagem(texto, erro = true) {
  const message = document.getElementById("redefinirMessage");
  message.textContent = texto;
  message.style.color = erro ? "#fca5a5" : "#86efac";
}

/**
 * @param {boolean} loading
 */
function setLoading(loading) {
  const form = document.getElementById("redefinirForm");
  const submit = document.getElementById("redefinirSubmit");
  Array.from(form.elements).forEach((element) => {
    if (element.tagName !== "BUTTON") {
      element.disabled = loading;
    }
  });
  submit.disabled = loading;
  submit.innerHTML = loading ? '<span class="spinner"></span> Redefinindo...' : "Redefinir senha";
}

function iniciarCountdown() {
  const timerDiv = document.getElementById("redefinirTimer");
  const expiradoDiv = document.getElementById("redefinirExpirado");
  const contagem = document.getElementById("redefinirTimerContagem");
  const bar = document.getElementById("redefinirTimerBar");
  const submit = document.getElementById("redefinirSubmit");

  timerDiv.style.display = "block";
  expiradoDiv.style.display = "none";

  _recoveryInterval = setInterval(async () => {
    const restanteMs = await window.electronAPI.getTempoRestanteRecuperacao();
    if (restanteMs <= 0) {
      clearInterval(_recoveryInterval);
      _recoveryInterval = null;
      timerDiv.style.display = "none";
      expiradoDiv.style.display = "block";
      submit.disabled = true;
      return;
    }
    const totalMs = 5 * 60 * 1000;
    const segundos = Math.ceil(restanteMs / 1000);
    const min = Math.floor(segundos / 60);
    const sec = segundos % 60;
    contagem.textContent = `${min}:${String(sec).padStart(2, "0")}`;
    bar.style.width = `${(restanteMs / totalMs) * 100}%`;
  }, 1000);
}

/**
 * @param {Event} event
 */
async function redefinir(event) {
  event.preventDefault();
  mostrarMensagem("");

  const { senha, confirmacao } = getFormValues();

  if (senha.length < 8) {
    mostrarMensagem("A senha deve ter no mínimo 8 caracteres.");
    return;
  }

  if (senha !== confirmacao) {
    mostrarMensagem("As senhas não conferem.");
    return;
  }

  if (modoManual) {
    const email = document.getElementById("redefinirEmail").value.trim();
    const linkOuToken = document.getElementById("redefinirToken").value.trim();
    const token = extrairTokenDoLink(linkOuToken);

    if (!email) {
      mostrarMensagem("Informe seu email.");
      return;
    }
    if (!token) {
      mostrarMensagem("Informe o link ou token de recuperação do email.");
      return;
    }

    setLoading(true);
    try {
      await window.electronAPI.confirmarRecuperacao(email, token, senha);
      mostrarMensagem("Senha redefinida com sucesso! Redirecionando...", false);
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2000);
    } catch (err) {
      const map = {
        SENHA_FRACA: "A senha não atende os requisitos de segurança.",
        TOKEN_INVALIDO: "Token inválido ou expirado. Solicite um novo link.",
      };
      mostrarMensagem(map[err.message] || "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
    return;
  }

  setLoading(true);

  try {
    await window.electronAPI.redefinirSenha(senha);
    mostrarMensagem("Senha redefinida com sucesso! Redirecionando...", false);
    setTimeout(() => {
      window.location.href = "login.html";
    }, 2000);
  } catch (err) {
    const map = {
      SENHA_FRACA: "A senha não atende os requisitos de segurança.",
    };
    mostrarMensagem(map[err.message] || "Erro ao redefinir senha.");
  } finally {
    setLoading(false);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const tokens = await obterTokenRecuperacao();
  if (tokens?.accessToken) {
    modoManual = false;
    document.getElementById("redefinirDeepInfo").style.display = "block";
    document.getElementById("redefinirFallback").style.display = "none";
    iniciarCountdown();
  } else {
    modoManual = true;
    document.getElementById("redefinirDeepInfo").style.display = "none";
    document.getElementById("redefinirFallback").style.display = "block";
  }

  iniciarToggleSenha();

  const senhaInput = document.getElementById("senha");
  senhaInput.addEventListener("input", () => avaliarRequisitos(senhaInput.value));

  document.getElementById("redefinirForm").addEventListener("submit", redefinir);

  _cleanupRecovery = window.electronAPI.onRecoveryExpired(() => {
    if (_recoveryInterval) {
      clearInterval(_recoveryInterval);
      _recoveryInterval = null;
    }
    document.getElementById("redefinirTimer").style.display = "none";
    document.getElementById("redefinirExpirado").style.display = "block";
    document.getElementById("redefinirSubmit").disabled = true;
  });

  const trigger = document.getElementById("contatoTrigger");
  const popover = document.getElementById("contatoPopover");
  if (trigger && popover) {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.hidden = !popover.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!trigger.contains(e.target) && !popover.contains(e.target)) {
        popover.hidden = true;
      }
    });
  }
});

window.addEventListener("beforeunload", () => {
  if (_recoveryInterval) clearInterval(_recoveryInterval);
  if (_cleanupRecovery) _cleanupRecovery();
});
