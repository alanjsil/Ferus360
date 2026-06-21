# Plano: CSP + Chart.js em build empacotado

## Problema

1. `dashboard.html:11` e `visualizar-dashboard-cliente.html:11` carregam Chart.js via `../node_modules/chart.js/dist/chart.umd.min.js`. Em build empacotado (electron-builder), o caminho relativo para `node_modules/` quebra porque a estrutura do asar não espelha a hierarquia de dev e a diretiva `"files"` (package.json:58-68) **não** inclui `node_modules/` explicitamente.

2. CSP idêntica repetida em **9 arquivos HTML** — qualquer ajuste exige editar todos.

## Solução

### 1. Script de build: copiar Chart.js para `public/vendor/`

Criar `scripts/copy-vendor.mts`:

```ts
import { copyFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const src = new URL("../node_modules/chart.js/dist/chart.umd.min.js", import.meta.url);
const dest = new URL("../public/vendor/chart.umd.min.js", import.meta.url);

mkdirSync(dirname(dest.pathname), { recursive: true });
copyFileSync(src, dest);
```

### 2. Adicionar script ao package.json

```json
"copy:vendor": "tsx scripts/copy-vendor.mts",
```

Injetar em `"build:ts"`: `rimraf dist-ts && tsc && npm run copy:vendor`

### 3. Atualizar `<script>` nos 2 HTMLs

| Arquivo | Antes | Depois |
|---|---|---|
| `public/dashboard.html:11` | `../node_modules/chart.js/dist/chart.umd.min.js` | `vendor/chart.umd.min.js` |
| `public/visualizar-dashboard-cliente.html:11` | `../node_modules/chart.js/dist/chart.umd.min.js` | `vendor/chart.umd.min.js` |

### 4. Centralizar CSP em `main.ts`

Remover `<meta http-equiv="Content-Security-Policy">` de todos os 9 HTMLs.

Injetar via `session.defaultSession.webRequest.onHeadersReceived`:

```ts
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": [
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://lsjoopdtjjadfoqsaasu.supabase.co`
      ]
    }
  });
});
```

### 5. Adicionar `public/vendor/` ao `.gitignore`

### Resumo das alterações

| Arquivo | Ação |
|---|---|
| `scripts/copy-vendor.mts` | **Criar** |
| `package.json` | Adicionar `"copy:vendor"`, alterar `"build:ts"` |
| `public/dashboard.html` | Trocar `<script src>` |
| `public/visualizar-dashboard-cliente.html` | Trocar `<script src>` |
| `public/*.html` (9 arquivos) | Remover `<meta http-equiv="Content-Security-Policy">` |
| `main.ts` | Adicionar interceptor de CSP |
| `.gitignore` | Adicionar `public/vendor/` |
