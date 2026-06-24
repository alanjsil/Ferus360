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

async function resolverCategoria(nome, usuarioId, tipo) {
  const { data: existente } = await supabase
    .from("financas_categorias")
    .select("id")
    .eq("nome", nome)
    .or(`eh_global.eq.true,usuario_id.eq.${usuarioId}`)
    .maybeSingle();

  if (existente) return existente.id;

  const { data: criada, error } = await supabase
    .from("financas_categorias")
    .insert({ nome, usuario_id: usuarioId, tipo })
    .select("id")
    .single();

  if (error) {
    console.error(`  Erro ao criar categoria "${nome}": ${error.message}`);
    return null;
  }

  console.log(`  Categoria "${nome}" criada`);
  return criada.id;
}

async function resolverSubcategoria(nome, categoriaId, usuarioId) {
  const { data: existente } = await supabase
    .from("financas_subcategorias")
    .select("id")
    .eq("categoria_id", categoriaId)
    .eq("nome", nome)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (existente) return existente.id;

  const { data: criada, error } = await supabase
    .from("financas_subcategorias")
    .insert({ nome, categoria_id: categoriaId, usuario_id: usuarioId })
    .select("id")
    .single();

  if (error) {
    console.error(`  Erro ao criar subcategoria "${nome}": ${error.message}`);
    return null;
  }

  console.log(`  Subcategoria "${nome}" criada`);
  return criada.id;
}

async function resolverConta(nome, usuarioId) {
  const { data: existente } = await supabase
    .from("financas_contas")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("nome", nome)
    .maybeSingle();

  if (existente) return existente.id;

  const { data: criada, error } = await supabase
    .from("financas_contas")
    .insert({ nome, usuario_id: usuarioId })
    .select("id")
    .single();

  if (error) {
    console.error(`  Erro ao criar conta "${nome}": ${error.message}`);
    return null;
  }

  console.log(`  Conta "${nome}" criada`);
  return criada.id;
}

async function resolverPessoa(nome, usuarioId) {
  const { data: existente } = await supabase
    .from("financas_pessoas")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("nome", nome)
    .maybeSingle();

  if (existente) return existente.id;

  const { data: criada, error } = await supabase
    .from("financas_pessoas")
    .insert({ nome, usuario_id: usuarioId })
    .select("id")
    .single();

  if (error) {
    console.error(`  Erro ao criar pessoa "${nome}": ${error.message}`);
    return null;
  }

  console.log(`  Pessoa "${nome}" criada`);
  return criada.id;
}

async function processar() {
  const jsonPath = resolve(__dirname, "dados-exemplo.json");
  const { usuarios } = JSON.parse(readFileSync(jsonPath, "utf-8"));

  for (const usuario of usuarios) {
    console.log(`\n--- ${usuario.nome} (${usuario.id}) ---`);

    const contaCache = {};
    const pessoaCache = {};
    const catCache = {};
    const subCache = {};

    for (const conta of usuario.contas) {
      contaCache[conta.nome] = await resolverConta(conta.nome, usuario.id);
    }

    for (const pessoa of usuario.pessoas) {
      pessoaCache[pessoa.nome] = await resolverPessoa(pessoa.nome, usuario.id);
    }

    for (const lanc of usuario.lancamentos) {
      if (!catCache[lanc.categoria]) {
        catCache[lanc.categoria] = await resolverCategoria(lanc.categoria, usuario.id, lanc.tipo);
      }
      const categoriaId = catCache[lanc.categoria];

      let subcategoriaId = null;
      if (lanc.subcategoria && categoriaId) {
        const cacheKey = `${categoriaId}:${lanc.subcategoria}`;
        if (!subCache[cacheKey]) {
          subCache[cacheKey] = await resolverSubcategoria(lanc.subcategoria, categoriaId, usuario.id);
        }
        subcategoriaId = subCache[cacheKey];
      }

      const hoje = new Date().toISOString();
      const payload = {
        data: lanc.data,
        tipo: lanc.tipo,
        valor: lanc.valor,
        status: lanc.status,
        usuario_id: usuario.id,
        descricao: lanc.descricao || null,
        categoria_id: categoriaId || null,
        subcategoria_id: subcategoriaId,
        data_pagamento: lanc.status === "PAGO" ? hoje : null,
      };

      if (lanc.conta && contaCache[lanc.conta]) {
        if (lanc.tipo === "RECEITA") {
          payload.conta_destino_id = contaCache[lanc.conta];
        } else {
          payload.conta_origem_id = contaCache[lanc.conta];
        }
      }

      if (lanc.pessoa && pessoaCache[lanc.pessoa]) {
        payload.pessoa_id = pessoaCache[lanc.pessoa];
      }

      const { error } = await supabase.from("financas_lancamentos").insert(payload);

      if (error) {
        console.error(`  Erro lançamento ${lanc.data} ${lanc.tipo} R$${lanc.valor}: ${error.message}`);
      } else {
        console.log(`  Lançamento ${lanc.data} ${lanc.tipo} R$${lanc.valor} — OK`);
      }
    }

    for (const orc of usuario.orcamentos) {
      if (!catCache[orc.categoria]) {
        catCache[orc.categoria] = await resolverCategoria(orc.categoria, usuario.id, orc.tipo);
      }
      const categoriaId = catCache[orc.categoria];

      let subcategoriaId = null;
      if (orc.subcategoria && categoriaId) {
        const cacheKey = `${categoriaId}:${orc.subcategoria}`;
        if (!subCache[cacheKey]) {
          subCache[cacheKey] = await resolverSubcategoria(orc.subcategoria, categoriaId, usuario.id);
        }
        subcategoriaId = subCache[cacheKey];
      }

      const payload = {
        data: orc.data,
        tipo: orc.tipo,
        descricao: orc.descricao || null,
        valor_planejado: orc.valor_planejado,
        valor_realizado: 0,
        usuario_id: usuario.id,
        categoria_id: categoriaId || null,
        subcategoria_id: subcategoriaId,
      };

      if (orc.conta && contaCache[orc.conta]) {
        payload.conta_id = contaCache[orc.conta];
      }

      if (orc.pessoa && pessoaCache[orc.pessoa]) {
        payload.pessoa_id = pessoaCache[orc.pessoa];
      }

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
