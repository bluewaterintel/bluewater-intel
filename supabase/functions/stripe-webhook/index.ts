// ============================================================================
// Bluewater Intel — Stripe webhook (Edge Function, Deno)
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//
// The ONLY place entitlements are written. Verifies the Stripe signature, then:
//   • subscription active/trialing/past_due/canceled → profiles.subscription_status
//     + current_period_end
//
// (Legacy one-time "lifetime" and per-port "pack" purchases are discontinued.
// Charted waypoints are included with Pro via has_premium()/has_waypoint_access().)
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
import { esc, ownerEmailShell, sendOwnerEmail } from "../_shared/email.ts";
import {
  cardFingerprintFromSubscription,
  normalizeEmail,
  recordTrialConsumed,
  trialAlreadyConsumed,
} from "../_shared/trial.ts";

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

// ── Owner notification: a new subscriber just signed up ─────────────────────
// Fired only from checkout.session.completed — the single "just subscribed"
// moment — so plan changes and renewals (which flow through the portal /
// invoice.paid) never re-trigger it. Tells the owner who signed up and which
// tier. Best-effort: never blocks or fails the webhook.
function money(cents: number | null | undefined, currency = "usd"): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch { return `$${(cents / 100).toFixed(2)}`; }
}
async function notifyOwnerNewSubscriber(session: Stripe.Checkout.Session, sub: Stripe.Subscription) {
  try {
    const price = sub.items?.data?.[0]?.price;
    const interval = price?.recurring?.interval ?? null;
    const trialing = sub.status === "trialing";
    const planName = interval === "year" ? "Pro — Annual" : interval === "month" ? "Pro — Monthly" : "Pro";
    const tier = trialing ? `7-day free trial → ${planName}` : planName;
    const email = session.customer_details?.email
      ?? (typeof session.customer === "object" ? (session.customer as Stripe.Customer)?.email : null)
      ?? "(unknown email)";
    const amount = money(price?.unit_amount, price?.currency ?? "usd");
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toUTCString() : null;
    const html = ownerEmailShell("🎣 New Bluewater Intel subscriber", `
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e8f4ff">
        <tr><td style="padding:6px 0;color:#9ec5e8;width:130px">Email</td><td style="padding:6px 0;font-weight:700">${esc(email)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Tier</td><td style="padding:6px 0;font-weight:700">${esc(tier)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Price</td><td style="padding:6px 0">${esc(amount)}${interval ? " / " + esc(interval) : ""}</td></tr>
        ${trialing && trialEnd ? `<tr><td style="padding:6px 0;color:#9ec5e8">Trial ends</td><td style="padding:6px 0">${esc(trialEnd)}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#9ec5e8">Status</td><td style="padding:6px 0">${esc(sub.status)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Customer</td><td style="padding:6px 0;font-size:12px;color:#9ec5e8">${esc(typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "—")}</td></tr>
      </table>`);
    await sendOwnerEmail({ subject: `New subscriber: ${tier}`, html });
  } catch (e) {
    console.error("notifyOwnerNewSubscriber failed", (e as Error)?.message);
  }
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
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
          const userId = (sub.metadata?.user_id) || (await userIdForCustomer(customerId));
          const email = normalizeEmail(
            s.customer_details?.email
              ?? (typeof s.customer === "object" ? (s.customer as Stripe.Customer)?.email : null)
              ?? null,
          );

          // One free trial per email/card. If a new email reuses a card that
          // already consumed a trial, cancel immediately and leave them on Free.
          // Paid (non-trial) checkouts are never canceled here.
          if (sub.status === "trialing") {
            const fingerprint = await cardFingerprintFromSubscription(stripe, sub);
            const cardUsed = fingerprint
              ? await trialAlreadyConsumed(admin, { fingerprint })
              : false;
            // Same email retrying is blocked at checkout; here we catch card reuse
            // across different emails. If the fingerprint row is for THIS email,
            // trialAlreadyConsumed(email) would also be true — still cancel only
            // when the card was already tied to a prior trial (any email).
            if (cardUsed) {
              const { data: prior } = await admin
                .from("trial_consumed")
                .select("email_normalized")
                .eq("card_fingerprint", fingerprint!)
                .limit(1)
                .maybeSingle();
              const priorEmail = prior?.email_normalized as string | undefined;
              if (priorEmail && email && priorEmail !== email) {
                console.warn("trial card reuse blocked", { email, priorEmail, sub: sub.id });
                try { await stripe.subscriptions.cancel(sub.id); } catch (e) {
                  console.error("cancel reused-trial sub failed", (e as Error)?.message);
                }
                if (userId) {
                  await admin.from("profiles").upsert({
                    id: userId,
                    stripe_customer_id: customerId ?? undefined,
                    subscription_status: "canceled",
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "id" });
                }
                // Record this email too so they can't keep hopping addresses.
                if (email) {
                  await recordTrialConsumed(admin, {
                    email,
                    userId,
                    customerId,
                    fingerprint,
                    source: "stripe_trial_card_reuse",
                  });
                }
                break;
              }
            }

            await applySubscription(sub);
            if (email) {
              await recordTrialConsumed(admin, {
                email,
                userId,
                customerId,
                fingerprint,
                source: "stripe_trial",
              });
            }
            await notifyOwnerNewSubscriber(s, sub);
          } else {
            await applySubscription(sub);
            await notifyOwnerNewSubscriber(s, sub);
          }
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
