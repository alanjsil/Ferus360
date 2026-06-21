import type {
  Usuario, Categoria, Subcategoria, Conta, Pessoa,
  Lancamento, Orcamento, Chamado, Auditoria,
  DashboardData, DashboardDadosResult, AuthResult,
  AdminDashboard, Sessao, CreateCategoriaPayload,
  CreateSubcategoriaPayload, createContaPayload,
  createPessoaPayload, CreateLancamentoPayload,
  CreateTransferenciaPayload, UpdatePerfilPayload,
  ImportarOrcamentoItem, FiltrosAuditoria,
} from "../../src/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase, supabaseAdmin, SUPABASE_URL } from "../conexao";
import * as database from "../database";
import * as logger from "../logger";

let supabase: SupabaseClient = defaultSupabase;
let supabaseAdminInstance: SupabaseClient | null = supabaseAdmin;

function __setSupabase(mockClient: SupabaseClient): void {
  supabase = mockClient;
}

function __setSupabaseAdmin(mockClient: SupabaseClient): void {
  supabaseAdminInstance = mockClient;
}

function __setDatabase(mockDb: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (database as any).__setDb && (database as any).__setDb(mockDb);
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
    body = await response.json() as Record<string, unknown>;
  } catch {
    logger.warn("repository", "_callEdgeFunction falha ao parsear JSON da resposta");
    body = null;
  }

  if (!response.ok) {
    const message = (body && (body.error || body.message as string)) || response.statusText || "FALHA_EDGE_FUNCTION";
    throw new Error(message as string);
  }

  if (body && body.error) {
    throw new Error(body.error as string);
  }

  return body;
}

function _cols(c: string[]): string {
  return c.join(", ");
}

function _placeholders(c: string[]): string {
  return c.map((k) => "@" + k).join(", ");
}

function _assignments(c: string[]): string {
  return c.map((k) => k + " = @" + k).join(", ");
}

function _excluirMetadados(cols: string[]): string[] {
  return cols.filter((k) => !["sync_status", "sync_error", "local_updated_at", "remote_updated_at", "deleted_at"].includes(k));
}

function _paraSQLite(registro: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!registro) return null;
  const r = { ...registro };
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "boolean") {
      r[k] = v ? 1 : 0;
    } else if (v !== null && v !== undefined && typeof v === "object") {
      r[k] = JSON.stringify(v);
    }
  }
  return r;
}

function _doSQLite(registro: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!registro) return null;
  const r = { ...registro };
  if (r.ativo === 0 || r.ativo === 1) r.ativo = !!r.ativo;
  if (r.eh_global === 0 || r.eh_global === 1) r.eh_global = !!r.eh_global;
  if (r.recorrente === 0 || r.recorrente === 1) r.recorrente = !!r.recorrente;
  return r;
}

function _inserirLocal(entidade: string, dados: Record<string, unknown>, syncStatus = "pending"): void {
  try {
    const d = _paraSQLite({ ...dados, sync_status: syncStatus, local_updated_at: new Date().toISOString() }) as Record<string, unknown>;
    const colunas = _excluirMetadados(Object.keys(d));
    colunas.push("sync_status", "local_updated_at");
    database.run(`INSERT OR REPLACE INTO ${entidade} (${_cols(colunas)}) VALUES (${_placeholders(colunas)})`, d);
  } catch (err) {
    logger.error("repository", `Erro ao inserir local em ${entidade}`, err);
  }
}

function _atualizarLocal(entidade: string, id: string, dados: Record<string, unknown>): void {
  try {
    const d = _paraSQLite({ ...dados, local_updated_at: new Date().toISOString() }) as Record<string, unknown>;
    const colunas = _excluirMetadados(Object.keys(d)).filter((k) => k !== "id");
    colunas.push("local_updated_at");
    database.run(`UPDATE ${entidade} SET ${_assignments(colunas)} WHERE id = @id`, { ...d, id });
  } catch (err) {
    logger.error("repository", `Erro ao atualizar local em ${entidade}`, err);
  }
}

function _popularCache(entidade: string, dados: Record<string, unknown> | Record<string, unknown>[]): void {
  if (!Array.isArray(dados)) dados = [dados];
  for (const item of dados) {
    _inserirLocal(entidade, item, "synced");
  }
  _limparCacheEviccao(entidade);
}

const DIAS_RETER_SOFT_DELETED = 30;
const DIAS_RETER_CONFLITOS_RESOLVIDOS = 7;
const MAX_REGISTROS_AUDITORIA = 1000;
const MESES_RETER_LANCAMENTOS = 6;

function _limparCacheEviccao(entidade: string): void {
  try {
    if (entidade !== "financas_auditoria") {
      database.run(`DELETE FROM ${entidade} WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-${DIAS_RETER_SOFT_DELETED} days')`);
    }

    if (entidade === "financas_lancamentos") {
      database.run(
        `DELETE FROM financas_lancamentos WHERE sync_status NOT IN ('pending', 'failed') AND data < datetime('now', '-${MESES_RETER_LANCAMENTOS} months')`,
      );
    }

    if (entidade === "financas_auditoria") {
      database.run(
        `DELETE FROM financas_auditoria WHERE id NOT IN (SELECT id FROM financas_auditoria ORDER BY criado_em DESC LIMIT ${MAX_REGISTROS_AUDITORIA})`,
      );
    }
  } catch (err) {
    logger.error("repository", `Erro na evicção de cache para ${entidade}`, err);
  }
}

function limparCacheGeral(): void {
  const entidades = [
    "financas_categorias", "financas_subcategorias", "financas_contas",
    "financas_pessoas", "financas_lancamentos", "financas_orcamento",
    "financas_chamados", "financas_auditoria",
  ];
  for (const entidade of entidades) {
    _limparCacheEviccao(entidade);
  }
  try {
    database.run(`DELETE FROM sync_conflicts WHERE resolvido_em IS NOT NULL AND resolvido_em < datetime('now', '-${DIAS_RETER_CONFLITOS_RESOLVIDOS} days')`);
  } catch (err) {
    logger.error("repository", "Erro na evicção de sync_conflicts", err);
  }
}

function _marcarPendente(entidade: string, id: string): void {
  try {
    database.run(`UPDATE ${entidade} SET sync_status = 'pending', version = version + 1, local_updated_at = datetime('now') WHERE id = ?`, id);
  } catch {
    /* ignore */
  }
}

function _syncAposEscrita(entidade: string, dados: Record<string, unknown>): void {
  if (!database.getDb()) return;
  _inserirLocal(entidade, dados, "pending");
}

async function setAuthSession(accessToken: string, refreshToken: string): Promise<void> {
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

async function clearAuthSession(): Promise<void> {
  await supabase.auth.signOut();
}

function addUsuarioFilter(query: any, usuarioId: string | null | undefined): any {
  if (usuarioId) {
    return query.eq("usuario_id", usuarioId);
  }

  return query;
}

function addTipoPessoaFilterStrict(query: any, tipoPessoa?: string): any {
  if (tipoPessoa) {
    return query.eq("tipo_pessoa", tipoPessoa);
  }
  return query;
}

function addTipoPessoaCategoriaFilter(query: any, tipoPessoa?: string, compartilhar?: boolean): any {
  if (compartilhar || !tipoPessoa) {
    return query;
  }
  return query.or(`tipo_pessoa.is.null,tipo_pessoa.eq.${tipoPessoa}`);
}

function addTipoPessoaWhere(where: string, params: Record<string, unknown>, tipoPessoa?: string, permitirNulo = false): { where: string; params: Record<string, unknown> } {
  if (!tipoPessoa) return { where, params };
  if (permitirNulo) {
    return {
      where: `${where} AND (tipo_pessoa IS NULL OR tipo_pessoa = @tipoPessoaAtivo)`,
      params: { ...params, tipoPessoaAtivo: tipoPessoa },
    };
  }
  return {
    where: `${where} AND tipo_pessoa = @tipoPessoaAtivo`,
    params: { ...params, tipoPessoaAtivo: tipoPessoa },
  };
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
  __setDatabase,
  _getCurrentAccessToken,
  _parseEdgeFunctionResult,
  _callEdgeFunction,
  _cols,
  _placeholders,
  _assignments,
  _excluirMetadados,
  _paraSQLite,
  _doSQLite,
  _inserirLocal,
  _atualizarLocal,
  _popularCache,
  _limparCacheEviccao,
  limparCacheGeral,
  _marcarPendente,
  _syncAposEscrita,
  setAuthSession,
  clearAuthSession,
  addUsuarioFilter,
  addTipoPessoaFilterStrict,
  addTipoPessoaCategoriaFilter,
  addTipoPessoaWhere,
  validarUUID,
  validarMes,
  normalizarNome,
};
