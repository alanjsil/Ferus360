/**
 * @file Seed automático para testes e2e.
 * @description Cria/limpa usuários e dados de teste no Supabase real.
 * @module test/e2e/seed.js
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, "../../.env"), quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const DOMINIO_TESTE = "@teste-integrado.com";
const SENHA_PADRAO = "SenhaTeste123!";

let clientAdmin = null;

function getAdminClient() {
  if (clientAdmin) return clientAdmin;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE são obrigatórios.");
  }
  clientAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return clientAdmin;
}

function criarClientAnon() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL é obrigatório");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Deleta auth.users de teste via listUsers().
 * Retorna os IDs dos auth users deletados.
 */
async function limparAuthUsers(supabase) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error || !data?.users) return [];

  const removidos = [];
  for (const user of data.users) {
    if (user.email?.endsWith(DOMINIO_TESTE)) {
      await supabase.auth.admin.deleteUser(user.id);
      removidos.push(user.id);
    }
  }
  return removidos;
}

/**
 * Limpa dados de teste do banco público (respeitando FKs).
 */
async function limparDadosTeste(supabase) {
  const { data: usuariosTeste } = await supabase.from("financas_usuarios").select("id, email").ilike("email", `%${DOMINIO_TESTE}`);

  if (!usuariosTeste || usuariosTeste.length === 0) {
    await limparAuthUsers(supabase);
    return [];
  }

  const ids = usuariosTeste.map((u) => u.id);

  const tabelas = [
    "financas_lancamentos",
    "financas_orcamento",
    "financas_subcategorias",
    "financas_auditoria",
    "financas_chamados",
    "financas_contas",
    "financas_pessoas",
    "financas_categorias",
  ];

  for (const tabela of tabelas) {
    const { error } = await supabase.from(tabela).delete().in("usuario_id", ids);
    if (error && !error.message.includes("violates foreign key")) {
      console.warn(`Aviso ao limpar ${tabela}:`, error.message);
    }
  }

  await supabase.from("financas_usuarios").delete().in("id", ids);
  await limparAuthUsers(supabase);

  return ids;
}

/**
 * Cria um usuário no Supabase Auth + perfil em financas_usuarios.
 */
async function criarUsuario(supabase, { email, nome, role }) {
  const emailCompleto = email.includes("@") ? email : `${email}${DOMINIO_TESTE}`;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: emailCompleto,
    password: SENHA_PADRAO,
    email_confirm: true,
    user_metadata: { nome, role },
  });

  if (authError) {
    throw new Error(`Falha ao criar usuário ${emailCompleto}: ${authError.message}`);
  }

  const userId = authData.user.id;

  await supabase.from("financas_usuarios").upsert(
    {
      id: userId,
      nome,
      email: emailCompleto,
      role,
      ativo: true,
    },
    { onConflict: "id" },
  );

  return { id: userId, email: emailCompleto, nome, role, senha: SENHA_PADRAO };
}

/**
 * Cria categorias globais base se não existirem.
 */
async function seedCategoriasGlobais(supabase, adminId) {
  const categorias = [
    { nome: "Alimentação", tipo: "DESPESA" },
    { nome: "Salário", tipo: "RECEITA" },
    { nome: "Transporte", tipo: "DESPESA" },
    { nome: "Moradia", tipo: "DESPESA" },
    { nome: "Lazer", tipo: "DESPESA" },
  ];

  const criadas = [];
  for (const cat of categorias) {
    const { data: existente } = await supabase.from("financas_categorias").select("*").eq("nome", cat.nome).eq("eh_global", true).maybeSingle();

    if (existente) {
      criadas.push(existente);
      continue;
    }

    const { data } = await supabase
      .from("financas_categorias")
      .insert({
        nome: cat.nome,
        tipo: cat.tipo,
        eh_global: true,
        ativo: true,
        usuario_id: adminId,
      })
      .select()
      .single();

    if (data) criadas.push(data);
  }

  return criadas;
}

/**
 * Executa seed completo: limpa dados antigos e cria admin + usuário.
 */
async function seedBase(supabase) {
  await limparDadosTeste(supabase);

  const admin = await criarUsuario(supabase, {
    email: "admin",
    nome: "Admin Teste",
    role: "admin",
  });

  const usuario = await criarUsuario(supabase, {
    email: "usuario",
    nome: "Usuário Teste",
    role: "user",
  });

  const categorias = await seedCategoriasGlobais(supabase, admin.id);

  return { admin, usuario, categorias };
}

export { getAdminClient, criarClientAnon, limparDadosTeste, criarUsuario, seedBase, DOMINIO_TESTE, SENHA_PADRAO };
