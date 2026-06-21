# Plano: Corrigir vazamento de listeners no preload.ts

## Problema

`preload.ts:87-111` — `ipcRenderer.on()` registra listeners permanentes sem nunca removê-los:

| Função | Canal | Linha |
|---|---|---|
| `onTipoPessoaChanged` | `state:updated` | 87 |
| `onUsarPjChanged` | `state:updated` | 94 |
| `onCompartilharCategoriasChanged` | `state:updated` | 100 |
| `onSyncStatus` | `sync:status` | 111 |

Cada página (`index.js`, `dashboard.js`, `configuracoes.js`, `visualizar-cliente.js`, `visualizar-dashboard-cliente.js`) registra novos listeners via `DOMContentLoaded`. Como a navegação usa `window.location.href` e o preload roda **uma única vez** por janela Electron, os listeners antigos acumulam-se. O evento dispara N vezes, causando duplicação e consumo crescente de memória.

## Mudanças no `preload.ts`

Cada `on*` deve retornar uma função de cleanup:

```ts
// Antes
onTipoPessoaChanged: (callback) =>
  ipcRenderer.on("state:updated", handler),

// Depois
onTipoPessoaChanged: (callback) => {
  const handler = (_e, data) => {
    if (data.key === "tipoPessoaAtivo") callback(data.value);
  };
  ipcRenderer.on("state:updated", handler);
  return () => ipcRenderer.removeListener("state:updated", handler);
},
```

Aplicar a mesma lógica em `onUsarPjChanged`, `onCompartilharCategoriasChanged` e `onSyncStatus`.

## Mudanças no renderer (5 arquivos)

Cada página deve armazenar o cleanup e dispará-lo antes de navegar:

```js
const cleanups = [];

// Registrar
cleanups.push(window.electronAPI.onTipoPessoaChanged(callback));

// Limpar ao sair
window.addEventListener("beforeunload", () => {
  cleanups.forEach(fn => fn());
  cleanups.length = 0;
});
```

### Arquivos afetados

| Arquivo | Listeners |
|---|---|
| `public/js/index.js:30,61,71` | `onSyncStatus`, `onTipoPessoaChanged`, `onUsarPjChanged` |
| `public/js/dashboard.js:68,81` | `onTipoPessoaChanged`, `onUsarPjChanged` |
| `public/js/configuracoes.js:406,426` | `onTipoPessoaChanged`, `onUsarPjChanged` |
| `public/js/visualizar-cliente.js:97,117` | `onTipoPessoaChanged`, `onUsarPjChanged` |
| `public/js/visualizar-dashboard-cliente.js:55,75` | `onTipoPessoaChanged`, `onUsarPjChanged` |

## Notas

- `onCompartilharCategoriasChanged` não é usado no renderer — corrigido apenas no preload por consistência.
- `onSyncStatus` usado apenas em `index.js:30`.
- `beforeunload` cobre navegação, refresh e fechamento.
