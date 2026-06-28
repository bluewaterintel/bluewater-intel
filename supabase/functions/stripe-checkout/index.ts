// ============================================================================
// Bluewater Intel — Stripe Checkout session (Edge Function, Deno)
// Deploy: supabase functions deploy stripe-checkout --no-verify-jwt
//
// Creates a Stripe Checkout Session for one of:
//   kind="subscription" interval="month"|"year"  → recurring plan ($14.99/$109.99)
//   kind="lifetime"                               → one-time $899.99 (everything)
//   kind="pack" port="<port name>"                → one-time $49.99 waypoint pack
//
// The user must be signed in (Supabase JWT). We create/reuse a Stripe customer
// and stamp it on profiles.stripe_customer_id so the webhook + billing portal
// can map customer → user. Entitlements are written by stripe-webhook, never
// trusted from the client.
//
// SECRETS: STRIPE_SECRET_KEY, APP_URL, ALLOWED_ORIGINS,
//   STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, STRIPE_PRICE_LIFETIME,
//   STRIPE_PRICE_PACK, SUPABASE_URL, SUPABASE_ANON_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const PRICES = {
  monthly: Deno.env.get("STRIPE_PRICE_MONTHLY") ?? "",
  annual: Deno.env.get("STRIPE_PRICE_ANNUAL") ?? "",
  lifetime: Deno.env.get("STRIPE_PRICE_LIFETIME") ?? "",
  pack: Deno.env.get("STRIPE_PRICE_PACK") ?? "",
};

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
  if (!PRICES.monthly) return json({ error: "Billing not configured." }, 503);

  // Require a signed-in user.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uerr } = await supa.auth.getUser();
  if (uerr || !user) return json({ error: "Sign in required." }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const kind = String(body.kind ?? "subscription");
  const interval = String(body.interval ?? "month");
  const port = typeof body.port === "string" ? body.port.slice(0, 80) : "";

  // Resolve the price + checkout mode for the requested product.
  let price = "", mode: "subscription" | "payment" = "subscription";
  if (kind === "subscription") {
    price = interval === "year" ? PRICES.annual : PRICES.monthly;
    mode = "subscription";
  } else if (kind === "lifetime") {
    price = PRICES.lifetime; mode = "payment";
  } else if (kind === "pack") {
    if (!port) return json({ error: "Port required for a waypoint pack." }, 400);
    price = PRICES.pack; mode = "payment";
  } else {
    return json({ error: "Unknown product." }, 400);
  }
  if (!price) return json({ error: "Price not configured for this product." }, 503);

  try {
    // Reuse the customer if we already created one; otherwise create + persist it.
    const { data: prof } = await supa.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    let customerId = prof?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await supa.from("profiles").upsert({ id: user.id, stripe_customer_id: customerId }, { onConflict: "id" });
    }

    const meta: Record<string, string> = { user_id: user.id, kind };
    if (kind === "pack") meta.port = port;

    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${APP_URL}/?checkout=success`,
      cancel_url: `${APP_URL}/?checkout=cancel`,
      metadata: meta,
      ...(mode === "subscription"
        ? { subscription_data: { metadata: meta } }
        : { payment_intent_data: { metadata: meta } }),
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("checkout error", (e as Error)?.message);
    return json({ error: "Could not start checkout." }, 502);
  }
});
