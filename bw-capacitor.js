/* Bluewater Intel — Capacitor native shell integration (iOS/Android).
 * No-op in browser/PWA. Loaded on every platform; only activates in native WebView. */
(function () {
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());

  window.BW_NATIVE = native;
  window.BW_APP_ORIGIN = native ? "com.bluewaterintel.app://" : "https://app.bluewaterintel.com/";

  if (!native) {
    window.BW_CAPACITOR = {
      isNative: false,
      openExternalUrl: (url) => { window.location.href = url; },
    };
    return;
  }

  const plugins = cap.Plugins || {};

  async function openExternalUrl(url) {
    const Browser = plugins.Browser;
    if (Browser && Browser.open) {
      await Browser.open({ url, presentationStyle: "popover" });
      return;
    }
    window.location.href = url;
  }

  async function initNativeShell() {
    // Status bar — match app header
    try {
      const StatusBar = plugins.StatusBar;
      if (StatusBar) {
        await StatusBar.setStyle({ style: "DARK" });
        await StatusBar.setBackgroundColor({ color: "#0a1628" });
      }
    } catch (e) { /* non-fatal */ }

    // Hide splash once DOM is ready
    try {
      const SplashScreen = plugins.SplashScreen;
      if (SplashScreen) await SplashScreen.hide();
    } catch (e) { /* non-fatal */ }

    // Deep links: email confirm, password recovery, Stripe return URLs
    const App = plugins.App;
    if (App && App.addListener) {
      App.addListener("appUrlOpen", async (event) => {
        await handleAuthDeepLink(event.url);
      });
      // Cold-start deep link
      App.getLaunchUrl?.().then((r) => {
        if (r && r.url) handleAuthDeepLink(r.url);
      }).catch(() => {});
    }
  }

  async function handleAuthDeepLink(rawUrl) {
    if (!rawUrl) return;
    try {
      // Custom scheme → parse as URL with https placeholder host
      const normalized = rawUrl.replace(/^com\.bluewaterintel\.app:\/\//, "https://app.bluewaterintel.com/");
      const u = new URL(normalized);

      // Password recovery / email confirm query flags
      if (u.searchParams.get("recovery") === "1" && typeof window.openPasswordRecoveryModal === "function") {
        window.openPasswordRecoveryModal();
      }
      if (u.searchParams.get("confirmed") === "1" && typeof showToast === "function") {
        showToast("Email confirmed — welcome aboard!", "success");
      }
      if (u.searchParams.get("checkout") === "success" && typeof showToast === "function") {
        showToast("Subscription active — Pro features unlocked.", "success");
      }

      // Supabase auth tokens in hash (#access_token=…&refresh_token=…)
      const hash = u.hash ? u.hash.slice(1) : "";
      const params = new URLSearchParams(hash || u.search);
      const access = params.get("access_token");
      const refresh = params.get("refresh_token");
      if (access && refresh && window.BW_AUTH && window.BW_AUTH._sb) {
        await window.BW_AUTH._sb.auth.setSession({ access_token: access, refresh_token: refresh });
      }

      // Code exchange (PKCE) if present
      const code = params.get("code");
      if (code && window.BW_AUTH && window.BW_AUTH._sb) {
        await window.BW_AUTH._sb.auth.exchangeCodeForSession(code);
      }
    } catch (e) {
      console.warn("BW_CAPACITOR: deep link handling failed", e);
    }
  }

  window.BW_CAPACITOR = {
    isNative: true,
    openExternalUrl,
    appOrigin: window.BW_APP_ORIGIN,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNativeShell);
  } else {
    initNativeShell();
  }
})();
