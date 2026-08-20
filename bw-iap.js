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
    await plugin.configure({ apiKey, appUserID: user.id });
    configured = true;
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
      return {
        monthly: byId[PRODUCT.monthly] || null,
        annual: byId[PRODUCT.annual] || null,
      };
    } catch (e) {
      return { error: e.message || String(e) };
    }
  }

  async function refreshEntitlementAfterPurchase() {
    if (typeof window.refreshEntitlement === "function") {
      for (let i = 0; i < 8; i++) {
        await window.refreshEntitlement();
        if (window.BW_PREMIUM) return;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  async function purchase(interval) {
    await ensureConfigured();
    const plugin = getPurchasesPlugin();
    const productId = interval === "year" ? PRODUCT.annual : PRODUCT.monthly;

    // Prefer offerings when configured; fall back to direct StoreKit product purchase.
    try {
      const offerings = await plugin.getOfferings();
      const pkg = offerings?.current?.availablePackages?.find(
        (p) => p.product && p.product.identifier === productId,
      ) || offerings?.current?.availablePackages?.[0];
      if (pkg) {
        const { customerInfo } = await plugin.purchasePackage({ aPackage: pkg });
        await refreshEntitlementAfterPurchase();
        return customerInfo;
      }
    } catch (e) {
      console.warn("RevenueCat offerings unavailable, trying direct product purchase", e);
    }

    const { products } = await plugin.getProducts({ productIdentifiers: [productId] });
    const product = products && products.find((p) => p.identifier === productId);
    if (!product) {
      throw new Error("Subscription not available in the App Store yet. Check App Store Connect + RevenueCat product catalog.");
    }
    const { customerInfo } = await plugin.purchaseStoreProduct({ product });
    await refreshEntitlementAfterPurchase();
    return customerInfo;
  }

  async function restore() {
    await ensureConfigured();
    const plugin = getPurchasesPlugin();
    await plugin.restorePurchases();
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
    loadProducts,
    openAppStoreSubscriptions,
  };
})();
