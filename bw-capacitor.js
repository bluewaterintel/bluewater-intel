/* Bluewater Intel — Capacitor native shell integration (iOS/Android).
 * No-op in browser/PWA. Loaded on every platform; only activates in native WebView. */
(function () {
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());

  window.BW_NATIVE = native;
  window.BW_APP_ORIGIN = native ? "com.bluewaterintel.app://" : "https://app.bluewaterintel.com/";

  // On native iOS, navigator.geolocation triggers TWO permission sheets: the app's
  // own prompt plus a separate WebKit "localhost" prompt. Capacitor Geolocation uses
  // CLLocationManager directly so the user sees one dialog with the app name.
  window.bwGetCurrentPosition = async function(options = {}){
    const opts = {
      enableHighAccuracy: !!options.enableHighAccuracy,
      timeout: options.timeout || 10000,
      maximumAge: options.maximumAge ?? 60000,
    };
    const Geo = native && cap && cap.Plugins && cap.Plugins.Geolocation;
    if(Geo && Geo.getCurrentPosition){
      const perm = await Geo.checkPermissions?.().catch(() => ({}));
      const granted = perm && (perm.location === "granted" || perm.coarseLocation === "granted");
      if(!granted && Geo.requestPermissions){
        const req = await Geo.requestPermissions().catch(() => ({}));
        const ok = req && (req.location === "granted" || req.coarseLocation === "granted");
        if(!ok){
          const err = new Error("Location permission denied");
          err.code = 1;
          throw err;
        }
      }
      const pos = await Geo.getCurrentPosition({
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge,
      });
      return {
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        },
      };
    }
    if(!navigator.geolocation){
      const err = new Error("Geolocation not supported");
      err.code = 2;
      throw err;
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, opts);
    });
  };

  if (native) {
    document.documentElement.classList.add("bw-native");
    if (typeof cap.getPlatform === "function") {
      const platform = cap.getPlatform();
      if (platform === "ios") document.documentElement.classList.add("bw-ios");
      if (platform === "android") document.documentElement.classList.add("bw-android");
    }
  }

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

  // Hide the native splash only after auth/session is resolved (see bw-authgate.js).
  window.BW_hideNativeSplash = async function () {
    try {
      const SplashScreen = plugins.SplashScreen;
      if (SplashScreen) await SplashScreen.hide({ fadeOutDuration: 0 });
    } catch (e) { /* non-fatal */ }
  };

  async function initNativeShell() {
    // Status bar — match app header. Capacitor: DARK = dark icons (light bg),
    // LIGHT = light icons (dark bg). Android needs LIGHT on navy; iOS already
    // uses DARK in capacitor.config / existing builds — leave that path alone.
    try {
      const StatusBar = plugins.StatusBar;
      if (StatusBar) {
        const platform = typeof cap.getPlatform === "function" ? cap.getPlatform() : "";
        await StatusBar.setStyle({ style: platform === "android" ? "LIGHT" : "DARK" });
        await StatusBar.setBackgroundColor({ color: "#0a1628" });
      }
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
      // iOS/Android: persist map layer toggles across background/resume.
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          if (typeof restoreSessionLayerState === "function") restoreSessionLayerState();
        } else if (typeof saveSessionLayerState === "function") {
          saveSessionLayerState();
        }
      });
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
