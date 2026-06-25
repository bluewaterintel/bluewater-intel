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

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  let _user = null;
  const listeners = new Set();

  function emit(user) {
    _user = user;
    listeners.forEach((fn) => {
      try { fn(user); } catch (e) { console.error(e); }
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
      .select("display_name, home_port, units")
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
    emit(data.user);
    return data.user;
  }

  async function signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) emit(data.user);
    return data;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    emit(null);
  }

  async function resetPassword(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
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
  async function postReport({ region, species, lat, lng, body }) {
    const user = await requireUser();
    const { data, error } = await client.from("fishing_reports").insert({
      user_id: user.id,
      region,
      species: species || null,
      lat: (lat == null ? null : lat),
      lng: (lng == null ? null : lng),
      body,
    }).select("id").single();
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
    const res = await fetch(`${cfg.supabaseUrl}/functions/v1/brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg.supabaseAnonKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Brief failed (${res.status})`);
    }
    return res.json();
  }

  function onAuthChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getUser() {
    return _user;
  }

  client.auth.onAuthStateChange(async (event, session) => {
    emit(session ? session.user : null);
    if (event === "PASSWORD_RECOVERY") {
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
  });

  client.auth.getSession().then(({ data: { session } }) => {
    emit(session ? session.user : null);
  });

  window.BW_AUTH = {
    _sb: client,
    signIn,
    signUp,
    signOut,
    isSignedIn,
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
    fetchReports,
    deleteReport,
    callBrief,
    onAuthChange,
    getUser,
  };
})();
