import type { Pessoa, CriarPessoaPayload } from "../../src/types";
import crypto from "crypto";
import * as logger from "../logger";
import {
  supabase,
  adicionarFiltroUsuario,
  adicionarFiltroTipoPessoaRestrito,
  normalizarNome,
} from "./utils";

async function getPessoas(usuarioId?: string, tipoPessoa?: string): Promise<Pessoa[]> {
  try {
    let query = supabase.from("financas_pessoas").select("*").order("nome") as any;
    query = adicionarFiltroUsuario(query, usuarioId);
    query = adicionarFiltroTipoPessoaRestrito(query, tipoPessoa);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    logger.warn("repository", "getPessoas Supabase indisponível", err);
  }

  return [];
}

async function criarPessoa(usuarioId: string, payload: CriarPessoaPayload): Promise<Pessoa> {
  const nomeNormalizado = normalizarNome(payload.nome);
  if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
    throw new Error("Nome deve ter entre 2 e 40 caracteres");
  }

  const id = crypto.randomUUID();
  const insertPayload: Record<string, unknown> = { id, nome: nomeNormalizado, usuario_id: usuarioId, tipo_pessoa: payload.tipo_pessoa ?? "PF" };
  const { data, error } = await supabase.from("financas_pessoas").insert(insertPayload).select().single();

  if (error) throw error;

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

  const { data, error } = await supabase.from("financas_pessoas").update(allowedFields).eq("id", id).select().single();

  if (error) throw error;

  return data;
}

async function deletarPessoa(usuarioId: string, id: string): Promise<{ success: boolean }> {
  const { count, error: errCheck } = await supabase.from("financas_lancamentos").select("id", { count: "exact", head: true }).eq("pessoa_id", id);

  if (errCheck) throw errCheck;

  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: existem lançamentos vinculados a esta pessoa.");
  }

  let query = supabase.from("financas_pessoas").delete().eq("id", id) as any;
  query = adicionarFiltroUsuario(query, usuarioId);
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

export { getPessoas, criarPessoa, updatePessoa, deletarPessoa };
