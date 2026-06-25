const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
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
const expiracao = require("./services/expiration");
const { iniciarMonitoramento, pararMonitoramento } = require("./services/conexao");
const { promptSenha } = require("./services/prompt-senha");

autoUpdater.on("checking-for-update", () => {
  logger.warn("auto-updater", "Checando se há atualizações...");
});

autoUpdater.on("update-available", (info) => {
  logger.warn("auto-updater", "Atualização disponível: " + info.version);
  // Aqui você pode disparar um evento via IPC para o seu Front-end avisar o usuário
});

autoUpdater.on("update-not-available", () => {
  logger.warn("auto-updater", "Nenhuma atualização disponível no momento.");
});

autoUpdater.on("error", (err) => {
  logger.error("auto-updater", "Erro no auto-updater", err);
});

autoUpdater.on("update-downloaded", (info) => {
  logger.warn("auto-updater", "Atualização baixada. Reiniciando e instalando...");
  // Avisa o usuário e força a instalação
  autoUpdater.quitAndInstall();
});

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
    const appRoot = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
    expiracao.init(appRoot);

    iniciarMonitoramento();

    registerHandlers(promptSenha);
    createWindow();

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }

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
  pararMonitoramento();
});
