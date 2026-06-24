import type { Usuario, AuthResult } from "../src/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase as defaultSupabase, SUPABASE_URL, SUPABASE_ANON_KEY, createClient } from "./conexao";
import { setAuthSession, limparSessaoAuth, logAuditoria as logAuditoriaRepo } from "./repository";
import * as logger from "./logger";

interface RecTokens {
  accessToken: string;
  refreshToken: string;
}

interface MetadadosRequisicao {
  ip?: string;
  user_agent?: string;
}

let pendingRecoveryTokens: RecTokens | null = null;
let _recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let _recoveryExpiresAt: number | null = null;
let _onRecoveryExpired: (() => void) | null = null;
const TEMPO_EXPIRACAO_RECUPERACAO_MS = 5 * 60 * 1000;

class AuthError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "AuthError";
    this.code = code;
  }
}

function mapearErroSupabase(error: { message?: string } | null): string | null {
  if (!error) return null;
  const msg = error.message || "";
  if (msg.includes("Invalid login credentials")) return "CREDENCIAIS_INVALIDAS";
  if (msg.includes("Email not confirmed")) return "EMAIL_NAO_CONFIRMADO";
  if (msg.includes("rate limit")) return "RATE_LIMIT";
  if (msg.includes("Password should be")) return "SENHA_FRACA";
  if (msg.includes("JWT expired")) return "TOKEN_EXPIRADO";
  return "ERRO_INTERNO";
}

interface AuthDependencies {
  supabase?: SupabaseClient & { auth: any; from: any };
  createClient?: typeof createClient;
  onLogin?: (accessToken: string, refreshToken: string) => void;
  onLogout?: () => void;
  logAuditoria?: (usuarioId: string | null, acao: string, metadados?: Record<string, unknown>) => Promise<void>;
}

interface AuthService {
  login: (email: string, senha: string, metadados?: MetadadosRequisicao) => Promise<AuthResult>;
  logout: (metadados?: MetadadosRequisicao) => Promise<{ success: boolean }>;
  verificarToken: (token: string) => Promise<Usuario>;
  verificarSessao: () => Promise<Usuario>;
  trocarSenha: (usuarioId: string, senhaAtual: string, novaSenha: string, metadados?: MetadadosRequisicao) => Promise<{ success: boolean }>;
  solicitarRecuperacao: (email: string, metadados?: MetadadosRequisicao) => Promise<{ success: boolean }>;
  confirmarRecuperacao: (email: string, token: string, novaSenha: string, metadados?: MetadadosRequisicao) => Promise<{ success: boolean }>;
  redefinirSenha: (accessToken: string, refreshToken: string, novaSenha: string) => Promise<{ success: boolean }>;
  renovarSessao: (refreshToken: string) => Promise<AuthResult>;
  verificarSenha: (usuarioId: string, senha: string) => Promise<{ success: boolean }>;
  setRecoveryTokens: (accessToken: string, refreshToken: string, onExpired?: () => void) => void;
  getRecoveryTokens: () => RecTokens | null;
  temTokenRecuperacao: () => boolean;
  limparTokenRecuperacao: () => void;
  getTempoRestanteRecuperacao: () => number;
}

function construirAuthService(dependencies: AuthDependencies = {}): AuthService {
  const supabase = dependencies.supabase || defaultSupabase;
  const _createClient = dependencies.createClient || createClient;
  const onLogin = dependencies.onLogin || (() => {});
  const onLogout = dependencies.onLogout || (() => {});
  const _logAuditoria = dependencies.logAuditoria || (() => Promise.resolve());

  async function getPerfilById(userId: string): Promise<Usuario | null> {
    const { data, error } = await supabase.from("financas_usuarios").select("id, nome, email, role, ativo, usar_pj").eq("id", userId).single();
    if (error || !data) return null;
    return data as Usuario;
  }

  async function login(email: string, senha: string, metadados?: MetadadosRequisicao): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error) {
      await _logAuditoria(null, "LOGIN_FAILED", {
        dados_novos: { email },
        ip: metadados?.ip,
        user_agent: metadados?.user_agent,
      }).catch((err: unknown) => logger.error("auth", "auditoria LOGIN_FAILED falhou", err));
      throw new AuthError(mapearErroSupabase(error) || "CREDENCIAIS_INVALIDAS");
    }

    const perfil = await getPerfilById(data.user.id);
    if (!perfil || !perfil.ativo) {
      await supabase.auth.signOut();
      throw new AuthError("USUARIO_INATIVO");
    }

    await onLogin(data.session.access_token, data.session.refresh_token);

    await _logAuditoria(perfil.id, "LOGIN", {
      ip: metadados?.ip,
      user_agent: metadados?.user_agent,
    }).catch((err: unknown) => logger.error("auth", "auditoria LOGIN falhou", err));

    return {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      usuario: perfil,
    };
  }

  async function logout(metadados?: MetadadosRequisicao): Promise<{ success: boolean }> {
    let sessionResult: { data: { session: { user: { id: string } } | null } | null };
    try {
      sessionResult = await supabase.auth.getSession();
    } catch {
      sessionResult = { data: null };
    }
    const usuarioId = sessionResult?.data?.session?.user?.id;
    if (usuarioId) {
      await _logAuditoria(usuarioId, "LOGOUT", {
        ip: metadados?.ip,
        user_agent: metadados?.user_agent,
      }).catch((err: unknown) => logger.error("auth", "auditoria LOGOUT falhou", err));
    }
    await onLogout();
    await supabase.auth.signOut().catch((err: unknown) => logger.error("auth", "signOut falhou", err));
    return { success: true };
  }

  async function verificarToken(token: string): Promise<Usuario> {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw new AuthError("TOKEN_INVALIDO");

    const perfil = await getPerfilById(data.user.id);
    if (!perfil) throw new AuthError("USUARIO_NAO_ENCONTRADO");
    if (!perfil.ativo) throw new AuthError("USUARIO_INATIVO");
    return perfil;
  }

  async function trocarSenha(_usuarioId: string, senhaAtual: string, novaSenha: string, metadados?: MetadadosRequisicao): Promise<{ success: boolean }> {
    await verificarSenha(_usuarioId, senhaAtual);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) throw new AuthError(mapearErroSupabase(error) || "ERRO_INTERNO");
    await _logAuditoria(_usuarioId, "SENHA_TROCADA", {
      ip: metadados?.ip,
      user_agent: metadados?.user_agent,
    }).catch((err: unknown) => logger.error("auth", "auditoria SENHA_TROCADA falhou", err));
    return { success: true };
  }

  function setRecoveryTokens(accessToken: string, refreshToken: string, onExpired?: () => void): void {
    if (_recoveryTimer) clearTimeout(_recoveryTimer);
    pendingRecoveryTokens = { accessToken, refreshToken };
    _recoveryExpiresAt = Date.now() + TEMPO_EXPIRACAO_RECUPERACAO_MS;
    _onRecoveryExpired = onExpired || null;
    _recoveryTimer = setTimeout(() => {
      pendingRecoveryTokens = null;
      _recoveryExpiresAt = null;
      _recoveryTimer = null;
      if (_onRecoveryExpired) {
        _onRecoveryExpired();
        _onRecoveryExpired = null;
      }
    }, TEMPO_EXPIRACAO_RECUPERACAO_MS);
  }

  function getRecoveryTokens(): RecTokens | null {
    if (_recoveryTimer) {
      clearTimeout(_recoveryTimer);
      _recoveryTimer = null;
    }
    const tokens = pendingRecoveryTokens;
    pendingRecoveryTokens = null;
    return tokens;
  }

  function temTokenRecuperacao(): boolean {
    return pendingRecoveryTokens !== null;
  }

  function limparTokenRecuperacao(): void {
    if (_recoveryTimer) {
      clearTimeout(_recoveryTimer);
      _recoveryTimer = null;
    }
    pendingRecoveryTokens = null;
    _recoveryExpiresAt = null;
    _onRecoveryExpired = null;
  }

  function getTempoRestanteRecuperacao(): number {
    if (!pendingRecoveryTokens || _recoveryExpiresAt === null) return 0;
    return Math.max(0, _recoveryExpiresAt - Date.now());
  }

  async function solicitarRecuperacao(email: string, metadados?: MetadadosRequisicao): Promise<{ success: boolean }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "financasapp://recuperar-senha",
    });
    await _logAuditoria(null, "RECUPERACAO_SOLICITADA", {
      dados_novos: { email },
      ip: metadados?.ip,
      user_agent: metadados?.user_agent,
    }).catch((err: unknown) => logger.error("auth", "auditoria RECUPERACAO_SOLICITADA falhou", err));
    if (error && !error.message?.includes("rate limit")) {
      logger.error("auth", "Erro ao solicitar recuperação", error);
    }
    return { success: true };
  }

  async function confirmarRecuperacao(email: string, token: string, novaSenha: string, metadados?: MetadadosRequisicao): Promise<{ success: boolean }> {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });
    if (verifyError) throw new AuthError(mapearErroSupabase(verifyError) || "TOKEN_INVALIDO");

    const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha });
    if (updateError) throw new AuthError(mapearErroSupabase(updateError) || "ERRO_INTERNO");

    await _logAuditoria(null, "RECUPERACAO_CONFIRMADA", {
      dados_novos: { email },
      ip: metadados?.ip,
      user_agent: metadados?.user_agent,
    }).catch((err: unknown) => logger.error("auth", "auditoria RECUPERACAO_CONFIRMADA falhou", err));
    return { success: true };
  }

  async function redefinirSenha(accessToken: string, refreshToken: string, novaSenha: string): Promise<{ success: boolean }> {
    if (accessToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) throw new AuthError(mapearErroSupabase(error) || "ERRO_INTERNO");
    return { success: true };
  }

  async function verificarSessao(): Promise<Usuario> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw new AuthError("NAO_AUTENTICADO");
    const perfil = await getPerfilById(data.user.id);
    if (!perfil) throw new AuthError("USUARIO_NAO_ENCONTRADO");
    if (!perfil.ativo) throw new AuthError("USUARIO_INATIVO");
    return perfil;
  }

  async function renovarSessao(refreshToken: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error) throw new AuthError("TOKEN_EXPIRADO");
    if (!data?.user || !data?.session) throw new AuthError("USUARIO_INVALIDO");
    const usuario = await getPerfilById(data.user.id);
    if (!usuario || !usuario.ativo) throw new AuthError("USUARIO_INATIVO");
    return {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      usuario,
    };
  }

  async function verificarSenha(_usuarioId: string, senha: string): Promise<{ success: boolean }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email;
    if (!email) throw new AuthError("USUARIO_INVALIDO");

    const client = _createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await client.auth.signInWithPassword({
      email,
      password: senha,
    });

    await client.auth.signOut().catch(() => {});

    if (error) throw new AuthError("SENHA_INVALIDA");
    return { success: true };
  }

  return {
    login,
    logout,
    verificarToken,
    verificarSessao,
    trocarSenha,
    solicitarRecuperacao,
    confirmarRecuperacao,
    redefinirSenha,
    renovarSessao,
    verificarSenha,
    setRecoveryTokens,
    getRecoveryTokens,
    temTokenRecuperacao,
    limparTokenRecuperacao,
    getTempoRestanteRecuperacao,
  };
}

function construirAuthServicePadrao(): AuthService {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return construirAuthService({
      supabase: {
        auth: {
          signInWithPassword: () => Promise.reject(new Error("Auth default disabled in tests")),
          signOut: () => Promise.reject(new Error("Auth default disabled in tests")),
          getUser: (token: string) => (token ? Promise.reject(new Error("Auth default disabled in tests")) : Promise.reject(new Error("Auth default disabled in tests"))),
          updateUser: () => Promise.reject(new Error("Auth default disabled in tests")),
          resetPasswordForEmail: () => Promise.reject(new Error("Auth default disabled in tests")),
          refreshSession: () => Promise.reject(new Error("Auth default disabled in tests")),
          getSession: () => Promise.reject(new Error("Auth default disabled in tests")),
        },
        from: () => ({
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        }),
      } as unknown as SupabaseClient,
    });
  }

  return construirAuthService({
    onLogin: (accessToken: string, refreshToken: string) => {
      return setAuthSession(accessToken, refreshToken);
    },
    onLogout: () => {
      return limparSessaoAuth();
    },
    logAuditoria: async (usuarioId, acao, metadados) => {
      await logAuditoriaRepo(usuarioId, acao, metadados);
    },
  });
}

const defaultService = construirAuthServicePadrao();

export { defaultService as createAuthService, construirAuthService, AuthError };
export const {
  login,
  logout,
  verificarToken,
  verificarSessao,
  trocarSenha,
  solicitarRecuperacao,
  confirmarRecuperacao,
  redefinirSenha,
  renovarSessao,
  verificarSenha,
  setRecoveryTokens,
  getRecoveryTokens,
  temTokenRecuperacao,
  limparTokenRecuperacao,
  getTempoRestanteRecuperacao,
} = defaultService;
