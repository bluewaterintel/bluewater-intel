/* ============================================================================
   Bluewater Intel — client billing (Stripe) glue
   ----------------------------------------------------------------------------
   Talks to the stripe-checkout function and reads entitlement state that the
   webhook wrote. The client NEVER decides access on its own — it reads
   subscription_status / entitlements from the backend and gates the UI from
   that. A determined user can fake the UI, but the SERVER enforces real access
   (the brief function checks has_premium; pack data is gated server-side too).

   Requires bw-auth.js (window.BW_AUTH) loaded first.
   ============================================================================ */

(function (root) {
  const cfg = root.BW_SUPABASE_CONFIG || {};
  const BASE = (cfg.url || "").replace(/\/$/, "");

  let state = { status: "none", currentPeriodEnd: null, trialEnd: null, packs: [] };

  async function refresh() {
    const sb = root.BW_AUTH._sb;
    const { data: prof } = await sb.from("profiles")
      .select("subscription_status, current_period_end, trial_end").maybeSingle();
    const { data: packs } = await sb.from("waypoint_pack_entitlements").select("port, radius_nm, purchased_at");
    state = {
      status: prof?.subscription_status ?? "none",
      currentPeriodEnd: prof?.current_period_end ?? null,
      trialEnd: prof?.trial_end ?? null,
      packs: packs ?? [],
    };
    root.dispatchEvent(new CustomEvent("bw-billing-changed", { detail: state }));
    return state;
  }

  const hasPremium = () => state.status === "trialing" || state.status === "active";
  const hasPack = (port) => state.packs.some((p) => p.port === port);
  const getState = () => state;

  async function startCheckout(kind, extra = {}) {
    const sb = root.BW_AUTH._sb;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sign in required.");
    const res = await fetch(`${BASE}/functions/v1/stripe-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: cfg.anonKey },
      body: JSON.stringify({ kind, ...extra }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Checkout failed (${res.status})`); }
    const { url } = await res.json();
    if (url) window.location.href = url; // redirect to Stripe Checkout
  }

  const subscribe = () => startCheckout("subscription");
  const buyPack = (port) => startCheckout("waypoint_pack", { port });

  // Open Stripe's hosted Billing Portal (update card, view invoices, cancel).
  async function manageBilling() {
    const sb = root.BW_AUTH._sb;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sign in required.");
    const res = await fetch(`${BASE}/functions/v1/stripe-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: cfg.anonKey },
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Could not open billing portal."); }
    const { url } = await res.json();
    if (url) window.location.href = url;
  }

  // Charted waypoints for a port, gated server-side: owners get the full set,
  // non-owners get a 10-point teaser (each row carries gated:true/false).
  async function chartedWaypoints(port, lat, lng, types) {
    const sb = root.BW_AUTH._sb;
    const { data, error } = await sb.rpc("pack_waypoints_within", {
      p_port: port, p_lat: lat, p_lng: lng, p_radius_nm: null, p_types: types || null,
    });
    if (error) throw error;
    return data || []; // [{name,type_code,lat,lng,nm,gated}]
  }

  // ── Waypoint pack GPX export (lifetime, exportable) ─────────────────────────
  // Pulls the pack's waypoints (within 120nm of the port) from the M1 backend and
  // builds a GPX file. Only callable if the user owns the pack (UI should gate;
  // the data RPC should also enforce — see PATCH notes).
  async function exportPackGPX(port, portLat, portLng) {
    if (!hasPack(port)) throw new Error("You don't own this waypoint pack.");
    // Use the gated RPC; as an owner this returns the full set (gated:false).
    const sb = root.BW_AUTH._sb;
    const { data, error } = await sb.rpc("pack_waypoints_within", {
      p_port: port, p_lat: portLat, p_lng: portLng, p_radius_nm: null, p_types: null,
    });
    if (error) throw error;
    const rows = (data || []).filter((w) => w.gated === false); // safety: only full-access rows
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const pts = rows.map((w) =>
      `  <wpt lat="${w.lat}" lon="${w.lng}"><name>${esc(w.name)}</name><type>${esc(w.type_code || "")}</type></wpt>`
    ).join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Bluewater Intel" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(port)} Waypoint Pack (120nm)</name></metadata>
${pts}
</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bluewater-${port.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-120nm.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  root.BW_BILLING = { refresh, hasPremium, hasPack, getState, subscribe, buyPack, manageBilling, chartedWaypoints, exportPackGPX };
})(typeof globalThis !== "undefined" ? globalThis : this);
