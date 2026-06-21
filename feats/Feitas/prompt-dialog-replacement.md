# Plano: Substituir prompt() nativo por diálogo do sistema de design

## Problema

Dois `prompt()` nativos em `configuracoes.js` que bloqueiam o renderer do Electron e têm comportamento inconsistente entre plataformas:

| Linha | Código |
|---|---|
| 674 | `const newNome = prompt("Editar nome da conta:", conta.nome);` |
| 804 | `const newNome = prompt("Editar nome da pessoa:", pessoa.nome);` |

## Solução

### 1. Criar `promptDialog(mensagem, valorPadrao)` em `public/js/toast.js`

Segue o mesmo padrão de `confirmDialog()` usando `<dialog>` nativo.

### 2. Alterar `configuracoes.js`

- Importar `promptDialog` de `./toast.js`
- Tornar os callbacks `async`
- Substituir `prompt(...)` por `await promptDialog(...)`

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `public/js/toast.js` | Adicionar `promptDialog()` |
| `public/js/configuracoes.js` | Importar + substituir 2 prompt() |
