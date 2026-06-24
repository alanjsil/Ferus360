import { BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as logger from "./logger";

const HTML_TEMPLATE = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #1a1a2e; color: #eee;
        display: flex; align-items: center; justify-content: center;
        min-height: 100vh;
      }
      .container { background: #16213e; padding: 2rem; border-radius: 12px; width: 320px; }
      p { margin-bottom: 1.5rem; font-size: 1rem; text-align: center; }
      input {
        width: 100%; padding: 0.75rem; margin-bottom: 0.35rem;
        border: 1px solid #0f3460; border-radius: 8px;
        background: #1a1a2e; color: #eee; font-size: 1rem; outline: none;
      }
      input:focus { border-color: #e94560; }
      #toggleSenha {
        display: inline-block; margin-bottom: 1rem;
        font-size: 0.82rem; color: #94a3b8; cursor: pointer; user-select: none;
      }
      #toggleSenha:hover { color: #e94560; }
      .buttons { display: flex; gap: 0.75rem; }
      button {
        flex: 1; padding: 0.75rem; border: none; border-radius: 8px;
        font-size: 1rem; cursor: pointer;
      }
      .btn-confirmar { background: #e94560; color: #fff; }
      .btn-cancelar { background: #0f3460; color: #eee; }
    </style>
  </head>
  <body>
    <div class="container">
      <p id="mensagem">{{mensagem}}</p>
      <input type="password" id="senha" autofocus placeholder="Digite sua senha" />
      <span id="toggleSenha">Mostrar senha</span>
      <div class="buttons">
        <button class="btn-cancelar" id="btnCancelar">Cancelar</button>
        <button class="btn-confirmar" id="btnConfirmar">Confirmar</button>
      </div>
    </div>

  </body>
</html>
`;

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
