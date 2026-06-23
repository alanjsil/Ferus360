const { app, BrowserWindow, ipcMain } = require("electron");
const logger = require("./services/logger");
logger.init(app.getPath("userData"));
const { isDev } = require("./src/env");
const path = require("path");

/**
 * Redireciona todo console.error para o logger (CSV) também.
 * Não causa loop pois logger.error() só escreve em arquivo (fs.appendFileSync),
 * sem chamar console.error internamente.
 */
const consoleErrorOriginal = console.error;
console.error = function (...args: unknown[]) {
  const msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  logger.error(
    "console",
    msg,
    args.find((a) => a instanceof Error),
  );
  consoleErrorOriginal.apply(console, args);
};

const auth = require("./services/auth");
const { registerHandlers } = require("./services/ipcHandlers");
const database = require("./services/database");
const expiracao = require("./services/expiration");
const sync = require("./services/sync");
const { iniciarMonitoramento, pararMonitoramento } = require("./services/conexao");
const dbPath = path.join(app.getPath("userData"), "financas.db");

let mainWindow: any;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, "..", "public", "login.html"));

  mainWindow.webContents.session.webRequest.onHeadersReceived((details: any, callback: any) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://lsjoopdtjjadfoqsaasu.supabase.co",
        ],
      },
    });
  });

  if (isDev) {
    //mainWindow.webContents.openDevTools();
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
}

const HTML_PROMPT_SENHA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #1a1a2e; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.container { background: #16213e; padding: 2rem; border-radius: 12px; width: 320px; }
p { margin-bottom: 1.5rem; font-size: 1rem; text-align: center; }
input { width: 100%; padding: 0.75rem; border: 1px solid #0f3460; border-radius: 8px; background: #1a1a2e; color: #eee; font-size: 1rem; margin-bottom: 1rem; outline: none; }
input:focus { border-color: #e94560; }
.buttons { display: flex; gap: 0.75rem; }
button { flex: 1; padding: 0.75rem; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; }
.btn-confirmar { background: #e94560; color: #fff; }
.btn-cancelar { background: #0f3460; color: #eee; }
</style>
</head>
<body>
<div class="container">
  <p id="mensagem"></p>
  <input type="password" id="senha" autofocus placeholder="Digite sua senha">
  <div class="buttons">
    <button class="btn-cancelar" id="btnCancelar">Cancelar</button>
    <button class="btn-confirmar" id="btnConfirmar">Confirmar</button>
  </div>
</div>
<script>
const params = new URLSearchParams(location.search);
document.getElementById('mensagem').textContent = params.get('msg') || 'Confirme sua senha';
document.getElementById('btnConfirmar').onclick = () => {
  window.electronDialog.confirmar(document.getElementById('senha').value);
};
document.getElementById('btnCancelar').onclick = () => {
  window.electronDialog.cancelar();
};
document.getElementById('senha').onkeydown = (e) => {
  if (e.key === 'Enter') document.getElementById('btnConfirmar').click();
  if (e.key === 'Escape') document.getElementById('btnCancelar').click();
};
</script>
</body>
</html>`;

function promptSenha(mensagem: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!mainWindow) return reject(new Error("Janela principal não disponível"));

    let resolvido = false;
    const win = new BrowserWindow({
      width: 380,
      height: 260,
      resizable: false,
      modal: true,
      parent: mainWindow,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "dialog-senha-preload.js"),
      },
    });

    win.setMenu(null);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML_PROMPT_SENHA)}&msg=${encodeURIComponent(mensagem)}`);

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
  });
}

module.exports = { promptSenha };

async function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    const isRecuperar = parsed.hostname?.includes("recuperar-senha") || parsed.pathname?.includes("recuperar-senha");
    if (!isRecuperar) return;

    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken) {
      try {
        await auth.verificarToken(accessToken);
      } catch {
        logger.warn("deep-link", "token de recuperação falhou na verificação direta, prosseguindo com setSession", url);
      }
      auth.setRecoveryTokens(accessToken, refreshToken, () => {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach((win: any) => {
          if (!win.isDestroyed()) {
            win.webContents.send("recovery:expired");
          }
        });
      });
    }

    mainWindow?.loadFile(path.join(__dirname, "..", "public", "redefinir.html"));
  } catch (err) {
    logger.error("deep-link", "erro ao processar URL", err);
  }
}

const PROTOCOL = "financasapp";

if (process.defaultApp) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event: any, argv: string[]) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url && mainWindow) {
      handleDeepLink(url);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    database.iniciar(app.getPath("userData"));

    const appRoot = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
    expiracao.init(appRoot);

    const repository = require("./services/repository");
    sync.init(database.getDb()!, repository);
    sync.start();
    iniciarMonitoramento();

    repository.limparCacheGeral();

    setInterval(() => repository.limparCacheGeral(), 3600000);

    sync.onSyncStatus((status: any) => {
      const wins = BrowserWindow.getAllWindows();
      wins.forEach((win: any) => {
        if (!win.isDestroyed()) {
          win.webContents.send("sync:status", status);
        }
      });
    });

    registerHandlers(promptSenha);
    createWindow();

    const url = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
  });
}

app.on("open-url", (event: any, url: string) => {
  event.preventDefault();
  if (url.startsWith(`${PROTOCOL}://`)) {
    handleDeepLink(url);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  sync.stop();
  pararMonitoramento();
  database.fechar();
});
