import type { Lancamento, Orcamento, Chamado, AdminDashboard, Usuario } from "../../src/types";
import * as logger from "../logger";
import {
  supabase, supabaseAdminInstance, _callEdgeFunction, _parseEdgeFunctionResult,
  _marcarPendente, descriptografar,
} from "./utils";

async function getAdminDashboard(): Promise<AdminDashboard> {
  const anoCorrente = new Date().getFullYear();
  const { data: lancamentos, error: err1 } = await supabase.from("financas_lancamentos").select("tipo, valor, status").gte("data", `${anoCorrente}-01-01`).lte("data", `${anoCorrente}-12-31`);

  if (err1) throw err1;

  const { count: totalUsuariosAtivos, error: err2 } = await supabase.from("financas_usuarios").select("id", { count: "exact", head: true }).eq("ativo", true);

  if (err2) throw err2;

  const receitas = (lancamentos || []).filter((l: Record<string, unknown>) => l.tipo === "RECEITA" && l.status === "PAGO" && !l.transferencia_grupo_id).reduce((s: number, l: Record<string, unknown>) => s + Number(l.valor), 0);

  const despesas = (lancamentos || []).filter((l: Record<string, unknown>) => l.tipo === "DESPESA" && l.status === "PAGO" && !l.transferencia_grupo_id).reduce((s: number, l: Record<string, unknown>) => s + Number(l.valor), 0);

  return {
    totalReceitas: receitas,
    totalDespesas: despesas,
    saldo: receitas - despesas,
    totalUsuariosAtivos: totalUsuariosAtivos || 0,
  };
}

async function getTransacoesCliente(usuarioId: string, mes?: string | number, ano?: string | number): Promise<Lancamento[]> {
  let query = supabase
    .from("financas_lancamentos")
    .select("*, categoria:financas_categorias(nome), subcategoria:financas_subcategorias(nome)")
    .eq("usuario_id", usuarioId)
    .order("data", { ascending: false }) as any;

  if (ano) {
    const mesStr = mes ? String(mes).padStart(2, "0") : null;
    if (mesStr) {
      query = query.gte("data", `${ano}-${mesStr}-01`).lte("data", `${ano}-${mesStr}-31`);
    } else {
      query = query.gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getChamadoById(id: string): Promise<Chamado> {
  const { data, error } = await supabase.from("financas_chamados").select("*, usuario:financas_usuarios(nome, email)").eq("id", id).single();

  if (error) throw error;
  return data;
}

async function getChamados(usuarioId?: string): Promise<Chamado[]> {
  let query = supabase.from("financas_chamados").select("*, usuario:financas_usuarios(nome, email)").order("criado_em", { ascending: false }).limit(1000) as any;

  if (usuarioId) {
    query = query.eq("usuario_id", usuarioId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function createChamado(payload: Record<string, unknown>): Promise<Chamado> {
  const { data, error } = await supabase
    .from("financas_chamados")
    .insert({ ...payload, respostas: [] })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateChamado(id: string, patch: Record<string, unknown>): Promise<Chamado> {
  const { data, error } = await supabase.from("financas_chamados").update(patch).eq("id", id).select().single();

  if (error) throw error;
  return data;
}

async function getClientes(): Promise<Usuario[]> {
  const { data, error } = await supabase.from("financas_usuarios").select("id, nome, email, role, ativo, criado_em, email_recuperacao").order("criado_em", { ascending: false }).limit(5000);

  if (error) throw error;

  const result = data as (Usuario & { email_recuperacao?: string })[];

  for (const c of result) {
    c.email_recuperacao = descriptografar(c.email_recuperacao);
  }

  const { data: logins, error: err2 } = await supabase.from("financas_auditoria").select("usuario_id, criado_em").eq("acao", "LOGIN").order("criado_em", { ascending: false });

  if (!err2 && logins) {
    const ultimoLoginMap: Record<string, string> = {};
    for (const l of logins) {
      if (!ultimoLoginMap[l.usuario_id]) {
        ultimoLoginMap[l.usuario_id] = l.criado_em;
      }
    }
    for (const c of result) {
      c.ultimo_login = ultimoLoginMap[c.id] || null;
    }
  }

  return result;
}

async function getResumoCliente(usuarioId: string): Promise<{ lancamentos: Lancamento[]; orcamento: Orcamento[] }> {
  const { data: lancamentos, error: err1 } = await supabase.from("financas_lancamentos").select("tipo, valor, status, data").eq("usuario_id", usuarioId);

  if (err1) throw err1;

  const { data: orcamento, error: err2 } = await supabase.from("financas_orcamento").select("tipo, valor_planejado, valor_realizado").eq("usuario_id", usuarioId);

  if (err2) throw err2;

  return { lancamentos: (lancamentos || []) as unknown as Lancamento[], orcamento: (orcamento || []) as unknown as Orcamento[] };
}

async function revokeUserSessions(usuarioId: string): Promise<void> {
  try {
    await _callEdgeFunction("revoke-user-sessions", { usuarioId });
  } catch (err) {
    const error = err as Error;
    logger.warn("repository", "revokeUserSessions edge function falhou, fallback para supabaseAdmin", error);
    if (!supabaseAdminInstance) return;
    const { error: rpcError } = await (supabaseAdminInstance.auth.admin as any).signOut(usuarioId);
    if (rpcError) logger.error("repository", "Erro ao revogar sessões", rpcError);
  }
}

async function toggleClienteStatus(id: string): Promise<Usuario> {
  const { data: current } = await supabase.from("financas_usuarios").select("ativo").eq("id", id).single();

  if (!current) throw new Error("USUARIO_NAO_ENCONTRADO");

  const novoAtivo = !current.ativo;
  const { data, error } = await supabase.from("financas_usuarios").update({ ativo: novoAtivo }).eq("id", id).select("id, nome, email, role, ativo, criado_em").single();

  if (error) throw error;

  if (!novoAtivo) {
    await revokeUserSessions(id).catch((err: unknown) => logger.error("repository", "revokeUserSessions falhou", err));
  }

  return data;
}

export {
  getAdminDashboard,
  getTransacoesCliente,
  getChamadoById,
  getChamados,
  createChamado,
  updateChamado,
  getClientes,
  getResumoCliente,
  toggleClienteStatus,
  revokeUserSessions,
};
