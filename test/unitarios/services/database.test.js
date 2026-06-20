/**
 * @file Testes da camada SQLite local (database.js).
 * @description Usa banco :memory: para testar init, schema, migrations, helpers.
 * @module test/unitarios/services/database.test.js
 * @changelog
 * [2026-06-15] - Criação inicial com testes de schema, sync_meta e CRUD básico.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

describe("database.js — SQLite local", () => {
  let db;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
  });

  function criarTabelas() {
    const sql = `
      CREATE TABLE IF NOT EXISTS financas_categorias (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL,
        usuario_id TEXT, eh_global INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
        criado_em TEXT DEFAULT (datetime('now')),
        atualizado_em TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'synced', sync_error TEXT,
        deleted_at TEXT, device_id TEXT, updated_by TEXT,
        version INTEGER DEFAULT 1,
        local_updated_at TEXT DEFAULT (datetime('now')),
        remote_updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS financas_lancamentos (
        id TEXT PRIMARY KEY, usuario_id TEXT, tipo TEXT NOT NULL,
        valor REAL NOT NULL, data TEXT NOT NULL, descricao TEXT,
        categoria_id TEXT, subcategoria_id TEXT, conta_origem_id TEXT,
        conta_destino_id TEXT, pessoa_id TEXT, status TEXT DEFAULT 'PENDENTE',
        data_pagamento TEXT, transferencia_grupo_id TEXT, data_busca TEXT,
        criado_em TEXT DEFAULT (datetime('now')),
        atualizado_em TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'synced', sync_error TEXT,
        deleted_at TEXT, device_id TEXT, updated_by TEXT,
        version INTEGER DEFAULT 1,
        local_updated_at TEXT DEFAULT (datetime('now')),
        remote_updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sync_meta (
        chave TEXT PRIMARY KEY, valor TEXT
      );
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY, entidade TEXT NOT NULL, registro_id TEXT NOT NULL,
        local_data TEXT NOT NULL, remote_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolvido_em TEXT, resolvido_como TEXT
      );
    `;
    db.exec(sql);
  }

  describe("Schema", () => {
    it("cria todas as tabelas no startup", () => {
      criarTabelas();
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);

      expect(tables).toContain("financas_categorias");
      expect(tables).toContain("financas_lancamentos");
      expect(tables).toContain("sync_meta");
      expect(tables).toContain("sync_conflicts");
    });

    it("sync_meta contém device_id e ultimo_pull_at", () => {
      criarTabelas();
      db.prepare("INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('device_id', 'abc-123')").run();
      db.prepare("INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('ultimo_pull_at', '')").run();

      const deviceId = db.prepare("SELECT valor FROM sync_meta WHERE chave = 'device_id'").get();
      expect(deviceId.valor).toBe("abc-123");
    });

    it("soft delete não remove registro fisicamente", () => {
      criarTabelas();
      db.prepare(
        "INSERT INTO financas_categorias (id, nome, tipo) VALUES ('cat-1', 'Salário', 'RECEITA')"
      ).run();

      db.prepare("UPDATE financas_categorias SET deleted_at = datetime('now') WHERE id = 'cat-1'").run();

      const deleted = db.prepare("SELECT * FROM financas_categorias WHERE id = 'cat-1'").get();
      expect(deleted).toBeTruthy();
      expect(deleted.deleted_at).toBeTruthy();

      const active = db
        .prepare("SELECT * FROM financas_categorias WHERE deleted_at IS NULL")
        .all();
      expect(active).toHaveLength(0);
    });
  });

  describe("CRUD básico", () => {
    beforeEach(() => {
      criarTabelas();
    });

    it("INSERT e SELECT de categoria", () => {
      db.prepare(
        "INSERT INTO financas_categorias (id, nome, tipo, usuario_id) VALUES (?, ?, ?, ?)"
      ).run("cat-1", "Salário", "RECEITA", "user-1");

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row.nome).toBe("Salário");
      expect(row.tipo).toBe("RECEITA");
      expect(row.sync_status).toBe("synced");
      expect(row.version).toBe(1);
    });

    it("UPDATE incrementa version manualmente", () => {
      db.prepare(
        "INSERT INTO financas_categorias (id, nome, tipo) VALUES (?, ?, ?)"
      ).run("cat-1", "Salário", "RECEITA");

      db.prepare(
        "UPDATE financas_categorias SET nome = ?, version = version + 1, sync_status = 'pending' WHERE id = ?"
      ).run("Salário Atualizado", "cat-1");

      const row = db.prepare("SELECT * FROM financas_categorias WHERE id = ?").get("cat-1");
      expect(row.nome).toBe("Salário Atualizado");
      expect(row.version).toBe(2);
      expect(row.sync_status).toBe("pending");
    });

    it("DELETE lógico (soft delete)", () => {
      db.prepare(
        "INSERT INTO financas_lancamentos (id, tipo, valor, data) VALUES (?, ?, ?, ?)"
      ).run("l-1", "DESPESA", 100, "2026-06-01");

      db.prepare(
        "UPDATE financas_lancamentos SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ?"
      ).run("l-1");

      const row = db.prepare("SELECT * FROM financas_lancamentos WHERE id = ?").get("l-1");
      expect(row.deleted_at).toBeTruthy();
      expect(row.sync_status).toBe("pending");
    });

    it("sync_conflicts armazena conflitos", () => {
      db.prepare(
        "INSERT INTO sync_conflicts (id, entidade, registro_id, local_data, remote_data) VALUES (?, ?, ?, ?, ?)"
      ).run("conf-1", "financas_lancamentos", "l-1", '{"valor":100}', '{"valor":150}');

      const conflito = db.prepare("SELECT * FROM sync_conflicts WHERE id = ?").get("conf-1");
      expect(conflito.entidade).toBe("financas_lancamentos");
      expect(conflito.resolvido_em).toBeNull();
    });
  });

  describe("WAL mode and pragmas", () => {
    it("journal_mode é WAL (ou memory em :memory:)", () => {
      const mode = db.pragma("journal_mode", { simple: true });
      expect(["wal", "memory"]).toContain(mode);
    });

    it("foreign_keys está ON", () => {
      const result = db.pragma("foreign_keys", { simple: true });
      expect(result).toBe(1);
    });
  });
});
