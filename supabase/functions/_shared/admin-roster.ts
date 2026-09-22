/**
 * Pure owner-admin roster helpers. Shared by the admin edge function and node tests.
 * Paid = active, trialing, past_due, or lifetime. Store tiles count only those
 * accounts whose billing_source matches, so a canceled Stripe row stays under
 * Canceled and does not inflate the Stripe total.
 */

const PAID = new Set(["active", "trialing", "past_due", "lifetime"]);
const PLAN_RANK = { active: 0, lifetime: 1, trialing: 2, past_due: 3, canceled: 4, none: 5 };
const BILL_RANK = { stripe: 0, apple: 1, google: 2 };

export function normalizeBillingSource(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "stripe" || s === "apple" || s === "google") return s;
  return null;
}

export function isPaidStatus(status) {
  return PAID.has(String(status ?? "none").trim().toLowerCase());
}

export function userMatchesQuery(user, needle) {
  const n = String(needle ?? "").trim().toLowerCase();
  if (!n) return true;
  const email = String(user.email ?? "").toLowerCase();
  const id = String(user.id ?? "").toLowerCase();
  const name = String(user.display_name ?? "").toLowerCase();
  return email.includes(n) || id.includes(n) || name.includes(n);
}

export function userMatchesFilter(user, filter) {
  const f = String(filter ?? "all").trim().toLowerCase() || "all";
  if (f === "all") return true;
  const st = String(user.subscription_status ?? "none").trim().toLowerCase() || "none";
  const src = normalizeBillingSource(user.billing_source);
  const owner = !!user.is_owner;
  if (f === "owners") return owner;
  if (f === "active" || f === "trialing" || f === "past_due" || f === "canceled" || f === "lifetime") {
    return st === f;
  }
  if (f === "free") return !owner && st === "none";
  if (f === "paid") return isPaidStatus(st);
  if (f === "stripe" || f === "apple" || f === "google") return src === f && isPaidStatus(st);
  if (f === "granted") return isPaidStatus(st) && !src;
  return true;
}

export function compareRoster(a, b, sort) {
  const mode = String(sort ?? "newest");
  if (mode === "email") {
    return String(a.email ?? "").localeCompare(String(b.email ?? ""));
  }
  if (mode === "plan") {
    const as = String(a.subscription_status ?? "none").toLowerCase();
    const bs = String(b.subscription_status ?? "none").toLowerCase();
    const d = (PLAN_RANK[as] ?? 6) - (PLAN_RANK[bs] ?? 6);
    if (d) return d;
    return String(a.email ?? "").localeCompare(String(b.email ?? ""));
  }
  if (mode === "billing") {
    const d = (BILL_RANK[normalizeBillingSource(a.billing_source)] ?? 9)
      - (BILL_RANK[normalizeBillingSource(b.billing_source)] ?? 9);
    if (d) return d;
    return String(a.email ?? "").localeCompare(String(b.email ?? ""));
  }
  const ad = new Date(a.created_at || 0).getTime();
  const bd = new Date(b.created_at || 0).getTime();
  return bd - ad;
}

export function tallyRoster(users) {
  const counts = {
    total_auth_users: users.length,
    total_profiles: 0,
    owners: 0,
    active: 0,
    trialing: 0,
    canceled: 0,
    free: 0,
    lifetime: 0,
    past_due: 0,
    paid: 0,
    stripe: 0,
    apple: 0,
    google: 0,
    granted: 0,
  };
  for (const u of users) {
    if (u.has_profile) counts.total_profiles++;
    if (u.is_owner) counts.owners++;
    const st = String(u.subscription_status ?? "none").trim().toLowerCase() || "none";
    if (st === "active") counts.active++;
    else if (st === "trialing") counts.trialing++;
    else if (st === "canceled") counts.canceled++;
    else if (st === "lifetime") counts.lifetime++;
    else if (st === "past_due") counts.past_due++;
    else if (!u.is_owner) counts.free++;
    if (!isPaidStatus(st)) continue;
    counts.paid++;
    const src = normalizeBillingSource(u.billing_source);
    if (src === "stripe" || src === "apple" || src === "google") counts[src]++;
    else counts.granted++;
  }
  return counts;
}
