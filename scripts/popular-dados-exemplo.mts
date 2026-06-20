/**
 * @file Popula banco com dados de exemplo a partir de dados-exemplo.json
 * Uso: node scripts/popular-dados-exemplo.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env"), quiet: true });

const SUPABASE_URL = "https://lsjoopdtjjadfoqsaasu.supabase.co";

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function getCategoriaId(nome) {
  const { data } = await supabase.from("financas_categorias").select("id").eq("eh_global", true).eq("nome", nome).maybeSingle();

  if (data) return data.id;

  const { data: userCat } = await supabase.from("financas_categorias").select("id").eq("nome", nome).limit(1).maybeSingle();

  return userCat?.id || null;
}

async function contaExiste(usuarioId, nome) {
  const { data } = await supabase.from("financas_contas").select("id").eq("usuario_id", usuarioId).eq("nome", nome).maybeSingle();

  return data?.id || null;
}

async function pessoaExiste(usuarioId, nome) {
  const { data } = await supabase.from("financas_pessoas").select("id").eq("usuario_id", usuarioId).eq("nome", nome).maybeSingle();

  return data?.id || null;
}

async function processar() {
  const jsonPath = resolve(__dirname, "dados-exemplo.json");
  const { usuarios } = JSON.parse(readFileSync(jsonPath, "utf-8"));

  for (const usuario of usuarios) {
    console.log(`\n--- ${usuario.nome} (${usuario.id}) ---`);

    for (const conta of usuario.contas) {
      const existente = await contaExiste(usuario.id, conta.nome);
      if (existente) {
        console.log(`  Conta "${conta.nome}" já existe — ignorando`);
        continue;
      }
      const { error } = await supabase.from("financas_contas").insert({ nome: conta.nome, usuario_id: usuario.id });

      if (error) {
        console.error(`  Erro ao criar conta "${conta.nome}":`, error.message);
      } else {
        console.log(`  Conta "${conta.nome}" criada`);
      }
    }

    for (const pessoa of usuario.pessoas) {
      const existente = await pessoaExiste(usuario.id, pessoa.nome);
      if (existente) {
        console.log(`  Pessoa "${pessoa.nome}" já existe — ignorando`);
        continue;
      }
      const { error } = await supabase.from("financas_pessoas").insert({ nome: pessoa.nome, usuario_id: usuario.id });

      if (error) {
        console.error(`  Erro ao criar pessoa "${pessoa.nome}":`, error.message);
      } else {
        console.log(`  Pessoa "${pessoa.nome}" criada`);
      }
    }

    const catCache = {};

    for (const lanc of usuario.lancamentos) {
      if (!catCache[lanc.categoria]) {
        catCache[lanc.categoria] = await getCategoriaId(lanc.categoria);
      }
      const categoriaId = catCache[lanc.categoria];

      const hoje = new Date().toISOString();
      const payload = {
        data: lanc.data,
        tipo: lanc.tipo,
        valor: lanc.valor,
        status: lanc.status,
        usuario_id: usuario.id,
        descricao: lanc.descricao || null,
        categoria_id: categoriaId || null,
        data_pagamento: lanc.status === "PAGO" ? hoje : null,
      };

      const { error } = await supabase.from("financas_lancamentos").insert(payload);

      if (error) {
        console.error(`  Erro lançamento ${lanc.data} ${lanc.tipo} R$${lanc.valor}: ${error.message}`);
      } else {
        console.log(`  Lançamento ${lanc.data} ${lanc.tipo} R$${lanc.valor} — OK`);
      }
    }

    for (const orc of usuario.orcamentos) {
      if (!catCache[orc.categoria]) {
        catCache[orc.categoria] = await getCategoriaId(orc.categoria);
      }
      const categoriaId = catCache[orc.categoria];

      const payload = {
        data: orc.data,
        tipo: orc.tipo,
        descricao: orc.descricao || null,
        valor_planejado: orc.valor_planejado,
        valor_realizado: 0,
        usuario_id: usuario.id,
        categoria_id: categoriaId || null,
      };

      const { error } = await supabase.from("financas_orcamento").insert(payload);

      if (error) {
        console.error(`  Erro orçamento ${orc.data} ${orc.descricao}: ${error.message}`);
      } else {
        console.log(`  Orçamento ${orc.data} ${orc.descricao} — OK`);
      }
    }
  }

  console.log("\n✅ Dados de exemplo inseridos com sucesso!");
}

processar().catch((err) => {
  console.error("Falha:", err);
  process.exit(1);
});
