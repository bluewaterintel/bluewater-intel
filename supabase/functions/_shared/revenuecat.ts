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

export function isProProduct(productId: string): boolean {
  if (!productId) return false;
  return PRO_PRODUCT_IDS.some((id) => productId === id || productId.includes(id));
}

export function entitlementActive(expires: string | null | undefined): boolean {
  if (!expires) return true;
  const t = Date.parse(expires);
  return Number.isFinite(t) && t > Date.now();
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
export async function fetchRcProfilePatch(appUserId: string, secretKey: string) {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RevenueCat API ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as RcSubscriber;
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

  // Fall back to any active Pro product subscription if entitlement name differs.
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
