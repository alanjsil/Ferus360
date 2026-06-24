/**
 * @file Gerencia período de trial (avaliação) do app.
 * Lê trial-config.json na raiz do app; se existir com `dias > 0`,
 * conta os dias a partir da primeira execução e bloqueia o login ao expirar.
 */

import * as path from "path";
import * as fs from "fs";
import * as logger from "./logger";

let _expirado = false;
let _diasRestantes = 0;
let _diasTrial = 0;
let _inicializado = false;

function getUserDataPath(): string {
  const envPath = process.env.LOCALAPPDATA || process.env.HOME || "";
  return path.join(envPath, "financas");
}

function getMetaFilePath(): string {
  return path.join(getUserDataPath(), "trial-meta.json");
}

function lerMeta(): Record<string, string> {
  try {
    const metaPath = getMetaFilePath();
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    }
  } catch (err) {
    logger.error("expiration", "falha ao ler trial-meta.json", err);
  }
  return {};
}

function salvarMeta(meta: Record<string, string>): void {
  try {
    const metaPath = getMetaFilePath();
    const dir = path.dirname(metaPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta), "utf-8");
  } catch (err) {
    logger.error("expiration", "falha ao salvar trial-meta.json", err);
  }
}

function init(appRoot: string): void {
  if (_inicializado) return;

  const configPath = path.join(appRoot, "trial-config.json");

  if (!fs.existsSync(configPath)) {
    _inicializado = true;
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    _diasTrial = config.dias || 0;
  } catch (err) {
    logger.error("expiration", "falha ao ler trial-config.json", err);
    _inicializado = true;
    return;
  }

  if (_diasTrial <= 0) {
    _inicializado = true;
    return;
  }

  const meta = lerMeta();

  if (!meta.trial_primeira_execucao) {
    meta.trial_primeira_execucao = String(Date.now());
    salvarMeta(meta);
    _diasRestantes = _diasTrial;
    _expirado = false;
  } else {
    const primeiraExec = Number(meta.trial_primeira_execucao);
    const diffDias = Math.floor((Date.now() - primeiraExec) / 86400000);
    _expirado = diffDias >= _diasTrial;
    _diasRestantes = Math.max(0, _diasTrial - diffDias);
  }

  _inicializado = true;
}

function estaExpirado(): boolean {
  return _expirado;
}

function diasRestantes(): number {
  return _diasRestantes;
}

function diasTrial(): number {
  return _diasTrial;
}

export { init, estaExpirado, diasRestantes, diasTrial };
