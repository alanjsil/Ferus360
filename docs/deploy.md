# Build e Publicação

## Stack de build

| Etapa       | Ferramenta        | Config                         |
| ----------- | ----------------- | ------------------------------ |
| Compilação  | TypeScript (`tsc`)| `tsconfig.json` → `dist-ts/`  |
| Empacotamento | electron-builder | `package.json` → `build:`      |
| Nativo      | `@electron/rebuild` | better-sqlite3 (C++)         |

## Pré-requisitos

- Node.js >= 22, npm >= 10
- Python 3.x + build tools (C++) para compilar `better-sqlite3`
- No Windows: `npm install -g windows-build-tools` ou Visual Studio Build Tools

## Comandos

### Build local (sem publicação)

```bash
npm run build          # Windows (NSIS + portable)
npm run build_mac      # macOS (DMG)
```

Saída em `dist/`.

### CI/CD

GitHub Actions (`.github/workflows/Ci Testes.yml`):

```yaml
on: push → npm ci → npm test → npm run build
```

## Configuração do electron-builder

```js
// Em package.json > "build"
{
  "appId": "com.deltaAutomacoes.financas",
  "productName": "Finanças Pessoais",
  "directories": { "output": "dist" },
  "files": [
    "dist-ts/",       // Código compilado (main + services)
    "public/**/*",    // Renderer
    "package.json"
  ],
  "win": {
    "target": ["nsis", "portable"],
    "icon": "build/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "license": "LICENSE.md"
  },
  "mac": {
    "target": "dmg",
    "icon": "build/icon.png"
  },
  "publish": [{ "provider": "github" }]
}
```

> **Atenção:** o campo `"files"` inclui também `main.js`, `preload.js`, `dialog-senha-preload.js`, `services/**/*`, `src/` — estes são resquícios da versão JS puro. O que realmente importa na build atual é `dist-ts/`, `public/` e `package.json`.

## Passo a passo para publicação

### 1. Versionamento

Atualize `version` em `package.json` seguindo semver.

### 2. Atualizar CHANGELOG.md

Registre as mudanças da release na seção `[Unreleased]`.

### 3. Build local

```bash
npm run build
```

Teste o instalador gerado em `dist/`.

### 4. Publicar no GitHub

Com `"publish": [{ "provider": "github" }]`, use:

```bash
npx electron-builder --publish always
```

Ou crie uma Release manual no GitHub e anexe os artefatos de `dist/`.

## Comandos úteis

| Comando                          | Descrição                                      |
| -------------------------------- | ---------------------------------------------- |
| `npm run build`                  | Build Windows (NSIS + portable)                |
| `npm run build_mac`              | Build macOS (DMG)                              |
| `npx electron-builder --win`     | Apenas Windows                                 |
| `npx electron-builder --linux`   | Apenas Linux                                   |
| `npx electron-builder --publish always` | Build + publica no GitHub Releases      |
| `npm run check`                  | Lint + testes unitários                        |
| `npm test`                       | Testes unitários + integrados (mock Supabase)  |

## Notas importantes

- **better-sqlite3** é um módulo nativo. O `postinstall` executa `@electron/rebuild` para recompilá-lo para a versão do Electron. Em CI, o `pretest` faz `npm rebuild better-sqlite3` antes dos testes.
- O banco SQLite do usuário fica em `%APPDATA%/Finanças Pessoais/financas.db` (Windows) ou `~/Library/Application Support/Finanças Pessoais/financas.db` (macOS).
- A chave `SUPABASE_SERVICE_ROLE` é lida do `.env` e **nunca** sai do main process. O `.env` não é empacotado no build — a anon key está hardcoded em `services/conexao.ts`.
- `forceCodeSigning: false` na configuração. Para distribuição oficial, configure a assinatura de código.
