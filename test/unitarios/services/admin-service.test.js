/**
 * @file Testes do serviço de administração (services/admin.js).
 * @description Valida verificarAdmin, dashboard, clientes, chamados, reset de senha e autorização de admin.
 * @module test/unitarios/services/admin-service.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 * [2026-06-10] - Visualizar cliente
 * - Adicionado getOrcamentoCliente: testa chamada com null+id e UNAUTHORIZED.
 * - Adicionado getDashboardDadosCliente: testa delegação com parâmetros e UNAUTHORIZED.
 * - Adicionado getAnosDisponiveisCliente: testa delegação e UNAUTHORIZED.
 * - Adicionado getContasCliente: testa delegação e UNAUTHORIZED.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";



describe("admin (serviço de administração)", () => {
  let admin;
  let mockRepository;
  let mockAuth;
  let mockSupabaseClientRef;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockAuth = {
      verificarSessao: vi.fn(),
      verificarToken: vi.fn(),
      solicitarRecuperacao: vi.fn(),
    };

    mockRepository = {
      getAdminDashboard: vi.fn(),
      getClientes: vi.fn(),
      toggleClienteStatus: vi.fn(),
      getResumoCliente: vi.fn(),
      getTransacoesCliente: vi.fn(),
      getMetasCliente: vi.fn(),
      getOrcamento: vi.fn(),
      getDashboardDados: vi.fn(),
      getAnosDisponiveis: vi.fn(),
      getContas: vi.fn(),
      getPerfil: vi.fn(),
      getChamados: vi.fn(),
      getChamadoById: vi.fn(),
      updateChamado: vi.fn(),
      criarChamado: vi.fn(),
      logAuditoria: vi.fn().mockResolvedValue({}),
      getAuditoria: vi.fn().mockResolvedValue([]),
    };

    const mockSupabaseClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    };

    const mod = await import("../../../services/admin.js");
    admin = mod.construirAdminService({
      repository: mockRepository,
      auth: mockAuth,
      crypto: { randomBytes: vi.fn() },
      supabaseUrl: "https://test.supabase.co",
      supabaseClient: mockSupabaseClient,
    });
    mockSupabaseClientRef = mockSupabaseClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ─────────── VERIFICAR ADMIN ─────────── */

  describe("verificarAdmin", () => {
    it("retorna usuario para admin válido", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({
        id: "admin-1", role: "admin", nome: "Admin",
      });

      // Act
      const result = await admin.verificarAdmin();

      // Assert
      expect(result.role).toBe("admin");
      expect(mockAuth.verificarSessao).toHaveBeenCalled();
    });

    it("lança UNAUTHORIZED quando role não é admin", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({
        id: "user-1", role: "user", nome: "User",
      });

      // Act & Assert
      await expect(admin.verificarAdmin()).rejects.toThrow("UNAUTHORIZED");
    });
  });

  /* ─────────── DASHBOARD ─────────── */

  describe("getDashboard", () => {
    it("retorna dados consolidados", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getAdminDashboard.mockResolvedValue({
        totalReceitas: 10000, totalDespesas: 5000, saldo: 5000, totalUsuariosAtivos: 10,
      });

      // Act
      const result = await admin.getDashboard();

      // Assert
      expect(result.totalReceitas).toBe(10000);
      expect(result.totalUsuariosAtivos).toBe(10);
    });

    it("lança UNAUTHORIZED se verificarAdmin falha", async () => {
      // Arrange
      mockAuth.verificarSessao.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act & Assert
      await expect(admin.getDashboard()).rejects.toThrow("UNAUTHORIZED");
      expect(mockRepository.getAdminDashboard).not.toHaveBeenCalled();
    });
  });

  /* ─────────── CLIENTES ─────────── */

  describe("getClientes", () => {
    it("retorna lista de clientes", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getClientes.mockResolvedValue([
        { id: "00000000-0000-0000-0000-000000000001", nome: "João", email: "joao@t.com", ativo: true },
      ]);

      // Act
      const result = await admin.getClientes();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].nome).toBe("João");
    });
  });

  describe("toggleCliente", () => {
    it("alterna status do cliente", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.toggleClienteStatus.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000001", ativo: false,
      });

      // Act
      const result = await admin.toggleCliente("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(result.ativo).toBe(false);
      expect(mockRepository.toggleClienteStatus).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001");
    });
  });

  describe("getResumoCliente", () => {
    it("retorna resumo financeiro", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getResumoCliente.mockResolvedValue({
        lancamentos: [], orcamento: [],
      });

      // Act
      const result = await admin.getResumoCliente("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(result).toHaveProperty("lancamentos");
      expect(result).toHaveProperty("orcamento");
      expect(result).toEqual({ lancamentos: [], orcamento: [] });
    });
  });

  describe("getTransacoesCliente", () => {
    it("passa mes e ano para o repository", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getTransacoesCliente.mockResolvedValue([]);

      // Act
      await admin.getTransacoesCliente("00000000-0000-0000-0000-000000000001", 6, 2026);

      // Assert
      expect(mockRepository.getTransacoesCliente).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", 6, 2026, undefined);
    });

    it("funciona sem mes e ano", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getTransacoesCliente.mockResolvedValue([]);

      // Act
      await admin.getTransacoesCliente("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(mockRepository.getTransacoesCliente).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", undefined, undefined, undefined);
    });
  });

  /* ─────────── ORCAMENTO CLIENTE ─────────── */

  describe("getOrcamentoCliente", () => {
    it("chama getOrcamento com null e id do cliente", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getOrcamento.mockResolvedValue([{ data: "2026-06-01", tipo: "RECEITA", valor_planejado: 1000, valor_realizado: 900 }]);

      // Act
      const result = await admin.getOrcamentoCliente("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(mockRepository.getOrcamento).toHaveBeenCalledWith(undefined, "00000000-0000-0000-0000-000000000001", undefined, undefined);
      expect(result).toHaveLength(1);
      expect(result[0].valor_planejado).toBe(1000);
    });

    it("lança UNAUTHORIZED se verificarAdmin falha", async () => {
      // Arrange
      mockAuth.verificarSessao.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act & Assert
      await expect(admin.getOrcamentoCliente("00000000-0000-0000-0000-000000000001")).rejects.toThrow("UNAUTHORIZED");
      expect(mockRepository.getOrcamento).not.toHaveBeenCalled();
    });
  });

  /* ─────────── DASHBOARD DADOS CLIENTE ─────────── */

  describe("getDashboardDadosCliente", () => {
    it("delega getDashboardDados com usuarioId do cliente", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getDashboardDados.mockResolvedValue({ lancamentos: [], orcamentos: [] });

      // Act
      const result = await admin.getDashboardDadosCliente("00000000-0000-0000-0000-000000000001", 2026, 6, "cat-1");

      // Assert
      expect(mockRepository.getDashboardDados).toHaveBeenCalledWith(2026, 6, "cat-1", "00000000-0000-0000-0000-000000000001", undefined);
      expect(result).toHaveProperty("lancamentos");
    });

    it("funciona sem mes e categoria", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getDashboardDados.mockResolvedValue({ lancamentos: [] });

      // Act
      await admin.getDashboardDadosCliente("00000000-0000-0000-0000-000000000001", 2026);

      // Assert
      expect(mockRepository.getDashboardDados).toHaveBeenCalledWith(2026, undefined, undefined, "00000000-0000-0000-0000-000000000001", undefined);
    });

    it("lança UNAUTHORIZED se não é admin", async () => {
      // Arrange
      mockAuth.verificarSessao.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act & Assert
      await expect(admin.getDashboardDadosCliente("00000000-0000-0000-0000-000000000001", 2026)).rejects.toThrow("UNAUTHORIZED");
      expect(mockRepository.getDashboardDados).not.toHaveBeenCalled();
    });
  });

  /* ─────────── ANOS DISPONIVEIS CLIENTE ─────────── */

  describe("getAnosDisponiveisCliente", () => {
    it("delega getAnosDisponiveis com usuarioId do cliente", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getAnosDisponiveis.mockResolvedValue([2025, 2026]);

      // Act
      const result = await admin.getAnosDisponiveisCliente("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(mockRepository.getAnosDisponiveis).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", undefined);
      expect(result).toEqual([2025, 2026]);
    });

    it("lança UNAUTHORIZED se não é admin", async () => {
      // Arrange
      mockAuth.verificarSessao.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act & Assert
      await expect(admin.getAnosDisponiveisCliente("00000000-0000-0000-0000-000000000001")).rejects.toThrow("UNAUTHORIZED");
      expect(mockRepository.getAnosDisponiveis).not.toHaveBeenCalled();
    });
  });

  /* ─────────── CONTAS CLIENTE ─────────── */

  describe("getContasCliente", () => {
    it("delega getContas com id do cliente", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getContas.mockResolvedValue([{ id: "c1", nome: "Conta Corrente" }]);

      // Act
      const result = await admin.getContasCliente("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(mockRepository.getContas).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", undefined);
      expect(result).toHaveLength(1);
      expect(result[0].nome).toBe("Conta Corrente");
    });

    it("lança UNAUTHORIZED se não é admin", async () => {
      // Arrange
      mockAuth.verificarSessao.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act & Assert
      await expect(admin.getContasCliente("00000000-0000-0000-0000-000000000001")).rejects.toThrow("UNAUTHORIZED");
      expect(mockRepository.getContas).not.toHaveBeenCalled();
    });
  });

  /* ─────────── RESET SENHA ─────────── */

  describe("resetSenha", () => {
    it("envia email de recuperação pelo auth", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({
        id: "admin-1", nome: "Admin", role: "admin",
      });
      mockRepository.getPerfil.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000001", email: "user@t.com",
      });

      // Act
      const result = await admin.resetSenha("00000000-0000-0000-0000-000000000001");

      // Assert
      expect(result.success).toBe(true);
      expect(result.redefinidoPor).toBe("admin-1");
      expect(mockAuth.solicitarRecuperacao).toHaveBeenCalledWith("user@t.com");
    });

    it("lança USUARIO_NAO_ENCONTRADO se perfil não existe", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({
        id: "admin-1", nome: "Admin", role: "admin",
      });
      mockRepository.getPerfil.mockResolvedValue(null);

      // Act & Assert
      await expect(admin.resetSenha("00000000-0000-0000-0000-000000000999")).rejects.toThrow(
        "USUARIO_NAO_ENCONTRADO"
      );
      expect(mockAuth.solicitarRecuperacao).not.toHaveBeenCalled();
    });
  });

  /* ─────────── CHAMADOS ─────────── */

  describe("getChamados", () => {
    it("mapeia campos corretamente", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getChamados.mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-000000000002",
          usuario_id: "00000000-0000-0000-0000-000000000001",
          usuario: { nome: "João", email: "joao@t.com" },
          titulo: "Ajuda",
          descricao: "Preciso de ajuda",
          respostas: [{ admin_nome: "Admin", mensagem: "Ok", criado_em: "2025-01-01" }],
          status: "aberto",
          criado_em: "2025-01-01T10:00:00Z",
          atualizado_em: "2025-01-02T10:00:00Z",
        },
      ]);

      // Act
      const result = await admin.getChamados();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].usuario_nome).toBe("João");
      expect(result[0].usuario_email).toBe("joao@t.com");
      expect(result[0].respostas).toHaveLength(1);
    });

    it("usa fallback quando usuario é null", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getChamados.mockResolvedValue([
        { id: "00000000-0000-0000-0000-000000000002", usuario_id: "00000000-0000-0000-0000-000000000001", usuario: null, titulo: "Ajuda", descricao: "", respostas: [], status: "aberto", criado_em: "", atualizado_em: "" },
      ]);

      // Act
      const result = await admin.getChamados();

      // Assert
      expect(result[0].usuario_nome).toBe("—");
      expect(result[0].usuario_email).toBe("—");
    });

    it("retorna array vazio quando não há chamados", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.getChamados.mockResolvedValue([]);

      // Act
      const result = await admin.getChamados();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("responderChamado", () => {
    it("adiciona resposta a chamado sem respostas prévias", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({
        id: "admin-1", nome: "Admin", role: "admin",
      });
      mockRepository.getChamadoById.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000002", respostas: null,
      });
      mockRepository.updateChamado.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000002" });
      mockRepository.getChamadoById.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000002", status: "em_andamento",
      });

      // Act
      await admin.responderChamado("00000000-0000-0000-0000-000000000002", "Resposta do admin");

      // Assert
      expect(mockRepository.updateChamado).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000002", expect.objectContaining({
        status: "em_andamento",
      }));
      const updateCall = mockRepository.updateChamado.mock.calls[0][1];
      expect(updateCall.respostas).toHaveLength(1);
      expect(updateCall.respostas[0].admin_id).toBe("admin-1");
      expect(updateCall.respostas[0].mensagem).toBe("Resposta do admin");
    });

    it("adiciona resposta a chamado com respostas existentes", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({
        id: "admin-1", nome: "Admin", role: "admin",
      });
      mockRepository.getChamadoById.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000002",
        respostas: [{ admin_nome: "Admin", mensagem: "Anterior", criado_em: "2025-01-01" }],
      });

      // Act
      await admin.responderChamado("00000000-0000-0000-0000-000000000002", "Nova resposta");

      // Assert
      const updateCall = mockRepository.updateChamado.mock.calls[0][1];
      expect(updateCall.respostas).toHaveLength(2);
    });
  });

  describe("updateChamado", () => {
    it("atualiza status do chamado", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockRepository.updateChamado.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000002", status: "resolvido",
      });

      // Act
      const result = await admin.updateChamado("00000000-0000-0000-0000-000000000002", "resolvido");

      // Assert
      expect(mockRepository.updateChamado).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000002", { status: "resolvido" });
      expect(result.status).toBe("resolvido");
    });
  });

  /* ─────────── CRIAR USUÁRIO ─────────── */

  describe("criarUsuario", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("cria usuario via Edge Function e retorna dados", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      mockSupabaseClientRef.auth.getSession.mockResolvedValue({
        data: { session: { access_token: "admin-token" } },
      });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, id: "novo-id", nome: "João", email: "joao@t.com" }),
      });

      // Act
      const result = await admin.criarUsuario("João", "joao@t.com", "senha123");

      // Assert
      expect(result.success).toBe(true);
      expect(result.id).toBe("novo-id");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/criar-usuario",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer admin-token" },
          body: JSON.stringify({ nome: "João", email: "joao@t.com", senha: "senha123" }),
        }),
      );
      expect(mockRepository.logAuditoria).not.toHaveBeenCalled();
    });

    it("lança UNAUTHORIZED quando token não é admin", async () => {
      // Arrange
      mockAuth.verificarSessao.mockRejectedValue(new Error("UNAUTHORIZED"));

      // Act & Assert
      await expect(admin.criarUsuario("João", "joao@t.com", "senha123")).rejects.toThrow("UNAUTHORIZED");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("lança DADOS_INCOMPLETOS quando campos estão vazios", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });

      // Act & Assert
      await expect(admin.criarUsuario("", "joao@t.com", "senha123")).rejects.toThrow("DADOS_INCOMPLETOS");
      await expect(admin.criarUsuario("João", "", "senha123")).rejects.toThrow("DADOS_INCOMPLETOS");
      await expect(admin.criarUsuario("João", "joao@t.com", "")).rejects.toThrow("DADOS_INCOMPLETOS");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("repassa erro da Edge Function", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      global.fetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Email already registered" }),
      });

      // Act & Assert
      await expect(admin.criarUsuario("João", "joao@t.com", "senha123")).rejects.toThrow("Email already registered");
    });
  });

  describe("criarChamado", () => {
    it("cria chamado via repository", async () => {
      // Arrange
      mockAuth.verificarSessao.mockResolvedValue({ id: "admin-1", role: "admin" });
      const payload = { usuario_id: "00000000-0000-0000-0000-000000000001", titulo: "Problema", descricao: "Ajuda" };
      mockRepository.criarChamado.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000002", ...payload,
      });

      // Act
      const result = await admin.criarChamado(payload);

      // Assert
      expect(mockRepository.criarChamado).toHaveBeenCalledWith(payload);
      expect(result.titulo).toBe("Problema");
    });
  });
});
