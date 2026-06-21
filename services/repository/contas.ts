import type { Conta, CriarContaPayload } from "../../src/types";
import crypto from "crypto";
import * as database from "../database";
import * as logger from "../logger";
import {
  supabase, _doSQLite, _popularCache, _atualizarLocal, _syncAposEscrita,
  _marcarPendente, _inserirLocal,
  adicionarFiltroUsuario, adicionarFiltroTipoPessoaRestrito, adicionarWhereTipoPessoa,
  validarUUID, normalizarNome,
} from "./utils";

async function getContas(usuarioId?: string, tipoPessoa?: string): Promise<Conta[]> {
  if (database.getDb()) {
    try {
      let where = "deleted_at IS NULL";
      const params: Record<string, unknown> = {};
      if (usuarioId) {
        where += " AND usuario_id = @usuarioId";
        params.usuarioId = usuarioId;
      }
      const r = adicionarWhereTipoPessoa(where, params, tipoPessoa);
      const data = database.query(`SELECT * FROM financas_contas WHERE ${r.where} ORDER BY nome`, r.params).map((r2) => _doSQLite(r2));
      if (data.length > 0) return data as unknown as Conta[];
    } catch {
      logger.warn("repository", "getContas cache local indisponível, fallback");
    }
  }

  let query = supabase.from("financas_contas").select("*").order("nome") as any;

  query = adicionarFiltroUsuario(query, usuarioId);
  query = adicionarFiltroTipoPessoaRestrito(query, tipoPessoa);

  const { data, error } = await query;
  if (error) throw error;
  _popularCache("financas_contas", data as unknown as Record<string, unknown>[]);
  return data;
}

async function criarConta(usuarioId: string, payload: CriarContaPayload): Promise<Conta> {
  const nomeNormalizado = normalizarNome(payload.nome);
  if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
    throw new Error("Nome deve ter entre 2 e 40 caracteres");
  }

  const id = crypto.randomUUID();
  const insertPayload: Record<string, unknown> = { id, nome: nomeNormalizado, usuario_id: usuarioId, tipo_pessoa: payload.tipo_pessoa ?? "PF" };
  _syncAposEscrita("financas_contas", insertPayload);

  const { data, error } = await supabase.from("financas_contas").insert(insertPayload).select().single();

  if (error) {
    _marcarPendente("financas_contas", id);
    throw error;
  }

  _inserirLocal("financas_contas", data as unknown as Record<string, unknown>, "synced");
  return data;
}

async function updateConta(id: string, patch: { nome?: string }): Promise<Conta | null> {
  const allowedFields: Record<string, unknown> = {};
  if (patch.nome !== undefined) {
    const nomeNormalizado = normalizarNome(patch.nome);
    if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
      throw new Error("Nome deve ter entre 2 e 40 caracteres");
    }
    allowedFields.nome = nomeNormalizado;
  }

  if (Object.keys(allowedFields).length === 0) return null;

  _atualizarLocal("financas_contas", id, { ...allowedFields, sync_status: "pending" });

  const { data, error } = await supabase.from("financas_contas").update(allowedFields).eq("id", id).select().single();

  if (error) {
    _marcarPendente("financas_contas", id);
    throw error;
  }

  _atualizarLocal("financas_contas", id, { ...data, sync_status: "synced" });
  return data;
}

async function deletarConta(usuarioId: string, id: string): Promise<{ success: boolean }> {
  validarUUID(id);
  const [origem, destino] = await Promise.all([
    supabase.from("financas_lancamentos").select("id", { count: "exact", head: true }).eq("conta_origem_id", id),
    supabase.from("financas_lancamentos").select("id", { count: "exact", head: true }).eq("conta_destino_id", id),
  ]);

  if (origem.error) throw origem.error;
  if (destino.error) throw destino.error;

  const count = (origem.count || 0) + (destino.count || 0);

  if (count > 0) {
    throw new Error("Não é possível excluir: existem lançamentos vinculados a esta conta.");
  }

  database.run("UPDATE financas_contas SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ?", id);

  let query = supabase.from("financas_contas").delete().eq("id", id) as any;
  query = adicionarFiltroUsuario(query, usuarioId);
  const { error } = await query;
  if (error) {
    _marcarPendente("financas_contas", id);
    throw error;
  }
  return { success: true };
}

export { getContas, criarConta, updateConta, deletarConta };
