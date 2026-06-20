/**
 * @file Teardown global para testes E2E.
 * @description Executa limpeza no Supabase real após todos os testes.
 *   Registrado como `globalSetup` no vitest.config.integrado.js.
 * @module test/e2e/cleanup-global.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env"), quiet: true });

const DOMINIO_TESTE = "@teste-integrado.com";

export default async function setup() {
  return async function teardown() {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Busca usuários de teste
    const { data: usuariosTeste } = await supabase
      .from("financas_usuarios")
      .select("id, email")
      .ilike("email", `%${DOMINIO_TESTE}`);

    if (usuariosTeste && usuariosTeste.length > 0) {
      const ids = usuariosTeste.map((u) => u.id);

      // Tabelas dependentes (filhos primeiro)
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
        const { error } = await supabase
          .from(tabela)
          .delete()
          .in("usuario_id", ids);
        if (error && !error.message.includes("violates foreign key")) {
          console.warn(`Aviso ao limpar ${tabela}:`, error.message);
        }
      }

      // Usuários por último
      const { error: errUsuarios } = await supabase
        .from("financas_usuarios")
        .delete()
        .in("id", ids);
      if (errUsuarios) {
        console.warn("Aviso ao limpar usuarios:", errUsuarios.message);
      }
    }

    // Limpa auth.users de teste
    try {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (!error && data?.users) {
        for (const user of data.users) {
          if (user.email?.endsWith(DOMINIO_TESTE)) {
            await supabase.auth.admin.deleteUser(user.id);
          }
        }
      }
    } catch (e) {
      console.warn("Aviso ao limpar auth users:", e.message);
    }
  };
}
