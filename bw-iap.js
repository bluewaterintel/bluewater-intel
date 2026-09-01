/* Bluewater Intel — Apple In-App Purchase (iOS App Store only).
 * Stripe is NOT used in the native app. Website billing stays in bw-billing.js.
 * Unified accounts: same Supabase login everywhere; entitlements sync via profiles. */
(function () {
  const native = !!(window.BW_NATIVE);

  const PRODUCT = {
    monthly: "com.bluewaterintel.app.pro.monthly",
    annual: "com.bluewaterintel.app.pro.annual",
  };

  let configured = false;
  let Purchases = null;

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message || "Timed out")), ms);
      }),
    ]);
  }

  function fnBase() {
    const cfg = window.BW_SUPABASE_CONFIG || window.BW_DATA_CONFIG || {};
    return ((cfg.supabaseUrl || cfg.url || "").replace(/\/$/, "")) + "/functions/v1";
  }

  async function authHeaders() {
    const sb = window.BW_AUTH && window.BW_AUTH._sb;
    if (!sb) throw new Error("Not signed in.");
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sign in required.");
    const cfg = window.BW_SUPABASE_CONFIG || window.BW_DATA_CONFIG || {};
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + session.access_token,
      apikey: cfg.supabaseAnonKey || "",
    };
  }

  function getPurchasesPlugin() {
    if (Purchases) return Purchases;
    const cap = window.Capacitor;
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins.Purchases) {
      Purchases = cap.Plugins.Purchases;
      return Purchases;
    }
    if (typeof cap.registerPlugin === "function") {
      Purchases = cap.registerPlugin("Purchases");
      return Purchases;
    }
    return null;
  }

  async function ensureConfigured() {
    if (!native || configured) return;
    const user = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if (!user) throw new Error("Sign in to subscribe.");
    const apiKey = (window.BW_DATA_CONFIG && window.BW_DATA_CONFIG.revenueCatIosApiKey) || "";
    if (!apiKey || apiKey.includes("YOUR_")) {
      throw new Error("In-app purchases are not configured yet. Add REVENUECAT_IOS_API_KEY to .env and rebuild.");
    }
    const plugin = getPurchasesPlugin();
    if (!plugin || !plugin.configure) {
      throw new Error("StoreKit plugin not loaded. Run: npm install && npx cap sync ios");
    }
    await withTimeout(
      plugin.configure({ apiKey, appUserID: user.id }),
      20000,
      "Store setup timed out. Check your connection and try again.",
    );
    configured = true;
  }

  async function prewarm() {
    if (!native || configured) return;
    try {
      await ensureConfigured();
    } catch (e) {
      console.warn("BW_IAP prewarm failed", e);
    }
  }

  // StoreKit reports a product's introductory offer regardless of whether THIS
  // Apple ID may still use it (it is once per Apple ID / Family per subscription
  // group). Advertising "7 days free" to an ineligible account is misleading —
  // Apple's purchase sheet correctly says "Starting today" and charges at once.
  // RevenueCat's eligibility check tells us which copy we're allowed to show.
  const ELIGIBILITY = { UNKNOWN: 0, INELIGIBLE: 1, ELIGIBLE: 2, NO_OFFER: 3 };

  async function trialEligibility(productIds) {
    const plugin = getPurchasesPlugin();
    if (!plugin || !plugin.checkTrialOrIntroductoryPriceEligibility) return {};
    try {
      const res = await plugin.checkTrialOrIntroductoryPriceEligibility({
        productIdentifiers: productIds,
      });
      const map = {};
      for (const id of productIds) {
        const entry = res && res[id];
        const status = entry && typeof entry.status === "number" ? entry.status : ELIGIBILITY.UNKNOWN;
        map[id] = status === ELIGIBILITY.ELIGIBLE ? "eligible"
          : status === ELIGIBILITY.INELIGIBLE ? "ineligible"
          : status === ELIGIBILITY.NO_OFFER ? "none"
          : "unknown";
      }
      return map;
    } catch (e) {
      console.warn("Intro offer eligibility check failed", e);
      return {};
    }
  }

  /** Load App Store product metadata for subscription disclosure labels. */
  async function loadProducts() {
    if (!native) return null;
    try {
      await ensureConfigured();
    } catch (e) {
      return { error: e.message || String(e) };
    }
    const plugin = getPurchasesPlugin();
    const ids = [PRODUCT.monthly, PRODUCT.annual];
    try {
      const { products } = await plugin.getProducts({ productIdentifiers: ids });
      const byId = {};
      for (const p of products || []) {
        if (p && p.identifier) byId[p.identifier] = p;
      }
      const eligibility = await trialEligibility(ids);
      return {
        monthly: byId[PRODUCT.monthly] || null,
        annual: byId[PRODUCT.annual] || null,
        monthlyTrial: eligibility[PRODUCT.monthly] || "unknown",
        annualTrial: eligibility[PRODUCT.annual] || "unknown",
      };
    } catch (e) {
      return { error: e.message || String(e) };
    }
  }

  async function syncIapEntitlement() {
    try {
      const res = await fetch(`${fnBase()}/iap-sync`, {
        method: "POST",
        headers: await authHeaders(),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("iap-sync failed", j.error || res.status);
        return false;
      }
      return true;
    } catch (e) {
      console.warn("iap-sync failed", e);
      return false;
    }
  }

  async function refreshEntitlementAfterPurchase() {
    syncIapEntitlement().catch(() => {});
    if (typeof window.refreshEntitlement !== "function") return;
    for (let i = 0; i < 4; i++) {
      try {
        await window.refreshEntitlement();
        if (window.BW_PREMIUM) return;
      } catch (e) { /* retry */ }
      if (i === 1) syncIapEntitlement().catch(() => {});
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  async function purchase(interval) {
    await ensureConfigured();
    const plugin = getPurchasesPlugin();
    const productId = interval === "year" ? PRODUCT.annual : PRODUCT.monthly;

    // Prefer offerings when configured; fall back to direct StoreKit product purchase.
    try {
      const offerings = await withTimeout(
        plugin.getOfferings(),
        15000,
        "Could not load subscription options. Try again.",
      );
      const pkg = offerings?.current?.availablePackages?.find(
        (p) => p.product && p.product.identifier === productId,
      ) || offerings?.current?.availablePackages?.[0];
      if (pkg) {
        const { customerInfo } = await withTimeout(
          plugin.purchasePackage({ aPackage: pkg }),
          120000,
          "Purchase timed out. If Apple charged you, tap Restore Purchases.",
        );
        refreshEntitlementAfterPurchase();
        return customerInfo;
      }
    } catch (e) {
      if (e && (e.userCancelled || /cancel/i.test(String(e.message || "")))) throw e;
      console.warn("RevenueCat offerings unavailable, trying direct product purchase", e);
    }

    const { products } = await withTimeout(
      plugin.getProducts({ productIdentifiers: [productId] }),
      15000,
      "Could not load App Store products. Try again in a moment.",
    );
    const product = products && products.find((p) => p.identifier === productId);
    if (!product) {
      throw new Error("Subscription not available in the App Store yet. Check App Store Connect + RevenueCat product catalog.");
    }
    const { customerInfo } = await withTimeout(
      plugin.purchaseStoreProduct({ product }),
      120000,
      "Purchase timed out. If Apple charged you, tap Restore Purchases.",
    );
    refreshEntitlementAfterPurchase();
    return customerInfo;
  }

  async function restore() {
    await ensureConfigured();
    const plugin = getPurchasesPlugin();
    await withTimeout(
      plugin.restorePurchases(),
      45000,
      "Restore timed out. Check your connection and try again.",
    );
    await refreshEntitlementAfterPurchase();
  }

  function openAppStoreSubscriptions() {
    const url = "https://apps.apple.com/account/subscriptions";
    if (window.BW_CAPACITOR && window.BW_CAPACITOR.openExternalUrl) {
      window.BW_CAPACITOR.openExternalUrl(url);
    } else {
      window.open(url, "_blank");
    }
  }

  window.BW_IAP = {
    available: native,
    productIds: PRODUCT,
    purchase,
    restore,
    prewarm,
    loadProducts,
    trialEligibility,
    syncIapEntitlement,
    openAppStoreSubscriptions,
  };
})();
