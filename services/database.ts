import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

let db: Database.Database | null = null;
let dbIntegrity = "ok";
let _testDb: Database.Database | null = null;

function getCaminho(userDataPath?: string): string {
  return path.join(userDataPath || __dirname, "financas.db");
}

function iniciar(userDataPath: string): Database.Database {
  if (db) return db;

  const caminho = getCaminho(userDataPath);
  let abrir = true;

  while (abrir) {
    try {
      db = new Database(caminho);
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");

      const row = db.pragma("integrity_check", { simple: false });
      if (Array.isArray(row) && row.length > 0 && (row as Array<Record<string, string>>)[0].integrity_check !== "ok") {
        db.close();
        if (fs.existsSync(caminho)) {
          fs.renameSync(caminho, caminho + ".corrompido." + Date.now());
        }
        dbIntegrity = "recriado";
        continue;
      }

      abrir = false;
    } catch (err) {
      if (db) {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        db = null;
      }
      if (fs.existsSync(caminho)) {
        try {
          fs.renameSync(caminho, caminho + ".corrompido." + Date.now());
        } catch {
          /* ignore */
        }
        dbIntegrity = "recriado";
        continue;
      }
      throw err;
    }
  }

  migrar();
  return db!;
}

function migrar(): void {
  const v = Number(db!.pragma("user_version", { simple: true }));

  if (v < 1) {
    criarTabelas();
    db!.pragma("user_version = 1");
  }

  if (v < 2) {
    db!.exec("DROP TABLE IF EXISTS financas_usuarios");
    criarTabelas();
    db!.pragma("user_version = 2");
  }
}

function criarTabelas(): void {
  const tabelas = [
    `CREATE TABLE IF NOT EXISTS financas_categorias (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      usuario_id TEXT,
      eh_global INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      deleted_at TEXT,
      device_id TEXT,
      updated_by TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_subcategorias (
      id TEXT PRIMARY KEY,
      categoria_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      usuario_id TEXT,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      deleted_at TEXT,
      device_id TEXT,
      updated_by TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_contas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      usuario_id TEXT,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      deleted_at TEXT,
      device_id TEXT,
      updated_by TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_pessoas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      usuario_id TEXT,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      deleted_at TEXT,
      device_id TEXT,
      updated_by TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_lancamentos (
      id TEXT PRIMARY KEY,
      usuario_id TEXT,
      tipo TEXT NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      descricao TEXT,
      categoria_id TEXT,
      subcategoria_id TEXT,
      conta_origem_id TEXT,
      conta_destino_id TEXT,
      pessoa_id TEXT,
      status TEXT DEFAULT 'PENDENTE',
      data_pagamento TEXT,
      transferencia_grupo_id TEXT,
      data_busca TEXT,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      deleted_at TEXT,
      device_id TEXT,
      updated_by TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_orcamento (
      id TEXT PRIMARY KEY,
      usuario_id TEXT,
      data TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descricao TEXT,
      valor_planejado REAL DEFAULT 0,
      valor_realizado REAL DEFAULT 0,
      categoria_id TEXT,
      subcategoria_id TEXT,
      conta_id TEXT,
      pessoa_id TEXT,
      recorrente INTEGER DEFAULT 0,
      observacoes TEXT,
      mes INTEGER,
      data_busca TEXT,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      deleted_at TEXT,
      device_id TEXT,
      updated_by TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_chamados (
      id TEXT PRIMARY KEY,
      usuario_id TEXT,
      titulo TEXT NOT NULL,
      descricao TEXT,
      respostas TEXT DEFAULT '[]',
      status TEXT DEFAULT 'aberto',
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      deleted_at TEXT,
      device_id TEXT,
      updated_by TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_auditoria (
      id TEXT PRIMARY KEY,
      usuario_id TEXT,
      acao TEXT NOT NULL,
      entidade TEXT,
      entidade_id TEXT,
      dados_anteriores TEXT,
      dados_novos TEXT,
      ip TEXT,
      user_agent TEXT,
      contexto TEXT DEFAULT 'user',
      criado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      local_updated_at TEXT DEFAULT (datetime('now')),
      device_id TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS financas_usuarios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      ativo INTEGER DEFAULT 1,
      email_recuperacao TEXT,
      avatar_url TEXT,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'synced',
      sync_error TEXT,
      device_id TEXT,
      version INTEGER DEFAULT 1,
      local_updated_at TEXT DEFAULT (datetime('now')),
      remote_updated_at TEXT
    )`,
  ];

  const transaction = db!.transaction(() => {
    for (const sql of tabelas) {
      db!.exec(sql);
    }

    db!.exec(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        chave TEXT PRIMARY KEY,
        valor TEXT
      )
    `);

    db!.exec(`
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        entidade TEXT NOT NULL,
        registro_id TEXT NOT NULL,
        local_data TEXT NOT NULL,
        remote_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolvido_em TEXT,
        resolvido_como TEXT
      )
    `);

    const deviceId = crypto.randomUUID();
    db!.prepare("INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('device_id', ?)").run(deviceId);
    db!.prepare("INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('ultimo_pull_at', '')").run();
    db!.prepare("INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('ultimo_push_at', '')").run();
  });

  transaction();
}

function query(sql: string, params: Record<string, unknown> = {}): Record<string, unknown>[] {
  const d = getDbOrTest();
  if (!d) return [];
  const stmt = d.prepare(sql);
  if (/\bWHERE\b/i.test(sql) && /\bSELECT\b/i.test(sql)) {
    return stmt.all(params) as Record<string, unknown>[];
  }
  return stmt.all(params) as Record<string, unknown>[];
}

function get(sql: string, params: Record<string, unknown> = {}): Record<string, unknown> | undefined {
  const d = getDbOrTest();
  if (!d) return undefined;
  return d.prepare(sql).get(params) as Record<string, unknown> | undefined;
}

function run(sql: string, ...params: unknown[]): { changes: number } {
  const d = getDbOrTest();
  if (!d) return { changes: 0 };
  if (params.length === 0) return d.prepare(sql).run();
  if (params.length === 1 && typeof params[0] === "object" && !Array.isArray(params[0])) {
    return d.prepare(sql).run(params[0] as Record<string, unknown>);
  }
  return d.prepare(sql).run(...params);
}

function transaction<T>(fn: () => T): T {
  const d = getDbOrTest();
  if (!d) return fn();
  return d.transaction(fn)();
}

function getDb(): Database.Database | null {
  return getDbOrTest();
}

function getDeviceId(): string | null {
  const row = get("SELECT valor FROM sync_meta WHERE chave = 'device_id'");
  return row ? (row.valor as string) : null;
}

function fechar(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function getIntegrityStatus(): string {
  return dbIntegrity;
}

function __setDb(mockDb: Database.Database): void {
  _testDb = mockDb;
}

function getDbOrTest(): Database.Database | null {
  return _testDb || db;
}

export {
  iniciar,
  query,
  get,
  run,
  transaction,
  getDb,
  getDeviceId,
  fechar,
  getIntegrityStatus,
  __setDb,
  getDbOrTest,
};
