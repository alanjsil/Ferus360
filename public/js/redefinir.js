/**
 * @file Página de redefinição de senha.
 */

import { iniciarToggleSenha, avaliarRequisitos } from "./password-utils.js";

let recoveryAccessToken = null;
let modoManual = false;

/**
 * @returns {Promise<{ accessToken: string | boolean } | null>}
 */
async function obterTokenRecuperacao() {
  const temToken = await window.electronAPI.temTokenRecuperacao();
  if (temToken) return { accessToken: true };
  if (window.location.hash) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    if (accessToken) return { accessToken };
  }
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
  recoveryAccessToken = tokens?.accessToken || null;
  if (recoveryAccessToken) {
    modoManual = false;
    document.getElementById("redefinirDeepInfo").style.display = "block";
    document.getElementById("redefinirFallback").style.display = "none";
  } else {
    modoManual = true;
    document.getElementById("redefinirDeepInfo").style.display = "none";
    document.getElementById("redefinirFallback").style.display = "block";
  }

  iniciarToggleSenha();

  const senhaInput = document.getElementById("senha");
  senhaInput.addEventListener("input", () => avaliarRequisitos(senhaInput.value));

  document.getElementById("redefinirForm").addEventListener("submit", redefinir);

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
