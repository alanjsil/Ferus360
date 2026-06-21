# Plano: Timer de expiração do token de recuperação — countdown visível

## Problema

`services/auth.ts:156-159` — `setRecoveryTokens()` cria um `setTimeout` de 5 minutos que zera `pendingRecoveryTokens` silenciosamente. Se o usuário já está na página `redefinir.html` quando o timeout dispara:

1. `hasRecoveryTokens()` passa a retornar `false`
2. O formulário segue exibido normalmente, parecendo funcional
3. Ao submeter, `getRecoveryTokens()` retorna `null` → erro `TOKEN_RECUPERACAO_AUSENTE`
4. O usuário não tem explicação clara do que ocorreu

## Solução

### 1. `services/auth.ts` — Armazenar timestamp de expiração + notificação expirada

Adicionar `_recoveryExpiresAt` e callback `_onRecoveryExpired`:

```ts
let _recoveryExpiresAt: number | null = null;
let _onRecoveryExpired: (() => void) | null = null;

function setRecoveryTokens(accessToken: string, refreshToken: string, onExpired?: () => void): void {
  if (_recoveryTimer) clearTimeout(_recoveryTimer);
  pendingRecoveryTokens = { accessToken, refreshToken };
  _recoveryExpiresAt = Date.now() + TEMPO_EXPIRACAO_RECUPERACAO_MS;
  _onRecoveryExpired = onExpired || null;
  _recoveryTimer = setTimeout(() => {
    pendingRecoveryTokens = null;
    _recoveryExpiresAt = null;
    _recoveryTimer = null;
    if (_onRecoveryExpired) _onRecoveryExpired();
  }, TEMPO_EXPIRACAO_RECUPERACAO_MS);
}
```

Adicionar função de consulta sem consumir o token:

```ts
function getTempoRestanteRecuperacao(): number {
  if (!pendingRecoveryTokens || _recoveryExpiresAt === null) return 0;
  return Math.max(0, _recoveryExpiresAt - Date.now());
}
```

Exportar `getTempoRestanteRecuperacao` e adicionar à interface `AuthService`.

### 2. `services/ipcHandlers.ts` — Novo handler `auth:tempo-restante-recuperacao`

```ts
handleAuthTempoRestanteRecuperacao: async () => auth.getTempoRestanteRecuperacao(),
```

Registrar em `registerHandlers`:
```ts
ipcMain.handle("auth:tempo-restante-recuperacao", handlers.handleAuthTempoRestanteRecuperacao);
```

### 3. `preload.ts` — Expor novo IPC no `electronAPI`

```ts
getTempoRestanteRecuperacao: () => ipcRenderer.invoke("auth:tempo-restante-recuperacao"),
```

### 4. `main.ts` — Notificar janela quando token expirar

Em `handleDeepLink`, passar callback de expiração:

```ts
auth.setRecoveryTokens(accessToken, refreshToken, () => {
  const wins = BrowserWindow.getAllWindows();
  wins.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("recovery:expired");
    }
  });
});
```

### 5. `preload.ts` — Listener `onRecoveryExpired`

```ts
onRecoveryExpired: (callback: () => void) => {
  ipcRenderer.on("recovery:expired", () => callback());
},
```

### 6. `public/redefinir.html` — Elemento de aviso

Adicionar após a div `#redefinirDeepInfo`:

```html
<div id="redefinirTimer" style="display: none">
  <div id="redefinirTimerBar" class="timer-bar"></div>
  <p id="redefinirTimerTexto">Seu link expira em <span id="redefinirTimerContagem">5:00</span></p>
</div>
<div id="redefinirExpirado" style="display: none" class="aviso-expirado">
  <p>Seu link de recuperação expirou. Solicite um novo.</p>
</div>
```

CSS correspondente em `public/css/login.css` (timer-bar com gradiente vermelho que encolhe).

### 7. `public/js/redefinir.js` — Lógica do countdown

No `DOMContentLoaded`, quando `tokens?.accessToken`:

```js
let _recoveryInterval = null;

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

// Limpar ao sair
window.addEventListener("beforeunload", () => {
  if (_recoveryInterval) clearInterval(_recoveryInterval);
});
```

Adicionar também listener para `window.electronAPI.onRecoveryExpired()` como fallback push, e limpar no `beforeunload`.

### 8. `test/unitarios/pages/redefinir.test.js` — Testes do countdown

Novos testes:
- Verificar que `getTempoRestanteRecuperacao` é chamado em intervalo
- Verificar que `redefinirTimer` fica visível quando token existe
- Verificar que `redefinirExpirado` aparece quando tempo = 0
- Verificar que o botão submit é desabilitado quando expirado

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `services/auth.ts` | `_recoveryExpiresAt`, `getTempoRestanteRecuperacao()`, callback `onExpired` |
| `services/ipcHandlers.ts` | Handler `auth:tempo-restante-recuperacao` + registro |
| `preload.ts` | `getTempoRestanteRecuperacao` + `onRecoveryExpired` |
| `main.ts` | Callback de expiração com `webContents.send` |
| `public/redefinir.html` | Elementos `#redefinirTimer`, `#redefinirExpirado` |
| `public/js/redefinir.js` | `iniciarCountdown()` com polling + listener push |
| `public/css/login.css` | Estilos `.timer-bar`, `.aviso-expirado` |
| `test/unitarios/pages/redefinir.test.js` | Testes do countdown |

## Resultado

- Usuário vê contagem regressiva visível ("Seu link expira em 4:32")
- Barra de progresso encolhe visualmente
- Ao expirar, formulário é desabilitado com aviso claro
- Duas camadas de notificação: polling (1s) + push (evento IPC)
- Sem alteração na lógica do fluxo de recuperação/manuseio de token
