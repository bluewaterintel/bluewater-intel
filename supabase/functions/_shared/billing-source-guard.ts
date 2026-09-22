/** Don't replace a live subscription with a different store (Stripe vs Apple vs Google). */

const LIVE = new Set(["active", "trialing", "past_due"]);

export function liveBillingSource(profile: {
  billing_source?: string | null;
  subscription_status?: string | null;
} | null | undefined): string | null {
  if (!profile) return null;
  const src = profile.billing_source ?? "";
  if (src !== "stripe" && src !== "apple" && src !== "google") return null;
  if (!LIVE.has(profile.subscription_status ?? "none")) return null;
  return src;
}

export function blocksCrossStoreOverwrite(
  current: { billing_source?: string | null; subscription_status?: string | null } | null | undefined,
  incomingSource: string | null | undefined,
): boolean {
  const existing = liveBillingSource(current);
  if (!existing || !incomingSource) return false;
  return existing !== incomingSource;
}
