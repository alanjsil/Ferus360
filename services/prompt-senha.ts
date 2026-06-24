import { BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as logger from "./logger";

const HTML_TEMPLATE = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" crossorigin="anonymous">
  <style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #1a1a2e; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .container { background: #16213e; padding: 2rem; border-radius: 12px; width: 320px; }
  p { margin-bottom: 1.5rem; font-size: 1rem; text-align: center; }
  .password-wrapper { position: relative; width: 100%; margin-bottom: 1rem; }
  .password-wrapper input { width: 100%; padding: 0.75rem 2.5rem 0.75rem 0.75rem; border: 1px solid #0f3460; border-radius: 8px; background: #1a1a2e; color: #eee; font-size: 1rem; outline: none; margin: 0; }
  .password-wrapper input:focus { border-color: #e94560; }
  .toggle-password { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0.25rem; font-size: 1rem; line-height: 1; flex: none; }
  .toggle-password:hover { color: #e94560; }
  .buttons { display: flex; gap: 0.75rem; }
  button { flex: 1; padding: 0.75rem; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; }
  .btn-confirmar { background: #e94560; color: #fff; }
  .btn-cancelar { background: #0f3460; color: #eee; }
  </style>
  </head>
  <body>
  <div class="container">
    <p id="mensagem">{{mensagem}}</p>
    <div class="password-wrapper">
      <input type="password" id="senha" autofocus placeholder="Digite sua senha">
      <button type="button" class="toggle-password" aria-label="Mostrar senha" tabindex="-1">
        <i class="fa-regular fa-eye"></i>
      </button>
    </div>
    <div class="buttons">
      <button class="btn-cancelar" id="btnCancelar">Cancelar</button>
      <button class="btn-confirmar" id="btnConfirmar">Confirmar</button>
    </div>
  </div>
  <script>
    document.addEventListener("DOMContentLoaded", () => {
      const toggle = document.querySelector(".toggle-password");
      const input = document.getElementById("senha");
      if (toggle && input) {
        toggle.addEventListener("click", () => {
          const isPassword = input.type === "password";
          input.type = isPassword ? "text" : "password";
          toggle.querySelector("i").className = isPassword ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
          toggle.setAttribute("aria-label", isPassword ? "Esconder senha" : "Mostrar senha");
        });
      }
    });
  </script>
  </body>
</html>`;

function promptSenha(mensagem: string, mainWindow?: any): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!mainWindow) {
      try {
        const wins = BrowserWindow.getAllWindows();
        if (wins.length === 0) return reject(new Error("USUARIO_CANCELOU"));
        mainWindow = wins[0];
      } catch {
        return reject(new Error("USUARIO_CANCELOU"));
      }
    }

    let resolvido = false;

    const win = new BrowserWindow({
      width: 380,
      height: 290,
      resizable: false,
      modal: true,
      parent: mainWindow,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "..", "dialog-senha-preload.js"),
      },
    });

    win.setMenu(null);

    const html = HTML_TEMPLATE.replace("{{mensagem}}", mensagem);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const onConfirmar = (_event: any, senha: string) => {
      if (resolvido) return;
      resolvido = true;
      cleanup();
      resolve(senha);
    };

    const onCancelar = () => {
      if (resolvido) return;
      resolvido = true;
      cleanup();
      reject(new Error("USUARIO_CANCELOU"));
    };

    function cleanup() {
      ipcMain.removeListener("dialog-senha:confirmar", onConfirmar);
      ipcMain.removeListener("dialog-senha:cancelar", onCancelar);
      if (!win.isDestroyed()) win.close();
    }

    win.on("closed", () => {
      if (!resolvido) onCancelar();
    });

    ipcMain.on("dialog-senha:confirmar", onConfirmar);
    ipcMain.on("dialog-senha:cancelar", onCancelar);

    win.webContents.on("did-fail-load", (_event: any, errorCode: number, errorDescription: string) => {
      logger.error("prompt-senha", `falha ao carregar dialogo: ${errorCode} ${errorDescription}`);
      if (!resolvido) {
        resolvido = true;
        cleanup();
        reject(new Error("USUARIO_CANCELOU"));
      }
    });
  });
}

export { promptSenha };
