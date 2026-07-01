// ============================================================================
// Bluewater Intel — Stripe Billing Portal session (Edge Function, Deno)
// Deploy: supabase functions deploy stripe-portal --no-verify-jwt
//
// Returns a URL to Stripe's hosted Billing Portal so a signed-in subscriber can
// update their card, view invoices, and cancel their subscription.
//
// SECRETS: STRIPE_SECRET_KEY, APP_URL, ALLOWED_ORIGINS,
//   SUPABASE_URL, SUPABASE_ANON_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.bluewaterintel.com").replace(/\/$/, "");

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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const CORS = cors(origin);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uerr } = await supa.auth.getUser();
  if (uerr || !user) return json({ error: "Sign in required." }, 401);

  const { data: prof } = await supa.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  const customerId = prof?.stripe_customer_id as string | undefined;
  if (!customerId) return json({ error: "No active subscription to manage." }, 400);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: APP_URL,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("portal error", (e as Error)?.message);
    return json({ error: "Could not open billing portal." }, 502);
  }
});
