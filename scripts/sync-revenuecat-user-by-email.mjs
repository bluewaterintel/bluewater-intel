#!/usr/bin/env node
/**
 * Pull a user's live RevenueCat subscription and write entitlement to profiles.
 * Use when a customer paid in the App Store / Play Store but Pro did not unlock
 * (webhook missed / iap-sync failed) or billing_source is wrong (e.g. Apple on Android).
 *
 * Requires in .env or env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   REVENUECAT_SECRET_API_KEY (V2, Customer information: Read)
 *   REVENUECAT_PROJECT_ID (proj_…) — required with V2 secret keys
 *
 * Usage:
 *   node scripts/sync-revenuecat-user-by-email.mjs southport05@gmail.com
 */
import { loadEnv } from "./load-env.mjs";

loadEnv();

const PRO_ENTITLEMENT = "pro";
const PRO_PRODUCT_IDS = [
  "com.bluewaterintel.app.pro.monthly",
  "com.bluewaterintel.app.pro.annual",
];

function isProProduct(productId) {
  if (!productId) return false;
  return PRO_PRODUCT_IDS.some((id) => productId === id || productId.includes(id));
}

function entitlementActive(expires) {
  if (!expires) return true;
  const t = Date.parse(expires);
  return Number.isFinite(t) && t > Date.now();
}

function billingSourceFromRcStore(store) {
  const s = String(store ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (s === "play_store" || s === "google_play") return "google";
  if (s === "stripe") return "stripe";
  return "apple";
}

function msToIso(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function subscriptionHasPro(sub) {
  const ents = sub.entitlements?.items ?? [];
  for (const ent of ents) {
    const key = String(ent.lookup_key ?? "").trim().toLowerCase();
    if (key === PRO_ENTITLEMENT || key === "pro") return true;
    for (const prod of ent.products?.items ?? []) {
      if (isProProduct(prod.store_identifier ?? "")) return true;
    }
  }
  return isProProduct(sub.product_id ?? "");
}

async function fetchRcProfilePatchV2(appUserId, secretKey, projectId) {
  const subs = [];
  let nextPath =
    `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(appUserId)}/subscriptions?limit=100`;

  while (nextPath) {
    const res = await fetch(`https://api.revenuecat.com/v2${nextPath}`, {
      headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`RevenueCat V2 ${res.status}: ${text.slice(0, 300)}`);
    }
    const page = await res.json();
    subs.push(...(page.items ?? []));
    const np = page.next_page;
    if (!np) nextPath = null;
    else if (np.startsWith("http")) nextPath = np.replace(/^https:\/\/api\.revenuecat\.com\/v2/, "");
    else nextPath = np.startsWith("/") ? np : `/${np}`;
  }

  const activePro = subs
    .filter((s) => s.gives_access && subscriptionHasPro(s))
    .sort((a, b) => (b.current_period_ends_at ?? 0) - (a.current_period_ends_at ?? 0));

  if (activePro.length > 0) {
    const sub = activePro[0];
    let productHint = sub.product_id ?? "";
    for (const ent of sub.entitlements?.items ?? []) {
      for (const prod of ent.products?.items ?? []) {
        if (prod.store_identifier) {
          productHint = prod.store_identifier;
          break;
        }
      }
    }
    const statusRaw = String(sub.status ?? "").toLowerCase();
    const status = statusRaw === "trialing" ? "trialing" : "active";
    const tx = sub.store_subscription_identifier?.split("..")[0] ?? null;
    return {
      id: appUserId,
      billing_source: billingSourceFromRcStore(sub.store),
      subscription_status: status,
      subscription_interval: /annual|year/i.test(productHint) ? "year" : "month",
      current_period_end: msToIso(sub.current_period_ends_at),
      updated_at: new Date().toISOString(),
      ...(tx ? { apple_original_transaction_id: tx } : {}),
    };
  }

  return {
    id: appUserId,
    billing_source: "apple",
    subscription_status: "canceled",
    subscription_interval: null,
    current_period_end: null,
    updated_at: new Date().toISOString(),
  };
}

async function fetchRcProfilePatch(appUserId, secretKey, projectId) {
  const pid = (projectId ?? "").trim();
  if (pid) return fetchRcProfilePatchV2(appUserId, secretKey, pid);

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 403 && text.includes("7723")) {
      throw new Error(
        "V2 secret key requires REVENUECAT_PROJECT_ID (proj_…) in .env — see docs/REVENUECAT-SUPABASE.md",
      );
    }
    throw new Error(`RevenueCat API ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  const subs = body.subscriber?.subscriptions ?? {};
  const ent = body.subscriber?.entitlements?.[PRO_ENTITLEMENT];
  if (ent && entitlementActive(ent.expires_date)) {
    const productId = ent.product_identifier ?? "";
    const periodType = String(ent.period_type ?? "").toUpperCase();
    const isTrial = periodType === "TRIAL" || periodType === "INTRO";
    let billingSource = "apple";
    for (const sub of Object.values(subs)) {
      if (entitlementActive(sub.expires_date)) {
        billingSource = billingSourceFromRcStore(sub.store);
        break;
      }
    }
    return {
      id: appUserId,
      billing_source: billingSource,
      subscription_status: isTrial ? "trialing" : "active",
      subscription_interval: /annual|year/i.test(productId) ? "year" : "month",
      current_period_end: ent.expires_date ?? null,
      updated_at: new Date().toISOString(),
    };
  }
  for (const [productId, sub] of Object.entries(subs)) {
    if (!isProProduct(productId)) continue;
    if (!entitlementActive(sub.expires_date)) continue;
    const periodType = String(sub.period_type ?? "").toUpperCase();
    const isTrial = periodType === "TRIAL" || periodType === "INTRO";
    return {
      id: appUserId,
      billing_source: billingSourceFromRcStore(sub.store),
      subscription_status: isTrial ? "trialing" : "active",
      subscription_interval: /annual|year/i.test(productId) ? "year" : "month",
      current_period_end: sub.expires_date ?? null,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    id: appUserId,
    billing_source: "apple",
    subscription_status: "canceled",
    subscription_interval: null,
    current_period_end: null,
    updated_at: new Date().toISOString(),
  };
}

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/sync-revenuecat-user-by-email.mjs <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rcSecret = process.env.REVENUECAT_SECRET_API_KEY;
const rcProject = process.env.REVENUECAT_PROJECT_ID;
if (!url || !serviceKey || !rcSecret) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or REVENUECAT_SECRET_API_KEY");
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

let patch;
try {
  patch = await fetchRcProfilePatch(user.id, rcSecret, rcProject);
} catch (e) {
  console.error("RevenueCat lookup failed:", e.message || e);
  console.error(
    "If RC shows the sub under a different App User ID, alias/transfer that customer to",
    user.id,
    "in the RevenueCat dashboard, then re-run this script.",
  );
  process.exit(1);
}

const updated = await adminFetch(`/rest/v1/profiles?on_conflict=id`, {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(patch),
});

console.log("RevenueCat patch:", patch);
console.log("After:", updated[0] || updated);
const active = patch.subscription_status === "active" || patch.subscription_status === "trialing";
console.log(active ? "✓ Pro entitlement synced from RevenueCat" : "⚠ No active RevenueCat Pro — profile set to canceled");
