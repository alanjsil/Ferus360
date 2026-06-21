/**
 * @file Testes dos handlers IPC (services/ipcHandlers.js).
 * @description Valida todos os handlers de autenticação, dados compartilhados, dados privados, categorias, subcategorias, admin e autorização.
 * @module test/unitarios/utils/ipcHandlers.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * - Adicionados comentários AAA.
 * [2026-06-10] - Visualizar cliente
 * - Adicionados mocks de getOrcamentoCliente, getDashboardDadosCliente, getAnosDisponiveisCliente, getContasCliente.
 * - Adicionados testes para os 4 novos handlers admin com cenários de sucesso e UNAUTHORIZED.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRepository = {
  getCategorias: vi.fn(),
  getSubcategorias: vi.fn(),
  getContas: vi.fn(),
  getPessoas: vi.fn(),
  getLancamentos: vi.fn(),
  getOrcamento: vi.fn(),
  getDashboardDados: vi.fn(),
  getDashboard: vi.fn(),
  criarLancamento: vi.fn(),
  deletarLancamento: vi.fn(),
  updateLancamento: vi.fn(),
  importarOrcamento: vi.fn(),
  criarCategoria: vi.fn(),
  updateCategoria: vi.fn(),
  toggleCategoriaAtivo: vi.fn(),
  criarSubcategoria: vi.fn(),
  updateSubcategoria: vi.fn(),
  deletarSubcategoria: vi.fn(),
  setAuthSession: vi.fn(),
  getPerfil: vi.fn(),
  criarConta: vi.fn(),
  updateConta: vi.fn(),
  deletarConta: vi.fn(),
  criarPessoa: vi.fn(),
  updatePessoa: vi.fn(),
  deletarPessoa: vi.fn(),
  getSessoes: vi.fn(),
  deletarSessao: vi.fn(),
};

const mockSetState = vi.fn();
const mockGetState = vi.fn((key) => {
  if (key === "usuarioAtual") return { id: "user-123" };
  if (key === "tipoPessoaAtivo") return "PF";
  if (key === "usarPjAtivo") return true;
  if (key === "compartilharCategorias") return false;
  return [];
});

const mockAuth = {
  verificarToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  solicitarRecuperacao: vi.fn(),
  confirmarRecuperacao: vi.fn(),
  redefinirSenha: vi.fn(),
  trocarSenha: vi.fn(),
  renovarSessao: vi.fn(),
  getRecoveryTokens: vi.fn(),
};

const mockPromptSenha = vi.fn().mockResolvedValue("senha-dialog");

const mockAdminService = {
  getDashboard: vi.fn(),
  getClientes: vi.fn(),
  toggleCliente: vi.fn(),
  getResumoCliente: vi.fn(),
  getTransacoesCliente: vi.fn(),

  resetSenha: vi.fn(),
  getChamados: vi.fn(),
  responderChamado: vi.fn(),
  updateChamado: vi.fn(),
  createChamado: vi.fn(),
  getAuditoria: vi.fn(),
  criarUsuario: vi.fn(),
  getOrcamentoCliente: vi.fn(),
  getDashboardDadosCliente: vi.fn(),
  getAnosDisponiveisCliente: vi.fn(),
  getContasCliente: vi.fn(),
};

const mockData = { id: 1, nome: "Teste" };

describe("ipcHandlers (handlers de IPC)", () => {
  let handlers;
  let ipcHandlersModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.verificarToken.mockResolvedValue({ id: "user-123" });
    mockRepository.getCategorias.mockResolvedValue([mockData]);
    mockRepository.getSubcategorias.mockResolvedValue([mockData]);
    mockRepository.getContas.mockResolvedValue([mockData]);
    mockRepository.getPessoas.mockResolvedValue([mockData]);
    mockRepository.getLancamentos.mockResolvedValue([mockData]);
    mockRepository.getOrcamento.mockResolvedValue([mockData]);
    mockRepository.getDashboardDados.mockResolvedValue(mockData);
    mockRepository.getDashboard.mockResolvedValue(mockData);
    mockRepository.criarLancamento.mockResolvedValue(mockData);
    mockRepository.deletarLancamento.mockResolvedValue({ success: true });
    mockRepository.updateLancamento.mockResolvedValue(mockData);
    mockRepository.importarOrcamento.mockResolvedValue({ success: true, importados: 2 });
    mockRepository.criarCategoria.mockResolvedValue(mockData);
    mockRepository.updateCategoria.mockResolvedValue(mockData);
    mockRepository.toggleCategoriaAtivo.mockResolvedValue(mockData);
    mockRepository.criarSubcategoria.mockResolvedValue(mockData);
    mockRepository.updateSubcategoria.mockResolvedValue(mockData);
    mockRepository.deletarSubcategoria.mockResolvedValue({ success: true });
    mockRepository.criarConta.mockResolvedValue(mockData);
    mockRepository.updateConta.mockResolvedValue(mockData);
    mockRepository.deletarConta.mockResolvedValue({ success: true });
    mockRepository.criarPessoa.mockResolvedValue(mockData);
    mockRepository.updatePessoa.mockResolvedValue(mockData);
    mockRepository.deletarPessoa.mockResolvedValue({ success: true });

    mockAdminService.getDashboard.mockResolvedValue({ totalReceitas: 10000, totalDespesas: 5000, saldo: 5000, totalUsuariosAtivos: 10 });
    mockAdminService.getClientes.mockResolvedValue([{ id: "u-1", nome: "User", email: "u@t.com", ativo: true }]);
    mockAdminService.toggleCliente.mockResolvedValue({ id: "u-1", ativo: false });
    mockAdminService.getResumoCliente.mockResolvedValue({ lancamentos: [], orcamento: [] });
    mockAdminService.getTransacoesCliente.mockResolvedValue([{ id: "t-1", valor: 100, tipo: "RECEITA" }]);

    mockAdminService.resetSenha.mockResolvedValue({ success: true, senhaTemporaria: "temp1234A1", redefinidoPor: "admin-1" });
    mockAdminService.getChamados.mockResolvedValue([{ id: "c-1", titulo: "Problema", status: "aberto" }]);
    mockAdminService.responderChamado.mockResolvedValue({ id: "c-1", status: "em_andamento" });
    mockAdminService.updateChamado.mockResolvedValue({ id: "c-1", status: "resolvido" });
    mockAdminService.createChamado.mockResolvedValue({ id: "c-1", titulo: "Novo Chamado" });
    mockAdminService.getAuditoria.mockResolvedValue([{ id: "a-1", acao: "LOGIN", usuario_id: "u-1", data: "2026-06-01" }]);
    mockAdminService.getOrcamentoCliente.mockResolvedValue([{ id: "o-1", categoria: "Salário", valor_planejado: 5000 }]);
    mockAdminService.getDashboardDadosCliente.mockResolvedValue({ receitas: [], despesas: [] });
    mockAdminService.getAnosDisponiveisCliente.mockResolvedValue([2026, 2025]);
    mockAdminService.getContasCliente.mockResolvedValue([{ id: "c-1", nome: "Conta Cliente" }]);


    ipcHandlersModule = await import("../../../services/ipcHandlers.js");
    handlers = ipcHandlersModule.createHandlers(
      mockRepository, mockSetState, mockGetState, () => {}, mockAuth, mockAdminService, mockPromptSenha
    );
  });

  describe("handlers de autenticação", () => {
    it("handleAuthLogin retorna dados e chama setState", async () => {
      // Arrange
      mockAuth.login.mockResolvedValue({
        token: "at-1", refreshToken: "rt-1",
        usuario: { id: "user-1", nome: "User", role: "user" },
      });
      // Act
      const result = await handlers.handleAuthLogin(null, "email@t.com", "senha");

      expect(mockAuth.login).toHaveBeenCalledWith("email@t.com", "senha", expect.any(Object));
      expect(mockSetState).toHaveBeenCalledWith("usuarioAtual", {
        id: "user-1", nome: "User", role: "user",
      });
      expect(result.token).toBe("at-1");
    });

    it("handleAuthLogout chama logout, reiniciarState e setState(null)", async () => {
      // Arrange
      const mockResetStateFn = vi.fn();
      handlers = ipcHandlersModule.createHandlers(
        mockRepository, mockSetState, mockGetState, mockResetStateFn, mockAuth, mockAdminService
      );

      mockAuth.logout.mockResolvedValue({ success: true });
      // Act
      const result = await handlers.handleAuthLogout();

      expect(mockAuth.logout).toHaveBeenCalledWith(expect.any(Object));
      expect(mockResetStateFn).toHaveBeenCalled();
      expect(mockSetState).toHaveBeenCalledWith("usuarioAtual", null);
      expect(result).toEqual({ success: true });
    });

    it("handleAuthVerificar delega para auth.verificarToken", async () => {
      mockAuth.verificarToken.mockResolvedValue({ id: "user-1", role: "user" });

      const result = await handlers.handleAuthVerificar(null, "token");

      expect(mockAuth.verificarToken).toHaveBeenCalledWith("token");
      expect(result.id).toBe("user-1");
    });

    it("handleAuthRecuperar delega para auth.solicitarRecuperacao", async () => {
      mockAuth.solicitarRecuperacao.mockResolvedValue({ success: true });

      const result = await handlers.handleAuthRecuperar(null, "email@t.com");

      expect(mockAuth.solicitarRecuperacao).toHaveBeenCalledWith("email@t.com", expect.any(Object));
      expect(result).toEqual({ success: true });
    });

    it("handleAuthConfirmarRecuperacao delega para auth.confirmarRecuperacao", async () => {
      mockAuth.confirmarRecuperacao.mockResolvedValue({ success: true });

      const result = await handlers.handleAuthConfirmarRecuperacao(null, "email@t.com", "123456", "NovaSenha1");

      expect(mockAuth.confirmarRecuperacao).toHaveBeenCalledWith("email@t.com", "123456", "NovaSenha1", expect.any(Object));
      expect(result).toEqual({ success: true });
    });

    it("handleAuthRedefinirSenha obtém tokens internamente e delega para auth.redefinirSenha", async () => {
      mockAuth.getRecoveryTokens.mockReturnValue({
        accessToken: "at-1", refreshToken: "rt-1",
      });
      mockAuth.redefinirSenha.mockResolvedValue({ success: true });

      const result = await handlers.handleAuthRedefinirSenha(null, "NovaSenha1");

      expect(mockAuth.getRecoveryTokens).toHaveBeenCalled();
      expect(mockAuth.redefinirSenha).toHaveBeenCalledWith("at-1", "rt-1", "NovaSenha1");
      expect(result).toEqual({ success: true });
    });

    it("handleAuthRedefinirSenha retorna erro se não há tokens de recuperação", async () => {
      mockAuth.getRecoveryTokens.mockReturnValue(null);

      const result = await handlers.handleAuthRedefinirSenha(null, "NovaSenha1");

      expect(result).toEqual({ error: "TOKEN_RECUPERACAO_AUSENTE" });
      expect(mockAuth.redefinirSenha).not.toHaveBeenCalled();
    });

    it("handleAuthRenovar delega para auth.renovarSessao", async () => {
      mockAuth.renovarSessao.mockResolvedValue({
        token: "new-at", refreshToken: "new-rt",
        usuario: { id: "user-1" },
      });

      const result = await handlers.handleAuthRenovar(null, "rt-1");

      expect(mockAuth.renovarSessao).toHaveBeenCalledWith("rt-1");
      expect(result.token).toBe("new-at");
    });

    it("handleAuthTrocarSenha obtém senha via promptSenha e delega", async () => {
      mockPromptSenha.mockResolvedValue("senha-atual-dialog");
      mockAuth.trocarSenha.mockResolvedValue({ success: true });

      const result = await handlers.handleAuthTrocarSenha(null, "user-1", "NovaSenha1");

      expect(mockPromptSenha).toHaveBeenCalledWith("Digite sua senha atual para confirmar a troca");
      expect(mockAuth.trocarSenha).toHaveBeenCalledWith("user-1", "senha-atual-dialog", "NovaSenha1", expect.any(Object));
      expect(result).toEqual({ success: true });
    });
  });

  describe("dados compartilhados (sem auth)", () => {
    it("calls repository.getCategorias on categorias:get", async () => {
      // Act
      const result = await handlers.handleCategoriasGet(null, "DESPESA");
      expect(mockRepository.getCategorias).toHaveBeenCalledWith("user-123", "DESPESA", false, "PF", false);
      expect(mockSetState).toHaveBeenCalledWith("categorias", [mockData]);
      expect(result).toEqual([mockData]);
    });


  });

  describe("dados privados (com auth)", () => {
    it("calls repository.getContas on contas:get", async () => {
      // Act
      const result = await handlers.handleContasGet(null);
      expect(mockRepository.getContas).toHaveBeenCalledWith("user-123", "PF");
      expect(mockSetState).toHaveBeenCalledWith("contas", [mockData]);
      expect(result).toEqual([mockData]);
    });

    it("calls repository.getPessoas on pessoas:get", async () => {
      const result = await handlers.handlePessoasGet(null);
      expect(mockRepository.getPessoas).toHaveBeenCalledWith("user-123", "PF");
      expect(mockSetState).toHaveBeenCalledWith("pessoas", [mockData]);
      expect(result).toEqual([mockData]);
    });

    it("calls repository.createConta on conta:create", async () => {
      const payload = { nome: "Nova Conta" };
      const result = await handlers.handleContaCreate(null, payload);
      expect(mockRepository.criarConta).toHaveBeenCalledWith("user-123", { ...payload, tipo_pessoa: "PF" });
      expect(mockSetState).toHaveBeenCalledWith("contas", [mockData]);
      expect(result).toEqual(mockData);
    });

    it("calls repository.updateConta on conta:update", async () => {
      const patch = { nome: "Conta Editada" };
      const result = await handlers.handleContaUpdate(null, 1, patch);
      expect(mockRepository.updateConta).toHaveBeenCalledWith(1, patch);
      expect(result).toEqual(mockData);
    });

    it("calls repository.deleteConta on conta:delete", async () => {
      const result = await handlers.handleContaDelete(null, 1);
      expect(mockRepository.deletarConta).toHaveBeenCalledWith("user-123", 1);
      expect(result).toEqual({ success: true });
    });

    it("calls repository.createPessoa on pessoa:create", async () => {
      const payload = { nome: "Nova Pessoa" };
      const result = await handlers.handlePessoaCreate(null, payload);
      expect(mockRepository.criarPessoa).toHaveBeenCalledWith("user-123", { ...payload, tipo_pessoa: "PF" });
      expect(mockSetState).toHaveBeenCalledWith("pessoas", [mockData]);
      expect(result).toEqual(mockData);
    });

    it("calls repository.updatePessoa on pessoa:update", async () => {
      const patch = { nome: "Pessoa Editada" };
      const result = await handlers.handlePessoaUpdate(null, 1, patch);
      expect(mockRepository.updatePessoa).toHaveBeenCalledWith(1, patch);
      expect(result).toEqual(mockData);
    });

    it("calls repository.deletePessoa on pessoa:delete", async () => {
      const result = await handlers.handlePessoaDelete(null, 1);
      expect(mockRepository.deletarPessoa).toHaveBeenCalledWith("user-123", 1);
      expect(result).toEqual({ success: true });
    });

    it("calls repository.getLancamentos on lancamentos:get", async () => {
      const result = await handlers.handleLancamentosGet(null, "2026-06");
      expect(mockRepository.getLancamentos).toHaveBeenCalledWith("2026-06", "user-123", "PF");
      expect(mockSetState).toHaveBeenCalledWith("lancamentos", [mockData]);
      expect(result).toEqual([mockData]);
    });

    it("calls repository.getOrcamento on orcamento:get", async () => {
      const result = await handlers.handleOrcamentoGet(null, "2026-06");
      expect(mockRepository.getOrcamento).toHaveBeenCalledWith("2026-06", "user-123", "PF");
      expect(mockSetState).toHaveBeenCalledWith("orcamento", [mockData]);
      expect(result).toEqual([mockData]);
    });

    it("calls repository.getSubcategorias on subcategorias:get", async () => {
      const result = await handlers.handleSubcategoriasGet(null, "cat-1");
      expect(mockRepository.getSubcategorias).toHaveBeenCalledWith("user-123", "cat-1", "PF", false);
      expect(mockSetState).toHaveBeenCalledWith("subcategorias", [mockData]);
      expect(result).toEqual([mockData]);
    });

    it("calls repository.getDashboardDados on dashboard:dados", async () => {
      const result = await handlers.handleDashboardDados(null, "2026", "06", "cat-1");
      expect(mockRepository.getDashboardDados).toHaveBeenCalledWith("2026", "06", "cat-1", "user-123", "PF");
      expect(mockSetState).toHaveBeenCalledWith("dashboard", mockData);
      expect(result).toEqual(mockData);
    });

    it("calls repository.getDashboard on dashboard:get", async () => {
      const result = await handlers.handleDashboardGet(null, "2026-06");
      expect(mockRepository.getDashboard).toHaveBeenCalledWith("2026-06", "user-123", "PF");
      expect(result).toEqual(mockData);
    });

    it("calls repository.createLancamento on lancamentos:create", async () => {
      const payload = { data: "2026-06-01", tipo: "DESPESA", valor: 100 };
      const result = await handlers.handleLancamentosCreate(null, payload);
      expect(mockRepository.criarLancamento).toHaveBeenCalledWith({ ...payload, tipo_pessoa: "PF" }, "user-123");
      expect(mockSetState).toHaveBeenCalledWith("lancamentos", [mockData]);
      expect(result).toEqual(mockData);
    });

    it("calls repository.deleteLancamento on lancamentos:delete", async () => {
      const result = await handlers.handleLancamentosDelete(null, 42);
      expect(mockRepository.deletarLancamento).toHaveBeenCalledWith(42, "user-123");
      expect(result).toEqual({ success: true });
    });

    it("calls repository.updateLancamento on lancamentos:update", async () => {
      const payload = { valor: 200 };
      const result = await handlers.handleLancamentosUpdate(null, 1, payload);
      expect(mockRepository.updateLancamento).toHaveBeenCalledWith(1, payload, "user-123");
      expect(result).toEqual(mockData);
    });

    it("calls repository.importarOrcamento on orcamento:importar", async () => {
      const itens = [{ data: "2026-06-01", tipo: "DESPESA", valor_planejado: "500" }];
      const result = await handlers.handleOrcamentoImportar(null, itens);
      expect(mockRepository.importarOrcamento).toHaveBeenCalledWith(itens, "user-123");
      expect(result).toEqual({ success: true, importados: 2 });
    });
  });

  describe("não autorizado (UNAUTHORIZED)", () => {
    beforeEach(() => {
      handlers = ipcHandlersModule.createHandlers(
        mockRepository, mockSetState, vi.fn(() => []), () => {}, mockAuth, mockAdminService, mockPromptSenha
      );
    });

    it("returns UNAUTHORIZED for contas:get without usuario logado", async () => {
      const result = await handlers.handleContasGet(null);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.getContas).not.toHaveBeenCalled();
    });

    it("returns UNAUTHORIZED for pessoas:get without usuario logado", async () => {
      const result = await handlers.handlePessoasGet(null);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.getPessoas).not.toHaveBeenCalled();
    });

    it("returns UNAUTHORIZED for conta:create without usuario logado", async () => {
      const result = await handlers.handleContaCreate(null, { nome: "X" });
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.criarConta).not.toHaveBeenCalled();
    });

    it("returns UNAUTHORIZED for conta:update without usuario logado", async () => {
      const result = await handlers.handleContaUpdate(null, 1, { nome: "X" });
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.updateConta).not.toHaveBeenCalled();
    });

    it("returns UNAUTHORIZED for conta:delete without usuario logado", async () => {
      const result = await handlers.handleContaDelete(null, 1);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.deletarConta).not.toHaveBeenCalled();
    });

    it("returns UNAUTHORIZED for pessoa:create without usuario logado", async () => {
      const result = await handlers.handlePessoaCreate(null, { nome: "X" });
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.criarPessoa).not.toHaveBeenCalled();
    });

    it("returns UNAUTHORIZED for lancamentos:get without usuario logado", async () => {
      const result = await handlers.handleLancamentosGet(null, "2026-06");
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.getLancamentos).not.toHaveBeenCalled();
    });
  });

  it("exports registerHandlers function", async () => {
    const ipcHandlers = await import("../../../services/ipcHandlers.js");
    expect(typeof ipcHandlers.registerHandlers).toBe("function");
  });

  describe("handlers de configuração", () => {
    it("handleConfigGetPerfil returns perfil", async () => {
      const mockPerfil = { id: "user-123", nome: "Alan", email: "alan@test.com" };
      mockRepository.getPerfil = vi.fn().mockResolvedValue(mockPerfil);

      const result = await handlers.handleConfigGetPerfil(null);
      expect(mockRepository.getPerfil).toHaveBeenCalledWith("user-123");
      expect(result).toEqual(mockPerfil);
    });

    it("handleConfigUpdatePerfil updates perfil", async () => {
      const payload = { nome: "Alan atualizado" };
      const mockResult = { id: "user-123", nome: "Alan atualizado" };
      mockRepository.updatePerfil = vi.fn().mockResolvedValue(mockResult);

      const result = await handlers.handleConfigUpdatePerfil(null, payload);
      expect(mockRepository.updatePerfil).toHaveBeenCalledWith("user-123", payload);
      expect(result).toEqual(mockResult);
    });

    it("handleConfigGetSessoes returns sessoes", async () => {
      const mockSessoes = [{ id: "sessao-1", ip: "127.0.0.1" }];
      mockRepository.getSessoes = vi.fn().mockResolvedValue(mockSessoes);

      const result = await handlers.handleConfigGetSessoes(null);
      expect(mockRepository.getSessoes).toHaveBeenCalledWith("user-123");
      expect(result).toEqual(mockSessoes);
    });

    it("handleConfigEncerrarSessao encerra sessão", async () => {
      mockRepository.deletarSessao.mockResolvedValue({ success: true });
      const result = await handlers.handleConfigEncerrarSessao(null, "sessao-1");
      expect(mockRepository.deletarSessao).toHaveBeenCalledWith("sessao-1");
      expect(result).toEqual({ success: true });
    });

    it("handleConfigEncerrarSessao retorna UNAUTHORIZED sem usuario logado", async () => {
      const noAuth = ipcHandlersModule.createHandlers(
        mockRepository, mockSetState, vi.fn(() => []), () => {}, mockAuth, mockAdminService, mockPromptSenha
      );
      const result = await noAuth.handleConfigEncerrarSessao(null, "sessao-1");
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleConfigExportarDados returns exported data", async () => {
      const mockExport = { lancamentos: [{ id: 1, valor: 100 }] };
      mockRepository.exportarDados = vi.fn().mockResolvedValue(mockExport);

      const result = await handlers.handleConfigExportarDados(null);
      expect(mockRepository.exportarDados).toHaveBeenCalledWith("user-123");
      expect(result).toEqual(mockExport);
    });

    it("handleConfigExcluirConta obtém senha via promptSenha e exclui", async () => {
      mockPromptSenha.mockResolvedValue("senha-dialog");
      mockAuth.verificarSenha = vi.fn().mockResolvedValue({ success: true });
      mockRepository.excluirConta = vi.fn().mockResolvedValue({ success: true });

      const result = await handlers.handleConfigExcluirConta(null);
      expect(mockPromptSenha).toHaveBeenCalledWith("Digite sua senha para excluir sua conta");
      expect(mockAuth.verificarSenha).toHaveBeenCalledWith("user-123", "senha-dialog");
      expect(mockRepository.excluirConta).toHaveBeenCalledWith("user-123");
      expect(result).toEqual({ success: true });
    });

    it("config handlers return UNAUTHORIZED without usuario logado", async () => {
      const noAuth = ipcHandlersModule.createHandlers(
        mockRepository, mockSetState, vi.fn(() => []), () => {}, mockAuth, mockAdminService, mockPromptSenha
      );
      const result = await noAuth.handleConfigGetPerfil(null);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });
  });

  describe("handlers de categorias", () => {
    it("cat:list calls getCategorias with usuarioId", async () => {
      const result = await handlers.handleCatList(null);
      expect(mockRepository.getCategorias).toHaveBeenCalledWith("user-123", null, true, "PF", false);
      expect(mockSetState).toHaveBeenCalledWith("categorias", [mockData]);
      expect(result).toEqual([mockData]);
    });

    it("cat:create calls createCategoria with payload and token", async () => {
      const payload = { nome: "Nova Cat", tipo: "RECEITA" };
      const result = await handlers.handleCatCreate(null, payload);
      expect(mockRepository.criarCategoria).toHaveBeenCalledWith({ ...payload, usuarioId: "user-123", tipo_pessoa: "PF" });
      expect(result).toEqual(mockData);
    });

    it("cat:create returns UNAUTHORIZED without usuario logado", async () => {
      const noAuth = ipcHandlersModule.createHandlers(
        mockRepository, mockSetState, vi.fn(() => []), () => {}, mockAuth, mockAdminService, mockPromptSenha
      );
      const result = await noAuth.handleCatCreate(null, { nome: "X", tipo: "RECEITA" });
      expect(result).toEqual({ error: "UNAUTHORIZED" });
      expect(mockRepository.criarCategoria).not.toHaveBeenCalled();
    });

    it("cat:update calls updateCategoria", async () => {
      const result = await handlers.handleCatUpdate(null, "cat-1", { nome: "Atualizado" });
      expect(mockRepository.updateCategoria).toHaveBeenCalledWith("cat-1", { nome: "Atualizado" }, "user-123");
      expect(result).toEqual(mockData);
    });

    it("cat:toggleAtivo calls toggleCategoriaAtivo", async () => {
      const result = await handlers.handleCatToggleAtivo(null, "cat-1");
      expect(mockRepository.toggleCategoriaAtivo).toHaveBeenCalledWith("cat-1", "user-123");
      expect(result).toEqual(mockData);
    });

    it("cat handlers return UNAUTHORIZED without usuario logado", async () => {
      const noAuth = ipcHandlersModule.createHandlers(
        mockRepository, mockSetState, vi.fn(() => []), () => {}, mockAuth, mockAdminService, mockPromptSenha
      );
      const r1 = await noAuth.handleCatUpdate(null, "cat-1", { nome: "X" });
      expect(r1).toEqual({ error: "UNAUTHORIZED" });
      const r2 = await noAuth.handleCatToggleAtivo(null, "cat-1");
      expect(r2).toEqual({ error: "UNAUTHORIZED" });
    });
  });

  describe("handlers de subcategorias", () => {
    it("subcat:create calls createSubcategoria", async () => {
      const payload = { nome: "Sub", categoria_id: "cat-1" };
      const result = await handlers.handleSubcatCreate(null, payload);
      expect(mockRepository.criarSubcategoria).toHaveBeenCalledWith("user-123", { ...payload, tipo_pessoa: "PF" });
      expect(result).toEqual(mockData);
    });

    it("subcat:update calls updateSubcategoria", async () => {
      const result = await handlers.handleSubcatUpdate(null, "sub-1", { nome: "Editado" });
      expect(mockRepository.updateSubcategoria).toHaveBeenCalledWith("sub-1", { nome: "Editado" });
      expect(result).toEqual(mockData);
    });

    it("subcat:delete calls deleteSubcategoria", async () => {
      const result = await handlers.handleSubcatDelete(null, "sub-1");
      expect(mockRepository.deletarSubcategoria).toHaveBeenCalledWith("sub-1");
      expect(result).toEqual({ success: true });
    });

    it("subcat:delete retorna mensagem de erro quando rejeita", async () => {
      mockRepository.deletarSubcategoria.mockRejectedValue(new Error("ERRO_DELETAR"));
      const result = await handlers.handleSubcatDelete(null, "sub-1");
      expect(result).toEqual({ error: "ERRO_DELETAR" });
    });

    it("subcat handlers return UNAUTHORIZED without usuario logado", async () => {
      const noAuth = ipcHandlersModule.createHandlers(
        mockRepository, mockSetState, vi.fn(() => []), () => {}, mockAuth, mockAdminService, mockPromptSenha
      );
      const r1 = await noAuth.handleSubcatCreate(null, { nome: "X", categoria_id: "c-1" });
      expect(r1).toEqual({ error: "UNAUTHORIZED" });
      const r2 = await noAuth.handleSubcatUpdate(null, "sub-1", { nome: "X" });
      expect(r2).toEqual({ error: "UNAUTHORIZED" });
      const r3 = await noAuth.handleSubcatDelete(null, "sub-1");
      expect(r3).toEqual({ error: "UNAUTHORIZED" });
    });
  });

  describe("handlers de administração", () => {
    it("handleAdminGetDashboard retorna dashboard consolidado", async () => {
      // Act
      const result = await handlers.handleAdminGetDashboard(null);
      expect(mockAdminService.getDashboard).toHaveBeenCalledWith();
      expect(result).toEqual({ totalReceitas: 10000, totalDespesas: 5000, saldo: 5000, totalUsuariosAtivos: 10 });
    });

    it("handleAdminGetDashboard retorna UNAUTHORIZED quando adminService lança", async () => {
      mockAdminService.getDashboard.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminGetDashboard(null);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetClientes retorna clientes", async () => {
      const result = await handlers.handleAdminGetClientes(null);
      expect(mockAdminService.getClientes).toHaveBeenCalledWith();
      expect(result).toHaveLength(1);
    });

    it("handleAdminGetClientes retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.getClientes.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminGetClientes(null);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminToggleCliente alterna status do cliente", async () => {
      const result = await handlers.handleAdminToggleCliente(null, "u-1");
      expect(mockAdminService.toggleCliente).toHaveBeenCalledWith("u-1");
      expect(result.ativo).toBe(false);
    });

    it("handleAdminToggleCliente retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.toggleCliente.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminToggleCliente(null, "u-1");
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetResumoCliente retorna resumo", async () => {
      const result = await handlers.handleAdminGetResumoCliente(null, "u-1");
      expect(mockAdminService.getResumoCliente).toHaveBeenCalledWith("u-1", undefined);
      expect(result).toHaveProperty("lancamentos");
    });

    it("handleAdminGetResumoCliente retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.getResumoCliente.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminGetResumoCliente(null, "u-1");
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetTransacoesCliente retorna transacoes", async () => {
      const result = await handlers.handleAdminGetTransacoesCliente(null, "u-1", 1, 2026);
      expect(mockAdminService.getTransacoesCliente).toHaveBeenCalledWith("u-1", 1, 2026, undefined);
      expect(result).toHaveLength(1);
    });

    it("handleAdminGetTransacoesCliente retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.getTransacoesCliente.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminGetTransacoesCliente(null, "u-1", 1, 2026);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });


    it("handleAdminResetSenha redefine senha", async () => {
      const result = await handlers.handleAdminResetSenha(null, "u-1");
      expect(mockAdminService.resetSenha).toHaveBeenCalledWith("u-1");
      expect(result.senhaTemporaria).toBe("temp1234A1");
    });

    it("handleAdminResetSenha retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.resetSenha.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminResetSenha(null, "u-1");
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetChamados retorna chamados", async () => {
      const result = await handlers.handleAdminGetChamados(null);
      expect(mockAdminService.getChamados).toHaveBeenCalledWith();
      expect(result).toHaveLength(1);
    });

    it("handleAdminGetChamados retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.getChamados.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminGetChamados(null);
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminResponderChamado envia resposta", async () => {
      const result = await handlers.handleAdminResponderChamado(null, "c-1", "Resposta");
      expect(mockAdminService.responderChamado).toHaveBeenCalledWith("c-1", "Resposta");
      expect(result.status).toBe("em_andamento");
    });

    it("handleAdminResponderChamado retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.responderChamado.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminResponderChamado(null, "c-1", "msg");
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminUpdateChamado atualiza status", async () => {
      const result = await handlers.handleAdminUpdateChamado(null, "c-1", "resolvido");
      expect(mockAdminService.updateChamado).toHaveBeenCalledWith("c-1", "resolvido");
      expect(result.status).toBe("resolvido");
    });

    it("handleAdminUpdateChamado retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.updateChamado.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminUpdateChamado(null, "c-1", "resolvido");
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetAuditoria retorna dados de auditoria", async () => {
      const result = await handlers.handleAdminGetAuditoria(null, { mes: "2026-06" });
      expect(mockAdminService.getAuditoria).toHaveBeenCalledWith({ mes: "2026-06" });
      expect(result).toHaveLength(1);
      expect(result[0].acao).toBe("LOGIN");
    });

    it("handleAdminGetAuditoria retorna UNAUTHORIZED em erro", async () => {
      mockAdminService.getAuditoria.mockRejectedValue(new Error("UNAUTHORIZED"));
      const result = await handlers.handleAdminGetAuditoria(null, {});
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminCriarUsuario cria usuario via admin service", async () => {
      // Arrange
      mockAdminService.criarUsuario.mockResolvedValue({ id: "u-new", nome: "João", email: "joao@t.com" });

      // Act
      const result = await handlers.handleAdminCriarUsuario(null, "João", "joao@t.com", "senha123");

      // Assert
      expect(mockAdminService.criarUsuario).toHaveBeenCalledWith("João", "joao@t.com", "senha123");
      expect(result.id).toBe("u-new");
      expect(result.nome).toBe("João");
    });

    it("handleAdminCriarUsuario retorna erro quando adminService falha", async () => {
      // Arrange
      mockAdminService.criarUsuario.mockRejectedValue({ code: "DADOS_INCOMPLETOS" });

      // Act
      const result = await handlers.handleAdminCriarUsuario(null, "", "e@t.com", "123");

      // Assert
      expect(result).toEqual({ error: "DADOS_INCOMPLETOS" });
    });

    it("handleAdminGetOrcamentoCliente retorna orçamento do cliente", async () => {
      // Act
      const result = await handlers.handleAdminGetOrcamentoCliente(null, "u-1");

      // Assert
      expect(mockAdminService.getOrcamentoCliente).toHaveBeenCalledWith("u-1", undefined);
      expect(result).toHaveLength(1);
      expect(result[0].categoria).toBe("Salário");
    });

    it("handleAdminGetOrcamentoCliente retorna UNAUTHORIZED em erro", async () => {
      // Arrange
      mockAdminService.getOrcamentoCliente.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act
      const result = await handlers.handleAdminGetOrcamentoCliente(null, "u-1");

      // Assert
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetDashboardDadosCliente retorna dados do dashboard", async () => {
      // Act
      const result = await handlers.handleAdminGetDashboardDadosCliente(null, "u-1", "2026", "06", null);

      // Assert
      expect(mockAdminService.getDashboardDadosCliente).toHaveBeenCalledWith("u-1", "2026", "06", null, undefined);
      expect(result).toEqual({ receitas: [], despesas: [] });
    });

    it("handleAdminGetDashboardDadosCliente retorna UNAUTHORIZED em erro", async () => {
      // Arrange
      mockAdminService.getDashboardDadosCliente.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act
      const result = await handlers.handleAdminGetDashboardDadosCliente(null, "u-1", "2026", "06", null);

      // Assert
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetAnosDisponiveisCliente retorna anos disponíveis", async () => {
      // Act
      const result = await handlers.handleAdminGetAnosDisponiveisCliente(null, "u-1");

      // Assert
      expect(mockAdminService.getAnosDisponiveisCliente).toHaveBeenCalledWith("u-1", undefined);
      expect(result).toEqual([2026, 2025]);
    });

    it("handleAdminGetAnosDisponiveisCliente retorna UNAUTHORIZED em erro", async () => {
      // Arrange
      mockAdminService.getAnosDisponiveisCliente.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act
      const result = await handlers.handleAdminGetAnosDisponiveisCliente(null, "u-1");

      // Assert
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });

    it("handleAdminGetContasCliente retorna contas do cliente", async () => {
      // Act
      const result = await handlers.handleAdminGetContasCliente(null, "u-1");

      // Assert
      expect(mockAdminService.getContasCliente).toHaveBeenCalledWith("u-1", undefined);
      expect(result).toHaveLength(1);
      expect(result[0].nome).toBe("Conta Cliente");
    });

    it("handleAdminGetContasCliente retorna UNAUTHORIZED em erro", async () => {
      // Arrange
      mockAdminService.getContasCliente.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act
      const result = await handlers.handleAdminGetContasCliente(null, "u-1");

      // Assert
      expect(result).toEqual({ error: "UNAUTHORIZED" });
    });
  });
});
