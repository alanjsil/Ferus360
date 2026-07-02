import crypto from "crypto";
import type { CriarLancamentoPayload, CriarTransferenciaPayload, DashboardDadosResult, DashboardData, FiltrosLancamento, ImportarOrcamentoItem, Lancamento, Orcamento, PaginaLancamentos } from "../../src/types";
import * as logger from "../logger";
import { logAuditoria } from "./auditoria";
import { adicionarFiltroTipoPessoaRestrito, adicionarFiltroUsuario, supabase, validarMes } from "./utils";

async function getLancamentosPaginado(filtros: FiltrosLancamento): Promise<PaginaLancamentos> {
  const limite = Math.min(filtros.limite ?? 50, 100);
  const limiteMaisUm = limite + 1;

  let countQuery = supabase.from("financas_lancamentos")
    .select("id", { count: "exact", head: true }) as any;
  countQuery = adicionarFiltroUsuario(countQuery, filtros.usuarioId);
  countQuery = adicionarFiltroTipoPessoaRestrito(countQuery, filtros.tipoPessoa);
  if (filtros.mes) countQuery = countQuery.like("data_busca", `${filtros.mes}%`);
  if (filtros.tipo) countQuery = countQuery.eq("tipo", filtros.tipo);
  if (filtros.status) countQuery = countQuery.eq("status", filtros.status);

  let query = supabase.from("financas_lancamentos")
    .select("*")
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false })
    .order("id", { ascending: true })
    .limit(limiteMaisUm) as any;

  query = adicionarFiltroUsuario(query, filtros.usuarioId);
  query = adicionarFiltroTipoPessoaRestrito(query, filtros.tipoPessoa);
  if (filtros.mes) query = query.like("data_busca", `${filtros.mes}%`);
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
  if (filtros.status) query = query.eq("status", filtros.status);

  if (filtros.cursor) {
    query = query.or(
      `data.lt.${filtros.cursor.data},` +
      `and(data.eq.${filtros.cursor.data},criado_em.lt.${filtros.cursor.criado_em}),` +
      `and(data.eq.${filtros.cursor.data},criado_em.eq.${filtros.cursor.criado_em},id.gt.${filtros.cursor.id})`
    );
  }

  const [{ count }, { data, error }] = await Promise.all([countQuery, query]);
  if (error) throw error;

  const registros = (data as Lancamento[]).slice(0, limite);
  const temMais = data.length > limite;

  const ultimo = registros.length > 0 ? registros[registros.length - 1] : null;
  return {
    data: registros,
    cursor: temMais && ultimo && ultimo.criado_em
      ? { data: ultimo.data, criado_em: ultimo.criado_em, id: ultimo.id }
      : null,
    total: count ?? 0,
    hasMore: temMais,
  };
}

async function getLancamentos(mes?: string, usuarioId?: string, tipoPessoa?: string): Promise<Lancamento[]> {
  let query = supabase.from("financas_lancamentos").select("*").order("data", { ascending: false }) as any;

  query = adicionarFiltroUsuario(query, usuarioId);
  query = adicionarFiltroTipoPessoaRestrito(query, tipoPessoa);

  if (mes) {
    validarMes(mes);
    query = query.like("data_busca", `${mes}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data;
}

async function getOrcamento(mes?: string, usuarioId?: string, tipoPessoa?: string): Promise<Orcamento[]> {
  let query = supabase.from("financas_orcamento").select("*").order("data", { ascending: true }) as any;

  query = adicionarFiltroUsuario(query, usuarioId);
  query = adicionarFiltroTipoPessoaRestrito(query, tipoPessoa);

  if (mes) {
    validarMes(mes);
    query = query.like("data_busca", `${mes}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getAnosDisponiveis(usuarioId?: string, tipoPessoa?: string): Promise<number[]> {
  let lancamentosQuery = supabase.from("financas_lancamentos").select("data") as any;
  lancamentosQuery = adicionarFiltroUsuario(lancamentosQuery, usuarioId);
  lancamentosQuery = adicionarFiltroTipoPessoaRestrito(lancamentosQuery, tipoPessoa);

  let orcamentoQuery = supabase.from("financas_orcamento").select("data") as any;
  orcamentoQuery = adicionarFiltroUsuario(orcamentoQuery, usuarioId);
  orcamentoQuery = adicionarFiltroTipoPessoaRestrito(orcamentoQuery, tipoPessoa);

  const [{ data: lancamentos, error: errorL }, { data: orcamentos, error: errorO }] = await Promise.all([lancamentosQuery, orcamentoQuery]);

  if (errorL) throw errorL;
  if (errorO) throw errorO;

  const anos = new Set<number>();
  (lancamentos || []).forEach((item: Record<string, string>) => anos.add(Number(item.data.substring(0, 4))));
  (orcamentos || []).forEach((item: Record<string, string>) => anos.add(Number(item.data.substring(0, 4))));

  return [...anos].sort((a, b) => b - a);
}

async function getDashboardDados(ano: string | number, mes?: string | number, categoria?: string, usuarioId?: string, tipoPessoa?: string): Promise<DashboardDadosResult> {
  let lancamentosQuery = supabase
    .from("financas_lancamentos")
    .select("*, categoria:financas_categorias (nome), subcategoria:financas_subcategorias (nome)")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
    .eq("status", "PAGO") as any;

  let orcamentoQuery = supabase
    .from("financas_orcamento")
    .select("*, categoria:financas_categorias (nome), subcategoria:financas_subcategorias (nome)")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`) as any;

  lancamentosQuery = adicionarFiltroUsuario(lancamentosQuery, usuarioId);
  lancamentosQuery = adicionarFiltroTipoPessoaRestrito(lancamentosQuery, tipoPessoa);
  orcamentoQuery = adicionarFiltroUsuario(orcamentoQuery, usuarioId);
  orcamentoQuery = adicionarFiltroTipoPessoaRestrito(orcamentoQuery, tipoPessoa);

  if (mes && mes !== "all") {
    const mesFormatado = mes.toString().padStart(2, "0");
    lancamentosQuery = lancamentosQuery.like("data_busca", `${ano}-${mesFormatado}%`);
    orcamentoQuery = orcamentoQuery.eq("mes", typeof mes === "number" ? mes : parseInt(mes));
  }

  if (categoria && categoria !== "all") {
    lancamentosQuery = lancamentosQuery.eq("categoria_id", categoria);
  }

  lancamentosQuery = lancamentosQuery.order("data", { ascending: true });
  orcamentoQuery = orcamentoQuery.order("data", { ascending: true });

  const [{ data: lancamentos, error: errorLancamentos }, { data: orcamentos, error: errorOrcamentos }] = await Promise.all([lancamentosQuery, orcamentoQuery]);

  if (errorLancamentos) {
    const msg = `[${errorLancamentos.code || "??"}] ${errorLancamentos.message || "sem mensagem"}${errorLancamentos.details ? " — " + errorLancamentos.details : ""}`;
    logger.error("repository", `Supabase lancamentos: ${msg}`);
    throw new Error(msg);
  }
  if (errorOrcamentos) {
    const msg = `[${errorOrcamentos.code || "??"}] ${errorOrcamentos.message || "sem mensagem"}${errorOrcamentos.details ? " — " + errorOrcamentos.details : ""}`;
    logger.error("repository", `Supabase orçamentos: ${msg}`);
    throw new Error(msg);
  }

  return {
    lancamentos: (lancamentos || []) as unknown as Lancamento[],
    orcamentos: (orcamentos || []) as unknown as Orcamento[],
    totalLancamentos: (lancamentos || []).length,
    totalOrcamentos: (orcamentos || []).length,
  };
}

async function getDashboard(mes?: string, usuarioId?: string, tipoPessoa?: string): Promise<DashboardData> {
  let orcamentoSP = supabase.from("financas_orcamento").select("*") as any;
  orcamentoSP = adicionarFiltroUsuario(orcamentoSP, usuarioId);
  orcamentoSP = adicionarFiltroTipoPessoaRestrito(orcamentoSP, tipoPessoa);

  if (mes) {
    validarMes(mes);
    orcamentoSP = orcamentoSP.like("data_busca", `${mes}%`);
  }
  const { data: orcamento, error } = (await orcamentoSP) as { data: Orcamento[] | null; error: unknown };
  if (error) throw error;

  let financasSP = supabase.from("financas_lancamentos").select("*").eq("status", "PAGO") as any;
  financasSP = adicionarFiltroUsuario(financasSP, usuarioId);
  financasSP = adicionarFiltroTipoPessoaRestrito(financasSP, tipoPessoa);

  if (mes) {
    validarMes(mes);
    financasSP = financasSP.like("data_busca", `${mes}%`);
  }
  const { data: realizados, error: errorRealizados } = (await financasSP) as { data: Lancamento[] | null; error: unknown };
  if (errorRealizados) throw errorRealizados;

  const totais = {
    receitas_planejadas: 0,
    receitas_realizadas: 0,
    despesas_planejadas: 0,
    despesas_realizadas: 0,
  };

  (orcamento || []).forEach((item: Orcamento) => {
    if (item.tipo === "RECEITA") {
      totais.receitas_planejadas += Number(item.valor_planejado);
    } else {
      totais.despesas_planejadas += Number(item.valor_planejado);
    }
  });

  (realizados || []).forEach((item: Lancamento) => {
    if (item.tipo === "RECEITA" && !item.transferencia_grupo_id) {
      totais.receitas_realizadas += Number(item.valor);
    } else if (item.tipo === "DESPESA" && !item.transferencia_grupo_id) {
      totais.despesas_realizadas += Number(item.valor);
    }
  });

  return { totais, orcamento: orcamento || [], realizados: realizados || [] };
}

const TIPOS_LANCAMENTO_VALIDOS = ["RECEITA", "DESPESA", "TRANSFERENCIA"];
const STATUS_LANCAMENTO_VALIDOS = ["PAGO", "PENDENTE", "CANCELADO"];

function validarPayloadLancamento(payload: { data?: string; tipo?: string; valor?: unknown; descricao?: string; status?: string }): void {
  if (!payload.data) {
    throw new Error("Data é obrigatória.");
  }
  if (!payload.tipo || !TIPOS_LANCAMENTO_VALIDOS.includes(payload.tipo.toUpperCase())) {
    throw new Error("Tipo inválido. Use RECEITA, DESPESA ou TRANSFERENCIA.");
  }
  const valor = Number(payload.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("Valor deve ser um número positivo.");
  }
  if (payload.descricao && payload.descricao.length > 500) {
    throw new Error("Descrição deve ter no máximo 500 caracteres.");
  }
  if (payload.status && !STATUS_LANCAMENTO_VALIDOS.includes(payload.status.toUpperCase())) {
    throw new Error("Status inválido. Use PAGO, PENDENTE ou CANCELADO.");
  }
}

async function criarLancamento(payload: CriarLancamentoPayload, usuarioId?: string, ip?: string, userAgent?: string): Promise<Lancamento> {
  validarPayloadLancamento(payload);
  const payloadNormalizado = {
    ...payload,
    tipo: payload.tipo.toUpperCase(),
    status: payload.status ? payload.status.toUpperCase() : payload.status,
  };
  const hoje = new Date().toISOString();
  const insertPayload: Record<string, unknown> = payloadNormalizado.status === "PAGO" ? { ...payloadNormalizado, data_pagamento: hoje } : { ...payloadNormalizado };
  if (usuarioId) insertPayload.usuario_id = usuarioId;
  if (!insertPayload.id) insertPayload.id = crypto.randomUUID();
  if (!insertPayload.tipo_pessoa) insertPayload.tipo_pessoa = "PF";

  const { data, error } = await supabase.from("financas_lancamentos").insert(insertPayload).select().single();

  if (error) throw error;

  if (usuarioId) {
    logAuditoria(usuarioId, "LANCAMENTO_CRIADO", {
      entidade: "lancamento",
      entidade_id: insertPayload.id as string,
      dados_novos: { tipo: payloadNormalizado.tipo, valor: payloadNormalizado.valor },
      ip: ip || null,
      user_agent: userAgent || null,
    }).catch((err: unknown) => logger.error("repository", "auditoria LANCAMENTO_CRIADO falhou", err));
  }
  return data;
}

async function deletarLancamento(id: string, usuarioId?: string, ip?: string, userAgent?: string): Promise<{ success: boolean }> {
  let query = supabase.from("financas_lancamentos").delete().eq("id", id) as any;
  query = adicionarFiltroUsuario(query, usuarioId);
  const { error } = await query;
  if (error) throw error;
  if (usuarioId) {
    logAuditoria(usuarioId, "LANCAMENTO_EXCLUIDO", {
      entidade: "lancamento",
      entidade_id: id,
      dados_novos: { id },
      ip: ip || null,
      user_agent: userAgent || null,
    }).catch((err: unknown) => logger.error("repository", "auditoria LANCAMENTO_EXCLUIDO falhou", err));
  }
  return { success: true };
}

async function updateLancamento(id: string, payload: Partial<CriarLancamentoPayload>, usuarioId?: string, ip?: string, userAgent?: string): Promise<Lancamento> {
  const hoje = new Date().toISOString();
  const updateData: Record<string, unknown> = payload.status === "PAGO" ? { ...payload, data_pagamento: hoje } : { ...payload };

  let query = supabase.from("financas_lancamentos").update(updateData).eq("id", id) as any;
  query = adicionarFiltroUsuario(query, usuarioId);
  const { data, error } = await query.select().single();

  if (error) throw error;

  if (usuarioId) {
    logAuditoria(usuarioId, "LANCAMENTO_ATUALIZADO", {
      entidade: "lancamento",
      entidade_id: id,
      dados_novos: updateData as Record<string, unknown>,
      ip: ip || null,
      user_agent: userAgent || null,
    }).catch((err: unknown) => logger.error("repository", "auditoria LANCAMENTO_ATUALIZADO falhou", err));
  }

  return data;
}

async function criarTransferencia(payload: CriarTransferenciaPayload, usuarioId?: string, ip?: string, userAgent?: string): Promise<Lancamento[]> {
  const grupoId = crypto.randomUUID();

  const base: Record<string, unknown> = {
    data: payload.data,
    status: payload.status,
    valor: payload.valor,
    categoria_id: payload.categoria_id,
    subcategoria_id: payload.subcategoria_id,
    pessoa_id: payload.pessoa_id || null,
    descricao: payload.descricao || null,
    transferencia_grupo_id: grupoId,
    tipo_pessoa: payload.tipo_pessoa || "PF",
  };

  const debito: Record<string, unknown> = {
    ...base,
    tipo: "DESPESA",
    conta_origem_id: payload.conta_origem_id || null,
    conta_destino_id: null,
  };

  const credito: Record<string, unknown> = {
    ...base,
    tipo: "RECEITA",
    conta_origem_id: null,
    conta_destino_id: payload.conta_destino_id || null,
  };

  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();
  const debitoFinal: Record<string, unknown> = { id: id1, ...debito, usuario_id: usuarioId || null };
  const creditoFinal: Record<string, unknown> = { id: id2, ...credito, usuario_id: usuarioId || null };

  const { data: data1, error: err1 } = await supabase.from("financas_lancamentos").insert(debitoFinal).select().single();

  if (err1) throw err1;

  const { data: data2, error: err2 } = await supabase.from("financas_lancamentos").insert(creditoFinal).select().single();

  if (err2) throw err2;

  if (usuarioId) {
    logAuditoria(usuarioId, "TRANSFERENCIA_CRIADA", {
      entidade: "transferencia",
      entidade_id: grupoId,
      dados_novos: { valor: payload.valor, data: payload.data },
      ip: ip || null,
      user_agent: userAgent || null,
    }).catch((err: unknown) => logger.error("repository", "auditoria TRANSFERENCIA_CRIADA falhou", err));
  }

  return [data1, data2];
}

async function deletarTransferencia(grupoId: string, usuarioId?: string, ip?: string, userAgent?: string): Promise<{ success: boolean }> {
  let query = supabase.from("financas_lancamentos").delete().eq("transferencia_grupo_id", grupoId) as any;
  query = adicionarFiltroUsuario(query, usuarioId);
  const { error } = await query;
  if (error) throw error;
  if (usuarioId) {
    logAuditoria(usuarioId, "TRANSFERENCIA_EXCLUIDA", {
      entidade: "transferencia",
      entidade_id: grupoId,
      dados_novos: { transferencia_grupo_id: grupoId },
      ip: ip || null,
      user_agent: userAgent || null,
    }).catch((err: unknown) => logger.error("repository", "auditoria TRANSFERENCIA_EXCLUIDA falhou", err));
  }
  return { success: true };
}

async function updateTransferencia(grupoId: string, payload: Partial<CriarTransferenciaPayload>, usuarioId?: string, ip?: string, userAgent?: string): Promise<Lancamento[]> {
  const hoje = new Date().toISOString();
  const updateData: Record<string, unknown> = payload.status === "PAGO" ? { data_pagamento: hoje } : {};

  const baseUpdate: Record<string, unknown> = {
    data: payload.data,
    status: payload.status,
    valor: payload.valor,
    categoria_id: payload.categoria_id,
    subcategoria_id: payload.subcategoria_id,
    pessoa_id: payload.pessoa_id || null,
    descricao: payload.descricao || null,
    ...updateData,
  };

  const { data: existing } = await supabase.from("financas_lancamentos").select("id, tipo, conta_origem_id, conta_destino_id").eq("transferencia_grupo_id", grupoId);

  if (!existing || existing.length === 0) {
    throw new Error("Transferência não encontrada.");
  }

  for (const entry of existing) {
    const patch: Record<string, unknown> = { ...baseUpdate };
    if (entry.tipo === "DESPESA") {
      patch.conta_origem_id = payload.conta_origem_id || null;
      patch.conta_destino_id = null;
    } else {
      patch.conta_origem_id = null;
      patch.conta_destino_id = payload.conta_destino_id || null;
    }

    let q = supabase.from("financas_lancamentos").update(patch).eq("id", entry.id) as any;
    q = adicionarFiltroUsuario(q, usuarioId);
    const { error } = await q;
    if (error) throw error;
  }

  const { data: updated } = await supabase.from("financas_lancamentos").select("*").eq("transferencia_grupo_id", grupoId);

  if (usuarioId) {
    logAuditoria(usuarioId, "TRANSFERENCIA_ATUALIZADA", {
      entidade: "transferencia",
      entidade_id: grupoId,
      dados_novos: baseUpdate as Record<string, unknown>,
      ip: ip || null,
      user_agent: userAgent || null,
    }).catch((err: unknown) => logger.error("repository", "auditoria TRANSFERENCIA_ATUALIZADA falhou", err));
  }

  return (updated || []) as unknown as Lancamento[];
}

async function importarOrcamento(itens: ImportarOrcamentoItem[], usuarioId?: string): Promise<{ success: boolean; data: Orcamento[]; importados: number }> {
  if (!itens || !Array.isArray(itens)) {
    throw new Error("Array de itens é obrigatório");
  }

  const itensProcessados = itens.map((item) => ({
    data: item.data,
    tipo: item.tipo,
    descricao: item.descricao || null,
    valor_planejado: parseFloat(String(item.valor_planejado)) || 0,
    valor_realizado: parseFloat(String(item.valor_realizado)) || 0,
    categoria_id: item.categoria_id || null,
    subcategoria_id: item.subcategoria_id || null,
    conta_id: item.conta_id || null,
    pessoa_id: item.pessoa_id || null,
    usuario_id: usuarioId || item.usuario_id || null,
    recorrente: item.recorrente === true || item.recorrente === "true",
    observacoes: item.observacoes || null,
    tipo_pessoa: item.tipo_pessoa || "PF",
    id: item.id || crypto.randomUUID(),
  }));

  const { data, error } = await supabase.from("financas_orcamento").insert(itensProcessados).select();

  if (error) throw error;

  return { success: true, data, importados: data.length };
}

export {
  criarLancamento,
  criarTransferencia,
  deletarLancamento,
  deletarTransferencia,
  getAnosDisponiveis,
  getDashboard,
  getDashboardDados,
  getLancamentos,
  getLancamentosPaginado,
  getOrcamento,
  importarOrcamento,
  updateLancamento,
  updateTransferencia,
};
