#!/usr/bin/env node
/**
 * Pull a user's live Stripe subscription and write entitlement to profiles.
 * Use when a customer paid but Pro did not unlock (webhook missed / delayed).
 *
 * Requires in .env or env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY
 *
 * Usage:
 *   node scripts/sync-stripe-user-by-email.mjs testbluewater61@gmail.com
 */
import { loadEnv } from "./load-env.mjs";

loadEnv();

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/sync-stripe-user-by-email.mjs <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!url || !serviceKey || !stripeKey) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or STRIPE_SECRET_KEY");
  process.exit(1);
}

const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function adminFetch(path, opts = {}) {
  const res = await fetch(`${url}${path}`, { ...opts, headers: { ...adminHeaders, ...(opts.headers || {}) } });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function stripeGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function isoFromUnix(s) {
  return s && Number.isFinite(s) ? new Date(s * 1000).toISOString() : null;
}

function periodEndUnix(sub) {
  if (sub.current_period_end && Number.isFinite(sub.current_period_end)) return sub.current_period_end;
  const item = sub.items?.data?.[0]?.current_period_end;
  return item && Number.isFinite(item) ? item : null;
}

let page = 1;
let user = null;
while (page <= 30) {
  const data = await adminFetch(`/auth/v1/admin/users?page=${page}&per_page=200`);
  user = (data.users || []).find((u) => (u.email || "").toLowerCase() === email);
  if (user || (data.users || []).length < 200) break;
  page++;
}
if (!user) {
  console.error(`No auth user for ${email}`);
  process.exit(1);
}

const profiles = await adminFetch(`/rest/v1/profiles?id=eq.${user.id}&select=*`);
const profile = profiles[0] || null;
console.log("User:", user.id, user.email);
console.log("Before:", profile);

let customerId = profile?.stripe_customer_id;
if (!customerId) {
  const customers = await stripeGet("/customers", { email, limit: "10" });
  const match = customers.data.find((c) => c.metadata?.user_id === user.id)
    ?? customers.data.find((c) => !c.deleted)
    ?? customers.data[0];
  customerId = match?.id;
}
if (!customerId) {
  console.error("No Stripe customer found for this user.");
  process.exit(1);
}

const subs = await stripeGet("/subscriptions", {
  customer: customerId,
  status: "all",
  limit: "20",
  "expand[]": "data.items.data.price",
});

const entitled = subs.data
  .filter((s) => ["active", "trialing", "past_due"].includes(s.status))
  .sort((a, b) => (periodEndUnix(b) ?? 0) - (periodEndUnix(a) ?? 0))[0];

let patch;
if (entitled) {
  const interval = entitled.items?.data?.[0]?.price?.recurring?.interval ?? null;
  const status = entitled.status === "past_due" ? "active" : entitled.status;
  patch = {
    id: user.id,
    stripe_customer_id: customerId,
    billing_source: "stripe",
    subscription_status: status,
    subscription_interval: interval,
    current_period_end: isoFromUnix(periodEndUnix(entitled)),
    trial_end: status === "trialing" && entitled.trial_end
      ? isoFromUnix(entitled.trial_end)
      : null,
    updated_at: new Date().toISOString(),
  };
} else {
  patch = {
    id: user.id,
    stripe_customer_id: customerId,
    billing_source: "stripe",
    subscription_status: "canceled",
    subscription_interval: null,
    current_period_end: null,
    trial_end: null,
    updated_at: new Date().toISOString(),
  };
}

const updated = await adminFetch(`/rest/v1/profiles?on_conflict=id`, {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(patch),
});

console.log("Stripe subs:", subs.data.map((s) => ({
  id: s.id,
  status: s.status,
  interval: s.items?.data?.[0]?.price?.recurring?.interval,
})));
console.log("After:", updated[0] || updated);
console.log(entitled ? "✓ Pro entitlement synced" : "⚠ No active Stripe subscription — profile set to canceled");
