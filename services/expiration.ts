/**
 * @file Gerencia período de trial (avaliação) do app.
 * Lê trial-config.json na raiz do app; se existir com `dias > 0`,
 * conta os dias a partir da primeira execução e bloqueia o login ao expirar.
 */

import * as path from "path";
import * as fs from "fs";
import { get, run } from "./database";
import * as logger from "./logger";

let _expirado = false;
let _diasRestantes = 0;
let _diasTrial = 0;
let _inicializado = false;

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

  const row = get("SELECT valor FROM sync_meta WHERE chave = 'trial_primeira_execucao'");

  if (!row) {
    run("INSERT INTO sync_meta (chave, valor) VALUES ('trial_primeira_execucao', ?)", String(Date.now()));
    _diasRestantes = _diasTrial;
    _expirado = false;
  } else {
    const primeiraExec = Number(row.valor);
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
