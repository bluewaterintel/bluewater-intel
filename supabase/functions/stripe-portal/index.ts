// ============================================================================
// Bluewater Intel — Stripe Billing Portal session (Edge Function, Deno)
// Deploy: supabase functions deploy stripe-portal --no-verify-jwt
//
// Returns a URL to Stripe's hosted Billing Portal so a signed-in subscriber can
// update their plan (monthly ↔ annual), update their card, view invoices, and
// cancel their subscription.
//
// SECRETS: STRIPE_SECRET_KEY, APP_URL, ALLOWED_ORIGINS,
//   STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL,
//   STRIPE_PORTAL_CONFIG_ID (optional — skips auto-config),
//   SUPABASE_URL, SUPABASE_ANON_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.bluewaterintel.com").replace(/\/$/, "");
const NATIVE_SCHEME = "com.bluewaterintel.app://";
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

let cachedPortalConfigId: string | null = Deno.env.get("STRIPE_PORTAL_CONFIG_ID") || null;

async function portalFeatures(): Promise<Stripe.BillingPortal.ConfigurationCreateParams.Features> {
  if (!PRICES.monthly) throw new Error("STRIPE_PRICE_MONTHLY not configured");

  const monthlyPrice = await stripe.prices.retrieve(PRICES.monthly);
  const productId = typeof monthlyPrice.product === "string" ? monthlyPrice.product : monthlyPrice.product.id;
  const prices = PRICES.annual && PRICES.annual !== PRICES.monthly
    ? [PRICES.monthly, PRICES.annual]
    : [PRICES.monthly];

  return {
    customer_update: { enabled: false },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      cancellation_reason: {
        enabled: true,
        options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      products: [{ product: productId, prices }],
      proration_behavior: "create_prorations",
      trial_update_behavior: "continue_trial",
    },
  };
}

async function ensurePortalConfiguration(): Promise<string> {
  if (cachedPortalConfigId) return cachedPortalConfigId;

  const features = await portalFeatures();

  const configs = await stripe.billingPortal.configurations.list({ limit: 100, active: true });
  const tagged = configs.data.find((c) => c.metadata?.app === "bluewater-intel");
  if (tagged) {
    await stripe.billingPortal.configurations.update(tagged.id, { features, active: true });
    cachedPortalConfigId = tagged.id;
    return tagged.id;
  }

  const config = await stripe.billingPortal.configurations.create({
    metadata: { app: "bluewater-intel" },
    features,
  });
  cachedPortalConfigId = config.id;
  return config.id;
}

function allowedReturnUrl(url: unknown, fallback: string): string {
  if (typeof url !== "string" || !url) return fallback;
  const trimmed = url.trim();
  if (APP_URL && trimmed.startsWith(APP_URL)) return trimmed;
  if (trimmed.startsWith(NATIVE_SCHEME)) return trimmed;
  return fallback;
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

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const { data: prof } = await supa.from("profiles").select("stripe_customer_id, subscription_status").eq("id", user.id).maybeSingle();
  const customerId = prof?.stripe_customer_id as string | undefined;
  const subStatus = (prof?.subscription_status as string | undefined) ?? "none";
  const canManage = ["active", "trialing", "past_due", "lifetime", "canceled"].includes(subStatus);

  if (!customerId) {
    return json({ error: "No billing account on file. Subscribe or start a trial first." }, 400);
  }
  if (!canManage) {
    return json({ error: "You're on the free plan — no billing to manage." }, 400);
  }

  try {
    const configuration = await ensurePortalConfiguration();
    const returnUrl = allowedReturnUrl(body.return_url, APP_URL);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      configuration,
    });
    return json({ url: session.url });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    console.error("portal error", msg);
    if (/no such customer/i.test(msg)) {
      return json({
        error: "Billing record not found. If you never subscribed, you can delete your account without canceling billing.",
      }, 404);
    }
    return json({ error: "Could not open billing portal. Contact info@bluewaterintel.com for help." }, 502);
  }
});
