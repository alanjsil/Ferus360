import type { Lancamento, Orcamento, DashboardData, DashboardDadosResult, CreateLancamentoPayload, CreateTransferenciaPayload, ImportarOrcamentoItem } from "../../src/types";
import crypto from "crypto";
import * as database from "../database";
import * as logger from "../logger";
import {
  supabase, _doSQLite, _popularCache, _atualizarLocal, _syncAposEscrita,
  _marcarPendente, _inserirLocal,
  addUsuarioFilter, validarMes, validarUUID, normalizarNome,
} from "./utils";
import { logAuditoria } from "./auditoria";

async function getLancamentos(mes?: string, usuarioId?: string): Promise<Lancamento[]> {
  if (database.getDb()) {
    try {
      let where = "1=1";
      const params: Record<string, unknown> = {};
      if (mes) {
        where += " AND data_busca LIKE @mes";
        params.mes = mes + "%";
      }
      if (usuarioId) {
        where += " AND usuario_id = @usuarioId";
        params.usuarioId = usuarioId;
      }
      const data = database.query(`SELECT * FROM financas_lancamentos WHERE deleted_at IS NULL AND ${where} ORDER BY data DESC`, params).map((r) => _doSQLite(r));
      if (data.length > 0) return data as unknown as Lancamento[];
    } catch {
      logger.warn("repository", "getLancamentos cache local indisponível, fallback");
    }
  }

  let query = supabase.from("financas_lancamentos").select("*").order("data", { ascending: false }).limit(5000) as any;

  query = addUsuarioFilter(query, usuarioId);

  if (mes) {
    validarMes(mes);
    query = query.like("data_busca", `${mes}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  _popularCache("financas_lancamentos", data as unknown as Record<string, unknown>[]);
  return data;
}

async function getOrcamento(mes?: string, usuarioId?: string): Promise<Orcamento[]> {
  if (database.getDb()) {
    try {
      let where = "1=1";
      const params: Record<string, unknown> = {};
      if (mes) {
        where += " AND data_busca LIKE @mes";
        params.mes = mes + "%";
      }
      const data = database.query(`SELECT * FROM financas_orcamento WHERE deleted_at IS NULL AND ${where} ORDER BY data ASC`, params).map((r) => _doSQLite(r));
      if (data.length > 0) return data as unknown as Orcamento[];
    } catch {
      logger.warn("repository", "getOrcamento cache local indisponível, fallback");
    }
  }

  let query = supabase.from("financas_orcamento").select("*").order("data", { ascending: true }) as any;

  query = addUsuarioFilter(query, usuarioId);

  if (mes) {
    validarMes(mes);
    query = query.like("data_busca", `${mes}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  _popularCache("financas_orcamento", data as unknown as Record<string, unknown>[]);
  return data;
}

async function getAnosDisponiveis(usuarioId?: string): Promise<number[]> {
  if (database.getDb()) {
    try {
      const lancamentos = database.query("SELECT DISTINCT substr(data, 1, 4) as ano FROM financas_lancamentos WHERE deleted_at IS NULL").map((r: Record<string, unknown>) => Number(r.ano));
      const orcamentos = database.query("SELECT DISTINCT substr(data, 1, 4) as ano FROM financas_orcamento WHERE deleted_at IS NULL").map((r: Record<string, unknown>) => Number(r.ano));
      const anos = new Set([...lancamentos, ...orcamentos]);
      if (anos.size > 0) return [...anos].sort((a, b) => b - a);
    } catch {
      logger.warn("repository", "getAnosDisponiveis cache local indisponível, fallback");
    }
  }

  let lancamentosQuery = supabase.from("financas_lancamentos").select("data") as any;
  lancamentosQuery = addUsuarioFilter(lancamentosQuery, usuarioId);

  let orcamentoQuery = supabase.from("financas_orcamento").select("data") as any;
  orcamentoQuery = addUsuarioFilter(orcamentoQuery, usuarioId);

  const [{ data: lancamentos, error: errorL }, { data: orcamentos, error: errorO }] = await Promise.all([lancamentosQuery, orcamentoQuery]);

  if (errorL) throw errorL;
  if (errorO) throw errorO;

  const anos = new Set<number>();
  (lancamentos || []).forEach((item: Record<string, string>) => anos.add(Number(item.data.substring(0, 4))));
  (orcamentos || []).forEach((item: Record<string, string>) => anos.add(Number(item.data.substring(0, 4))));

  return [...anos].sort((a, b) => b - a);
}

async function getDashboardDados(ano: string | number, mes?: string | number, categoria?: string, usuarioId?: string): Promise<DashboardDadosResult> {
  if (database.getDb()) {
    try {
      let lWhere = "deleted_at IS NULL AND status = 'PAGO' AND data >= @anoInicio AND data <= @anoFim";
      const params: Record<string, unknown> = { anoInicio: `${ano}-01-01`, anoFim: `${ano}-12-31` };
      if (mes && mes !== "all") {
        const mesF = mes.toString().padStart(2, "0");
        lWhere += " AND data >= @mesInicio AND data <= @mesFim";
        params.mesInicio = `${ano}-${mesF}-01`;
        params.mesFim = `${ano}-${mesF}-31`;
      }
      if (categoria && categoria !== "all") {
        lWhere += " AND categoria_id = @categoria";
        params.categoria = categoria;
      }
      const lancamentos = database.query(`SELECT * FROM financas_lancamentos WHERE ${lWhere} ORDER BY data ASC`, params).map((r) => _doSQLite(r));

      let oWhere = "deleted_at IS NULL AND data >= @anoInicio AND data <= @anoFim";
      if (mes && mes !== "all") {
        oWhere += " AND mes = @mesN";
        params.mesN = parseInt(mes.toString());
      }
      const orcamentos = database.query(`SELECT * FROM financas_orcamento WHERE ${oWhere} ORDER BY data ASC`, params).map((r) => _doSQLite(r));

      if (lancamentos.length > 0 || orcamentos.length > 0) {
        return {
          lancamentos: lancamentos as unknown as Lancamento[],
          orcamentos: orcamentos as unknown as Orcamento[],
          totalLancamentos: lancamentos.length,
          totalOrcamentos: orcamentos?.length || 0,
        };
      }
    } catch {
      logger.warn("repository", "getDashboardDados cache local indisponível, fallback");
    }
  }

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

  lancamentosQuery = addUsuarioFilter(lancamentosQuery, usuarioId);
  orcamentoQuery = addUsuarioFilter(orcamentoQuery, usuarioId);

  if (mes && mes !== "all") {
    const mesFormatado = mes.toString().padStart(2, "0");
    lancamentosQuery = lancamentosQuery.gte("data", `${ano}-${mesFormatado}-01`).lte("data", `${ano}-${mesFormatado}-31`);
    orcamentoQuery = orcamentoQuery.eq("mes", typeof mes === "number" ? mes : parseInt(mes));
  }

  if (categoria && categoria !== "all") {
    lancamentosQuery = lancamentosQuery.eq("categoria_id", categoria);
  }

  lancamentosQuery = lancamentosQuery.order("data", { ascending: true });
  orcamentoQuery = orcamentoQuery.order("data", { ascending: true });

  const [{ data: lancamentos, error: errorLancamentos }, { data: orcamentos, error: errorOrcamentos }] = await Promise.all([lancamentosQuery, orcamentoQuery]);

  if (errorLancamentos) throw errorLancamentos;
  if (errorOrcamentos) throw errorOrcamentos;

  return {
    lancamentos: (lancamentos || []) as unknown as Lancamento[],
    orcamentos: (orcamentos || []) as unknown as Orcamento[],
    totalLancamentos: (lancamentos || []).length,
    totalOrcamentos: (orcamentos || []).length,
  };
}

async function getDashboard(mes?: string, usuarioId?: string): Promise<DashboardData> {
  if (database.getDb()) {
    try {
      let lWhere = "deleted_at IS NULL AND status = 'PAGO'";
      const lParams: Record<string, unknown> = {};
      let oWhere = "deleted_at IS NULL";
      const oParams: Record<string, unknown> = {};
      if (mes) {
        lWhere += " AND data_busca LIKE @mes";
        lParams.mes = mes + "%";
        oWhere += " AND data_busca LIKE @mesO";
        oParams.mesO = mes + "%";
      }
      const orcamento = database.query(`SELECT * FROM financas_orcamento WHERE ${oWhere} ORDER BY data ASC`, { ...oParams, ...lParams }).map((r) => _doSQLite(r));
      const realizados = database.query(`SELECT * FROM financas_lancamentos WHERE ${lWhere} ORDER BY data DESC`, { ...lParams, ...oParams }).map((r) => _doSQLite(r));

      if (orcamento.length > 0 || realizados.length > 0) {
        const totais = {
          receitas_planejadas: 0,
          receitas_realizadas: 0,
          despesas_planejadas: 0,
          despesas_realizadas: 0,
        };
        (orcamento as Record<string, unknown>[]).forEach((item) => {
          if (item.tipo === "RECEITA") totais.receitas_planejadas += Number(item.valor_planejado);
          else totais.despesas_planejadas += Number(item.valor_planejado);
        });
        (realizados as Record<string, unknown>[]).forEach((item) => {
          if (item.tipo === "RECEITA" && !item.transferencia_grupo_id) totais.receitas_realizadas += Number(item.valor);
          else if (item.tipo === "DESPESA" && !item.transferencia_grupo_id) totais.despesas_realizadas += Number(item.valor);
        });
        return { totais, orcamento: orcamento as unknown as Orcamento[], realizados: realizados as unknown as Lancamento[] };
      }
    } catch {
      logger.warn("repository", "getDashboard cache local indisponível, fallback");
    }
  }

  let orcamentoSP = supabase.from("financas_orcamento").select("*").limit(5000) as any;
  orcamentoSP = addUsuarioFilter(orcamentoSP, usuarioId);

  if (mes) {
    validarMes(mes);
    orcamentoSP = orcamentoSP.like("data_busca", `${mes}%`);
  }
  const { data: orcamento, error } = await orcamentoSP as { data: Orcamento[] | null; error: unknown };
  if (error) throw error;

  let financasSP = supabase.from("financas_lancamentos").select("*").eq("status", "PAGO").limit(5000) as any;
  financasSP = addUsuarioFilter(financasSP, usuarioId);

  if (mes) {
    validarMes(mes);
    financasSP = financasSP.like("data_busca", `${mes}%`);
  }
  const { data: realizados, error: errorRealizados } = await financasSP as { data: Lancamento[] | null; error: unknown };
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

async function createLancamento(payload: CreateLancamentoPayload, usuarioId?: string): Promise<Lancamento> {
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

  _syncAposEscrita("financas_lancamentos", insertPayload);

  const { data, error } = await supabase.from("financas_lancamentos").insert(insertPayload).select().single();

  if (error) {
    _marcarPendente("financas_lancamentos", insertPayload.id as string);
    throw error;
  }

  _inserirLocal("financas_lancamentos", data as unknown as Record<string, unknown>, "synced");
  if (usuarioId) {
    logAuditoria(usuarioId, "LANCAMENTO_CRIADO", { entidade: "lancamento", entidade_id: insertPayload.id as string, dados_novos: { tipo: payloadNormalizado.tipo, valor: payloadNormalizado.valor } }).catch((err: unknown) => logger.error("repository", "auditoria LANCAMENTO_CRIADO falhou", err));
  }
  return data;
}

async function deleteLancamento(id: string, usuarioId?: string): Promise<{ success: boolean }> {
  database.run("UPDATE financas_lancamentos SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ?", id);

  let query = supabase.from("financas_lancamentos").delete().eq("id", id) as any;
  query = addUsuarioFilter(query, usuarioId);
  const { error } = await query;
  if (error) {
    _marcarPendente("financas_lancamentos", id);
    throw error;
  }
  return { success: true };
}

async function updateLancamento(id: string, payload: Partial<CreateLancamentoPayload>, usuarioId?: string): Promise<Lancamento> {
  const hoje = new Date().toISOString();
  const updateData: Record<string, unknown> = payload.status === "PAGO" ? { ...payload, data_pagamento: hoje } : { ...payload };

  _atualizarLocal("financas_lancamentos", id, { ...updateData, sync_status: "pending" });

  let query = supabase.from("financas_lancamentos").update(updateData).eq("id", id) as any;
  query = addUsuarioFilter(query, usuarioId);
  const { data, error } = await query.select().single();

  if (error) {
    _marcarPendente("financas_lancamentos", id);
    throw error;
  }

  _atualizarLocal("financas_lancamentos", id, { ...data, sync_status: "synced" });
  return data;
}

async function createTransferencia(payload: CreateTransferenciaPayload, usuarioId?: string): Promise<Lancamento[]> {
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

  _syncAposEscrita("financas_lancamentos", debitoFinal);
  _syncAposEscrita("financas_lancamentos", creditoFinal);

  const { data: data1, error: err1 } = await supabase.from("financas_lancamentos").insert(debitoFinal).select().single();

  if (err1) {
    _marcarPendente("financas_lancamentos", id1);
    _marcarPendente("financas_lancamentos", id2);
    throw err1;
  }

  const { data: data2, error: err2 } = await supabase.from("financas_lancamentos").insert(creditoFinal).select().single();

  if (err2) {
    _marcarPendente("financas_lancamentos", id1);
    _marcarPendente("financas_lancamentos", id2);
    throw err2;
  }

  _inserirLocal("financas_lancamentos", data1 as unknown as Record<string, unknown>, "synced");
  _inserirLocal("financas_lancamentos", data2 as unknown as Record<string, unknown>, "synced");
  return [data1, data2];
}

async function deleteTransferencia(grupoId: string, usuarioId?: string): Promise<{ success: boolean }> {
  database.run("UPDATE financas_lancamentos SET deleted_at = datetime('now'), sync_status = 'pending' WHERE transferencia_grupo_id = ?", grupoId);

  let query = supabase.from("financas_lancamentos").delete().eq("transferencia_grupo_id", grupoId) as any;
  query = addUsuarioFilter(query, usuarioId);
  const { error } = await query;
  if (error) {
    _marcarPendente("financas_lancamentos", grupoId);
    throw error;
  }
  return { success: true };
}

async function updateTransferencia(grupoId: string, payload: Partial<CreateTransferenciaPayload>, usuarioId?: string): Promise<Lancamento[]> {
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

  const updatedLocal = async () => {
    for (const entry of existing) {
      _atualizarLocal("financas_lancamentos", entry.id, { ...baseUpdate, sync_status: "pending" });
    }
  };

  await updatedLocal();

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
    q = addUsuarioFilter(q, usuarioId);
    const { error } = await q;
    if (error) {
      _marcarPendente("financas_lancamentos", entry.id);
      throw error;
    }
  }

  const { data: updated } = await supabase.from("financas_lancamentos").select("*").eq("transferencia_grupo_id", grupoId);

  for (const item of updated || []) {
    _inserirLocal("financas_lancamentos", item as unknown as Record<string, unknown>, "synced");
  }

  return (updated || []) as unknown as Lancamento[];
}

async function importarOrcamento(itens: ImportarOrcamentoItem[], usuarioId?: string): Promise<{ success: boolean; data: Orcamento[]; importados: number }> {
  if (!itens || !Array.isArray(itens)) {
    throw new Error("Array de itens é obrigatório");
  }

  const itensProcessados = itens.map((item) => ({
    data: item.data,
    data_busca: item.data_busca || (item.data ? item.data.substring(0, 7) : null),
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
    id: item.id || crypto.randomUUID(),
  }));

  for (const item of itensProcessados) {
    _syncAposEscrita("financas_orcamento", item);
  }

  const { data, error } = await supabase.from("financas_orcamento").insert(itensProcessados).select();

  if (error) {
    for (const item of itensProcessados) {
      _marcarPendente("financas_orcamento", item.id);
    }
    throw error;
  }

  for (const item of data || []) {
    _inserirLocal("financas_orcamento", item as unknown as Record<string, unknown>, "synced");
  }

  return { success: true, data, importados: data.length };
}

export {
  getLancamentos,
  getOrcamento,
  getAnosDisponiveis,
  getDashboardDados,
  getDashboard,
  createLancamento,
  deleteLancamento,
  updateLancamento,
  createTransferencia,
  deleteTransferencia,
  updateTransferencia,
  importarOrcamento,
};
