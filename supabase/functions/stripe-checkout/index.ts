// ============================================================================
// Bluewater Intel — Stripe Checkout session (Edge Function, Deno)
// Deploy: supabase functions deploy stripe-checkout --no-verify-jwt
//
// Creates a Stripe Checkout Session for:
//   kind="subscription" interval="month"|"year"  → Pro plan (full app incl. all charted waypoints)
//
// The user must be signed in (Supabase JWT). We create/reuse a Stripe customer
// and stamp it on profiles.stripe_customer_id so the webhook + billing portal
// can map customer → user. Entitlements are written by stripe-webhook, never
// trusted from the client.
//
// Trial abuse: trial:true is refused when trial_consumed (or Stripe history)
// shows this email already used a 7-day trial. Paid checkout (no trial) and
// Free-tier use are unaffected.
//
// SECRETS: STRIPE_SECRET_KEY, APP_URL, ALLOWED_ORIGINS,
//   STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  emailHadStripeTrial,
  normalizeEmail,
  trialAlreadyConsumed,
} from "../_shared/trial.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const IS_LIVE = STRIPE_KEY.startsWith("sk_live_");
const PRO_CHECKOUT_BLURB =
  "Bluewater Intel Pro — full app access: Bite Map, all charted waypoints, ocean & wind layers, fishing reports, and up to 2 AI Captain's Briefs per day.";
const TRIAL_CHECKOUT_BLURB =
  "Bluewater Intel Pro — 7-day free trial: full app access (Bite Map, charted waypoints, ocean & wind layers, fishing reports) plus 1 AI Captain's Brief for the trial. After 7 days, $12.99/mo unless you cancel first.";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const PRICES = {
  monthly: Deno.env.get("STRIPE_PRICE_MONTHLY") ?? "",
  annual: Deno.env.get("STRIPE_PRICE_ANNUAL") ?? "",
};

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// Reflect the caller's Origin so CORS works from every hostname (apex, www.,
// mobile webview). Strict matching returned the apex domain for www./webview
// callers, which the browser rejects. Auth is enforced by the JWT bearer token,
// not CORS, and no cookies are used, so echoing the origin is safe.
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
  const trial = body.trial === true || body.trial === "true";

  // Only the Pro subscription is offered (monthly/annual). Lifetime and per-port
  // "packs" are discontinued.
  if (kind !== "subscription") return json({ error: "Unknown product." }, 400);
  const price = interval === "year" ? PRICES.annual : PRICES.monthly;
  const mode: "subscription" | "payment" = "subscription";
  if (!price) return json({ error: "Price not configured for this product." }, 503);

  // One free trial per email. Paid Monthly/Annual checkout skips this entirely
  // so former trial/paid users can still subscribe — and canceling to Free never
  // touches this path.
  if (trial) {
    const email = normalizeEmail(user.email);
    if (!email) {
      return json({ error: "A verified email is required to start a free trial.", code: "trial_email_required" }, 400);
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const used = await trialAlreadyConsumed(admin, { email })
      || await emailHadStripeTrial(stripe, email);
    if (used) {
      return json({
        error: "You've already used your free trial. Choose Monthly or Annual to subscribe — or continue on Free.",
        code: "trial_used",
      }, 403);
    }
  }

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

    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${APP_URL}/?checkout=success`,
      cancel_url: `${APP_URL}/?checkout=cancel`,
      metadata: meta,
      ...(kind === "subscription"
        ? {
            custom_text: {
              submit: { message: trial ? TRIAL_CHECKOUT_BLURB : PRO_CHECKOUT_BLURB },
            },
          }
        : {}),
      ...(mode === "subscription"
        ? {
            subscription_data: {
              metadata: meta,
              ...(trial ? { trial_period_days: 7 } : {}),
            },
          }
        : { payment_intent_data: { metadata: meta } }),
    });

    return json({ url: session.url, livemode: IS_LIVE });
  } catch (e) {
    console.error("checkout error", (e as Error)?.message);
    return json({ error: "Could not start checkout." }, 502);
  }
});
