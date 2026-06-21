# Plano: Race condition no `_importTimeoutId` (importação)

## Problema

`public/js/index.js` — `processarImportacao()` (linha 919) é `async` e não bloqueia o botão. Cenário:

1. Usuário clica "Importar" → `processarImportacao()` inicia
2. Durante `await fazerImportacaoAPI()` (linha 945), usuário clica de novo
3. **Duas chamadas de API** em paralelo — ambas persistem dados
4. Cada uma chama `mostrarResultadoImportacao`:
   - Timer A agendado, depois dispara e seu callback entra na fila de macrotasks
   - `clearTimeout(Timer A)` **não funciona** — já disparou
   - Timer B criado, dispara normalmente
   - Callback do Timer A **ainda executa** → `carregarOrcamento()` + `carregarDashboard()` rodam **duas vezes**

O `if (_importTimeoutId) clearTimeout(...)` (linha 994) só cobre timers que **não dispararam**. Não previne callback já enfileirado.

## Solução

### Camada 1 — Desabilitar o botão durante o processo (impede reentrância)

```js
async function processarImportacao() {
  const btn = document.getElementById("btnImportarDados");
  btn.disabled = true;
  btn.textContent = "Importando...";
  try {
    // ... pipeline atual (coleta, validação, confirmação, API, resultado) ...
  } finally {
    btn.disabled = false;
    btn.textContent = "Importar";
  }
}
```

### Camada 2 — Manter `clearTimeout` existente como safety net (linha 994)

O padrão atual `if (_importTimeoutId) clearTimeout(_importTimeoutId)` continua funcionando como proteção residual.

## Arquivo alterado

| Arquivo | Linhas | Mudança |
|---|---|---|
| `public/js/index.js` | 919-951 | Envolver corpo em `btn.disabled = true / finally { disabled = false }` |

## Resultado

- Botão desabilitado durante todo o pipeline (`async` com confirmação + API)
- Zero chance de double-submit
- Timer roda uma única vez por importação
