/// <reference lib="dom" />

import { ipcRenderer } from "electron";

window.addEventListener("DOMContentLoaded", () => {
  const btnConfirmar = document.getElementById("btnConfirmar");
  const btnCancelar = document.getElementById("btnCancelar");
  const senhaInput = document.getElementById("senha") as HTMLInputElement | null;

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

  if (senhaInput) {
    senhaInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") btnConfirmar?.click();
      if (e.key === "Escape") btnCancelar?.click();
    });
    senhaInput.focus();
  }
});
