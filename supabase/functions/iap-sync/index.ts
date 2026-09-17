// ============================================================================
// Bluewater Intel — Pull RevenueCat entitlements → Supabase profiles
// Deploy: supabase functions deploy iap-sync
//
// Fallback when the RevenueCat webhook is delayed or missed. The iOS app calls
// this after purchase/restore so Pro unlocks without waiting on webhook delivery.
//
// SECRETS: REVENUECAT_SECRET_API_KEY (V2 secret, Customer information: Read),
//         REVENUECAT_PROJECT_ID (proj_… from Project settings → General)
//   RESEND_API_KEY, ALERT_EMAIL — owner email when sync newly grants Pro/trial
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  appleTierLabel,
  notifyOwnerAppleIapSyncBackup,
  profileEntitled,
} from "../_shared/billing-alerts.ts";
import { fetchRcProfilePatch } from "../_shared/revenuecat.ts";

const RC_SECRET = Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "";
const RC_PROJECT = Deno.env.get("REVENUECAT_PROJECT_ID") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supa.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 });
  }

  if (!RC_SECRET || RC_SECRET.includes("YOUR_")) {
    return new Response(JSON.stringify({ error: "RevenueCat secret key not configured." }), {
      status: 503,
    });
  }
  if (!RC_PROJECT || RC_PROJECT.includes("YOUR_")) {
    return new Response(JSON.stringify({
      error: "REVENUECAT_PROJECT_ID not configured (required for V2 secret keys).",
    }), { status: 503 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: beforeProf } = await admin.from("profiles")
      .select("subscription_status")
      .eq("id", user.id)
      .maybeSingle();
    const beforeStatus = (beforeProf?.subscription_status as string | null) ?? "none";

    const patch = await fetchRcProfilePatch(user.id, RC_SECRET, RC_PROJECT);
    const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
    if (error) {
      console.error("iap-sync upsert failed", error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 502 });
    }

    const afterStatus = patch.subscription_status;
    const newlyEntitled = !profileEntitled(beforeStatus)
      && profileEntitled(afterStatus)
      && (afterStatus === "active" || afterStatus === "trialing");

    if (newlyEntitled) {
      const { data: prof } = await admin.from("profiles")
        .select("subscription_status, subscription_interval, current_period_end, trial_end, billing_source")
        .eq("id", user.id)
        .maybeSingle();
      const tierLabel = appleTierLabel(afterStatus, patch.subscription_interval ?? null);
      await notifyOwnerAppleIapSyncBackup({
        email: user.email ?? null,
        userId: user.id,
        tierLabel,
        beforeStatus,
        profile: prof ?? patch,
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      subscription_status: patch.subscription_status,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("iap-sync failed", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 502 });
  }
});
