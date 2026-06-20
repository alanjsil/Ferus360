/**
 * @file Sistema de notificações toast e diálogo de confirmação.
 */

let container = null;
let toastIdCounter = 0;

function getContainer() {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Exibe uma notificação toast que emerge do canto direito.
 * O toast permanece até ser clicado (ou até o tempo informado em duracao).
 *
 * @param {string} mensagem - Texto da notificação
 * @param {"error"|"success"|"info"|"warning"} [tipo="info"] - Tipo visual
 * @param {number} [duracao=0] - Auto-fecha após N ms (0 = desligado)
 * @returns {{ fechar: () => void }} Controle para fechar programaticamente
 */
export function exibirToast(mensagem, tipo = "info", duracao = 5000) {
  const id = ++toastIdCounter;

  const el = document.createElement("div");
  el.className = `toast-item toast-${tipo}`;
  el.dataset.toastId = id;
  el.innerHTML = `<span>${mensagem}</span><span class="toast-close">&times;</span>`;

  el.addEventListener("click", () => fecharToast(el));

  getContainer().appendChild(el);

  if (duracao > 0) {
    setTimeout(() => fecharToast(el), duracao);
  }

  return {
    fechar: () => fecharToast(el),
  };
}

function fecharToast(el) {
  if (!el || el.classList.contains("toast-out")) return;
  el.classList.add("toast-out");
  el.addEventListener("animationend", () => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
}

/**
 * Exibe um diálogo de confirmação modal (não-nativo).
 * Substitui window.confirm() sem os problemas de foco/composição do Electron.
 *
 * @param {string} mensagem - Texto da confirmação (suporta \n para quebra)
 * @returns {Promise<boolean>} true se o usuário confirmou, false se cancelou
 */
export function confirmDialog(mensagem) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog";

    dialog.innerHTML = `
      <div class="dialog-header">
        <h2>Confirmação</h2>
      </div>
      <div class="dialog-body">
        <p style="white-space:pre-line;margin:0;line-height:1.6">${mensagem}</p>
      </div>
      <div class="dialog-actions" style="padding:12px 20px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border)">
        <button class="btn-secondary" id="confirmCancel" type="button">Cancelar</button>
        <button class="btn-primary" id="confirmOk" type="button">Confirmar</button>
      </div>
    `;

    document.body.appendChild(dialog);

    const fechar = (resultado) => {
      dialog.close();
      document.body.removeChild(dialog);
      resolve(resultado);
    };

    dialog.querySelector("#confirmOk").addEventListener("click", () => fechar(true));
    dialog.querySelector("#confirmCancel").addEventListener("click", () => fechar(false));

    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar(false);
      }
    });

    dialog.addEventListener("close", () => {
      if (document.body.contains(dialog)) {
        document.body.removeChild(dialog);
      }
      resolve(false);
    });

    dialog.showModal();
    dialog.querySelector("#confirmOk").focus();
  });
}
