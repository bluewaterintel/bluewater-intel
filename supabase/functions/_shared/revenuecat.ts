// Shared RevenueCat → profiles mapping for webhook + client-triggered sync.

export const PRO_ENTITLEMENT = "pro";

export const PRO_PRODUCT_IDS = [
  "com.bluewaterintel.app.pro.monthly",
  "com.bluewaterintel.app.pro.annual",
];

type RcSubscriber = {
  subscriber?: {
    entitlements?: Record<string, {
      expires_date?: string | null;
      product_identifier?: string;
      period_type?: string;
    }>;
    subscriptions?: Record<string, {
      expires_date?: string | null;
      period_type?: string;
      store?: string;
    }>;
  };
};

type RcV2List<T> = {
  items?: T[];
  next_page?: string | null;
};

type RcV2Subscription = {
  gives_access?: boolean;
  status?: string;
  product_id?: string | null;
  current_period_ends_at?: number | null;
  store?: string;
  entitlements?: {
    items?: Array<{
      lookup_key?: string;
      products?: {
        items?: Array<{ store_identifier?: string }>;
      };
    }>;
  };
};

export function isProProduct(productId: string): boolean {
  if (!productId) return false;
  return PRO_PRODUCT_IDS.some((id) => productId === id || productId.includes(id));
}

export function entitlementActive(expires: string | null | undefined): boolean {
  if (!expires) return true;
  const t = Date.parse(expires);
  return Number.isFinite(t) && t > Date.now();
}

function msToIso(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function billingSourceFromRcStore(store: string | undefined): string {
  if (store === "play_store") return "google";
  return "apple";
}

function isProEntitlementLookup(lookupKey: string | undefined): boolean {
  return String(lookupKey ?? "").trim().toLowerCase() === PRO_ENTITLEMENT;
}

function subscriptionHasPro(sub: RcV2Subscription): boolean {
  const ents = sub.entitlements?.items ?? [];
  for (const ent of ents) {
    if (isProEntitlementLookup(ent.lookup_key)) return true;
    for (const prod of ent.products?.items ?? []) {
      if (isProProduct(prod.store_identifier ?? "")) return true;
    }
  }
  return isProProduct(sub.product_id ?? "");
}

function subscriptionInterval(productHint: string, sub: RcV2Subscription): string {
  if (/annual|year/i.test(productHint)) return "year";
  const start = sub.current_period_starts_at;
  const end = sub.current_period_ends_at;
  if (start != null && end != null && end - start > 180 * 24 * 60 * 60 * 1000) return "year";
  return "month";
}

function profilePatchFromV2Subscription(appUserId: string, sub: RcV2Subscription) {
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
  return {
    id: appUserId,
    billing_source: billingSourceFromRcStore(sub.store),
    subscription_status: status,
    subscription_interval: subscriptionInterval(productHint, sub),
    current_period_end: msToIso(sub.current_period_ends_at),
    updated_at: new Date().toISOString(),
  };
}

async function rcV2Get(secretKey: string, path: string) {
  const res = await fetch(`https://api.revenuecat.com/v2${path}`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RevenueCat API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchRcProfilePatchV2(
  appUserId: string,
  secretKey: string,
  projectId: string,
) {
  const subs: RcV2Subscription[] = [];
  let nextPath: string | null =
    `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(appUserId)}/subscriptions?limit=100`;

  while (nextPath) {
    const page = await rcV2Get(secretKey, nextPath) as RcV2List<RcV2Subscription> & {
      next_page?: string | null;
    };
    subs.push(...(page.items ?? []));
    const np = page.next_page;
    if (!np) {
      nextPath = null;
    } else if (np.startsWith("http")) {
      nextPath = np.replace(/^https:\/\/api\.revenuecat\.com\/v2/, "");
    } else {
      nextPath = np.startsWith("/") ? np : `/${np}`;
    }
  }

  const activePro = subs
    .filter((s) => s.gives_access && subscriptionHasPro(s))
    .sort((a, b) => (b.current_period_ends_at ?? 0) - (a.current_period_ends_at ?? 0));

  if (activePro.length > 0) {
    return profilePatchFromV2Subscription(appUserId, activePro[0]);
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

async function fetchRcProfilePatchV1(appUserId: string, secretKey: string) {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    if (res.status === 403 && text.includes("7723")) {
      throw new Error(
        "RevenueCat V2 secret key requires REVENUECAT_PROJECT_ID (proj_…) — set it in Supabase secrets and redeploy iap-sync.",
      );
    }
    throw new Error(`RevenueCat API ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = JSON.parse(text) as RcSubscriber;
  const ent = body.subscriber?.entitlements?.[PRO_ENTITLEMENT];
  if (ent && entitlementActive(ent.expires_date)) {
    const productId = ent.product_identifier ?? "";
    const periodType = String(ent.period_type ?? "").toUpperCase();
    const isTrial = periodType === "TRIAL" || periodType === "INTRO";
    return {
      id: appUserId,
      billing_source: "apple",
      subscription_status: isTrial ? "trialing" : "active",
      subscription_interval: /annual|year/i.test(productId) ? "year" : "month",
      current_period_end: ent.expires_date ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  const subs = body.subscriber?.subscriptions ?? {};
  for (const [productId, sub] of Object.entries(subs)) {
    if (!isProProduct(productId)) continue;
    if (!entitlementActive(sub.expires_date)) continue;
    const periodType = String(sub.period_type ?? "").toUpperCase();
    const isTrial = periodType === "TRIAL" || periodType === "INTRO";
    return {
      id: appUserId,
      billing_source: "apple",
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

/** Map a RevenueCat webhook event to a profiles patch, or null to skip the write. */
export function mapRcWebhookEvent(event: Record<string, unknown>) {
  const type = String(event.type ?? "");
  const appUserId = String(event.app_user_id ?? "");
  const entitlementIds: string[] = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids.map(String)
    : [];
  const entitlementId = String(event.entitlement_id ?? "");
  const productId = String(event.product_id ?? "");
  const periodType = String(event.period_type ?? "").toUpperCase();
  const expires = event.expiration_at_ms
    ? new Date(Number(event.expiration_at_ms)).toISOString()
    : null;
  const interval = /annual|year/i.test(productId) ? "year" : "month";
  const originalTx = event.original_transaction_id
    ? String(event.original_transaction_id)
    : null;

  const hasProEntitlement = entitlementIds.includes(PRO_ENTITLEMENT)
    || entitlementId === PRO_ENTITLEMENT;
  const purchaseTypes = new Set([
    "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED",
    "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE", "REFUND_REVERSED",
  ]);
  const isPurchase = purchaseTypes.has(type);
  const isTrialPeriod = periodType === "TRIAL" || periodType === "INTRO";

  let status: string | null = null;

  if (type === "EXPIRATION") {
    status = "canceled";
  } else if (type === "CANCELLATION") {
    // Access continues until expiration_at_ms in sandbox and production.
    if (expires && Date.parse(expires) > Date.now()) {
      status = isTrialPeriod ? "trialing" : "active";
    } else {
      status = "canceled";
    }
  } else if (hasProEntitlement || (isPurchase && isProProduct(productId))) {
    status = isTrialPeriod ? "trialing" : "active";
  } else if (type === "TEST") {
    return null;
  }

  if (!status) return null;

  return {
    appUserId,
    patch: {
      id: appUserId,
      billing_source: "apple",
      subscription_status: status,
      subscription_interval: status === "canceled" ? null : interval,
      current_period_end: expires,
      updated_at: new Date().toISOString(),
      ...(originalTx ? { apple_original_transaction_id: originalTx } : {}),
    },
  };
}

/** Fetch subscriber from RevenueCat REST API and build a profiles patch. */
export async function fetchRcProfilePatch(
  appUserId: string,
  secretKey: string,
  projectId?: string,
) {
  const pid = (projectId ?? "").trim();
  if (pid) {
    return fetchRcProfilePatchV2(appUserId, secretKey, pid);
  }
  return fetchRcProfilePatchV1(appUserId, secretKey);
}

/** Pull live RevenueCat entitlements for a Supabase user id and upsert profiles. */
export async function syncRevenueCatEntitlementForUser(
  admin: { from: (table: string) => { upsert: (row: unknown, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }> } },
  userId: string,
  secretKey: string,
  projectId?: string,
) {
  const patch = await fetchRcProfilePatch(userId, secretKey, projectId);
  const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return patch;
}
