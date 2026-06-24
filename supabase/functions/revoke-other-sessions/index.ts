import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUser = createClient(Deno.env.get("URL")!, Deno.env.get("ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const supabaseAdmin = createClient(Deno.env.get("URL")!, Deno.env.get("SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    let sessaoAtualId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      sessaoAtualId = payload.sid || null;
    } catch {
      // fallback: se não conseguir extrair do JWT, não exclui nenhuma
    }

    if (!sessaoAtualId) {
      return new Response(JSON.stringify({ error: "SESSAO_ID_NAO_ENCONTRADO" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const { data: sessions, error: listError } = await supabaseAdmin
      .rpc("get_user_sessions", { p_user_id: user.id });

    if (listError) throw listError;

    const outrasSessoes = (sessions || []).filter(
      (s: { id: string }) => s.id !== sessaoAtualId,
    );

    for (const sessao of outrasSessoes) {
      const { error } = await supabaseAdmin.rpc("delete_user_session", {
        p_session_id: sessao.id,
      });

      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true, encerradas: outrasSessoes.length }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
