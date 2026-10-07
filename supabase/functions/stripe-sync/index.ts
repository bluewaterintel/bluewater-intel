// ============================================================================
// Bluewater Intel — Pull Stripe subscription → Supabase profiles
// Deploy: supabase functions deploy stripe-sync
//
// Fallback when the Stripe webhook is delayed, misconfigured, or missed. The
// web app calls this after checkout success (and on demand) so Pro unlocks
// without waiting on webhook delivery.
//
// SECRETS: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { syncStripeEntitlementForUser } from "../_shared/stripe-entitlements.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Sign in required." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supa.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Sign in required." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const result = await syncStripeEntitlementForUser(admin, stripe, user.id, user.email);
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("stripe-sync failed", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
