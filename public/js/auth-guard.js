/**
 * @file Helpers de autenticação para páginas do renderer.
 * @module public/js/auth-guard
 */

const ACCESS_TOKEN_KEY = "financas.access_token";
const REFRESH_TOKEN_KEY = "financas.refresh_token";
const USER_KEY = "financas.user";

/**
 * @param {Storage} storage
 * @param {string} key
 * @returns {string | null}
 */
function storageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * @param {Storage} storage
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 */
function storageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    return false;
  }

  return true;
}

/**
 * @param {Storage} storage
 * @param {string} key
 * @returns {boolean}
 */
function storageRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    return false;
  }

  return true;
}

/**
 * @returns {string | null}
 */
function getAccessToken() {
  return storageGet(sessionStorage, ACCESS_TOKEN_KEY) ?? storageGet(localStorage, ACCESS_TOKEN_KEY);
}

/**
 * @returns {string | null}
 */
function getRefreshToken() {
  return storageGet(localStorage, REFRESH_TOKEN_KEY);
}

function clearAuthSession() {
  storageRemove(sessionStorage, ACCESS_TOKEN_KEY);
  storageRemove(localStorage, ACCESS_TOKEN_KEY);
  storageRemove(localStorage, REFRESH_TOKEN_KEY);
  storageRemove(sessionStorage, USER_KEY);
  storageRemove(localStorage, USER_KEY);
}

/**
 * @param {{ token: string, refreshToken?: string, usuario: import("../../src/types").Usuario, rememberMe?: boolean }} params
 */
function storeAuthSession({ token, refreshToken, usuario, rememberMe }) {
  storageSet(sessionStorage, ACCESS_TOKEN_KEY, token);
  storageSet(sessionStorage, USER_KEY, JSON.stringify(usuario));

  if (rememberMe && refreshToken) {
    storageSet(localStorage, REFRESH_TOKEN_KEY, refreshToken);
  } else {
    storageRemove(localStorage, REFRESH_TOKEN_KEY);
  }

  storageRemove(localStorage, ACCESS_TOKEN_KEY);
}

/**
 * @returns {Promise<{ token: string, refreshToken: string, usuario: import("../../src/types").Usuario } | null>}
 */
async function renewFromRefreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken || !window.electronAPI?.renovarAuth) {
    return null;
  }

  const result = await window.electronAPI.renovarAuth(refreshToken);
  storeAuthSession({ ...result, rememberMe: true });
  return result;
}

/**
 * @param {{ requireAdmin?: boolean, redirectTo?: string, redirectOnFailure?: boolean }} [options]
 * @returns {Promise<{ token: string, usuario: import("../../src/types").Usuario } | null>}
 */
async function ensureAuthenticated(options = {}) {
  const { requireAdmin = false, redirectTo = "login.html", redirectOnFailure = true } = options;
  let token = getAccessToken();
  let usuario = null;

  if (!token) {
    const renewed = await renewFromRefreshToken().catch(() => null);
    if (renewed) {
      token = renewed.token;
      usuario = renewed.usuario;
    }
  }

  if (!usuario && token && window.electronAPI?.verificarAuth) {
    try {
      usuario = await window.electronAPI.verificarAuth(token);
    } catch {
      const renewed = await renewFromRefreshToken().catch(() => null);
      if (renewed) {
        token = renewed.token;
        usuario = renewed.usuario;
      }
    }
  }

  if (!usuario) {
    clearAuthSession();
    if (redirectOnFailure) {
      window.location.href = redirectTo;
    }
    return null;
  }

  if (requireAdmin && usuario.role !== "admin") {
    if (redirectOnFailure) {
      window.location.href = "index.html";
    }
    return null;
  }

  storageSet(sessionStorage, ACCESS_TOKEN_KEY, token);
  storageSet(sessionStorage, USER_KEY, JSON.stringify(usuario));

  return { token, usuario };
}

async function restoreSession() {
  try {
    return await ensureAuthenticated({
      redirectTo: "index.html",
      redirectOnFailure: false,
    });
  } catch {
    return null;
  }
}

/**
 * @param {unknown} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, clearAuthSession, ensureAuthenticated, escapeHtml, getAccessToken, getRefreshToken, renewFromRefreshToken, restoreSession, storeAuthSession };
