import type { Categoria, Subcategoria, CriarCategoriaPayload, CriarSubcategoriaPayload } from "../../src/types";
import crypto from "crypto";
import * as logger from "../logger";
import {
  supabase,
  adicionarFiltroUsuario,
  adicionarFiltroCategoriaTipoPessoa,
  validarUUID,
  normalizarNome,
} from "./utils";
import { logAuditoria } from "./auditoria";

async function getCategorias(usuarioId?: string, tipo?: string, mostrarInativas = false, tipoPessoa?: string): Promise<Categoria[]> {
  function montarQueryBase() {
    let q = supabase.from("financas_categorias").select("*");
    if (!mostrarInativas) q = q.eq("ativo", true);
    if (tipo) q = q.eq("tipo", tipo);
    q = adicionarFiltroCategoriaTipoPessoa(q, tipoPessoa);
    return q;
  }

  try {
    let data: Categoria[];
    if (usuarioId) {
      validarUUID(usuarioId);
      const [globais, proprias] = await Promise.all([
        montarQueryBase().eq("eh_global", true).order("nome", { ascending: true }),
        montarQueryBase().eq("usuario_id", usuarioId).order("nome", { ascending: true }),
      ]);
      if (globais.error) throw globais.error;
      if (proprias.error) throw proprias.error;
      const map = new Map<string, Categoria>();
      for (const item of [...globais.data, ...proprias.data]) {
        map.set(item.id, item);
      }
      data = [...map.values()];
    } else {
      const res = await montarQueryBase().eq("eh_global", true).order("nome", { ascending: true });
      if (res.error) throw res.error;
      data = res.data;
    }

    return data;
  } catch (err) {
    logger.warn("repository", "getCategorias Supabase indisponível, fallback ao cache local", err);
  }

  return [];
}

async function criarCategoria(payload: CriarCategoriaPayload): Promise<Categoria> {
  const { nome, tipo, usuarioId, tipo_pessoa } = payload;
  const ehGlobal = payload.eh_global ?? payload.ehGlobal ?? false;

  const nomeNormalizado = normalizarNome(nome);
  if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
    throw new Error("Nome deve ter entre 2 e 40 caracteres");
  }

  const filterUsuarioId = ehGlobal ? null : usuarioId || null;

  const { data: activeExisting } = await supabase
    .from("financas_categorias")
    .select("id, ativo")
    .ilike("nome", nomeNormalizado)
    .eq("tipo", tipo)
    .eq("usuario_id", filterUsuarioId)
    .eq("ativo", true)
    .maybeSingle();

  if (activeExisting) {
    throw new Error("Já existe uma categoria ativa com este nome.");
  }

  const { data: inactiveExisting } = await supabase
    .from("financas_categorias")
    .select("id")
    .ilike("nome", nomeNormalizado)
    .eq("tipo", tipo)
    .eq("usuario_id", filterUsuarioId)
    .eq("ativo", false)
    .maybeSingle();

  if (inactiveExisting) {
    const { data, error } = await supabase.from("financas_categorias").update({ ativo: true, nome: nomeNormalizado }).eq("id", inactiveExisting.id).select().single();
    if (error) throw error;
    return data;
  }

  const id = crypto.randomUUID();
  const insertPayload: Record<string, unknown> = {
    id,
    nome: nomeNormalizado,
    tipo,
    usuario_id: ehGlobal ? null : usuarioId || null,
    eh_global: ehGlobal,
    ativo: true,
    tipo_pessoa: tipo_pessoa ?? null,
  };

  const { data, error } = await supabase.from("financas_categorias").insert(insertPayload).select().single();

  if (error) throw error;

  if (usuarioId) {
    logAuditoria(usuarioId, "CATEGORIA_CRIADA", { entidade: "categoria", entidade_id: data.id, dados_novos: { nome: nomeNormalizado, tipo } }).catch((err: unknown) =>
      logger.error("repository", "auditoria CATEGORIA_CRIADA falhou", err),
    );
  }
  return data;
}

async function updateCategoria(id: string, patch: { nome?: string; tipo?: string; tipo_pessoa?: string | null }, usuarioId?: string): Promise<Categoria | null> {
  const { data: cat } = await supabase.from("financas_categorias").select("eh_global").eq("id", id).single();
  if (!cat) throw new Error("Categoria não encontrada.");

  if (cat.eh_global) {
    const { data: user } = await supabase.from("financas_usuarios").select("role").eq("id", usuarioId).single();
    if (!user || user.role !== "admin") {
      throw new Error("Categorias globais só podem ser editadas por administradores.");
    }
  }

  const allowedFields: Record<string, unknown> = {};
  if (patch.nome !== undefined) {
    const nomeNormalizado = normalizarNome(patch.nome);
    if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
      throw new Error("Nome deve ter entre 2 e 40 caracteres");
    }
    allowedFields.nome = nomeNormalizado;
  }
  if (patch.tipo !== undefined) allowedFields.tipo = patch.tipo;
  if (patch.tipo_pessoa !== undefined) allowedFields.tipo_pessoa = patch.tipo_pessoa;

  if (Object.keys(allowedFields).length === 0) return null;

  const { data, error } = await supabase.from("financas_categorias").update(allowedFields).eq("id", id).select().single();

  if (error) throw error;

  return data;
}

async function toggleCategoriaAtivo(id: string, usuarioId?: string): Promise<Categoria> {
  const { data: cat } = await supabase.from("financas_categorias").select("eh_global, ativo").eq("id", id).single();
  if (!cat) throw new Error("Categoria não encontrada.");

  if (cat.eh_global) {
    const { data: user } = await supabase.from("financas_usuarios").select("role").eq("id", usuarioId).single();
    if (!user || user.role !== "admin") {
      throw new Error("Categorias globais só podem ser alteradas por administradores.");
    }
  }

  const { count, error: errCheck } = await supabase.from("financas_lancamentos").select("id", { count: "exact", head: true }).eq("categoria_id", id);

  if (errCheck) throw errCheck;

  if (count! && count! > 0) {
    throw new Error("Não é possível desativar: existem lançamentos vinculados a esta categoria.");
  }

  const novoAtivo = !cat.ativo;

  const { data, error } = await supabase.from("financas_categorias").update({ ativo: novoAtivo }).eq("id", id).select().single();

  if (error) throw error;

  return data;
}

async function toggleCategoriaUniversal(id: string, usuarioId?: string, tipoPessoaAtivo?: string): Promise<Categoria> {
  const { data: cat } = await supabase.from("financas_categorias").select("tipo_pessoa, eh_global").eq("id", id).single();
  if (!cat) throw new Error("Categoria não encontrada.");

  if (cat.eh_global) {
    const { data: user } = await supabase.from("financas_usuarios").select("role").eq("id", usuarioId).single();
    if (!user || user.role !== "admin") {
      throw new Error("Categorias globais só podem ser alteradas por administradores.");
    }
  }

  const novoTipoPessoa = cat.tipo_pessoa === null ? (tipoPessoaAtivo ?? null) : null;

  const { data, error } = await supabase.from("financas_categorias").update({ tipo_pessoa: novoTipoPessoa }).eq("id", id).select().single();

  if (error) throw error;

  const { error: errSub } = await supabase.from("financas_subcategorias").update({ tipo_pessoa: novoTipoPessoa }).eq("categoria_id", id);
  if (errSub) throw errSub;

  return data;
}

async function criarSubcategoria(usuarioId: string, payload: CriarSubcategoriaPayload): Promise<Subcategoria> {
  const { categoria_id, nome, tipo_pessoa } = payload;

  const nomeNormalizado = normalizarNome(nome);
  if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
    throw new Error("Nome deve ter entre 2 e 40 caracteres");
  }

  const { data: existing } = await supabase.from("financas_subcategorias").select("id").eq("categoria_id", categoria_id).eq("usuario_id", usuarioId).ilike("nome", nomeNormalizado).maybeSingle();

  if (existing) {
    throw new Error("Já existe uma subcategoria com este nome.");
  }

  const id = crypto.randomUUID();
  const insertPayload = { id, categoria_id, nome: nomeNormalizado, usuario_id: usuarioId, tipo_pessoa: tipo_pessoa ?? null };
  const { data, error } = await supabase.from("financas_subcategorias").insert(insertPayload).select().single();

  if (error) throw error;

  return data;
}

async function updateSubcategoria(id: string, patch: { nome?: string }): Promise<Subcategoria | null> {
  const allowedFields: Record<string, unknown> = {};
  if (patch.nome !== undefined) {
    const nomeNormalizado = normalizarNome(patch.nome);
    if (nomeNormalizado.length < 2 || nomeNormalizado.length > 40) {
      throw new Error("Nome deve ter entre 2 e 40 caracteres");
    }
    allowedFields.nome = nomeNormalizado;
  }

  if (Object.keys(allowedFields).length === 0) return null;

  const { data, error } = await supabase.from("financas_subcategorias").update(allowedFields).eq("id", id).select();

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Subcategoria não encontrada.");

  return data[0];
}

async function getSubcategorias(usuarioId?: string, categoriaId?: string, tipoPessoa?: string): Promise<Subcategoria[]> {
  try {
    let query = supabase.from("financas_subcategorias").select("*").order("nome") as any;

    query = adicionarFiltroUsuario(query, usuarioId);
    query = adicionarFiltroCategoriaTipoPessoa(query, tipoPessoa);

    if (categoriaId) {
      query = query.eq("categoria_id", categoriaId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    logger.warn("repository", "getSubcategorias Supabase indisponível", err);
  }

  return [];
}

async function deletarSubcategoria(id: string): Promise<{ success: boolean }> {
  const { count, error: errCheck } = await supabase.from("financas_lancamentos").select("id", { count: "exact", head: true }).eq("subcategoria_id", id);

  if (errCheck) throw errCheck;

  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: existem lançamentos vinculados a esta subcategoria.");
  }

  const { error } = await supabase.from("financas_subcategorias").delete().eq("id", id);

  if (error) throw error;
  return { success: true };
}

export { getCategorias, criarCategoria, updateCategoria, toggleCategoriaAtivo, toggleCategoriaUniversal, getSubcategorias, criarSubcategoria, updateSubcategoria, deletarSubcategoria };
