import type { Auditoria, FiltrosAuditoria } from "../../src/types";
import crypto from "crypto";
import * as database from "../database";
import * as logger from "../logger";
import { supabase, supabaseAdminInstance, _doSQLite, _syncAposEscrita, _marcarPendente, _inserirLocal } from "./utils";

async function getAuditoria(filtros: FiltrosAuditoria = {}): Promise<Auditoria[]> {
  if (database.getDb() && !filtros.usuarioId && !filtros.acao) {
    try {
      const data = database.query("SELECT * FROM financas_auditoria ORDER BY criado_em DESC LIMIT ?", { limite: filtros.limite || 100 }).map((r) => _doSQLite(r));
      if (data.length > 0) return data as unknown as Auditoria[];
    } catch {
      logger.warn("repository", "getAuditoria cache local indisponível, fallback");
    }
  }

  let query = supabase.from("financas_auditoria").select("*, usuario:financas_usuarios(nome, email)").order("criado_em", { ascending: false }) as any;

  if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
  if (filtros.acao) query = query.eq("acao", filtros.acao);
  if (filtros.entidade) query = query.eq("entidade", filtros.entidade);
  if (filtros.de) query = query.gte("criado_em", filtros.de);
  if (filtros.ate) query = query.lte("criado_em", filtros.ate);
  if (filtros.limite) query = query.limit(filtros.limite);
  else query = query.limit(100);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function logAuditoria(
  usuarioId: string | null,
  acao: string,
  metadados: {
    entidade?: string;
    entidade_id?: string;
    dados_anteriores?: unknown;
    dados_novos?: unknown;
    ip?: string | null;
    user_agent?: string | null;
    contexto?: string;
    device_id?: string | null;
  } = {},
): Promise<Auditoria> {
  const id = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    id,
    usuario_id: usuarioId,
    acao,
    entidade: metadados.entidade || "auth",
    entidade_id: metadados.entidade_id || null,
    dados_anteriores: metadados.dados_anteriores || null,
    dados_novos: metadados.dados_novos || null,
    ip: metadados.ip || null,
    user_agent: metadados.user_agent || null,
    contexto: metadados.contexto || "user",
    device_id: metadados.device_id || null,
  };

  _syncAposEscrita("financas_auditoria", payload);

  const insertPayload = {
    usuario_id: usuarioId,
    acao,
    entidade: metadados.entidade || "auth",
    entidade_id: metadados.entidade_id || null,
    dados_anteriores: metadados.dados_anteriores || null,
    dados_novos: metadados.dados_novos || null,
    ip: metadados.ip || null,
    user_agent: metadados.user_agent || null,
    contexto: metadados.contexto || "user",
  };

  let result = await supabase.from("financas_auditoria").insert(insertPayload).select().single();

  if (result.error && supabaseAdminInstance) {
    logger.warn("repository", "logAuditoria: fallback para supabaseAdmin", result.error);
    try {
      result = await supabaseAdminInstance.from("financas_auditoria").insert(insertPayload).select().single();
    } catch (fallbackErr) {
      logger.error("repository", "logAuditoria: fallback supabaseAdmin também falhou", fallbackErr);
    }
  }

  if (result.error) {
    _marcarPendente("financas_auditoria", id);
    throw result.error;
  }

  _inserirLocal("financas_auditoria", { ...result.data, device_id: metadados.device_id }, "synced");
  return result.data;
}

export { getAuditoria, logAuditoria };
