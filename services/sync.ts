import type { SupabaseClient } from "@supabase/supabase-js";
import type BetterSqlite3 from "better-sqlite3";
import crypto from "crypto";
import type { ConflitoSync, SyncStatus } from "../src/types";
import * as _conexaoModule from "./conexao";
import * as database from "./database";
import * as logger from "./logger";

const ENTIDADES_CRITICAS = ["financas_lancamentos"];

const ENTIDADES_VALIDAS = new Set([
  "financas_categorias",
  "financas_subcategorias",
  "financas_contas",
  "financas_pessoas",
  "financas_lancamentos",
  "financas_orcamento",
  "financas_chamados",
  ...ENTIDADES_CRITICAS,
]);

function validarEntidade(entidade: string): void {
  if (!ENTIDADES_VALIDAS.has(entidade)) {
    throw new Error(`Entidade inválida: ${entidade}`);
  }
}

// Mutable wrappers for test mocking (ESM module namespace is read-only)
let _isOnline: () => boolean = () => _conexaoModule.isOnline();
let _supabase: import("@supabase/supabase-js").SupabaseClient | null = _conexaoModule.supabase;

const ENTIDADES = ["financas_categorias", "financas_subcategorias", "financas_contas", "financas_pessoas", "financas_lancamentos", "financas_orcamento", "financas_chamados"];

const INTERVALO_PUSH_MS = 60000;
const INTERVALO_PULL_MS = 30000;

let _db: BetterSqlite3.Database | null = null;
let _repository: object | null = null;
let _pushTimer: ReturnType<typeof setInterval> | null = null;
let _pullTimer: ReturnType<typeof setInterval> | null = null;
let _syncing = false;
let _statusListeners = new Set<(status: SyncStatus) => void>();
let _cleanupStatusChange: (() => void) | null = null;

function init(db: BetterSqlite3.Database, repository: object): void {
  _db = db;
  _repository = repository;
}

function onSyncStatus(callback: (status: SyncStatus) => void): () => void {
  _statusListeners.add(callback);
  return () => _statusListeners.delete(callback);
}

function notificarStatus(extra: Record<string, unknown> = {}): void {
  const status = getStatus(extra);
  for (const cb of _statusListeners) {
    try {
      cb(status);
    } catch {
      /* ignore */
    }
  }
}

function start(): void {
  if (_pushTimer) return;
  _pushTimer = setInterval(push, INTERVALO_PUSH_MS);
  _pullTimer = setInterval(pull, INTERVALO_PULL_MS);

  _cleanupStatusChange = _conexaoModule.onStatusChange((online) => {
    if (online) {
      push();
      pull();
    }
  });
}

function stop(): void {
  if (_pushTimer) {
    clearInterval(_pushTimer);
    _pushTimer = null;
  }
  if (_pullTimer) {
    clearInterval(_pullTimer);
    _pullTimer = null;
  }
  if (_cleanupStatusChange) {
    _cleanupStatusChange();
    _cleanupStatusChange = null;
  }
  _statusListeners.clear();
}

function getStatus(extra: Record<string, unknown> = {}): SyncStatus {
  const pendingCount = _db
    ? (
        _db
          .prepare(
            "SELECT COUNT(*) as total FROM (SELECT 1 FROM financas_lancamentos WHERE sync_status IN ('pending', 'failed') UNION ALL SELECT 1 FROM financas_categorias WHERE sync_status IN ('pending', 'failed') UNION ALL SELECT 1 FROM financas_subcategorias WHERE sync_status IN ('pending', 'failed') UNION ALL SELECT 1 FROM financas_contas WHERE sync_status IN ('pending', 'failed') UNION ALL SELECT 1 FROM financas_pessoas WHERE sync_status IN ('pending', 'failed') UNION ALL SELECT 1 FROM financas_orcamento WHERE sync_status IN ('pending', 'failed') UNION ALL SELECT 1 FROM financas_chamados WHERE sync_status IN ('pending', 'failed'))",
          )
          .get() as { total: number } | undefined
      )?.total || 0
    : 0;

  const conflictsCount = _db ? (_db.prepare("SELECT COUNT(*) as total FROM sync_conflicts WHERE resolvido_em IS NULL").get() as { total: number })?.total || 0 : 0;

  const ultimoPush = _db ? (_db.prepare("SELECT valor FROM sync_meta WHERE chave = 'ultimo_push_at'").get() as { valor: string } | undefined)?.valor || null : null;

  const ultimoPull = _db ? (_db.prepare("SELECT valor FROM sync_meta WHERE chave = 'ultimo_pull_at'").get() as { valor: string } | undefined)?.valor || null : null;

  return {
    online: _isOnline(),
    syncing: _syncing,
    pendentes: pendingCount,
    conflitos: conflictsCount,
    ultimoPush,
    ultimoPull,
    dbIntegrity: database.getIntegrityStatus(),
    ...extra,
  };
}

async function forcarSync(): Promise<void> {
  await push();
  await pull();
  notificarStatus({ forcar: true });
}

async function push(): Promise<void> {
  if (_syncing) return;
  _syncing = true;
  notificarStatus({ syncing: true });

  try {
    if (!_isOnline()) return;

    const deviceId = database.getDeviceId();

    for (const entidade of ENTIDADES) {
      const rows = database.query(`SELECT * FROM ${entidade} WHERE sync_status IN ('pending', 'failed') ORDER BY local_updated_at ASC LIMIT 50`);

      if (rows.length === 0) continue;

      const supabase = _supabase;
      if (!supabase) continue;

      for (const row of rows) {
        await pushRegistro(entidade, row, supabase, deviceId);
      }
    }

    database.run("UPDATE sync_meta SET valor = datetime('now') WHERE chave = 'ultimo_push_at'");
  } finally {
    _syncing = false;
    notificarStatus();
  }
}

async function pushRegistro(entidade: string, row: Record<string, unknown>, supabase: SupabaseClient, _deviceId: string | null): Promise<void> {
  validarEntidade(entidade);
  try {
    if (row.deleted_at) {
      const { error } = await supabase.rpc("sync_delete", {
        tabela: entidade,
        registro_id: row.id,
      });
      if (error) throw error;
      database.run(`UPDATE ${entidade} SET sync_status = 'synced', sync_error = NULL, remote_updated_at = datetime('now') WHERE id = ?`, row.id);
      return;
    }

    const camposEnvio: Record<string, unknown> = {};
    const colunas = Object.keys(row).filter((k) => !["sync_status", "sync_error", "local_updated_at", "remote_updated_at"].includes(k));

    for (const col of colunas) {
      if (row[col] !== null && row[col] !== undefined) {
        camposEnvio[col] = row[col];
      }
    }

    if (row.version === 1) {
      const { data, error } = await supabase.rpc("sync_insert", {
        tabela: entidade,
        payload: camposEnvio,
      });
      if (error) throw error;
      const remoteUpdatedAt = (data as Record<string, string> | null)?.atualizado_em || (data as Record<string, string> | null)?.updated_at || new Date().toISOString();
      database.run(`UPDATE ${entidade} SET sync_status = 'synced', sync_error = NULL, remote_updated_at = ? WHERE id = ?`, remoteUpdatedAt, row.id);
    } else {
      delete camposEnvio.id;
      delete camposEnvio.version;

      const { data, error } = await supabase.rpc("sync_upsert", {
        tabela: entidade,
        registro_id: row.id,
        expected_version: row.version,
        payload: camposEnvio,
      });
      if (error) {
        if ((error as Error).message === "CONFLICT") {
          await tratarConflito(entidade, row, supabase);
        } else {
          throw error;
        }
        return;
      }
      const remoteUpdatedAt = (data as Record<string, string> | null)?.atualizado_em || (data as Record<string, string> | null)?.updated_at || new Date().toISOString();
      database.run(`UPDATE ${entidade} SET sync_status = 'synced', sync_error = NULL, remote_updated_at = ? WHERE id = ?`, remoteUpdatedAt, row.id);
    }
  } catch (err) {
    const error = err as Error;
    if (error.message === "CONFLICT") return;
    database.run(`UPDATE ${entidade} SET sync_status = 'failed', sync_error = ? WHERE id = ?`, error.message, row.id);
  }
}

async function tratarConflito(entidade: string, row: Record<string, unknown>, supabase: SupabaseClient): Promise<void> {
  validarEntidade(entidade);
  if (ENTIDADES_CRITICAS.includes(entidade)) {
    const { data: remote } = await supabase.from(entidade).select("*").eq("id", row.id).single();

    database.run(`UPDATE ${entidade} SET sync_status = 'conflict' WHERE id = ?`, row.id);

    const conflitoId = crypto.randomUUID();
    database.run(
      `INSERT OR IGNORE INTO sync_conflicts (id, entidade, registro_id, local_data, remote_data) VALUES (?, ?, ?, ?, ?)`,
      conflitoId,
      entidade,
      row.id,
      JSON.stringify(row),
      JSON.stringify(remote || {}),
    );
  } else {
    const { data: remote } = await supabase.from(entidade).select("*").eq("id", row.id).single();

    if (remote) {
      const localTime = new Date((row.local_updated_at as string) || 0).getTime();
      const remoteTime = new Date((remote as Record<string, string>).atualizado_em || 0).getTime();

      if (remoteTime > localTime) {
        upsertLocal(entidade, remote as Record<string, unknown>, "synced");
      } else {
        const camposEnvio: Record<string, unknown> = { ...row };
        delete camposEnvio.id;
        delete camposEnvio.version;
        delete camposEnvio.sync_status;
        delete camposEnvio.sync_error;
        delete camposEnvio.local_updated_at;
        delete camposEnvio.remote_updated_at;

        const { error } = await supabase.rpc("sync_upsert", {
          tabela: entidade,
          registro_id: row.id,
          expected_version: (remote as Record<string, unknown>).version || row.version,
          payload: camposEnvio,
        });
        if (error && (error as Error).message !== "CONFLICT") throw error;
      }
    }
  }
}

async function pull(): Promise<void> {
  try {
    if (!_isOnline()) return;

    const supabase = _supabase;
    if (!supabase) return;

    const ultimoPull = _db ? (_db.prepare("SELECT valor FROM sync_meta WHERE chave = 'ultimo_pull_at'").get() as { valor: string } | undefined)?.valor || null : null;

    let dadosAtualizados = false;

    for (const entidade of ENTIDADES) {
      let query = supabase.from(entidade).select("*").order("atualizado_em", { ascending: true });

      if (ultimoPull) {
        query = query.gte("atualizado_em", ultimoPull);
      }

      const { data, error } = await query;
      if (error) {
        logger.error("sync", `Erro no pull de ${entidade}`, error);
        continue;
      }

      if (data && data.length > 0) {
        const registros = data as Record<string, unknown>[];
        for (const registro of registros) {
          const localStatus = _db!.prepare(`SELECT sync_status FROM ${entidade} WHERE id = ?`).get(registro.id) as { sync_status: string } | undefined;

          if (localStatus && ["pending", "conflict"].includes(localStatus.sync_status)) {
            continue;
          }

          upsertLocal(entidade, registro, "synced");
          dadosAtualizados = true;
        }
      }
    }

    database.run("UPDATE sync_meta SET valor = datetime('now') WHERE chave = 'ultimo_pull_at'");

    if (dadosAtualizados) {
      notificarStatus({ dadosAtualizados: true });
    } else {
      notificarStatus();
    }
  } catch (err) {
    logger.error("sync", "Erro no pull", err);
  }
}

function upsertLocal(entidade: string, data: Record<string, unknown>, syncStatus: string): void {
  if (!_db) return;

  const colunas = Object.keys(data).filter((k) => k !== "atualizado_em");
  const nomesColunas = colunas.join(", ");
  const placeholders = colunas.map((k) => `@${k}`).join(", ");
  const updates = colunas.map((k) => `${k} = @${k}`).join(", ");

  const params: Record<string, unknown> = { ...data };
  for (const col of colunas) {
    const val = params[col];
    if (val === undefined || val === null) {
      params[col] = null;
    } else if (typeof val === "boolean") {
      params[col] = Number(val);
    } else if (typeof val === "object") {
      params[col] = JSON.stringify(val);
    }
  }

  params.sync_status = syncStatus;
  params.remote_updated_at = (data as Record<string, unknown>).atualizado_em || null;

  _db
    .prepare(
      `INSERT INTO ${entidade} (${nomesColunas}, sync_status, remote_updated_at)
     VALUES (${placeholders}, @sync_status, @remote_updated_at)
     ON CONFLICT(id) DO UPDATE SET ${updates}, sync_status = @sync_status, remote_updated_at = @remote_updated_at`,
    )
    .run(params);
}

function getConflitos(): ConflitoSync[] {
  if (!_db) return [];
  const rows = database.query("SELECT * FROM sync_conflicts WHERE resolvido_em IS NULL ORDER BY created_at ASC");
  return rows as unknown as ConflitoSync[];
}

async function resolverConflito(conflitoId: string, decisao: "local" | "remoto" | "mesclar", payloadMesclado?: Record<string, unknown>): Promise<void> {
  if (!_db) return;

  const conflito = _db.prepare("SELECT * FROM sync_conflicts WHERE id = ?").get(conflitoId) as Record<string, unknown> | undefined;
  if (!conflito) throw new Error("Conflito não encontrado");

  const local = JSON.parse(conflito.local_data as string);
  const remoto = JSON.parse(conflito.remote_data as string);

  let dadosFinais: Record<string, unknown>;
  if (decisao === "local") dadosFinais = local;
  else if (decisao === "remoto") dadosFinais = remoto;
  else if (decisao === "mesclar") dadosFinais = payloadMesclado!;
  else throw new Error("Decisão inválida");

  upsertLocal(conflito.entidade as string, dadosFinais, "pending");

  _db.prepare("UPDATE sync_conflicts SET resolvido_em = datetime('now'), resolvido_como = ? WHERE id = ?").run(decisao, conflitoId);

  if (_repository) {
    const deviceId = database.getDeviceId();
    try {
      const repo = _repository as { logAuditoria: (usuarioId: string, acao: string, metadados: Record<string, unknown>) => Promise<unknown> };
      await repo.logAuditoria((dadosFinais.usuario_id as string) || "unknown", "CONFLITO_RESOLVIDO", {
        device_id: deviceId,
        entidade: conflito.entidade,
        entidade_id: conflito.registro_id,
        dados_anteriores: conflito.local_data,
        dados_novos: JSON.stringify(dadosFinais),
      });
    } catch {
      /* silent */
    }
  }

  await forcarSync();
}

function __setDatabase(mockDb: BetterSqlite3.Database): void {
  _db = mockDb;
}

function __setConexao(mockCnx: { isOnline?: () => boolean; supabase?: SupabaseClient | null }): void {
  if (mockCnx) {
    if (mockCnx.isOnline) _isOnline = mockCnx.isOnline;
    if (mockCnx.supabase !== undefined) _supabase = mockCnx.supabase;
  }
}

export { __setConexao, __setDatabase, forcarSync, getConflitos, getStatus, init, onSyncStatus, resolverConflito, start, stop };
