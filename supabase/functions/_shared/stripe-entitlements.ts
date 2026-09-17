import Stripe from "npm:stripe@16";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const isoFromUnix = (s: number | null | undefined) =>
  (s && isFinite(s)) ? new Date(s * 1000).toISOString() : null;

/** Stripe moved period fields onto subscription items in newer API versions. */
export function periodEndUnix(sub: Stripe.Subscription): number | null {
  const top = sub.current_period_end;
  if (top && isFinite(top)) return top;
  const item = sub.items?.data?.[0]?.current_period_end;
  return (item && isFinite(item)) ? item : null;
}

export function periodStartUnix(sub: Stripe.Subscription): number | null {
  const top = sub.current_period_start;
  if (top && isFinite(top)) return top;
  const item = sub.items?.data?.[0]?.current_period_start;
  return (item && isFinite(item)) ? item : null;
}

export async function userIdForCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  if (data?.id) return data.id;
  try {
    const c = await stripe.customers.retrieve(customerId);
    const uid = (c as Stripe.Customer)?.metadata?.user_id;
    return uid || null;
  } catch {
    return null;
  }
}

export async function applySubscription(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
  stripe?: Stripe,
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const userId = (sub.metadata?.user_id) || (stripe ? await userIdForCustomer(admin, stripe, customerId) : null);
  if (!userId) {
    console.warn("no user for subscription", sub.id);
    return null;
  }
  const entitled = new Set(["active", "trialing", "past_due"]);
  const terminal = new Set(["canceled", "unpaid", "incomplete_expired"]);
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
  const base = {
    id: userId,
    stripe_customer_id: customerId ?? undefined,
    billing_source: "stripe",
    updated_at: new Date().toISOString(),
  };

  // checkout.session.completed can arrive while Stripe still reports
  // "incomplete" for a moment — never downgrade a paying user to canceled.
  if (!entitled.has(sub.status) && !terminal.has(sub.status)) {
    const { error } = await admin.from("profiles").upsert(base, { onConflict: "id" });
    if (error) throw error;
    return null;
  }

  const status = sub.status === "past_due" ? "active" : (entitled.has(sub.status) ? sub.status : "canceled");
  const patch: Record<string, unknown> = {
    ...base,
    subscription_status: status,
    subscription_interval: status === "canceled" ? null : interval,
    current_period_end: status === "canceled" ? null : isoFromUnix(periodEndUnix(sub)),
    trial_end: status === "trialing" ? isoFromUnix(sub.trial_end) : null,
  };
  const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) throw error;
  return { userId, subscription_status: status, subscription_interval: interval };
}

/** Clear paid access when Stripe shows no live subscription (cancel / lapse). */
export async function markProfileCanceled(
  admin: SupabaseClient,
  userId: string,
  customerId?: string | null,
) {
  const { error } = await admin.from("profiles").upsert({
    id: userId,
    ...(customerId ? { stripe_customer_id: customerId } : {}),
    billing_source: "stripe",
    subscription_status: "canceled",
    subscription_interval: null,
    current_period_end: null,
    trial_end: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function syncStripeEntitlementForUser(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  email?: string | null,
) {
  const { data: prof } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  let customerId = prof?.stripe_customer_id as string | undefined;

  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 10 });
    const match = customers.data.find((c) => c.metadata?.user_id === userId)
      ?? customers.data.find((c) => !c.deleted)
      ?? customers.data[0];
    if (match?.id) customerId = match.id;
  }

  if (!customerId) {
    return { ok: true, synced: false, subscription_status: "none" as const };
  }

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
    expand: ["data.items.data.price"],
  });

  const entitled = subs.data
    .filter((s) => ["active", "trialing", "past_due"].includes(s.status))
    .sort((a, b) => (periodEndUnix(b) ?? 0) - (periodEndUnix(a) ?? 0))[0];

  if (entitled) {
    const applied = await applySubscription(admin, entitled, stripe);
    return {
      ok: true,
      synced: true,
      subscription_status: applied?.subscription_status ?? "active",
      subscription_interval: applied?.subscription_interval ?? null,
    };
  }

  await markProfileCanceled(admin, userId, customerId);

  return { ok: true, synced: true, subscription_status: "canceled" as const };
}
