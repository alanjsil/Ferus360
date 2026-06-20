/**
 * @file Testes do motor de sincronia offline-first (sync.js).
 * @description Injeta database e conexao mockados via __setDatabase e __setConexao.
 * @module test/unitarios/services/sync.test.js
 * @changelog
 * [2026-06-15] - Criação inicial com testes de push, pull, conflitos.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import * as syncModule from "../../../services/sync.js";
import * as databaseModule from "../../../services/database.js";

const TABELAS = [
  "financas_lancamentos",
  "financas_categorias",
  "financas_subcategorias",
  "financas_contas",
  "financas_pessoas",
  "financas_orcamento",
  "financas_chamados",
  "financas_auditoria",
  "financas_usuarios",
];

function criarSchema(db) {
  for (const t of TABELAS) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${t} (
        id TEXT PRIMARY KEY,
        sync_status TEXT DEFAULT 'synced',
        sync_error TEXT,
        deleted_at TEXT,
        version INTEGER DEFAULT 1,
        local_updated_at TEXT DEFAULT (datetime('now')),
        remote_updated_at TEXT,
        nome TEXT, tipo TEXT, valor REAL, data TEXT, usuario_id TEXT,
        atualizado_em TEXT
      )
    `);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      chave TEXT PRIMARY KEY, valor TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY, entidade TEXT NOT NULL, registro_id TEXT NOT NULL,
      local_data TEXT NOT NULL, remote_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolvido_em TEXT, resolvido_como TEXT
    );
  `);
  db.prepare("INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('device_id', 'dev-999')").run();
  db.prepare("INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('ultimo_pull_at', '')").run();
}

function criarMockDb(raw) {
  return {
    get: (sql, ...params) => raw.prepare(sql).get(...params),
    run: (sql, ...params) => raw.prepare(sql).run(...params),
    query: (sql, params = {}) => raw.prepare(sql).all(params),
    prepare: (sql) => raw.prepare(sql),
    transaction: (fn) => raw.transaction(fn),
    getDeviceId: () => "dev-999",
    getIntegrityStatus: () => "ok",
  };
}

describe("sync.js — motor de sincronia", () => {
  let db;
  let mockDb;
  let mockConexao;
  let mockRepository;

  beforeEach(async () => {
    db = new Database(":memory:");
    criarSchema(db);
    mockDb = criarMockDb(db);

    mockConexao = {
      isOnline: () => true,
      supabase: {
        rpc: vi.fn(),
        from: vi.fn().mockReturnValue({
          select: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      },
      onStatusChange: vi.fn(),
    };
    mockRepository = { logAuditoria: vi.fn() };

    databaseModule.__setDb(db);
    syncModule.__setDatabase(mockDb);
    syncModule.__setConexao(mockConexao);
    syncModule.init(mockDb, mockRepository);
    syncModule.start();
  });

  afterEach(() => {
    syncModule.stop();
    db.close();
  });

  describe("push", () => {
    it("não envia nada se não há pendentes", async () => {
      await syncModule.forceSync();
      expect(mockConexao.supabase.rpc).not.toHaveBeenCalled();
    });

    it("envia registros pending para sync_insert quando version=1", async () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status, version) VALUES (?, ?, ?, ?, ?)").run("cat-1", "Salário", "RECEITA", "pending", 1);

      mockConexao.supabase.rpc.mockResolvedValue({ data: { id: "cat-1" }, error: null });

      await syncModule.forceSync();

      expect(mockConexao.supabase.rpc).toHaveBeenCalledWith("sync_insert", {
        tabela: "financas_categorias",
        payload: expect.objectContaining({ id: "cat-1", nome: "Salário", tipo: "RECEITA" }),
      });

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row.sync_status).toBe("synced");
    });

    it("envia registros pending para sync_upsert quando version>1", async () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status, version) VALUES (?, ?, ?, ?, ?)").run("cat-1", "Salário Antigo", "RECEITA", "pending", 2);

      mockConexao.supabase.rpc.mockResolvedValue({ data: { id: "cat-1" }, error: null });

      await syncModule.forceSync();

      expect(mockConexao.supabase.rpc).toHaveBeenCalledWith(
        "sync_upsert",
        expect.objectContaining({
          tabela: "financas_categorias",
          registro_id: "cat-1",
          expected_version: 2,
        }),
      );
    });

    it("marca como failed se rpc retorna erro", async () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status, version) VALUES (?, ?, ?, ?, ?)").run("cat-1", "Salário", "RECEITA", "pending", 1);

      mockConexao.supabase.rpc.mockResolvedValue({ data: null, error: new Error("Network error") });

      await syncModule.forceSync();

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row.sync_status).toBe("failed");
      expect(row.sync_error).toBe("Network error");
    });

    it("envia soft-delete via sync_delete RPC", async () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status, version, deleted_at) VALUES (?, ?, ?, ?, ?, ?)").run("cat-1", "Antiga", "RECEITA", "pending", 2, "2026-06-01");

      mockConexao.supabase.rpc.mockResolvedValue({ data: null, error: null });

      await syncModule.forceSync();

      expect(mockConexao.supabase.rpc).toHaveBeenCalledWith("sync_delete", {
        tabela: "financas_categorias",
        registro_id: "cat-1",
      });

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row.sync_status).toBe("synced");
    });

    it("não faz push se offline", async () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status, version) VALUES (?, ?, ?, ?, ?)").run("cat-1", "Salário", "RECEITA", "pending", 1);

      syncModule.__setConexao({ isOnline: () => false, supabase: mockConexao.supabase, onStatusChange: vi.fn() });

      await syncModule.forceSync();

      expect(mockConexao.supabase.rpc).not.toHaveBeenCalled();
    });

    it("trata conflito de versão (CONFLICT) para entidade crítica", async () => {
      db.prepare("INSERT INTO financas_lancamentos (id, tipo, valor, data, sync_status, version, local_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "l-1",
        "DESPESA",
        100,
        "2026-01-01",
        "pending",
        2,
        "2026-06-01T00:00:00.000Z",
      );

      mockConexao.supabase.rpc.mockResolvedValue({ data: null, error: { message: "CONFLICT" } });

      mockConexao.supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { id: "l-1", valor: 150 }, error: null }),
          }),
        }),
      });

      await syncModule.forceSync();

      const conflito = db.prepare("SELECT * FROM sync_conflicts WHERE registro_id = ?").get("l-1");
      expect(conflito).toBeTruthy();
      expect(conflito.entidade).toBe("financas_lancamentos");

      const row = db.prepare("SELECT * FROM financas_lancamentos WHERE id = ?").get("l-1");
      expect(row.sync_status).toBe("conflict");
    });

    it("resolve conflito não-crítico com last-write-wins (remoto mais novo)", async () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status, version, local_updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        "cat-1",
        "Local",
        "RECEITA",
        "pending",
        2,
        "2026-01-01T00:00:00.000Z",
      );

      mockConexao.supabase.rpc.mockResolvedValue({ data: null, error: { message: "CONFLICT" } });

      mockConexao.supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "cat-1", nome: "Remoto", atualizado_em: "2026-06-02T00:00:00.000Z" },
                error: null,
              }),
          }),
        }),
      });

      await syncModule.forceSync();

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row.nome).toBe("Remoto");
      expect(row.sync_status).toBe("synced");
    });
  });

  describe("pull", () => {
    it("não faz pull se offline", async () => {
      syncModule.__setConexao({ isOnline: () => false, supabase: mockConexao.supabase, onStatusChange: vi.fn() });

      await syncModule.forceSync();
      expect(mockConexao.supabase.from).not.toHaveBeenCalled();
    });

    it("traz dados do remoto e faz upsert local", async () => {
      const remoteData = [{ id: "cat-1", nome: "Remoto", tipo: "RECEITA", atualizado_em: "2026-06-01T12:00:00.000Z" }];
      mockConexao.supabase.from.mockReturnValue({
        select: () => ({
          order: () => Promise.resolve({ data: remoteData, error: null }),
        }),
      });

      await syncModule.forceSync();

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row).toBeTruthy();
      expect(row.nome).toBe("Remoto");
      expect(row.sync_status).toBe("synced");
    });

    it("não sobrescreve registros pending locais", async () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status, version) VALUES (?, ?, ?, ?, ?)").run("cat-1", "Local Pendente", "RECEITA", "pending", 2);

      mockConexao.supabase.from.mockReturnValue({
        select: () => ({
          order: () => ({
            gte: () =>
              Promise.resolve({
                data: [{ id: "cat-1", nome: "Remoto", tipo: "DESPESA", atualizado_em: "2026-06-01T12:00:00.000Z" }],
                error: null,
              }),
          }),
        }),
      });

      await syncModule.forceSync();

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row.nome).toBe("Local Pendente");
    });
  });

  describe("conflitos", () => {
    it("getConflitos retorna conflitos não resolvidos", () => {
      db.prepare("INSERT INTO sync_conflicts (id, entidade, registro_id, local_data, remote_data, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        "c-1",
        "financas_lancamentos",
        "l-1",
        "{}",
        "{}",
        "2026-06-01",
      );

      const conflitos = syncModule.getConflitos();
      expect(conflitos).toHaveLength(1);
      expect(conflitos[0].id).toBe("c-1");
    });

    it("resolverConflito com decisão 'local' atualiza banco e força sync", async () => {
      db.prepare("INSERT INTO sync_conflicts (id, entidade, registro_id, local_data, remote_data) VALUES (?, ?, ?, ?, ?)").run(
        "c-1",
        "financas_lancamentos",
        "l-1",
        '{"id":"l-1","valor":100}',
        '{"id":"l-1","valor":200}',
      );

      mockConexao.supabase.rpc.mockResolvedValue({ data: { id: "l-1" }, error: null });

      await syncModule.resolverConflito("c-1", "local");

      const resolvido = db.prepare("SELECT * FROM sync_conflicts WHERE id = ?").get("c-1");
      expect(resolvido.resolvido_em).toBeTruthy();
      expect(resolvido.resolvido_como).toBe("local");

      const lancamento = db.prepare("SELECT * FROM financas_lancamentos WHERE id = ?").get("l-1");
      expect(lancamento).toBeTruthy();
      expect(lancamento.sync_status).toBe("synced");
    });
  });

  describe("getStatus", () => {
    it("retorna status padrão quando não há dados", () => {
      const status = syncModule.getStatus();
      expect(status).toMatchObject({
        pendentes: expect.any(Number),
        conflitos: expect.any(Number),
        online: true,
        dbIntegrity: "ok",
      });
    });

    it("contabiliza pendentes corretamente", () => {
      db.prepare("INSERT INTO financas_categorias (id, nome, tipo, sync_status) VALUES (?, ?, ?, ?)").run("cat-1", "Pendente", "RECEITA", "pending");

      db.prepare("INSERT INTO financas_lancamentos (id, tipo, valor, data, sync_status) VALUES (?, ?, ?, ?, ?)").run("l-1", "DESPESA", 50, "2026-01-01", "failed");

      const status = syncModule.getStatus();
      expect(status.pendentes).toBe(2);
    });
  });
});
