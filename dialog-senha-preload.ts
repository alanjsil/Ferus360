/// <reference lib="dom" />

import { ipcRenderer } from "electron";

window.addEventListener("DOMContentLoaded", () => {
  const btnConfirmar = document.getElementById("btnConfirmar");
  const btnCancelar = document.getElementById("btnCancelar");
  const senhaInput = document.getElementById("senha") as HTMLInputElement | null;
  const toggleSenha = document.getElementById("toggleSenha");

  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", () => {
      ipcRenderer.send("dialog-senha:confirmar", senhaInput?.value || "");
    });
  }

  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => {
      ipcRenderer.send("dialog-senha:cancelar");
    });
  }

  if (toggleSenha && senhaInput) {
    toggleSenha.addEventListener("click", () => {
      const isPassword = senhaInput.type === "password";
      senhaInput.type = isPassword ? "text" : "password";
      toggleSenha.textContent = isPassword ? "Ocultar senha" : "Mostrar senha";
    });
  }

  if (senhaInput) {
    senhaInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") btnConfirmar?.click();
      if (e.key === "Escape") btnCancelar?.click();
    });
    senhaInput.focus();
  }
});
