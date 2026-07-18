// ============================================================================
// One free 7-day trial per customer — shared helpers for stripe-checkout +
// stripe-webhook. Registry lives in public.trial_consumed and survives
// account deletion. Paid checkout and Free-tier use are never blocked here.
// ============================================================================

import type Stripe from "npm:stripe@16";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Normalize email for stable registry lookups. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const n = email.trim().toLowerCase();
  if (!n || !n.includes("@")) return null;
  return n;
}

/** True if this email (or card fingerprint) already consumed a free trial. */
export async function trialAlreadyConsumed(
  admin: SupabaseClient,
  opts: { email?: string | null; fingerprint?: string | null },
): Promise<boolean> {
  const email = normalizeEmail(opts.email);
  if (email) {
    const { data } = await admin
      .from("trial_consumed")
      .select("email_normalized")
      .eq("email_normalized", email)
      .maybeSingle();
    if (data) return true;
  }
  const fp = opts.fingerprint && String(opts.fingerprint).trim();
  if (fp) {
    const { data } = await admin
      .from("trial_consumed")
      .select("email_normalized")
      .eq("card_fingerprint", fp)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

/**
 * Best-effort: any Stripe customer with this email already had a subscription
 * that included a trial (covers trials started before the registry existed).
 */
export async function emailHadStripeTrial(
  stripe: Stripe,
  email: string,
): Promise<boolean> {
  try {
    const customers = await stripe.customers.list({ email, limit: 20 });
    for (const c of customers.data) {
      const subs = await stripe.subscriptions.list({
        customer: c.id,
        status: "all",
        limit: 40,
      });
      for (const s of subs.data) {
        if (s.trial_start) return true;
      }
    }
  } catch (e) {
    console.warn("emailHadStripeTrial failed", (e as Error)?.message);
  }
  return false;
}

export async function cardFingerprintFromSubscription(
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<string | null> {
  try {
    const pmRef = sub.default_payment_method;
    const pmId = typeof pmRef === "string" ? pmRef : pmRef?.id ?? null;
    if (!pmId) return null;
    const pm = await stripe.paymentMethods.retrieve(pmId);
    return pm.card?.fingerprint ?? null;
  } catch {
    return null;
  }
}

/** Upsert a trial-consumed row. Fingerprint is filled in when available. */
export async function recordTrialConsumed(
  admin: SupabaseClient,
  opts: {
    email: string;
    userId?: string | null;
    customerId?: string | null;
    fingerprint?: string | null;
    source?: string;
  },
): Promise<void> {
  const email = normalizeEmail(opts.email);
  if (!email) return;

  const patch: Record<string, unknown> = {
    email_normalized: email,
    consumed_at: new Date().toISOString(),
    source: opts.source ?? "stripe_trial",
  };
  if (opts.userId) patch.user_id = opts.userId;
  if (opts.customerId) patch.stripe_customer_id = opts.customerId;
  if (opts.fingerprint) patch.card_fingerprint = opts.fingerprint;

  // If we already have a row, keep an existing fingerprint when the new one is null.
  const { data: existing } = await admin
    .from("trial_consumed")
    .select("card_fingerprint")
    .eq("email_normalized", email)
    .maybeSingle();
  if (existing?.card_fingerprint && !opts.fingerprint) {
    delete patch.card_fingerprint;
  }

  const { error } = await admin.from("trial_consumed").upsert(patch, {
    onConflict: "email_normalized",
  });
  if (error) console.error("recordTrialConsumed failed", error.message);
}
