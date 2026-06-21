export {
  __setSupabase,
  __setSupabaseAdmin,
  __setDatabase,
  setAuthSession,
  limparSessaoAuth,
  validarUUID,
  validarMes,
  normalizarNome,
  limparCacheGeral,
  adicionarFiltroUsuario,
  adicionarFiltroTipoPessoaRestrito,
  adicionarFiltroCategoriaTipoPessoa,
  adicionarWhereTipoPessoa,
} from "./utils";

export {
  getCategorias,
  criarCategoria,
  updateCategoria,
  toggleCategoriaAtivo,
  getSubcategorias,
  criarSubcategoria,
  updateSubcategoria,
  deletarSubcategoria,
} from "./categorias";

export {
  getContas,
  criarConta,
  updateConta,
  deletarConta,
} from "./contas";

export {
  getPessoas,
  criarPessoa,
  updatePessoa,
  deletarPessoa,
} from "./pessoas";

export {
  getLancamentos,
  getOrcamento,
  getAnosDisponiveis,
  getDashboardDados,
  getDashboard,
  criarLancamento,
  deletarLancamento,
  updateLancamento,
  criarTransferencia,
  deletarTransferencia,
  updateTransferencia,
  importarOrcamento,
} from "./lancamentos";

export {
  getPerfil,
  updatePerfil,
  getSessoes,
  deletarSessao,
  exportarDados,
  excluirConta,
  revokeOtherSessions,
} from "./perfil";

export {
  getAdminDashboard,
  getTransacoesCliente,
  getChamadoById,
  getChamados,
  criarChamado,
  updateChamado,
  getClientes,
  getResumoCliente,
  toggleClienteStatus,
} from "./admin";

export {
  logAuditoria,
  getAuditoria,
} from "./auditoria";
