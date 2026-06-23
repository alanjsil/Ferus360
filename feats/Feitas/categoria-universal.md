# Categoria Universal (substitui Compartilhar Categorias)

## O que muda

- **Remove** toggle global "Compartilhar categorias entre PF e PJ" da aba Conta
- **Adiciona** toggle "Universal" por categoria na tabela de categorias (3ª ação no `actions-cell`)
- Categoria com `tipo_pessoa = NULL` = universal (aparece para PF e PJ)
- Categoria com `tipo_pessoa = 'PF'` ou `'PJ'` = restrita ao tipo
- O filtro existente (`tipo_pessoa.is.null,tipo_pessoa.eq.{userTipoPessoa}`) já funciona — só remover o override global

## Arquivos e mudanças

### 1. `services/repository/utils.ts`
- `adicionarFiltroCategoriaTipoPessoa(query, tipoPessoa)` — remover param `compartilhar`
- `adicionarWhereTipoPessoa(where, params, tipoPessoa)` — remover param `permitirNulo` (sempre true agora)

### 2. `services/repository/categorias.ts`
- `getCategorias()` e `getSubcategorias()` — remover param `compartilhar` e chamadas a ele
- `updateCategoria()` — add `tipo_pessoa` aos `allowedFields`
- Add `toggleCategoriaUniversal(id, usuarioId)` — se `tipo_pessoa` for null → seta `tipoPessoaAtivo`; senão → seta null

### 3. `services/state.ts`
- Remover `compartilharCategorias` da `interface State`, estado inicial e `reiniciarState()`

### 4. `services/ipcHandlers.ts`
- Remover `obterCompartilharCategorias()`
- Remover `handleCompartilharCategoriasGet` e `handleCompartilharCategoriasSet`
- Remover registros IPC `compartilhar-categorias:get` e `compartilhar-categorias:set`
- Atualizar `handleCategoriasGet`, `handleSubcategoriasGet`, `handleCatList` — não passar `compartilhar`
- Add `handleCatToggleUniversal`

### 5. `preload.ts`
- Remover `getCompartilharCategorias`, `setCompartilharCategorias`, `onCompartilharCategoriasChanged`
- Add `toggleCategoriaUniversal: (id) => ipcRenderer.invoke("cat:toggleUniversal", id)`

### 6. `public/js/configuracoes.js`
- **Remover** `configurarCompartilharCategorias()` (função + chamada em `iniciar`)
- **Remover** init do toggle em `carregarPerfil()` (linhas 107-111)
- **Add** toggle Universal no `editActions()` — 3º botão "Universal" com badge indicando estado
- **Add** badge visual na `nome-cell` quando `tipo_pessoa` for null (ex: `"<span class="badge-global">Universal</span>"`)
- **Add** event listener `btn-toggle-universal` em `renderizarCategorias()`
- O botão mostra "Universal" (se `tipo_pessoa == null`) ou "Restrito" (se tem valor)

### 7. `public/configuracoes.html`
- Remover div `.conta-action` do "Compartilhar categorias entre PF e PJ" (linhas 116-125)

### 8. Test files (callers de `getCategorias` com `compartilhar`)
- `test/unitarios/utils/ipcHandlers.test.js` — remover mock/referência a compartilharCategorias
- `test/unitarios/pages/configuracoes.test.js` — remover mock de setCompartilharCategorias
- Testes existentes de `getCategorias` sem `compartilhar` continuam funcionando

## Fluxo (renderer)

```
[Universal] button click
  → window.electronAPI.toggleCategoriaUniversal(id)
  → IPC cat:toggleUniversal
  → repository.toggleCategoriaUniversal(id, usuarioId)
    → lê cat.tipo_pessoa atual
    → se null → seta tipoPessoaAtivo (restrito)
    → se valor → seta null (universal)
  → return categoria atualizada
  → renderizarCategorias() (re-render)
```

## Notas

- Categorias globais (`eh_global: true`) não têm o toggle (já são universais)
- `tipo_pessoa = NULL` já é tratado como "qualquer tipo" pelo filtro existente
- Nenhuma migration necessária — coluna `tipo_pessoa` já existe em `financas_categorias`
- O estado em `state.ts` pode ter `compartilharCategorias` residual por sessões abertas, mas ao recarregar a página some
- O novo toggle salva direto no Supabase via `updateCategoria`

## Ordem de implementação

1. `utils.ts` — remover param compartilhar
2. `categorias.ts` — remover compartilhar + add toggleCategoriaUniversal + add tipo_pessoa em updateCategoria
3. `state.ts` — remover compartilharCategorias
4. `ipcHandlers.ts` — remover handlers compartilhar + add handleCatToggleUniversal + limpar refs
5. `preload.ts` — remover APIs compartilhar + add toggleCategoriaUniversal
6. `configuracoes.html` — remover HTML do toggle global
7. `configuracoes.js` — remover refs compartilhar + add toggle universal na tabela
8. Rodar testes
