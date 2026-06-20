import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ quiet: true });

const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SERVICE;
const supabase = createClient(process.env.SUPABASE_URL, key);

const tabelas = [
  "financas_contas",
  "financas_pessoas",
  "financas_chamados",
  "financas_usuarios",
  "financas_auditoria",
  "financas_orcamento",
  "financas_categorias",
  "financas_lancamentos",
  "financas_subcategorias",
];

for (const t of tabelas) {
  const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });

  if (error) {
    console.log(`❌ ${t} — erro: ${error.message}`);
  } else {
    console.log(`✅ ${t} — ${count} registro(s)`);
  }
}
