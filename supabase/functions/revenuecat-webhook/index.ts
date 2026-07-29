// ============================================================================
// Bluewater Intel — RevenueCat webhook → unified Supabase entitlements
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
//
// RevenueCat receives App Store receipts and notifies this endpoint when a
// user's "pro" entitlement changes. We write the SAME profiles columns that
// the Stripe webhook uses, so has_premium() works on web and iOS alike.
//
// SECRETS: REVENUECAT_WEBHOOK_AUTH, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const PRO_ENTITLEMENT = "pro";

function mapRcEvent(event: Record<string, unknown>) {
  const type = String(event.type ?? "");
  const appUserId = String(event.app_user_id ?? "");
  const entitlementIds: string[] = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids.map(String)
    : [];
  const hasPro = entitlementIds.includes(PRO_ENTITLEMENT)
    || String(event.entitlement_id ?? "") === PRO_ENTITLEMENT;
  const expires = event.expiration_at_ms
    ? new Date(Number(event.expiration_at_ms)).toISOString()
    : null;
  const productId = String(event.product_id ?? "");
  const interval = /annual|year/i.test(productId) ? "year" : "month";
  const originalTx = event.original_transaction_id
    ? String(event.original_transaction_id)
    : null;

  let status = "none";
  if (hasPro) {
    status = type.includes("TRIAL") ? "trialing" : "active";
  } else if (["EXPIRATION", "CANCELLATION"].some((t) => type.includes(t))) {
    status = "canceled";
  }

  return { appUserId, status, expires, interval, originalTx, type };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (WEBHOOK_AUTH) {
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${WEBHOOK_AUTH}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const event = (body.event as Record<string, unknown>) ?? body;
  const { appUserId, status, expires, interval, originalTx } = mapRcEvent(event);

  // app_user_id is the Supabase user UUID (set in bw-iap.js Purchases.configure).
  if (!appUserId || !/^[0-9a-f-]{36}$/i.test(appUserId)) {
    console.warn("revenuecat-webhook: skip — no valid app_user_id", appUserId);
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const patch: Record<string, unknown> = {
    id: appUserId,
    billing_source: "apple",
    subscription_status: status,
    subscription_interval: status === "none" || status === "canceled" ? null : interval,
    current_period_end: expires,
    updated_at: new Date().toISOString(),
  };
  if (originalTx) patch.apple_original_transaction_id = originalTx;

  const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) {
    console.error("revenuecat-webhook upsert failed", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
