import { createClient } from "@supabase/supabase-js";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { nome, email } = await req.json();

    if (!nome || !email) {
      return new Response(JSON.stringify({ error: "DADOS_INCOMPLETOS" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "EMAIL_INVALIDO" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        nome,
      },
      redirectTo: "financasapp://recuperar-senha",
    });

    if (inviteError) {
      const msg = inviteError.message?.toLowerCase() ?? "";

      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        return new Response(JSON.stringify({ error: "EMAIL_JA_CADASTRADO" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: inviteError.message || "ERRO_ENVIAR_CONVITE",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const usuarioConvidado = invited.user;

    if (!usuarioConvidado) {
      return new Response(JSON.stringify({ error: "USUARIO_NAO_CRIADO" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: usuarioConvidado.id,
        nome,
        email,
        conviteEnviado: true,
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
