export {
  __setSupabase,
  __setSupabaseAdmin,
  __setDatabase,
  setAuthSession,
  clearAuthSession,
  validarUUID,
  validarMes,
  normalizarNome,
  criptografar,
  descriptografar,
  limparCacheGeral,
  addUsuarioFilter,
  addTipoPessoaFilterStrict,
  addTipoPessoaCategoriaFilter,
  addTipoPessoaWhere,
} from "./utils";

export {
  getCategorias,
  createCategoria,
  updateCategoria,
  toggleCategoriaAtivo,
  getSubcategorias,
  createSubcategoria,
  updateSubcategoria,
  deleteSubcategoria,
} from "./categorias";

export {
  getContas,
  createConta,
  updateConta,
  deleteConta,
} from "./contas";

export {
  getPessoas,
  createPessoa,
  updatePessoa,
  deletePessoa,
} from "./pessoas";

export {
  getLancamentos,
  getOrcamento,
  getAnosDisponiveis,
  getDashboardDados,
  getDashboard,
  createLancamento,
  deleteLancamento,
  updateLancamento,
  createTransferencia,
  deleteTransferencia,
  updateTransferencia,
  importarOrcamento,
} from "./lancamentos";

export {
  getPerfil,
  updatePerfil,
  getSessoes,
  deleteSessao,
  exportarDados,
  excluirConta,
  revokeOtherSessions,
} from "./perfil";

export {
  getAdminDashboard,
  getTransacoesCliente,
  getChamadoById,
  getChamados,
  createChamado,
  updateChamado,
  getClientes,
  getResumoCliente,
  toggleClienteStatus,
} from "./admin";

export {
  logAuditoria,
  getAuditoria,
} from "./auditoria";
