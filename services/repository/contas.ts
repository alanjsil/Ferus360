import type { Conta, CriarContaPayload } from "../../src/types";
import crypto from "crypto";
import * as logger from "../logger";
import {
  supabase,
  adicionarFiltroUsuario,
  adicionarFiltroTipoPessoaRestrito,
  validarUUID,
  normalizarNome,
} from "./utils";

async function getContas(usuarioId?: string, tipoPessoa?: string): Promise<Conta[]> {
  try {
    let query = supabase.from("financas_contas").select("*").order("nome") as any;

    query = adicionarFiltroUsuario(query, usuarioId);
    query = adicionarFiltroTipoPessoaRestrito(query, tipoPessoa);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    logger.warn("repository", "getContas Supabase indisponível", err);
  }

  return [];
}

async function criarConta(usuarioId: string, payload: CriarContaPayload): Promise<Conta> {
  const nomeNormalizado = normalizarNome(payload.nome);
  if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
    throw new Error("Nome deve ter entre 2 e 40 caracteres");
  }

  const id = crypto.randomUUID();
  const insertPayload: Record<string, unknown> = { id, nome: nomeNormalizado, usuario_id: usuarioId, tipo_pessoa: payload.tipo_pessoa ?? "PF" };
  const { data, error } = await supabase.from("financas_contas").insert(insertPayload).select().single();

  if (error) throw error;

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

  const { data, error } = await supabase.from("financas_contas").update(allowedFields).eq("id", id).select().single();

  if (error) throw error;

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

  let query = supabase.from("financas_contas").delete().eq("id", id) as any;
  query = adicionarFiltroUsuario(query, usuarioId);
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

export { getContas, criarConta, updateConta, deletarConta };
