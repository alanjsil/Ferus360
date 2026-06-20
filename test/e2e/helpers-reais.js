/**
 * @file Helpers para testes e2e.
 * @description Funções auxiliares para conectar e autenticar no Supabase real.
 * @module test/e2e/helpers-reais.js
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, "../../.env"), quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

/**
 * Cria clients Supabase admin (service_role) e anon.
 */
function criarClientesTeste() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL é obrigatório");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  return { admin, anon };
}

/**
 * Faz login com email/senha e retorna o client autenticado + sessão.
 */
async function autenticarUsuario(email, senha) {
  const { anon } = criarClientesTeste();
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) throw new Error(`Falha no login: ${error.message}`);

  return {
    client: anon,
    usuario: data.user,
    sessao: data.session,
    token: data.session.access_token,
  };
}

/**
 * Payload padrão para criar lançamento.
 */
function payloadLancamento(overrides = {}) {
  return {
    data: "2026-06-15",
    tipo: "DESPESA",
    status: "PENDENTE",
    valor: 150.5,
    descricao: "Lançamento de teste",
    data_busca: "2026-06",
    ...overrides,
  };
}

export { autenticarUsuario, criarClientesTeste, payloadLancamento };
