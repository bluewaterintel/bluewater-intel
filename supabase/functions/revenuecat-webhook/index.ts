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
import { mapRcWebhookEvent } from "../_shared/revenuecat.ts";

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

  const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) {
    console.error("revenuecat-webhook upsert failed", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true, status: patch.subscription_status }), {
    headers: { "Content-Type": "application/json" },
  });
});
