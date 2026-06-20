import type { Usuario, AdminDashboard, FiltrosAuditoria, Auditoria, Chamado, Lancamento, Conta, Orcamento, DashboardDadosResult } from "../src/types";
import crypto from "crypto";
import * as conexaoModule from "./conexao";
import * as repositoryModule from "./repository";
import * as authModule from "./auth";
import * as logger from "./logger";
import { validarUUID } from "./repository";

class AdminError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "AdminError";
    this.code = code;
  }
}

function createAdminError(code: string): AdminError {
  return new AdminError(code);
}

interface DefaultDependencies {
  repository: Record<string, Function>;
  auth: Record<string, Function>;
  crypto: typeof crypto;
  supabaseUrl: string;
  supabaseClient: import("@supabase/supabase-js").SupabaseClient;
}

function createDefaultDependencies(): DefaultDependencies {
  return {
    repository: repositoryModule as unknown as Record<string, Function>,
    auth: authModule as unknown as Record<string, Function>,
    crypto: crypto,
    supabaseUrl: conexaoModule.SUPABASE_URL,
    supabaseClient: conexaoModule.supabase,
  };
}

interface AdminDependencies {
  repository?: DefaultDependencies["repository"];
  auth?: DefaultDependencies["auth"];
  crypto?: typeof crypto;
  supabaseUrl?: string;
  supabaseClient?: DefaultDependencies["supabaseClient"];
}

interface AdminService {
  verificarAdmin: () => Promise<Usuario>;
  getDashboard: () => Promise<AdminDashboard>;
  getClientes: () => Promise<Usuario[]>;
  toggleCliente: (id: string) => Promise<Usuario>;
  getResumoCliente: (id: string) => Promise<{ lancamentos: Lancamento[]; orcamento: Orcamento[] }>;
  getTransacoesCliente: (id: string, mes?: string | number, ano?: string | number) => Promise<Lancamento[]>;
  getOrcamentoCliente: (id: string) => Promise<Orcamento[]>;
  getDashboardDadosCliente: (usuarioId: string, ano: string | number, mes?: string | number, categoria?: string) => Promise<DashboardDadosResult>;
  getAnosDisponiveisCliente: (usuarioId: string) => Promise<number[]>;
  getContasCliente: (id: string) => Promise<Conta[]>;
  resetSenha: (id: string) => Promise<{ success: boolean; message: string; redefinidoPor: string }>;
  getChamados: () => Promise<(Chamado & { usuario_nome: string; usuario_email: string })[]>;
  responderChamado: (id: string, msg: string) => Promise<Chamado>;
  updateChamado: (id: string, status: string) => Promise<Chamado>;
  createChamado: (payload: Record<string, unknown>) => Promise<Chamado>;
  getAuditoria: (filtros?: FiltrosAuditoria) => Promise<Auditoria[]>;
  criarUsuario: (nome: string, email: string, senha: string) => Promise<unknown>;
}

function buildAdminService(dependencies: AdminDependencies = {}): AdminService {
  let defaultDeps: DefaultDependencies | null = null;
  function getDefaultDeps(): DefaultDependencies {
    if (!defaultDeps) {
      defaultDeps = createDefaultDependencies();
    }
    return defaultDeps;
  }

  const deps = {
    repository: dependencies.repository || getDefaultDeps().repository,
    auth: dependencies.auth || getDefaultDeps().auth,
    crypto: dependencies.crypto || crypto,
    supabaseUrl: dependencies.supabaseUrl || getDefaultDeps().supabaseUrl,
    supabaseClient: dependencies.supabaseClient || getDefaultDeps().supabaseClient,
  };

  async function verificarAdmin(): Promise<Usuario> {
    const usuario = await deps.auth.verificarSessao();

    if (usuario.role !== "admin") {
      throw createAdminError("UNAUTHORIZED");
    }

    return usuario;
  }

  async function getDashboard(): Promise<AdminDashboard> {
    await verificarAdmin();
    return await deps.repository.getAdminDashboard();
  }

  async function getClientes(): Promise<Usuario[]> {
    await verificarAdmin();
    return await deps.repository.getClientes();
  }

  async function toggleCliente(id: string): Promise<Usuario> {
    const admin = await verificarAdmin();
    validarUUID(id);
    const result = await deps.repository.toggleClienteStatus(id);
    await deps.repository
      .logAuditoria(admin.id, "ADMIN_TOGGLE_USUARIO", {
        entidade: "usuarios",
        entidade_id: id,
        dados_novos: { ativo: result.ativo },
        contexto: "admin",
      })
      .catch((err: unknown) => logger.error("admin", "toggleClienteStatus auditoria falhou", err));
    return result;
  }

  async function getResumoCliente(id: string): Promise<{ lancamentos: Lancamento[]; orcamento: Orcamento[] }> {
    await verificarAdmin();
    validarUUID(id);
    return await deps.repository.getResumoCliente(id);
  }

  async function getTransacoesCliente(id: string, mes?: string | number, ano?: string | number): Promise<Lancamento[]> {
    await verificarAdmin();
    validarUUID(id);
    return await deps.repository.getTransacoesCliente(id, mes, ano);
  }

  async function getOrcamentoCliente(id: string): Promise<Orcamento[]> {
    await verificarAdmin();
    validarUUID(id);
    return await deps.repository.getOrcamento(undefined, id);
  }

  async function getDashboardDadosCliente(usuarioId: string, ano: string | number, mes?: string | number, categoria?: string): Promise<DashboardDadosResult> {
    await verificarAdmin();
    validarUUID(usuarioId);
    return await deps.repository.getDashboardDados(ano, mes, categoria, usuarioId);
  }

  async function getAnosDisponiveisCliente(usuarioId: string): Promise<number[]> {
    await verificarAdmin();
    validarUUID(usuarioId);
    return await deps.repository.getAnosDisponiveis(usuarioId);
  }

  async function getContasCliente(id: string): Promise<Conta[]> {
    await verificarAdmin();
    validarUUID(id);
    return await deps.repository.getContas(id);
  }

  async function resetSenha(id: string): Promise<{ success: boolean; message: string; redefinidoPor: string }> {
    const admin = await verificarAdmin();
    validarUUID(id);
    const usuario = await deps.repository.getPerfil(id);

    if (!usuario) {
      throw createAdminError("USUARIO_NAO_ENCONTRADO");
    }

    await deps.auth.solicitarRecuperacao(usuario.email);

    await deps.repository
      .logAuditoria(admin.id, "ADMIN_RESET_SENHA", {
        entidade: "usuarios",
        entidade_id: id,
        dados_novos: { email: usuario.email },
        contexto: "admin",
      })
      .catch((err: unknown) => logger.error("admin", "resetSenha auditoria falhou", err));

    return { success: true, message: "Email de recuperação enviado", redefinidoPor: admin.id };
  }

  async function getChamados(): Promise<(Chamado & { usuario_nome: string; usuario_email: string })[]> {
    await verificarAdmin();
    const chamados = await deps.repository.getChamados(undefined);
    return (chamados as (Chamado & { usuario?: { nome: string; email: string } | null })[]).map((c) => ({
      id: c.id,
      usuario_id: c.usuario_id,
      usuario_nome: c.usuario?.nome || "—",
      usuario_email: c.usuario?.email || "—",
      titulo: c.titulo,
      descricao: c.descricao,
      respostas: c.respostas || [],
      status: c.status,
      criado_em: c.criado_em,
      atualizado_em: c.atualizado_em,
    })) as (Chamado & { usuario_nome: string; usuario_email: string })[];
  }

  async function responderChamado(id: string, msg: string): Promise<Chamado> {
    const admin = await verificarAdmin();
    validarUUID(id);

    const chamado = await deps.repository.getChamadoById(id);

    const novaResposta = {
      admin_id: admin.id,
      admin_nome: admin.nome,
      mensagem: msg,
      criado_em: new Date().toISOString(),
    };

    const respostasAtuais = Array.isArray(chamado.respostas) ? chamado.respostas : [];
    const respostasAtualizadas = [...respostasAtuais, novaResposta];

    await deps.repository.updateChamado(id, {
      respostas: respostasAtualizadas,
      status: "em_andamento",
    });

    return await deps.repository.getChamadoById(id);
  }

  async function updateChamado(id: string, status: string): Promise<Chamado> {
    await verificarAdmin();
    validarUUID(id);
    return await deps.repository.updateChamado(id, { status });
  }

  async function createChamado(payload: Record<string, unknown>): Promise<Chamado> {
    await verificarAdmin();
    return await deps.repository.createChamado(payload);
  }

  async function getAuditoria(filtros: FiltrosAuditoria = {}): Promise<Auditoria[]> {
    await verificarAdmin();
    return await deps.repository.getAuditoria(filtros);
  }

  async function criarUsuario(nome: string, email: string, senha: string): Promise<unknown> {
    await verificarAdmin();

    if (!nome || !email || !senha) {
      throw createAdminError("DADOS_INCOMPLETOS");
    }

    const { data: sessionData } = await deps.supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;

    const response = await fetch(`${deps.supabaseUrl}/functions/v1/criar-usuario`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nome, email, senha }),
    });

    const result = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      throw createAdminError((result.error as string) || "ERRO_CRIAR_USUARIO");
    }

    return result;
  }

  return {
    verificarAdmin,
    getDashboard,
    getClientes,
    toggleCliente,
    getResumoCliente,
    getTransacoesCliente,
    getOrcamentoCliente,
    getDashboardDadosCliente,
    getAnosDisponiveisCliente,
    getContasCliente,
    resetSenha,
    getChamados,
    responderChamado,
    updateChamado,
    createChamado,
    getAuditoria,
    criarUsuario,
  };
}

const defaultService = buildAdminService();

export { defaultService as createAdminService, buildAdminService, AdminError };
export const {
  verificarAdmin,
  getDashboard,
  getClientes,
  toggleCliente,
  getResumoCliente,
  getTransacoesCliente,
  getOrcamentoCliente,
  getDashboardDadosCliente,
  getAnosDisponiveisCliente,
  getContasCliente,
  resetSenha,
  getChamados,
  responderChamado,
  updateChamado,
  createChamado,
  getAuditoria,
  criarUsuario,
} = defaultService;
