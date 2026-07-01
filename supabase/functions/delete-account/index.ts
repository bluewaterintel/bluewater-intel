// ============================================================================
// Bluewater Intel — Delete account (Edge Function, Deno)
// Deploy: supabase functions deploy delete-account --no-verify-jwt
//
// Permanently deletes the CALLER's auth user and all app data. Identity is read
// ONLY from the Authorization Bearer token — never from the request body.
//
// Order: (1) cancel any active Stripe subscription, (2) delete user-owned rows
// with the service role, (3) delete the auth user via admin API.
//
// SECRETS: STRIPE_SECRET_KEY, ALLOWED_ORIGINS,
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
function cors(origin: string | null) {
  const allow = origin && (ALLOWED.length === 0 || ALLOWED.includes(origin)) ? origin : (ALLOWED[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

async function cancelStripeSubscriptions(customerId: string): Promise<void> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  const active = subs.data.filter((s) => ACTIVE_SUB_STATUSES.has(s.status));
  for (const sub of active) {
    await stripe.subscriptions.cancel(sub.id);
  }
}

async function deleteUserData(admin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  const tables = [
  { table: "user_waypoints", column: "user_id" },
  { table: "user_catches", column: "user_id" },
  { table: "user_logs", column: "user_id" },
  { table: "fishing_reports", column: "user_id" },
  { table: "waypoint_pack_entitlements", column: "user_id" },
  { table: "user_brief_usage", column: "user_id" },
  { table: "profiles", column: "id" },
  ] as const;

  for (const { table, column } of tables) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const CORS = cors(origin);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Never trust a user id from the request body — identity comes from the JWT only.
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

  const userId = user.id;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("stripe_customer_id, subscription_status")
      .eq("id", userId)
      .maybeSingle();

    const customerId = prof?.stripe_customer_id as string | undefined;
    const hasBillableSub = prof?.subscription_status === "active" || prof?.subscription_status === "trialing";

    if (customerId && hasBillableSub) {
      try {
        await cancelStripeSubscriptions(customerId);
      } catch (e) {
        console.error("stripe cancel failed", (e as Error)?.message);
        return json({
          error: "Could not cancel your subscription. Please cancel billing first from Manage Billing, then try again.",
        }, 409);
      }
    } else if (customerId) {
      // Customer exists (e.g. lifetime / canceled) — cancel any stray active subs in Stripe.
      try {
        await cancelStripeSubscriptions(customerId);
      } catch (e) {
        console.error("stripe cancel failed", (e as Error)?.message);
        return json({
          error: "Could not cancel your subscription. Please cancel billing first from Manage Billing, then try again.",
        }, 409);
      }
    }

    await deleteUserData(admin, userId);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error(delErr.message);

    return json({ ok: true });
  } catch (e) {
    console.error("delete-account error", (e as Error)?.message);
    return json({ error: (e as Error)?.message || "Could not delete account." }, 500);
  }
});
