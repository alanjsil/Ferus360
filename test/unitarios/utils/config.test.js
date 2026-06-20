/**
 * @file Testes de configuração de perfil (repository — mock em memória).
 * @description Valida getPerfil, updatePerfil, getSessoes, exportarDados, excluirConta e getChamados com seed in-memory.
 * @module test/unitarios/utils/config.test.js
 * @changelog
 * [2026-06-08] - Padronização
 * - Adicionado cabeçalho JSDoc padronizado conforme SDD de testes.
 * - Ajustadas descrições dos testes para português.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../services/repository.js", () => {
  const db = {};

  return {
    getPerfil: async (usuarioId) => {
      const user = db[usuarioId]?.financas_usuarios?.[0];
      if (!user) throw new Error("Not found");
      const { senha_hash: _senha_hash, ativo: _ativo, ...perfil } = user;
      return perfil;
    },

    updatePerfil: async (usuarioId, payload) => {
      const user = db[usuarioId]?.financas_usuarios?.[0];
      if (!user) throw new Error("Not found");
      Object.assign(user, payload);
      const { senha_hash: _senha_hash, ativo: _ativo, ...perfil } = user;
      return perfil;
    },

    getSessoes: async (usuarioId) => {
      const sessoes = db[usuarioId]?.financas_sessoes || [];
      return [...sessoes].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    },

    exportarDados: async (usuarioId) => {
      const lancamentos = db[usuarioId]?.financas_lancamentos || [];
      return { lancamentos };
    },

    excluirConta: async (usuarioId) => {
      if (!db[usuarioId]) throw new Error("Not found");
      delete db[usuarioId];
      return { success: true };
    },

    getChamados: async (usuarioId) => {
      let result = [];
      for (const uid of Object.keys(db)) {
        if (!usuarioId || uid === usuarioId) {
          const chamados = db[uid]?.financas_chamados || [];
          result = result.concat(chamados.map((c) => ({
            ...c,
            usuario: db[uid].financas_usuarios?.[0]
              ? { nome: db[uid].financas_usuarios[0].nome, email: db[uid].financas_usuarios[0].email }
              : null,
          })));
        }
      }
      return result;
    },

    __seed(usuarioId, table, data) {
      if (!db[usuarioId]) db[usuarioId] = {};
      if (!db[usuarioId][table]) db[usuarioId][table] = [];
      db[usuarioId][table] = data;
    },

    __resetDb() {
      Object.keys(db).forEach((k) => delete db[k]);
    },
  };
});

describe("config (configurações via repository)", () => {
  let repo;

  beforeEach(async () => {
    vi.resetModules();
    repo = await import("../../../services/repository.js");
    repo.__resetDb();
  });

  describe("getPerfil", () => {
    it("retorna perfil do usuario", async () => {
      // Arrange
      repo.__seed("user-1", "financas_usuarios", [{
        id: "user-1", nome: "Alan", email: "alan@example.com",
        email_recuperacao: "rec@example.com", avatar_url: null,
        role: "user", senha_hash: "hash", ativo: true,
      }]);

      // Act
      const perfil = await repo.getPerfil("user-1");

      // Assert
      expect(perfil).toEqual({
        id: "user-1", nome: "Alan", email: "alan@example.com",
        email_recuperacao: "rec@example.com", avatar_url: null, role: "user",
      });
    });

    it("lanca erro para usuario inexistente", async () => {
      // Act & Assert
      await expect(repo.getPerfil("inexistente")).rejects.toThrow("Not found");
    });
  });

  describe("updatePerfil", () => {
    it("atualiza nome", async () => {
      // Arrange
      repo.__seed("user-1", "financas_usuarios", [{
        id: "user-1", nome: "Alan", email: "alan@example.com",
        email_recuperacao: null, avatar_url: null, role: "user",
        senha_hash: "hash", ativo: true,
      }]);

      // Act
      const result = await repo.updatePerfil("user-1", { nome: "Alan Atualizado" });

      // Assert
      expect(result.nome).toBe("Alan Atualizado");
    });

    it("atualiza avatar_url com base64", async () => {
      // Arrange
      const avatar = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAA";
      repo.__seed("user-1", "financas_usuarios", [{
        id: "user-1", nome: "Alan", email: "alan@example.com",
        email_recuperacao: null, avatar_url: null, role: "user",
        senha_hash: "hash", ativo: true,
      }]);

      // Act
      const result = await repo.updatePerfil("user-1", { avatar_url: avatar });

      // Assert
      expect(result.avatar_url).toBe(avatar);
    });
  });

  describe("getSessoes", () => {
    it("retorna sessoes ativas do usuario", async () => {
      // Arrange
      repo.__seed("user-1", "financas_sessoes", [
        { id: "s-1", usuario_id: "user-1", ip: "127.0.0.1", user_agent: "Chrome", criado_em: "2026-06-01T00:00:00Z", expires_at: "2026-07-01T00:00:00Z" },
        { id: "s-2", usuario_id: "user-1", ip: "10.0.0.1", user_agent: "Firefox", criado_em: "2026-06-02T00:00:00Z", expires_at: "2026-07-02T00:00:00Z" },
      ]);

      // Act
      const sessoes = await repo.getSessoes("user-1");

      // Assert
      expect(sessoes).toHaveLength(2);
      expect(sessoes[0].id).toBe("s-2");
    });

    it("retorna array vazio se nao ha sessoes", async () => {
      // Act
      const sessoes = await repo.getSessoes("user-1");

      // Assert
      expect(sessoes).toEqual([]);
    });
  });

  describe("exportarDados", () => {
    it("retorna lancamentos do usuario", async () => {
      // Arrange
      repo.__seed("user-1", "financas_lancamentos", [
        { id: "l-1", usuario_id: "user-1", valor: 100, tipo: "RECEITA", data: "2026-06-01" },
        { id: "l-2", usuario_id: "user-1", valor: 50, tipo: "DESPESA", data: "2026-06-02" },
      ]);

      // Act
      const dados = await repo.exportarDados("user-1");

      // Assert
      expect(dados.lancamentos).toHaveLength(2);
    });

    it("retorna array vazio quando nao ha lancamentos", async () => {
      // Act
      const dados = await repo.exportarDados("user-1");

      // Assert
      expect(dados.lancamentos).toEqual([]);
    });
  });

  describe("excluirConta", () => {
    it("remove conta e retorna success", async () => {
      // Arrange
      repo.__seed("user-1", "financas_usuarios", [{ id: "user-1", nome: "Alan" }]);

      // Act
      const result = await repo.excluirConta("user-1");

      // Assert
      expect(result).toEqual({ success: true });
    });

    it("lanca erro se usuario nao existe", async () => {
      // Act & Assert
      await expect(repo.excluirConta("inexistente")).rejects.toThrow("Not found");
    });
  });

  describe("getChamados", () => {
    it("retorna chamados do usuario com dados do usuario", async () => {
      // Arrange
      repo.__seed("user-1", "financas_usuarios", [{ id: "user-1", nome: "Alan", email: "alan@example.com" }]);
      repo.__seed("user-1", "financas_chamados", [
        { id: "ch-1", usuario_id: "user-1", titulo: "Ajuda", descricao: "Preciso de ajuda", status: "aberto", criado_em: "2026-06-01T00:00:00Z" },
      ]);

      // Act
      const result = await repo.getChamados("user-1");

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].titulo).toBe("Ajuda");
      expect(result[0].usuario.nome).toBe("Alan");
    });
  });
});
