import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as logger from "./logger";

type EntidadeCache = "categorias" | "subcategorias" | "contas" | "pessoas";

interface CacheEntry {
  cachedAt: number;
  expiresAt: number;
  usuarioId: string;
  tipoPessoa: string;
  checksum: string;
}

interface CacheMeta {
  version: number;
  entries: Partial<Record<EntidadeCache, CacheEntry>>;
}

const TTL_MS: Record<EntidadeCache, number> = {
  categorias:    24 * 60 * 60 * 1000,
  subcategorias: 24 * 60 * 60 * 1000,
  contas:        12 * 60 * 60 * 1000,
  pessoas:       12 * 60 * 60 * 1000,
};

class CacheService {
  private dir: string;
  private metaPath: string;

  constructor(userDataPath: string) {
    this.dir = path.join(userDataPath, "cache");
    this.metaPath = path.join(this.dir, "meta.json");
    this.garantirDiretorio();
  }

  isValid(entidade: EntidadeCache, usuarioId: string, tipoPessoa: string): boolean {
    const meta = this.lerMeta();
    const entry = meta.entries[entidade];
    if (!entry) return false;
    if (entry.usuarioId !== usuarioId || entry.tipoPessoa !== tipoPessoa) return false;
    if (Date.now() > entry.expiresAt) return false;
    return true;
  }

  hasStale(entidade: EntidadeCache): boolean {
    return !!this.lerMeta().entries[entidade];
  }

  get<T>(entidade: EntidadeCache): T[] {
    try {
      const raw = fs.readFileSync(this.caminhoEntidade(entidade), "utf-8");
      const parsed = JSON.parse(raw) as { data: T[] };
      return parsed.data ?? [];
    } catch (err) {
      logger.warn("cache", `Falha ao ler ${entidade}.json`, err);
      return [];
    }
  }

  set<T>(entidade: EntidadeCache, data: T[], usuarioId: string, tipoPessoa: string): void {
    const payload = JSON.stringify({ data });
    const checksum = crypto.createHash("sha256").update(payload).digest("hex");
    try {
      fs.writeFileSync(this.caminhoEntidade(entidade), payload, "utf-8");
    } catch (err) {
      logger.error("cache", `Falha ao escrever ${entidade}.json`, err);
      return;
    }
    const meta = this.lerMeta();
    meta.entries[entidade] = {
      cachedAt: Date.now(),
      expiresAt: Date.now() + TTL_MS[entidade],
      usuarioId, tipoPessoa, checksum,
    };
    this.salvarMeta(meta);
  }

  invalidar(entidade: EntidadeCache): void {
    const meta = this.lerMeta();
    delete meta.entries[entidade];
    this.salvarMeta(meta);
  }

  invalidarTodos(): void {
    const meta = this.lerMeta();
    meta.entries = {};
    this.salvarMeta(meta);
    const entidades: EntidadeCache[] = ["categorias", "subcategorias", "contas", "pessoas"];
    for (const e of entidades) {
      const fp = this.caminhoEntidade(e);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch { /* ignora */ } }
    }
  }

  private garantirDiretorio(): void {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  private caminhoEntidade(entidade: EntidadeCache): string {
    return path.join(this.dir, `${entidade}.json`);
  }

  private lerMeta(): CacheMeta {
    try {
      if (fs.existsSync(this.metaPath)) return JSON.parse(fs.readFileSync(this.metaPath, "utf-8"));
    } catch { /* meta corrompido — começa do zero */ }
    return { version: 1, entries: {} };
  }

  private salvarMeta(meta: CacheMeta): void {
    try {
      fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2), "utf-8");
    } catch (err) {
      logger.error("cache", "Falha ao salvar meta.json", err);
    }
  }
}

let _instance: CacheService | null = null;

export function initCache(userDataPath: string): void {
  _instance = new CacheService(userDataPath);
}

export function getCache(): CacheService {
  if (!_instance) throw new Error("Cache não inicializado. Chame initCache() primeiro.");
  return _instance;
}
