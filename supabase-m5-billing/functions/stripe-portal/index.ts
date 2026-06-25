// ============================================================================
// Bluewater Intel — Stripe Billing Portal session (Edge Function, Deno)
// Deploy: supabase functions deploy stripe-portal
//
// Returns a URL to Stripe's hosted Billing Portal so a signed-in user can update
// their card, view invoices, and CANCEL their subscription themselves. Required
// for a clean (and legally-expected) "easy cancellation" path.
//
// SECRETS: STRIPE_SECRET_KEY, APP_URL, SUPABASE_URL/SUPABASE_ANON_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
const APP_URL = Deno.env.get("APP_URL") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGINS") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await supa.auth.getUser();
  if (error || !user) return json({ error: "Sign in required." }, 401);

  const { data: prof } = await supa.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  const customerId = prof?.stripe_customer_id;
  if (!customerId) return json({ error: "No billing account yet." }, 400);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/?portal=return`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("portal error", (e as Error)?.message);
    return json({ error: "Could not open billing portal." }, 502);
  }
});
