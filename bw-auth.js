/* Bluewater Intel — Milestone 2 auth + account data (Supabase Auth + RLS) */
window.BW_SUPABASE_CONFIG = window.BW_SUPABASE_CONFIG || {
  supabaseUrl: (window.BW_DATA_CONFIG && window.BW_DATA_CONFIG.supabaseUrl) || "",
  supabaseAnonKey: (window.BW_DATA_CONFIG && window.BW_DATA_CONFIG.supabaseAnonKey) || "",
};

(function () {
  const cfg = window.BW_SUPABASE_CONFIG;
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    console.warn("BW_AUTH: Supabase SDK or config missing");
    return;
  }

  // iOS WebView localStorage is often cleared on force-quit; Preferences uses
  // UserDefaults and survives app restarts. One-time read migrates legacy keys.
  function nativePreferencesStorage() {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    if (!P) return null;
    return {
      getItem: async (key) => {
        try {
          const { value } = await P.get({ key });
          if (value != null) return value;
        } catch (e) { console.warn("BW_AUTH: Preferences.get failed", e); }
        try {
          const legacy = localStorage.getItem(key);
          if (legacy != null) {
            await P.set({ key, value: legacy });
            return legacy;
          }
        } catch (e) { /* ignore */ }
        return null;
      },
      setItem: async (key, value) => {
        await P.set({ key, value });
      },
      removeItem: async (key) => {
        await P.remove({ key });
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
      },
    };
  }

  const authOpts = {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !window.BW_NATIVE,
  };
  const nativeStore = window.BW_NATIVE && nativePreferencesStorage();
  if (nativeStore) authOpts.storage = nativeStore;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: authOpts,
  });

  let _user = null;
  let _authInitDone = false;
  let _lastAuthEvent = null;
  const listeners = new Set();

  function emit(user, event) {
    _user = user;
    if(event) _lastAuthEvent = event;
    listeners.forEach((fn) => {
      try { fn(user, event || _lastAuthEvent); } catch (e) { console.error(e); }
    });
  }

  async function requireUser() {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new Error("Not signed in");
    return user;
  }

  function isSignedIn() {
    return !!_user;
  }

  async function fetchProfile() {
    const user = await requireUser();
    const { data, error } = await client
      .from("profiles")
      .select("display_name, home_port, units, prefs_json")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function saveProfile(patch) {
    const user = await requireUser();
    const { error } = await client.from("profiles").upsert(
      { id: user.id, ...patch },
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    emit(data.user, "SIGNED_IN");
    return data.user;
  }

  function authRedirectUrl(query) {
    if (window.BW_NATIVE) return "com.bluewaterintel.app://?" + query;
    if (typeof window !== "undefined" && window.location && /^https?:\/\/(localhost|127\.0\.0\.1)/.test(window.location.origin)) {
      return window.location.origin + "/?" + query;
    }
    return "https://app.bluewaterintel.com/?" + query;
  }
  const EMAIL_CONFIRM_REDIRECT = authRedirectUrl("confirmed=1");
  const PASSWORD_RECOVERY_REDIRECT = authRedirectUrl("recovery=1");

  async function signUp(email, password, meta) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      // Confirmation link must match Supabase Auth redirect allow-list.
      options: {
        data: meta || {},
        emailRedirectTo: EMAIL_CONFIRM_REDIRECT,
      },
    });
    if (error) throw error;
    // Supabase anti-enumeration: re-signup with an existing email can return a
    // user shell with no identities — treat that as "already registered".
    const identities = data.user?.identities;
    if (data.user && Array.isArray(identities) && identities.length === 0) {
      const err = new Error("An account with this email already exists. Sign in, or use “Resend verification email” if you have not confirmed yet.");
      err.code = "USER_ALREADY_EXISTS";
      throw err;
    }
    // With "Confirm email" enabled, signUp returns user but no session until
    // the user clicks the link — do not emit an unconfirmed user as signed in.
    if (data.session?.user) emit(data.session.user, "SIGNED_IN");
    return data;
  }

  async function resendSignupConfirmation(email) {
    const { error } = await client.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: EMAIL_CONFIRM_REDIRECT },
    });
    if (error) throw error;
  }

  // True when the signed-in user has premium access (owner flag, or an active
  // subscription/trial). Server-evaluated via has_premium(); falls back to a
  // direct profile read. Free accounts resolve to false.
  async function isPremium() {
    try {
      const { data, error } = await client.rpc("has_premium");
      if (!error && typeof data === "boolean") return data;
    } catch (e) { /* fall through to profile read */ }
    try {
      const { data } = await client
        .from("profiles")
        .select("is_owner, subscription_status, current_period_end, trial_end")
        .maybeSingle();
      if (!data) return false;
      if (data.is_owner) return true;
      if (["trialing", "active"].includes(data.subscription_status)) return true;
      const now = Date.now();
      if (data.current_period_end && new Date(data.current_period_end).getTime() > now) return true;
      if (data.trial_end && new Date(data.trial_end).getTime() > now) return true;
      return false;
    } catch (e) { return false; }
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    emit(null, "SIGNED_OUT");
  }

  async function resetPassword(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RECOVERY_REDIRECT,
    });
    if (error) throw error;
  }

  async function updatePassword(newPassword) {
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async function fetchWaypoints() {
    const user = await requireUser();
    const { data, error } = await client.from("user_waypoints").select("data").eq("user_id", user.id);
    if (error) throw error;
    return (data || []).map((r) => r.data);
  }

  async function saveWaypoint(wp) {
    const user = await requireUser();
    const { error } = await client.from("user_waypoints").upsert({
      id: wp.id,
      user_id: user.id,
      data: wp,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function saveWaypointsBulk(wps) {
    const user = await requireUser();
    const rows = wps.map((wp) => ({
      id: wp.id,
      user_id: user.id,
      data: wp,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await client.from("user_waypoints").upsert(rows);
    if (error) throw error;
  }

  async function deleteWaypoint(id) {
    const user = await requireUser();
    const { error } = await client.from("user_waypoints").delete().eq("user_id", user.id).eq("id", id);
    if (error) throw error;
  }

  async function fetchCatches() {
    const user = await requireUser();
    const { data, error } = await client.from("user_catches").select("data, created_at").eq("user_id", user.id);
    if (error) throw error;
    return (data || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((r) => r.data);
  }

  async function saveCatch(entry) {
    const user = await requireUser();
    const payload = { ...entry };
    if (payload.photo && payload.photo.length > 50000) {
      delete payload.photo;
    }
    const { error } = await client.from("user_catches").upsert({
      id: entry.id,
      user_id: user.id,
      data: payload,
      created_at: entry.timestamp || new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function deleteCatch(id) {
    const user = await requireUser();
    const { error } = await client.from("user_catches").delete().eq("user_id", user.id).eq("id", id);
    if (error) throw error;
  }

  async function fetchLog(logKey) {
    const user = await requireUser();
    const { data, error } = await client.from("user_logs").select("data").eq("user_id", user.id).eq("log_key", logKey).maybeSingle();
    if (error) throw error;
    return data ? data.data : [];
  }

  async function saveLog(logKey, payload) {
    const user = await requireUser();
    const { error } = await client.from("user_logs").upsert({
      user_id: user.id,
      log_key: logKey,
      data: payload,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  // ── Community fishing reports (first-party forum) ──────────────────────────
  async function postReport({ region, species, port, lat, lng, body, fished_at }) {
    const user = await requireUser();
    const { data, error } = await client.from("fishing_reports").insert({
      user_id: user.id,
      region,
      species: species || null,
      port: port || null,
      lat: (lat == null ? null : lat),
      lng: (lng == null ? null : lng),
      body,
      fished_at: fished_at || null,
    }).select("id").single();
    if (error) throw error;
    return data;
  }

  async function updateReport(id, { region, species, port, lat, lng, body, fished_at }) {
    const user = await requireUser();
    const { data, error } = await client.from("fishing_reports").update({
      region,
      species: species || null,
      port: port || null,
      lat: (lat == null ? null : lat),
      lng: (lng == null ? null : lng),
      body,
      fished_at: fished_at || null,
    }).eq("user_id", user.id).eq("id", id).select("id").single();
    if (error) throw error;
    return data;
  }

  async function fetchMyReportIds() {
    const user = await requireUser();
    const { data, error } = await client.from("fishing_reports").select("id").eq("user_id", user.id);
    if (error) throw error;
    return (data || []).map((r) => r.id);
  }

  async function fetchMyReport(id) {
    const user = await requireUser();
    const { data, error } = await client.from("fishing_reports")
      .select("id, region, species, port, lat, lng, body, fished_at, created_at")
      .eq("user_id", user.id)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  // Reads the DE-IDENTIFIED public view (no user_id/PII; coords rounded; hashed handle).
  async function fetchReports({ region = null, sinceDays = 21, limit = 400 } = {}) {
    let q = client.from("fishing_reports_public").select("*").order("created_at", { ascending: false }).limit(limit);
    if (region && region !== "all") q = q.eq("region", region);
    if (sinceDays) q = q.gte("created_at", new Date(Date.now() - sinceDays * 86400000).toISOString());
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function deleteReport(id) {
    const user = await requireUser();
    const { error } = await client.from("fishing_reports").delete().eq("user_id", user.id).eq("id", id);
    if (error) throw error;
  }

  async function callBrief(payload) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error("Sign in required.");
    // Client ceiling under the server's 90s Anthropic abort — don't leave the
    // UI spinning indefinitely if the edge function hangs before responding.
    let signal;
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      signal = AbortSignal.timeout(75000);
    } else {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 75000);
      signal = ctrl.signal;
    }
    let res;
    try {
      res = await fetch(`${cfg.supabaseUrl}/functions/v1/brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: cfg.supabaseAnonKey,
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (e && (e.name === "AbortError" || e.name === "TimeoutError")) {
        throw new Error("The brief timed out generating. Please try again.");
      }
      throw e;
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Brief failed (${res.status})`);
    }
    return res.json();
  }

  function onAuthChange(fn) {
    listeners.add(fn);
    // Replay the settled state to late subscribers. bw-auth.js loads near the top
    // of the document and bw-authgate.js ~2400 lines later, so getSession() can
    // resolve and emit before the gate has subscribed — that listener would then
    // never learn the user is signed in, and entitlement would never refresh.
    if (_authInitDone) {
      try { fn(_user, _lastAuthEvent); } catch (e) { console.error(e); }
    }
    return () => listeners.delete(fn);
  }

  function getUser() {
    return _user;
  }

  client.auth.onAuthStateChange(async (event, session) => {
    // Skip the pre-storage INITIAL_SESSION null — whenReady() owns first emit.
    if (event === "INITIAL_SESSION" && !_authInitDone) return;
    emit(session ? session.user : null, event);
    if (event === "PASSWORD_RECOVERY") {
      if (typeof window.openPasswordRecoveryModal === "function") {
        window.openPasswordRecoveryModal();
      } else {
        const pw = prompt("Enter a new password (min 6 characters):");
        if (pw && pw.length >= 6) {
          try {
            await updatePassword(pw);
            alert("Password updated. You're signed in.");
          } catch (e) {
            alert("Could not update password: " + (e.message || e));
          }
        }
      }
    }
  });

  const _ready = client.auth.getSession().then(({ data: { session } }) => {
    _authInitDone = true;
    emit(session ? session.user : null, "INITIAL_SESSION");
    return session;
  }).catch((e) => {
    _authInitDone = true;
    console.error("BW_AUTH: getSession failed", e);
    emit(null, "INITIAL_SESSION");
    return null;
  });

  function whenReady() {
    return _ready;
  }

  function isAuthInitDone() {
    return _authInitDone;
  }

  window.BW_AUTH = {
    _sb: client,
    signIn,
    signUp,
    resendSignupConfirmation,
    signOut,
    isSignedIn,
    isPremium,
    fetchProfile,
    saveProfile,
    resetPassword,
    updatePassword,
    fetchWaypoints,
    saveWaypoint,
    saveWaypointsBulk,
    deleteWaypoint,
    fetchCatches,
    saveCatch,
    deleteCatch,
    fetchLog,
    saveLog,
    postReport,
    updateReport,
    fetchReports,
    fetchMyReportIds,
    fetchMyReport,
    deleteReport,
    callBrief,
    onAuthChange,
    getUser,
    whenReady,
    isAuthInitDone,
  };
})();
