// ============================================================================
// Bluewater Intel — RevenueCat webhook → unified Supabase entitlements
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
//
// RevenueCat receives App Store receipts and notifies this endpoint when a
// user's "pro" entitlement changes. We write the SAME profiles columns that
// the Stripe webhook uses, so has_premium() works on web and iOS alike.
//
// SECRETS: REVENUECAT_WEBHOOK_AUTH, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto),
//   RESEND_API_KEY, ALERT_EMAIL (default info@bluewaterintel.com), ALERT_FROM
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { notifyOwnerAppleSubscriber } from "../_shared/billing-alerts.ts";
import { isProProduct, mapRcWebhookEvent } from "../_shared/revenuecat.ts";
import { blocksCrossStoreOverwrite } from "../_shared/billing-source-guard.ts";

const WEBHOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

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
  const mapped = mapRcWebhookEvent(event);

  if (!mapped) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { appUserId, patch } = mapped;

  // app_user_id is the Supabase user UUID (set in bw-iap.js Purchases.configure).
  if (!appUserId || !/^[0-9a-f-]{36}$/i.test(appUserId)) {
    console.warn("revenuecat-webhook: skip — no valid app_user_id", appUserId);
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: beforeProf } = await admin.from("profiles")
    .select("billing_source, subscription_status")
    .eq("id", appUserId)
    .maybeSingle();
  if (blocksCrossStoreOverwrite(beforeProf, patch.billing_source)) {
    console.warn("revenuecat-webhook skipped cross-store overwrite", beforeProf?.billing_source, patch.billing_source);
    return new Response(JSON.stringify({ ok: true, skipped: "existing_subscription" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) {
    console.error("revenuecat-webhook upsert failed", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }

  const rcType = String(event.type ?? "");
  const productId = String(event.product_id ?? "");
  const periodType = String(event.period_type ?? "").toUpperCase();
  const isTrial = periodType === "TRIAL" || periodType === "INTRO";
  const isNewPurchase = rcType === "INITIAL_PURCHASE"
    && (patch.subscription_status === "active" || patch.subscription_status === "trialing")
    && isProProduct(productId);

  if (isNewPurchase) {
    let email: string | null = null;
    try {
      const { data: { user } } = await admin.auth.admin.getUserById(appUserId);
      email = user?.email ?? null;
    } catch { /* optional */ }
    const interval = /annual|year/i.test(productId) ? "year" : "month";
    const planName = interval === "year" ? "Pro — Annual" : "Pro — Monthly";
    const tierLabel = isTrial ? `7-day free trial → ${planName}` : planName;
    const { data: prof } = await admin.from("profiles")
      .select("subscription_status, subscription_interval, current_period_end, trial_end, billing_source")
      .eq("id", appUserId)
      .maybeSingle();
    await notifyOwnerAppleSubscriber({
      email,
      userId: appUserId,
      tierLabel,
      productId,
      rcEventType: rcType,
      profile: prof ?? patch,
    });
  }

  return new Response(JSON.stringify({ ok: true, status: patch.subscription_status }), {
    headers: { "Content-Type": "application/json" },
  });
});
