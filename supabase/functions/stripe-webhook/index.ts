// ============================================================================
// Bluewater Intel — Stripe webhook (Edge Function, Deno)
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//
// The ONLY place entitlements are written. Verifies the Stripe signature, then:
//   • subscription active/trialing/past_due/canceled → profiles.subscription_status
//     + current_period_end
//   • one-time "lifetime" purchase → subscription_status='lifetime' (never expires)
//   • one-time "pack" purchase     → waypoint_pack_entitlements(user, port)
//
// Uses the SERVICE ROLE key (auto-injected) to bypass RLS — there is no user
// context in a webhook. Customer→user mapping is via profiles.stripe_customer_id
// (stamped at checkout) and the metadata we set on the session/subscription.
//
// SECRETS: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto).
// ============================================================================

import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const isoFromUnix = (s: number | null | undefined) =>
  (s && isFinite(s)) ? new Date(s * 1000).toISOString() : null;

async function userIdForCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  if (data?.id) return data.id;
  // Fall back to the customer's metadata.user_id (set at customer creation).
  try {
    const c = await stripe.customers.retrieve(customerId);
    const uid = (c as Stripe.Customer)?.metadata?.user_id;
    return uid || null;
  } catch { return null; }
}

async function applySubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const userId = (sub.metadata?.user_id) || (await userIdForCustomer(customerId));
  if (!userId) { console.warn("no user for subscription", sub.id); return; }
  // Map Stripe statuses → our gate. active/trialing unlock; everything else locks.
  const status = ["active", "trialing"].includes(sub.status) ? sub.status : "canceled";
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
  await admin.from("profiles").upsert({
    id: userId,
    stripe_customer_id: customerId ?? undefined,
    subscription_status: status,
    subscription_interval: interval,
    current_period_end: isoFromUnix(sub.current_period_end),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

async function grantLifetime(userId: string, customerId: string | null) {
  await admin.from("profiles").upsert({
    id: userId,
    stripe_customer_id: customerId ?? undefined,
    subscription_status: "lifetime",
    current_period_end: new Date(Date.now() + 100 * 365 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

async function grantPack(userId: string, port: string) {
  if (!port) return;
  await admin.from("waypoint_pack_entitlements").upsert({
    user_id: userId, port, radius_nm: 120, purchased_at: new Date().toISOString(), source: "stripe",
  }, { onConflict: "user_id,port" });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET) return new Response("Webhook not configured", { status: 503 });

  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
  } catch (e) {
    console.error("signature verification failed", (e as Error)?.message);
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = (s.client_reference_id) || (s.metadata?.user_id) || (await userIdForCustomer(typeof s.customer === "string" ? s.customer : null));
        const customerId = typeof s.customer === "string" ? s.customer : null;
        const kind = s.metadata?.kind ?? (s.mode === "subscription" ? "subscription" : "");
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          await applySubscription(sub);
        } else if (userId && kind === "lifetime") {
          await grantLifetime(userId, customerId);
        } else if (userId && kind === "pack") {
          await grantPack(userId, s.metadata?.port ?? "");
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        if (event.type === "customer.subscription.deleted") {
          const customerId = typeof sub.customer === "string" ? sub.customer : null;
          const userId = (sub.metadata?.user_id) || (await userIdForCustomer(customerId));
          if (userId) {
            await admin.from("profiles").update({
              subscription_status: "canceled", updated_at: new Date().toISOString(),
            }).eq("id", userId);
          }
        } else {
          await applySubscription(sub);
        }
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof inv.subscription === "string" ? inv.subscription : inv.subscription.id);
          await applySubscription(sub);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("webhook handler error", (e as Error)?.message);
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
