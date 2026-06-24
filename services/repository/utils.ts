import type {
  Usuario,
  Categoria,
  Subcategoria,
  Conta,
  Pessoa,
  Lancamento,
  Orcamento,
  Chamado,
  Auditoria,
  DashboardData,
  DashboardDadosResult,
  AuthResult,
  AdminDashboard,
  Sessao,
  CriarCategoriaPayload,
  CriarSubcategoriaPayload,
  CriarContaPayload,
  CriarPessoaPayload,
  CriarLancamentoPayload,
  CriarTransferenciaPayload,
  UpdatePerfilPayload,
  ImportarOrcamentoItem,
  FiltrosAuditoria,
} from "../../src/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase, supabaseAdmin, SUPABASE_URL } from "../conexao";
import * as logger from "../logger";

let supabase: SupabaseClient = defaultSupabase;
let supabaseAdminInstance: SupabaseClient | null = supabaseAdmin;

function __setSupabase(mockClient: SupabaseClient): void {
  supabase = mockClient;
}

function __setSupabaseAdmin(mockClient: SupabaseClient): void {
  supabaseAdminInstance = mockClient;
}

async function _getCurrentAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    logger.warn("repository", "_getCurrentAccessToken falhou ao obter sessão");
    return null;
  }
}

function _parseEdgeFunctionResult(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

async function _callEdgeFunction(functionName: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const token = await _getCurrentAccessToken();
  if (!token) {
    throw new Error("[repository] token de sessão ausente para Edge Function");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let body: Record<string, unknown> | null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    logger.warn("repository", "_callEdgeFunction falha ao parsear JSON da resposta");
    body = null;
  }

  if (!response.ok) {
    const message = (body && (body.error || (body.message as string))) || response.statusText || "FALHA_EDGE_FUNCTION";
    throw new Error(message as string);
  }

  if (body && body.error) {
    throw new Error(body.error as string);
  }

  return body;
}

async function setAuthSession(accessToken: string, refreshToken: string): Promise<void> {
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

async function limparSessaoAuth(): Promise<void> {
  await supabase.auth.signOut();
}

function adicionarFiltroUsuario(query: any, usuarioId: string | null | undefined): any {
  if (usuarioId) {
    return query.eq("usuario_id", usuarioId);
  }

  return query;
}

function adicionarFiltroTipoPessoaRestrito(query: any, tipoPessoa?: string): any {
  if (tipoPessoa) {
    return query.eq("tipo_pessoa", tipoPessoa);
  }
  return query;
}

function adicionarFiltroCategoriaTipoPessoa(query: any, tipoPessoa?: string): any {
  if (!tipoPessoa) {
    return query;
  }
  return query.or(`tipo_pessoa.is.null,tipo_pessoa.eq.${tipoPessoa}`);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarUUID(valor: string): void {
  if (!UUID_REGEX.test(valor)) {
    throw new Error("ID inválido.");
  }
}

const MES_REGEX = /^\d{4}(-\d{2})?$/;

function validarMes(mes: string): void {
  if (!MES_REGEX.test(mes)) {
    throw new Error("Mês inválido.");
  }
}

function normalizarNome(str?: string): string {
  if (!str) return "";
  const s = str.trim();
  if (s.length === 0) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export {
  supabase,
  supabaseAdminInstance,
  __setSupabase,
  __setSupabaseAdmin,
  _getCurrentAccessToken,
  _parseEdgeFunctionResult,
  _callEdgeFunction,
  setAuthSession,
  limparSessaoAuth,
  adicionarFiltroUsuario,
  adicionarFiltroTipoPessoaRestrito,
  adicionarFiltroCategoriaTipoPessoa,
  validarUUID,
  validarMes,
  normalizarNome,
};
