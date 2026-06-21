import type { Usuario, Lancamento, Sessao, UpdatePerfilPayload } from "../../src/types";
import * as logger from "../logger";
import { supabase, supabaseAdminInstance, _callEdgeFunction, _parseEdgeFunctionResult, normalizarNome } from "./utils";
import { logAuditoria } from "./auditoria";

async function getPerfil(usuarioId: string): Promise<Usuario | null> {
  const { data, error } = await supabase.from("financas_usuarios").select("id, nome, email, avatar_url, role").eq("id", usuarioId).single();

  if (error) throw error;
  return data as Usuario | null;
}

async function updatePerfil(usuarioId: string, payload: UpdatePerfilPayload): Promise<Usuario | null> {
  const allowedFields: Record<string, unknown> = {};
  if (payload.nome !== undefined) {
    const nomeNormalizado = normalizarNome(payload.nome);
    if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
      throw new Error("Nome deve ter entre 2 e 40 caracteres");
    }
    allowedFields.nome = nomeNormalizado;
  }
  if (payload.email !== undefined) allowedFields.email = payload.email;
  if (payload.avatar_url !== undefined) allowedFields.avatar_url = payload.avatar_url;

  const { data, error } = await supabase.from("financas_usuarios").update(allowedFields).eq("id", usuarioId).select("id, nome, email, avatar_url, role").single();

  if (error) throw error;
  return data as Usuario | null;
}

async function getSessoes(usuarioId: string): Promise<Sessao[]> {
  try {
    const result = await _callEdgeFunction("get-user-sessions", { usuarioId });
    const data = _parseEdgeFunctionResult(result) as Record<string, unknown>[];
    return (data || []).map((s) => ({
      id: s.id as string,
      user_agent: s.user_agent as string | undefined,
      ip: s.ip as string | undefined,
      criado_em: s.created_at as string | undefined,
    }));
  } catch (err) {
    const error = err as Error;
    logger.warn("repository", "getSessoes edge function falhou, fallback para supabaseAdmin", error);
    if (!supabaseAdminInstance) return [];
    const { data, error: rpcError } = await supabaseAdminInstance.rpc("get_user_sessions", {
      p_user_id: usuarioId,
    });
    if (rpcError) throw rpcError;
    return (data || []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      user_agent: s.user_agent as string | undefined,
      ip: s.ip as string | undefined,
      criado_em: s.created_at as string | undefined,
    }));
  }
}

async function deleteSessao(sessaoId: string): Promise<{ success: boolean }> {
  if (!sessaoId) {
    throw new Error("SESSAO_ID_AUSENTE");
  }
  try {
    await _callEdgeFunction("delete-user-session", { p_session_id: sessaoId });
    return { success: true };
  } catch (err) {
    if (!supabaseAdminInstance) throw err;
    const { error } = await supabaseAdminInstance.rpc("delete_user_session", {
      p_session_id: sessaoId,
    });
    if (error) throw error;
    return { success: true };
  }
}

async function exportarDados(usuarioId: string): Promise<{ lancamentos: Lancamento[] }> {
  const { data: lancamentos, error: err1 } = await supabase
    .from("financas_lancamentos")
    .select(
      "*, categoria:financas_categorias(nome), subcategoria:financas_subcategorias(nome), conta_origem:financas_contas!conta_origem_id(nome), conta_destino:financas_contas!conta_destino_id(nome), pessoa:financas_pessoas(nome)",
    )
    .eq("usuario_id", usuarioId)
    .order("data", { ascending: false });

  if (err1) throw err1;

  await logAuditoria(usuarioId, "DADOS_EXPORTADOS", {
    entidade: "auth",
    dados_novos: { totalLancamentos: lancamentos.length },
  }).catch((err: unknown) => logger.error("repository", "auditoria DADOS_EXPORTADOS falhou", err));

  return { lancamentos };
}

async function excluirConta(): Promise<{ success: boolean }> {
  const { error } = await supabase.rpc("excluir_conta");
  if (error) throw error;
  return { success: true };
}

async function revokeOtherSessions(): Promise<unknown> {
  try {
    const result = await _callEdgeFunction("revoke-other-sessions", {});
    return result;
  } catch (err) {
    logger.warn("repository", "revokeOtherSessions edge function falhou", err);
    throw err;
  }
}

export { getPerfil, updatePerfil, getSessoes, deleteSessao, exportarDados, excluirConta, revokeOtherSessions };
