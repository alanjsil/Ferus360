/**
 * @file Config de ambiente: carrega .env em dev, seguro em teste/build.
 * @module src/env
 */

let isDev = false;

try {
  const { app } = require("electron");
  isDev = !app.isPackaged;
} catch {
  // Fora do Electron (testes, scripts)
}

if (isDev) {
  try {
    require("dotenv").config({ quiet: true });
  } catch {
    console.log("dotenv não está disponível");
  }
}

module.exports = {
  isDev,
};
