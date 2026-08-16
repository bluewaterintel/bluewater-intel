// ============================================================================
// Bluewater Intel — Delete account (Edge Function, Deno)
// Deploy: supabase functions deploy delete-account --no-verify-jwt
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { purgeUserAccount } from "../_shared/delete-user.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function cors(origin: string | null) {
  const allow = origin || (ALLOWED[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const CORS = cors(origin);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    if (body && typeof body === "object" && ("userId" in body || "user_id" in body)) {
      console.warn("delete-account: ignored user id in request body");
    }
  } catch { /* empty body is fine */ }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uerr } = await supa.auth.getUser();
  if (uerr || !user) return json({ error: "Sign in required." }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    await purgeUserAccount(admin, user.id, { stripe, strictBilling: true });
    return json({ ok: true });
  } catch (e) {
    console.error("delete-account error", (e as Error)?.message);
    const msg = (e as Error)?.message || "Could not delete account.";
    const status = /cancel.*subscription/i.test(msg) ? 409 : 500;
    return json({ error: msg }, status);
  }
});
