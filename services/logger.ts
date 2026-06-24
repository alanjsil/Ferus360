const path = require("path");
const fs = require("fs");

function formatarTimestamp(): string {
  const agora = new Date();
  return agora.toISOString().replace("T", " ").slice(0, 19);
}

function escaparCSV(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const str = typeof valor === "string" ? valor : JSON.stringify(valor);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

let _caminhoLog: string | null = null;
let _inicializado = false;

function init(pastaDados: string): void {
  const dir = path.join(pastaDados, "logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  _caminhoLog = path.join(dir, "financas-erros.csv");
  if (!fs.existsSync(_caminhoLog)) {
    fs.writeFileSync(_caminhoLog, "timestamp,level,context,message,stack\n", "utf-8");
  }
  _inicializado = true;
}

function escrever(level: string, context: string, message: string, err?: unknown): void {
  if (!_inicializado || !_caminhoLog) return;
  const timestamp = formatarTimestamp();
  const stack = err instanceof Error ? err.stack || "" : err ? String(err) : "";
  const linha = [timestamp, level, context, message, stack].map(escaparCSV).join(",") + "\n";
  try {
    fs.appendFileSync(_caminhoLog, linha, "utf-8");
  } catch {}
}

function error(context: string, message: string, err?: unknown): void {
  escrever("ERROR", context, message, err);
}

function warn(context: string, message: string, err?: unknown): void {
  escrever("WARN", context, message, err);
}

export { init, error, warn };
