# Referência IPC

Catálogo completo dos 63 canais IPC entre o renderer (`window.electronAPI`, 65 métodos) e o main process (`ipcMain.handle`).

## Mapa geral

```
window.electronAPI.xyz(...)   ──▶   ipcMain.handle("xyz", ...)
```

A ponte é definida em `preload.ts` via `contextBridge.exposeInMainWorld("electronAPI", ...)`.

## Tabela de canais

| Canal IPC                         | Direção       | Método `electronAPI`                                            | Service       | Descrição                             |
| --------------------------------- | ------------- | --------------------------------------------------------------- | ------------- | ------------------------------------- |
| `auth:login`                      | renderer→main | `login(email, senha)`                                           | auth.ts       | Autentica usuário                     |
| `auth:logout`                     | renderer→main | `logout()`                                                      | auth.ts       | Encerra sessão                        |
| `auth:verificar`                  | renderer→main | `verificarAuth(token)`                                          | auth.ts       | Verifica token JWT                    |
| `auth:recuperar`                  | renderer→main | `solicitarRecuperacao(email)`                                   | auth.ts       | Solicita recuperação de senha         |
| `auth:confirmar-recuperacao`      | renderer→main | `confirmarRecuperacao(email, token, novaSenha)`                 | auth.ts       | Confirma recuperação com token        |
| `auth:redefinir-senha`            | renderer→main | `redefinirSenha(novaSenha)`                                     | auth.ts       | Redefine senha (token da recuperação) |
| `auth:tem-token-recuperacao`      | renderer→main | `temTokenRecuperacao()`                                         | auth.ts       | Verifica se há token de recuperação   |
| `auth:renovar`                    | renderer→main | `renovarAuth(refreshToken)`                                     | auth.ts       | Renova sessão com refresh token       |
| `auth:trocar-senha`               | renderer→main | `trocarSenha(usuarioId, novaSenha)`                             | auth.ts       | Troca senha do usuário logado         |
| `categorias:get`                  | renderer→main | `getCategorias(tipo)`                                           | repository.ts | Lista categorias por tipo             |
| `cat:list`                        | renderer→main | `listCategorias()`                                              | repository.ts | Lista todas (inclusive inativas)      |
| `cat:create`                      | renderer→main | `createCategoria(payload)`                                      | repository.ts | Cria categoria                        |
| `cat:update`                      | renderer→main | `updateCategoria(id, patch)`                                    | repository.ts | Atualiza categoria                    |
| `cat:toggleAtivo`                 | renderer→main | `toggleCategoriaAtivo(id)`                                      | repository.ts | Ativa/desativa categoria              |
| `subcategorias:get`               | renderer→main | `getSubcategorias(categoriaId)`                                 | repository.ts | Lista subcategorias                   |
| `subcat:create`                   | renderer→main | `createSubcategoria(payload)`                                   | repository.ts | Cria subcategoria                     |
| `subcat:update`                   | renderer→main | `updateSubcategoria(id, patch)`                                 | repository.ts | Atualiza subcategoria                 |
| `subcat:delete`                   | renderer→main | `deleteSubcategoria(id)`                                        | repository.ts | Exclui subcategoria                   |
| `contas:get`                      | renderer→main | `getContas()`                                                   | repository.ts | Lista contas bancárias                |
| `conta:create`                    | renderer→main | `createConta(payload)`                                          | repository.ts | Cria conta                            |
| `conta:update`                    | renderer→main | `updateConta(id, patch)`                                        | repository.ts | Atualiza conta                        |
| `conta:delete`                    | renderer→main | `deleteConta(id)`                                               | repository.ts | Exclui conta                          |
| `pessoas:get`                     | renderer→main | `getPessoas()`                                                  | repository.ts | Lista pessoas                         |
| `pessoa:create`                   | renderer→main | `createPessoa(payload)`                                         | repository.ts | Cria pessoa                           |
| `pessoa:update`                   | renderer→main | `updatePessoa(id, patch)`                                       | repository.ts | Atualiza pessoa                       |
| `pessoa:delete`                   | renderer→main | `deletePessoa(id)`                                              | repository.ts | Exclui pessoa                         |
| `lancamentos:get`                 | renderer→main | `getLancamentos(mes)`                                           | repository.ts | Lista lançamentos do mês              |
| `lancamentos:create`              | renderer→main | `createLancamento(payload)`                                     | repository.ts | Cria lançamento                       |
| `lancamentos:update`              | renderer→main | `updateLancamento(id, payload)`                                 | repository.ts | Atualiza lançamento                   |
| `lancamentos:delete`              | renderer→main | `deleteLancamento(id)`                                          | repository.ts | Exclui lançamento                     |
| `transferencia:create`            | renderer→main | `createTransferencia(payload)`                                  | repository.ts | Cria transferência entre contas       |
| `transferencia:update`            | renderer→main | `updateTransferencia(grupoId, payload)`                         | repository.ts | Atualiza transferência                |
| `transferencia:delete`            | renderer→main | `deleteTransferencia(grupoId)`                                  | repository.ts | Exclui transferência                  |
| `orcamento:get`                   | renderer→main | `getOrcamento(mes)`                                             | repository.ts | Lista orçamento do mês                |
| `orcamento:importar`              | renderer→main | `importarOrcamento(itens)`                                      | repository.ts | Importa itens de orçamento            |
| `dashboard:get`                   | renderer→main | `getDashboard(mes)`                                             | repository.ts | Totais do dashboard                   |
| `dashboard:dados`                 | renderer→main | `getDashboardDados(ano, mes, categoria)`                        | repository.ts | Dados detalhados do dashboard         |
| `dashboard:anos`                  | renderer→main | `getAnosDisponiveis()`                                          | repository.ts | Lista anos com lançamentos            |
| `config:getPerfil`                | renderer→main | `getPerfil()`                                                   | repository.ts | Obtém perfil do usuário               |
| `config:updatePerfil`             | renderer→main | `updatePerfil(payload)`                                         | repository.ts | Atualiza perfil                       |
| `config:getSessoes`               | renderer→main | `getSessoes()`                                                  | repository.ts | Lista sessões ativas                  |
| `config:encerrar-sessao`          | renderer→main | `encerrarSessao(sessaoId)`                                      | repository.ts | Encerra sessão específica             |
| `config:encerrar-outras-sessoes`  | renderer→main | `revogarOutrasSessoes()`                                        | repository.ts | Revoga todas as outras sessões        |
| `config:exportarDados`            | renderer→main | `exportarDados()`                                               | repository.ts | Exporta dados do usuário              |
| `config:excluir-conta`            | renderer→main | `excluirConta()`                                                | repository.ts | Exclui conta do usuário               |
| `sync:force`                      | renderer→main | `forceSync()`                                                   | sync.ts       | Força sincronização imediata          |
| `sync:conflitos`                  | renderer→main | `getConflitos()`                                                | sync.ts       | Lista conflitos de sincronização      |
| `sync:resolver-conflito`          | renderer→main | `resolverConflito(id, decisao, payloadMesclado)`                | sync.ts       | Resolve conflito manualmente          |
| `admin:getDashboard`              | renderer→main | `adminGetDashboard()`                                           | admin.ts      | Dashboard administrativo              |
| `admin:getClientes`               | renderer→main | `adminGetClientes()`                                            | admin.ts      | Lista clientes                        |
| `admin:toggleCliente`             | renderer→main | `adminToggleCliente(id)`                                        | admin.ts      | Ativa/desativa cliente                |
| `admin:getResumoCliente`          | renderer→main | `adminGetResumoCliente(id)`                                     | admin.ts      | Resumo financeiro do cliente          |
| `admin:getTransacoesCliente`      | renderer→main | `adminGetTransacoesCliente(id, mes, ano)`                       | admin.ts      | Transações do cliente                 |
| `admin:getOrcamentoCliente`       | renderer→main | `adminGetOrcamentoCliente(id)`                                  | admin.ts      | Orçamento do cliente                  |
| `admin:getDashboardDadosCliente`  | renderer→main | `adminGetDashboardDadosCliente(usuarioId, ano, mes, categoria)` | admin.ts      | Dashboard detalhado do cliente        |
| `admin:getAnosDisponiveisCliente` | renderer→main | `adminGetAnosDisponiveisCliente(usuarioId)`                     | admin.ts      | Anos disponíveis do cliente           |
| `admin:getContasCliente`          | renderer→main | `adminGetContasCliente(id)`                                     | admin.ts      | Contas do cliente                     |
| `admin:resetSenha`                | renderer→main | `adminResetSenha(id)`                                           | admin.ts      | Reseta senha do cliente               |
| `admin:getChamados`               | renderer→main | `adminGetChamados()`                                            | admin.ts      | Lista chamados de suporte             |
| `admin:responderChamado`          | renderer→main | `adminResponderChamado(id, msg)`                                | admin.ts      | Responde chamado                      |
| `admin:updateChamado`             | renderer→main | `adminUpdateChamado(id, status)`                                | admin.ts      | Atualiza status do chamado            |
| `admin:getAuditoria`              | renderer→main | `adminGetAuditoria(filtros)`                                    | admin.ts      | Logs de auditoria                     |
| `admin:criarUsuario`              | renderer→main | `adminCriarUsuario(nome, email, senha)`                         | admin.ts      | Cria usuário (admin)                  |
| `state:updated`                   | main→renderer | (push via `webContents.send`)                                   | state.ts      | Notifica mudança no estado global     |

## Observações

- Todos os canais usam `ipcMain.handle` / `ipcRenderer.invoke` (padrão request-response assíncrono)
- Canais `auth:*` delegam ao `services/auth.ts` (autenticação Supabase)
- Canais de CRUD delegam ao `services/repository.ts` (queries no Supabase com RLS)
- Canais `admin:*` delegam ao `services/admin.ts` (operações administrativas)
- Canais `sync:*` delegam ao `services/sync.ts` (sincronização offline bidirecional)
- Estado centralizado em `services/state.ts`: handlers chamam `setState()` após operações, e o push `state:updated` notifica o renderer
- Erros são retornados como `{ error: string }` nos canais autenticados, ou propagados como exceção

## Exemplos de uso

```js
// Login
const result = await window.electronAPI.login("email@exemplo.com", "senha123");
if (result.error) return console.error(result.error);
// result.usuario → { id, nome, email, role }

// Listar categorias do tipo DESPESA
const cats = await window.electronAPI.getCategorias("DESPESA");

// Criar lançamento
const lanc = await window.electronAPI.createLancamento({
  data: "2026-06-13",
  tipo: "DESPESA",
  valor: 150.0,
  categoria_id: "uuid-da-categoria",
  descricao: "Almoço",
  status: "PAGO",
});

// Ouvir atualizações de estado
window.electronAPI.onStateUpdated?.((_event, { key, value }) => {
  console.log(`Estado atualizado: ${key}`, value);
});
```
