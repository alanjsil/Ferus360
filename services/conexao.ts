import "../src/env";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import EventEmitter from "events";

const SUPABASE_URL = "https://lsjoopdtjjadfoqsaasu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzam9vcGR0amphZGZvcXNhYXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MzI5NTcsImV4cCI6MjA5NjIwODk1N30.dRVEivrhYwTMeBQgAGqqMENOL-SNzseZIFsT1DgKQrE";

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const logger = require("./logger");
  logger.error("conexao", "Falta chaves do banco (obrigatórios)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let supabaseAdmin: ReturnType<typeof createClient> | null = null;
if (SUPABASE_SERVICE_ROLE) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
}

const emitter = new EventEmitter();
let _online = false;
let _intervalId: ReturnType<typeof setInterval> | null = null;

async function estaOnline(): Promise<boolean> {
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/", {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

function onStatusChange(callback: (online: boolean) => void): () => void {
  emitter.on("conexao:status", callback);
  return () => { emitter.removeListener("conexao:status", callback); };
}

function iniciarMonitoramento(): void {
  if (_intervalId) return;

  _intervalId = setInterval(async () => {
    const onlineAgora = await estaOnline();
    if (onlineAgora !== _online) {
      _online = onlineAgora;
      emitter.emit("conexao:status", onlineAgora);
    }
  }, 30000);

  estaOnline().then((online) => {
    _online = online;
    emitter.emit("conexao:status", online);
  });
}

function pararMonitoramento(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

function isOnline(): boolean {
  return _online;
}

export {
  supabase,
  supabaseAdmin,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  createClient,
  estaOnline,
  onStatusChange,
  iniciarMonitoramento,
  pararMonitoramento,
  isOnline,
};
