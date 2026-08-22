// ============================================================================
// Bluewater Intel — Pull RevenueCat entitlements → Supabase profiles
// Deploy: supabase functions deploy iap-sync
//
// Fallback when the RevenueCat webhook is delayed or missed. The iOS app calls
// this after purchase/restore so Pro unlocks without waiting on webhook delivery.
//
// SECRETS: REVENUECAT_SECRET_API_KEY (RevenueCat project secret key, NOT appl_ SDK key)
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchRcProfilePatch } from "../_shared/revenuecat.ts";

const RC_SECRET = Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "";

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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const patch = await fetchRcProfilePatch(user.id, RC_SECRET);
    const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
    if (error) {
      console.error("iap-sync upsert failed", error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 502 });
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
