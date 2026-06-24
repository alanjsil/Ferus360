import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const supabaseUser = createClient(Deno.env.get("URL")!, Deno.env.get("ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const supabaseAdmin = createClient(Deno.env.get("URL")!, Deno.env.get("SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabaseUser.from("financas_usuarios").select("role").eq("id", user.id).single();

    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    const { usuarioId } = await req.json();
    if (!usuarioId) {
      return new Response(JSON.stringify({ error: "USUARIO_ID_AUSENTE" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const { error } = await supabaseAdmin.auth.admin.signOut(usuarioId);

    if (error) {
      console.error("[revoke-user-sessions] Erro ao revogar sessões:", error);
      return new Response(JSON.stringify({ error: "ERRO_REVOGAR_SESSOES" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
