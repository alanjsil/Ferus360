import { contextBridge, ipcRenderer } from "electron";

function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem("financas.refresh_token");
  } catch {
    return null;
  }
}

const api = {
  // ==================== LOGGER ====================
  logError: (context: string, message: string, err?: unknown) => ipcRenderer.invoke("log:error", context, message, err),
  logWarn: (context: string, message: string, err?: unknown) => ipcRenderer.invoke("log:warn", context, message, err),

  // ==================== AUTH ====================
  login: (email: string, senha: string) => ipcRenderer.invoke("auth:login", email, senha),
  logout: () => ipcRenderer.invoke("auth:logout"),
  verificarAuth: (token: string) => {
    const refreshToken = getStoredRefreshToken();
    return ipcRenderer.invoke("auth:verificar", token, refreshToken);
  },
  renovarAuth: (refreshToken: string) => ipcRenderer.invoke("auth:renovar", refreshToken),
  solicitarRecuperacao: (email: string) => ipcRenderer.invoke("auth:recuperar", email),
  confirmarRecuperacao: (email: string, token: string, novaSenha: string) => ipcRenderer.invoke("auth:confirmar-recuperacao", email, token, novaSenha),
  temTokenRecuperacao: () => ipcRenderer.invoke("auth:tem-token-recuperacao"),
  getTempoRestanteRecuperacao: () => ipcRenderer.invoke("auth:tempo-restante-recuperacao"),
  onRecoveryExpired: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("recovery:expired", handler);
    return () => ipcRenderer.removeListener("recovery:expired", handler);
  },
  redefinirSenha: (novaSenha: string) => ipcRenderer.invoke("auth:redefinir-senha", novaSenha),
  trocarSenha: (usuarioId: string, novaSenha: string) => ipcRenderer.invoke("auth:trocar-senha", usuarioId, novaSenha),
  verificarSenha: (senha: string) => ipcRenderer.invoke("auth:verificar-senha", senha),

  // ==================== DASHBOARD ====================
  getDashboard: (mes: string) => ipcRenderer.invoke("dashboard:get", mes),
  getDashboardDados: (ano: string, mes: string, categoria: string) => ipcRenderer.invoke("dashboard:dados", ano, mes, categoria),
  getAnosDisponiveis: () => ipcRenderer.invoke("dashboard:anos"),

  // ==================== CATEGORIAS ====================
  getCategorias: (tipo?: string) => ipcRenderer.invoke("categorias:get", tipo),
  listarCategorias: () => ipcRenderer.invoke("cat:list"),
  criarCategoria: (payload: any) => ipcRenderer.invoke("cat:create", payload),
  updateCategoria: (id: string, patch: any) => ipcRenderer.invoke("cat:update", id, patch),
  toggleCategoriaAtivo: (id: string) => ipcRenderer.invoke("cat:toggleAtivo", id),
  toggleCategoriaUniversal: (id: string) => ipcRenderer.invoke("cat:toggleUniversal", id),

  // ==================== SUBCATEGORIAS ====================
  getSubcategorias: (categoriaId?: string) => ipcRenderer.invoke("subcategorias:get", categoriaId),
  criarSubcategoria: (payload: any) => ipcRenderer.invoke("subcat:create", payload),
  updateSubcategoria: (id: string, patch: any) => ipcRenderer.invoke("subcat:update", id, patch),
  deletarSubcategoria: (id: string) => ipcRenderer.invoke("subcat:delete", id),

  // ==================== CONTAS ====================
  getContas: () => ipcRenderer.invoke("contas:get"),
  criarConta: (payload: any) => ipcRenderer.invoke("conta:create", payload),
  updateConta: (id: string, patch: any) => ipcRenderer.invoke("conta:update", id, patch),
  deletarConta: (id: string) => ipcRenderer.invoke("conta:delete", id),

  // ==================== PESSOAS ====================
  getPessoas: () => ipcRenderer.invoke("pessoas:get"),
  criarPessoa: (payload: any) => ipcRenderer.invoke("pessoa:create", payload),
  updatePessoa: (id: string, patch: any) => ipcRenderer.invoke("pessoa:update", id, patch),
  deletarPessoa: (id: string) => ipcRenderer.invoke("pessoa:delete", id),

  // ==================== LANÇAMENTOS ====================
  getLancamentos: (mes: string) => ipcRenderer.invoke("lancamentos:get", mes),
  criarLancamento: (payload: any) => ipcRenderer.invoke("lancamentos:create", payload),
  updateLancamento: (id: string, payload: any) => ipcRenderer.invoke("lancamentos:update", id, payload),
  deletarLancamento: (id: string) => ipcRenderer.invoke("lancamentos:delete", id),

  // ==================== TRANSFERÊNCIAS ====================
  criarTransferencia: (payload: any) => ipcRenderer.invoke("transferencia:create", payload),
  updateTransferencia: (grupoId: string, payload: any) => ipcRenderer.invoke("transferencia:update", grupoId, payload),
  deletarTransferencia: (grupoId: string) => ipcRenderer.invoke("transferencia:delete", grupoId),

  // ==================== ORÇAMENTO ====================
  getOrcamento: (mes: string) => ipcRenderer.invoke("orcamento:get", mes),
  importarOrcamento: (itens: any[]) => ipcRenderer.invoke("orcamento:importar", itens),

  // ==================== CONFIGURAÇÕES / PERFIL ====================
  getPerfil: () => ipcRenderer.invoke("config:getPerfil"),
  updatePerfil: (payload: any) => ipcRenderer.invoke("config:updatePerfil", payload),
  getSessoes: () => ipcRenderer.invoke("config:getSessoes"),
  encerrarSessao: (sessaoId: string) => ipcRenderer.invoke("config:encerrar-sessao", sessaoId),
  revogarOutrasSessoes: () => ipcRenderer.invoke("config:encerrar-outras-sessoes"),
  exportarDados: () => ipcRenderer.invoke("config:exportarDados"),
  excluirConta: () => ipcRenderer.invoke("config:excluir-conta"),

  // ==================== TIPO PESSOA ====================
  getTipoPessoa: () => ipcRenderer.invoke("tipo-pessoa:get"),
  setTipoPessoa: (tipoPessoa: string) => ipcRenderer.invoke("tipo-pessoa:set", tipoPessoa),
  onTipoPessoaChanged: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => {
      if (data.key === "tipoPessoaAtivo") callback(data.value);
    };
    ipcRenderer.on("state:updated", handler);
    return () => ipcRenderer.removeListener("state:updated", handler);
  },

  // ==================== USAR PJ ====================
  getUsarPj: () => ipcRenderer.invoke("usar-pj:get"),
  setUsarPj: (value: boolean) => ipcRenderer.invoke("usar-pj:set", value),
  onUsarPjChanged: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => {
      if (data.key === "usarPjAtivo") callback(data.value);
    };
    ipcRenderer.on("state:updated", handler);
    return () => ipcRenderer.removeListener("state:updated", handler);
  },

  // ==================== TRIAL ====================
  getTrialStatus: () => ipcRenderer.invoke("trial:status"),

  // ==================== ADMIN ====================
  adminGetDashboard: () => ipcRenderer.invoke("admin:getDashboard"),
  adminGetClientes: () => ipcRenderer.invoke("admin:getClientes"),
  adminToggleCliente: (id: string) => ipcRenderer.invoke("admin:toggleCliente", id),
  adminGetChamados: () => ipcRenderer.invoke("admin:getChamados"),
  adminResponderChamado: (id: string, msg: string) => ipcRenderer.invoke("admin:responderChamado", id, msg),
  adminUpdateChamado: (id: string, status: string) => ipcRenderer.invoke("admin:updateChamado", id, status),
  adminResetSenha: (id: string) => ipcRenderer.invoke("admin:resetSenha", id),
  adminCriarUsuario: (nome: string, email: string, senha: string) => ipcRenderer.invoke("admin:criarUsuario", nome, email, senha),
  adminGetAuditoria: (filtros: any) => ipcRenderer.invoke("admin:getAuditoria", filtros),
  adminGetResumoCliente: (id: string, tipoPessoa?: string) => ipcRenderer.invoke("admin:getResumoCliente", id, tipoPessoa),
  adminGetTransacoesCliente: (id: string, mes: string, ano: string, tipoPessoa?: string) => ipcRenderer.invoke("admin:getTransacoesCliente", id, mes, ano, tipoPessoa),
  adminGetOrcamentoCliente: (id: string, tipoPessoa?: string) => ipcRenderer.invoke("admin:getOrcamentoCliente", id, tipoPessoa),
  adminGetContasCliente: (id: string, tipoPessoa?: string) => ipcRenderer.invoke("admin:getContasCliente", id, tipoPessoa),
  adminGetAnosDisponiveisCliente: (usuarioId: string, tipoPessoa?: string) => ipcRenderer.invoke("admin:getAnosDisponiveisCliente", usuarioId, tipoPessoa),
  adminGetDashboardDadosCliente: (usuarioId: string, ano: string, mes: string, categoria: string, tipoPessoa?: string) =>
    ipcRenderer.invoke("admin:getDashboardDadosCliente", usuarioId, ano, mes, categoria, tipoPessoa),
};

contextBridge.exposeInMainWorld("electronAPI", api);
export type ElectronAPI = typeof api;
