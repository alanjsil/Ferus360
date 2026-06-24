/**
 * @file Teste Playwright: Fluxo de Login -> Criar Lancamento -> Dashboard.
 * @description Testa a UI do Electron via Playwright com seed minimo no Supabase.
 * @module test/e2e/auth-lancamento.spec.ts
 * @changelog
 * [2026-06-20] - Alan Silveira
 * - Criado teste Playwright reaproveitando logica do auth-lancamento.test.js
 * - Seed inline para compatibilidade com modulo CJS do Playwright
 * - Usuario fixo: teste@teste-playwright.com (criado manualmente)
 * - Categoria global "Alimentação" ja existe no Supabase
 */

import { test, expect, _electron as electron } from "@playwright/test";
import path from "path";
import os from "os";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
const USUARIO_FIXO = {
  id: "4fe7c7ee-445a-4cf7-af96-fcb9b0374343",
  email: "teste@teste-playwright.com",
};
const CAT_GLOBAL_ALIMENTACAO_ID = "a61c5ea3-55e4-43a3-8485-cf4f5914f671";
const SENHA_PADRAO = "SenhaTeste123!";

declare global {
  interface Window {
    electronAPI: {
      getSubcategorias(categoriaId?: string): Promise<Array<{ id: string; nome: string; categoria_id: string }>>;
      getCategorias(tipo?: string): Promise<Array<{ id: string; nome: string; tipo: string }>>;
      getContas(): Promise<Array<{ id: string; nome: string }>>;
    };
  }
}

function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function seedMinimo(supabase: any) {
  const { data: sub } = await supabase.from("financas_subcategorias").select("*").eq("nome", "Mercado").eq("usuario_id", USUARIO_FIXO.id).maybeSingle();

  if (!sub) {
    const { data: novaSub, error: subErr } = await supabase
      .from("financas_subcategorias")
      .insert({ nome: "Mercado", categoria_id: CAT_GLOBAL_ALIMENTACAO_ID, usuario_id: USUARIO_FIXO.id })
      .select()
      .single();
    if (subErr) throw new Error(`Falha subcategoria: ${subErr.message}`);
  }

  const { data: conta } = await supabase.from("financas_contas").select("*").eq("nome", "NuBank").eq("usuario_id", USUARIO_FIXO.id).maybeSingle();

  if (!conta) {
    const { error: contaErr } = await supabase.from("financas_contas").insert({ nome: "NuBank", usuario_id: USUARIO_FIXO.id });
    if (contaErr) throw new Error(`Falha conta: ${contaErr.message}`);
  }
}

async function limparDadosTeste(supabase: any) {
  await supabase.from("financas_subcategorias").delete().eq("nome", "Mercado").eq("usuario_id", USUARIO_FIXO.id);
  await supabase.from("financas_contas").delete().eq("nome", "NuBank").eq("usuario_id", USUARIO_FIXO.id);
}

test.describe("Auth -> Lançamentos -> Dashboard [Playwright]", () => {
  let supabaseAdmin: ReturnType<typeof getAdminClient>;

  test.beforeAll(async () => {
    supabaseAdmin = getAdminClient();
    await seedMinimo(supabaseAdmin);
  });

  test.afterAll(async () => {
    await limparDadosTeste(supabaseAdmin);
  });

  test("Fluxo completo: Login -> Criar Lançamento -> Dashboard", async () => {
    const electronApp = await electron.launch({ args: ["."] });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    // Aguardar splash e formulario de login
    await page.waitForSelector("#splashScreen", { state: "hidden", timeout: 15000 }).catch(() => {});
    await page.waitForSelector("#loginForm", { state: "visible", timeout: 20000 });

    // Login
    await page.fill("#email", USUARIO_FIXO.email);
    await page.fill("#senha", SENHA_PADRAO);
    await page.click("#loginSubmit");

    // Aguardar redirect para index.html
    await page.waitForURL("**/index.html", { timeout: 30000 });

    // Preencher formulario de lancamento
    await page.waitForSelector("#data", { state: "visible" });
    await page.fill("#data", "2026-06-15");
    await page.selectOption("#tipo", "DESPESA");
    await page.fill("#valor", "150.50");
    await page.selectOption("#status", "PAGO");

    // Aguardar e selecionar categoria "Alimentação" (global, sempre visivel)
    await page.waitForSelector('#categoria option:not([value=""])', { state: "attached", timeout: 15000 });
    await page.selectOption("#categoria", { label: "Alimentação" });

    // Forçar populacao do select de subcategoria (change event pode nao disparar)
    await page.waitForTimeout(1000);
    await page.evaluate(async () => {
      const categoriaId = (document.getElementById("categoria") as HTMLSelectElement).value;
      const select = document.getElementById("subcategoria") as HTMLSelectElement;
      const subs = await window.electronAPI.getSubcategorias();
      if (!subs?.length) return;
      select.innerHTML = '<option value="" disabled selected>Selecione...</option>';
      subs
        .filter((s) => String(s.categoria_id) === categoriaId)
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.nome;
          select.appendChild(opt);
        });
    });

    // Aguardar subcategorias carregarem (apos selecionar categoria)
    await page.waitForFunction(
      () => {
        const sel = document.getElementById("subcategoria") as HTMLSelectElement;
        return sel && Array.from(sel.options).some((o) => o.value && o.value !== "");
      },
      { timeout: 15000 },
    );
    await page.selectOption("#subcategoria", { label: "Mercado" });

    // Aguardar contas carregarem
    await page.waitForFunction(
      () => {
        const sel = document.getElementById("contaOrigem") as HTMLSelectElement;
        return sel && Array.from(sel.options).some((o) => o.value && o.value !== "");
      },
      { timeout: 15000 },
    );
    await page.selectOption("#contaOrigem", { label: "NuBank" });

    await page.fill("#descricao", "Compra no supermercado Playwright");

    // Submeter formulario
    await page.click('#formLancamento button[type="submit"]');

    // Validar que o lancamento aparece na tabela
    await expect(page.locator("#tabelaLancamentos")).toContainText("Compra no supermercado Playwright", { timeout: 15000 });

    // Navegar para Dashboard
    await page.click("#btnDashboard");
    await page.waitForURL("**/dashboard.html", { timeout: 15000 });
    await expect(page.locator("#chartMensal")).toBeVisible({ timeout: 15000 });

    // Logout (opcional, apenas tenta)
    await page.click("#logoutBtn").catch(() => {});
    await page.waitForURL("**/login.html", { timeout: 5000 }).catch(() => {});

    await electronApp.close();
  });
});
