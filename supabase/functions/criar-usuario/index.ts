import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const supabaseUser = createClient(Deno.env.get("URL")!, Deno.env.get("ANON_KEY")!, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const supabaseAdmin = createClient(Deno.env.get("URL")!, Deno.env.get("SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const { data: profile, error: profileError } = await supabaseUser.from("financas_usuarios").select("role").eq("id", user.id).single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "USUARIO_NAO_ENCONTRADO" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    if (profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    const { nome, email, senha } = await req.json();

    if (!nome || !email || !senha) {
      return new Response(JSON.stringify({ error: "DADOS_INCOMPLETOS" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "EMAIL_INVALIDO" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (senha.length < 8) {
      return new Response(JSON.stringify({ error: "SENHA_FRACA" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        nome,
      },
    });

    if (createError) {
      const msg = createError.message?.toLowerCase() ?? "";

      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        return new Response(JSON.stringify({ error: "EMAIL_JA_CADASTRADO" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: createError.message || "ERRO_CRIAR_USUARIO",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const novoUsuario = created.user;

    if (!novoUsuario) {
      return new Response(JSON.stringify({ error: "USUARIO_NAO_CRIADO" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    await supabaseAdmin.from("financas_auditoria").insert({
      usuario_id: user.id,
      acao: "ADMIN_CRIOU_USUARIO",
      entidade: "usuarios",
      entidade_id: novoUsuario.id,
      dados_novos: {
        nome,
        email,
      },
      contexto: "admin",
    });

    return new Response(
      JSON.stringify({
        success: true,
        id: novoUsuario.id,
        nome,
        email,
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});
