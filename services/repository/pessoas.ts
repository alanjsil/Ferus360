import type { Pessoa, createPessoaPayload } from "../../src/types";
import crypto from "crypto";
import * as database from "../database";
import * as logger from "../logger";
import {
  supabase, _doSQLite, _popularCache, _atualizarLocal, _syncAposEscrita,
  _marcarPendente, _inserirLocal,
  addUsuarioFilter, normalizarNome,
} from "./utils";

async function getPessoas(usuarioId?: string): Promise<Pessoa[]> {
  if (database.getDb()) {
    try {
      const data = database.query("SELECT * FROM financas_pessoas WHERE deleted_at IS NULL ORDER BY nome").map((r) => _doSQLite(r));
      if (data.length > 0) return data as unknown as Pessoa[];
    } catch {
      logger.warn("repository", "getPessoas cache local indisponível, fallback");
    }
  }

  let query = supabase.from("financas_pessoas").select("*").order("nome") as any;
  query = addUsuarioFilter(query, usuarioId);

  const { data, error } = await query;
  if (error) throw error;
  _popularCache("financas_pessoas", data as unknown as Record<string, unknown>[]);
  return data;
}

async function createPessoa(usuarioId: string, payload: createPessoaPayload): Promise<Pessoa> {
  const nomeNormalizado = normalizarNome(payload.nome);
  if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
    throw new Error("Nome deve ter entre 2 e 40 caracteres");
  }

  const id = crypto.randomUUID();
  const insertPayload = { id, nome: nomeNormalizado, usuario_id: usuarioId };
  _syncAposEscrita("financas_pessoas", insertPayload);

  const { data, error } = await supabase.from("financas_pessoas").insert(insertPayload).select().single();

  if (error) {
    _marcarPendente("financas_pessoas", id);
    throw error;
  }

  _inserirLocal("financas_pessoas", data as unknown as Record<string, unknown>, "synced");
  return data;
}

async function updatePessoa(id: string, patch: { nome?: string }): Promise<Pessoa | null> {
  const allowedFields: Record<string, unknown> = {};
  if (patch.nome !== undefined) {
    const nomeNormalizado = normalizarNome(patch.nome);
    if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
      throw new Error("Nome deve ter entre 2 e 40 caracteres");
    }
    allowedFields.nome = nomeNormalizado;
  }

  if (Object.keys(allowedFields).length === 0) return null;

  _atualizarLocal("financas_pessoas", id, { ...allowedFields, sync_status: "pending" });

  const { data, error } = await supabase.from("financas_pessoas").update(allowedFields).eq("id", id).select().single();

  if (error) {
    _marcarPendente("financas_pessoas", id);
    throw error;
  }

  _atualizarLocal("financas_pessoas", id, { ...data, sync_status: "synced" });
  return data;
}

async function deletePessoa(usuarioId: string, id: string): Promise<{ success: boolean }> {
  const { count, error: errCheck } = await supabase.from("financas_lancamentos").select("id", { count: "exact", head: true }).eq("pessoa_id", id);

  if (errCheck) throw errCheck;

  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: existem lançamentos vinculados a esta pessoa.");
  }

  database.run("UPDATE financas_pessoas SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ?", id);

  let query = supabase.from("financas_pessoas").delete().eq("id", id) as any;
  query = addUsuarioFilter(query, usuarioId);
  const { error } = await query;
  if (error) {
    _marcarPendente("financas_pessoas", id);
    throw error;
  }
  return { success: true };
}

export { getPessoas, createPessoa, updatePessoa, deletePessoa };
