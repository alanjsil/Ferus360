/**
 * @file Utilitários compartilhados para campos de senha.
 * @module public/js/password-utils
 */

/** @type {Array<{ key: string, test: (s: string) => boolean }>} */
export const REQUISITOS = [
  { key: "length", test: (s) => s.length >= 8 },
  { key: "uppercase", test: (s) => /[A-Z]/.test(s) },
  { key: "number", test: (s) => /\d/.test(s) },
];

/**
 * @param {string} senha
 */
export function avaliarRequisitos(senha) {
  REQUISITOS.forEach(({ key, test }) => {
    const el = document.querySelector(`[data-req="${key}"]`);
    if (el) {
      el.classList.toggle("met", test(senha));
    }
  });
}

export function iniciarToggleSenha() {
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;

      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";

      const icon = btn.querySelector("i");
      if (icon) {
        icon.className = isPassword ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
      }

      btn.setAttribute("aria-label", isPassword ? "Esconder senha" : "Mostrar senha");
    });
  });
}
