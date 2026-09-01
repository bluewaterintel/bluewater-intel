// ============================================================================
// Bluewater Intel — dataset drift monitor (Edge Function, Deno)
// Deploy: supabase functions deploy dataset-health --no-verify-jwt
//
// WHAT IT DOES
//   Probes each upstream ocean feed the app depends on and classifies it
//   green / amber / red for two kinds of drift:
//     • HARD drift  — the dataset 404s / 5xxs / redirects / returns no value
//                     (e.g. NOAA retiring a dataset id, which has happened here
//                      before: nesdisGeoPolarSSTN5SQNRT, nesdisSSH1day).
//     • SOFT drift  — the dataset still responds but its newest observation is
//                     older than its expected latency (a stalled feed).
//   Results are written to public.dataset_health and, when the overall state
//   worsens (or stays degraded for a day), the owner is emailed via Resend.
//
// ENDPOINTS
//   GET  /dataset-health            → public JSON snapshot (for the in-app
//                                      health panel + external uptime monitors).
//   POST /dataset-health {action:"run"}
//        - with header  X-Cron-Secret: <CRON_SECRET>   (used by pg_cron), OR
//        - with an owner Bearer JWT (the "Run check now" button)
//                                    → runs all probes, upserts, alerts.
//
// The probe config MIRRORS supabase/functions/ocean/index.ts. Keep dataset ids
// / hosts in sync (both read the same env overrides), so health reflects what
// the app actually queries.
//
// SECRETS: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto),
//   CRON_SECRET, RESEND_API_KEY, ALERT_EMAIL, ALERT_FROM,
//   ADMIN_EMAILS (optional), ALLOWED_ORIGINS (optional),
//   + the same SST_*/CHL_*/ETOPO_*/ALTIMETRY_* overrides ocean uses.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { esc, ownerEmailShell, sendOwnerEmail } from "../_shared/email.ts";

// ── CORS (public GET) ────────────────────────────────────────────────────────
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// Reflect the caller's Origin so CORS works from every hostname the app is
// served from (apex, www., mobile webview). Strict matching returned the apex
// domain for www./webview callers → the browser blocked it and the admin
// System Health panel showed "Failed to fetch". Auth still enforced below.
function cors(origin: string | null) {
  const allow = origin || (ALLOWED[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

const ERDDAP_HEADERS = { "User-Agent": "BluewaterIntel/1.0 (+https://bluewaterintel.com; health monitor)" };
const H = 3600 * 1000;

// ── Dataset config (mirrors ocean/index.ts) ──────────────────────────────────
const SST_ERDDAP = Deno.env.get("SST_ERDDAP") ?? "https://coastwatch.pfeg.noaa.gov/erddap/griddap";
const SST_DATASET = Deno.env.get("SST_DATASET") ?? "jplMURSST41";
const SST_VAR = Deno.env.get("SST_VAR") ?? "analysed_sst";
const SST_HAS_ALTITUDE = (Deno.env.get("SST_HAS_ALTITUDE") ?? "false") === "true";

const CHL_ERDDAP = Deno.env.get("CHL_ERDDAP") ?? "https://coastwatch.noaa.gov/erddap/griddap";
const CHL_DATASET = Deno.env.get("CHL_DATASET") ?? "noaacwNPPN20VIIRSDINEOFDaily";
const CHL_VAR = Deno.env.get("CHL_VAR") ?? "chlor_a";
const CHL_HAS_ALTITUDE = (Deno.env.get("CHL_HAS_ALTITUDE") ?? "true") === "true";

const ETOPO_ERDDAP = Deno.env.get("ETOPO_ERDDAP") ?? "https://coastwatch.pfeg.noaa.gov/erddap/griddap";
const ETOPO_DATASET = Deno.env.get("ETOPO_DATASET") ?? "etopo180";

const ALTIMETRY_ERDDAP = Deno.env.get("ALTIMETRY_ERDDAP") ?? "https://coastwatch.noaa.gov/erddap/griddap";
const ALTIMETRY_SSH_DATASET = "noaacwBLENDEDsshDaily";
const ALTIMETRY_CUR_DATASET = "noaacwBLENDEDNRTcurrentsDaily";

const RTOFS_DODS = Deno.env.get("RTOFS_DODS")
  ?? "https://tds.hycom.org/thredds/dodsC/FMRC_ESPC-D-V02_uv3z/FMRC_ESPC-D-V02_uv3z_best.ncd";

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const COOPS_MD = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions";

// A canonical in-coverage sample point (off Cape Hatteras — Gulf Stream water,
// non-null for every gridded product we use).
const PROBE_LAT = 35.0;
const PROBE_LNG = -75.0;
// Representative coastal buoys for the NDBC probe — freshest observation wins.
// Individual stations go offline for maintenance (41001 has been down for weeks);
// the feed is healthy if any station in this set is reporting fresh data.
const PROBE_BUOYS = ["41002", "44100", "44025", "41008", "41001"];

type Severity = "green" | "amber" | "red" | "unknown";
const SEV_RANK: Record<Severity, number> = { green: 0, unknown: 1, amber: 2, red: 3 };

type Probe = {
  id: string;
  label: string;
  category: "core" | "supporting";
  status: Severity;
  http_status: number | null;
  latest_obs_at: string | null;
  age_hours: number | null;
  amber_after_hours: number | null;
  red_after_hours: number | null;
  sample_value: number | null;
  latency_ms: number;
  message: string;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && isFinite(n) ? n : null;
};

// Classify a feed from its HTTP status, sampled value, and observation age.
function classify(opts: {
  httpOk: boolean;
  hasValue: boolean;
  ageHours: number | null;
  amberAfter: number | null;
  redAfter: number | null;
}): { status: Severity; note: string } {
  if (!opts.httpOk) return { status: "red", note: "upstream unreachable / error status" };
  if (!opts.hasValue) return { status: "red", note: "responded but returned no usable value" };
  const { ageHours, amberAfter, redAfter } = opts;
  if (ageHours != null && redAfter != null && ageHours > redAfter) {
    return { status: "red", note: `stale: newest data ${Math.round(ageHours)}h old (> ${redAfter}h)` };
  }
  if (ageHours != null && amberAfter != null && ageHours > amberAfter) {
    return { status: "amber", note: `aging: newest data ${Math.round(ageHours)}h old (> ${amberAfter}h)` };
  }
  return { status: "green", note: ageHours != null ? `fresh: newest data ${Math.round(ageHours)}h old` : "reachable" };
}

async function timedFetch(url: string, timeoutMs = 12000): Promise<{ res: Response | null; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: ERDDAP_HEADERS });
    return { res, ms: Date.now() - t0 };
  } catch {
    return { res: null, ms: Date.now() - t0 };
  }
}

// ── ERDDAP griddap point probe (SST, chlorophyll, altimetry) ─────────────────
async function probeErddapPoint(cfg: {
  id: string; label: string; category: "core" | "supporting";
  base: string; dataset: string; varName: string; hasAltitude: boolean;
  amberAfter: number; redAfter: number; scale?: (v: number) => number;
}): Promise<Probe> {
  const altIdx = cfg.hasAltitude ? "%5B(0.0)%5D" : "";
  const url = `${cfg.base}/${cfg.dataset}.json?${cfg.varName}%5B(last)%5D${altIdx}%5B(${PROBE_LAT})%5D%5B(${PROBE_LNG})%5D`;
  const { res, ms } = await timedFetch(url);
  const httpOk = !!res && res.ok;
  let value: number | null = null;
  let obsAt: string | null = null;
  if (httpOk) {
    try {
      const d = await res!.json();
      const cols: string[] = d?.table?.columnNames ?? [];
      const rows: unknown[][] = d?.table?.rows ?? [];
      const ti = cols.indexOf("time");
      const vi = cols.indexOf(cfg.varName);
      for (let i = rows.length - 1; i >= 0; i--) {
        const v = num(rows[i][vi]);
        if (v != null) {
          value = cfg.scale ? cfg.scale(v) : v;
          if (ti >= 0 && typeof rows[i][ti] === "string") obsAt = rows[i][ti] as string;
          break;
        }
      }
    } catch { /* leave null */ }
  }
  const ageHours = obsAt ? Math.max(0, (Date.now() - Date.parse(obsAt)) / H) : null;
  const { status, note } = classify({
    httpOk, hasValue: value != null, ageHours, amberAfter: cfg.amberAfter, redAfter: cfg.redAfter,
  });
  return {
    id: cfg.id, label: cfg.label, category: cfg.category, status,
    http_status: res?.status ?? null, latest_obs_at: obsAt,
    age_hours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
    amber_after_hours: cfg.amberAfter, red_after_hours: cfg.redAfter,
    sample_value: value != null ? Math.round(value * 1000) / 1000 : null,
    latency_ms: ms, message: httpOk ? note : `HTTP ${res?.status ?? "timeout"} — ${note}`,
  };
}

// ── ETOPO relief probe (static — reachability + a real depth only) ───────────
async function probeEtopo(): Promise<Probe> {
  const url = `${ETOPO_ERDDAP}/${ETOPO_DATASET}.json?altitude%5B(${PROBE_LAT})%5D%5B(${PROBE_LNG})%5D`;
  const { res, ms } = await timedFetch(url);
  const httpOk = !!res && res.ok;
  let value: number | null = null;
  if (httpOk) {
    try {
      const d = await res!.json();
      const cols: string[] = d?.table?.columnNames ?? [];
      const rows: unknown[][] = d?.table?.rows ?? [];
      const ai = cols.indexOf("altitude");
      if (rows.length && ai >= 0) value = num(rows[0][ai]);
    } catch { /* null */ }
  }
  const { status, note } = classify({ httpOk, hasValue: value != null, ageHours: null, amberAfter: null, redAfter: null });
  return {
    id: "etopo", label: "Bathymetry — ETOPO relief (fallback)", category: "core", status,
    http_status: res?.status ?? null, latest_obs_at: null, age_hours: null,
    amber_after_hours: null, red_after_hours: null,
    sample_value: value != null ? Math.round(value) : null,
    latency_ms: ms, message: httpOk ? "static relief reachable" : `HTTP ${res?.status ?? "timeout"} — ${note}`,
  };
}

// ── RTOFS currents probe (HYCOM DODS time axis freshness) ────────────────────
async function probeRtofs(): Promise<Probe> {
  const amberAfter = 36, redAfter = 72;
  const t0 = Date.now();
  let httpOk = false, httpStatus: number | null = null;
  let newestMs: number | null = null;
  try {
    const [dasR, timeR] = await Promise.all([
      fetch(`${RTOFS_DODS}.das`, { signal: AbortSignal.timeout(12000), headers: ERDDAP_HEADERS }),
      fetch(`${RTOFS_DODS}.ascii?time`, { signal: AbortSignal.timeout(12000), headers: ERDDAP_HEADERS }),
    ]);
    httpStatus = dasR.status;
    httpOk = dasR.ok && timeR.ok;
    if (httpOk) {
      const das = await dasR.text();
      const units = das.match(/time\s*\{[^}]*units\s+"hours since ([^"]+)"/s)?.[1];
      const body = await timeR.text();
      const m = body.match(/time\[\d+\]\s*\n([\s\S]+)/);
      if (units && m) {
        const epochMs = Date.parse(units.replace(" UTC", "Z").replace(".000", ""));
        const hours = m[1].split(",").map((x) => parseFloat(x.trim())).filter((h) => isFinite(h));
        if (isFinite(epochMs) && hours.length) {
          newestMs = epochMs + Math.max(...hours) * H;
        }
      }
    }
  } catch { httpOk = false; }
  const ms = Date.now() - t0;
  // The FMRC "best" series extends into the forecast future; "age" is how far the
  // newest available valid time is BEHIND now (0 while the forecast leads now).
  const ageHours = newestMs != null ? Math.max(0, (Date.now() - newestMs) / H) : null;
  const { status, note } = classify({ httpOk, hasValue: newestMs != null, ageHours, amberAfter, redAfter });
  return {
    id: "rtofs", label: "Surface currents — RTOFS (ESPC-D-V02)", category: "core", status,
    http_status: httpStatus, latest_obs_at: newestMs != null ? new Date(newestMs).toISOString() : null,
    age_hours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
    amber_after_hours: amberAfter, red_after_hours: redAfter,
    sample_value: null, latency_ms: ms,
    message: httpOk ? note : `HYCOM DODS ${httpStatus ?? "timeout"} — ${note}`,
  };
}

// ── NDBC buoy probe (supporting) ─────────────────────────────────────────────
async function probeBuoyStation(id: string): Promise<{
  id: string; obsMs: number | null; ms: number; httpOk: boolean; httpStatus: number | null;
}> {
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`;
  const { res, ms } = await timedFetch(url, 9000);
  const httpOk = !!res && res.ok;
  let obsMs: number | null = null;
  if (httpOk) {
    try {
      const text = await res!.text();
      const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
      if (lines.length) {
        const c = lines[0].trim().split(/\s+/);
        const [YY, MM, DD, hh, mm] = [c[0], c[1], c[2], c[3], c[4]].map((x) => parseInt(x, 10));
        const t = Date.UTC(YY, MM - 1, DD, hh, mm);
        if (isFinite(t)) obsMs = t;
      }
    } catch { /* null */ }
  }
  return { id, obsMs, ms, httpOk, httpStatus: res?.status ?? null };
}

async function probeBuoy(): Promise<Probe> {
  const amberAfter = 6, redAfter = 24;
  const results = await Promise.all(PROBE_BUOYS.map(probeBuoyStation));
  const fresh = results.filter((r) => r.httpOk && r.obsMs != null);
  const best = fresh.length
    ? fresh.reduce((a, b) => ((b.obsMs as number) > (a.obsMs as number) ? b : a))
    : (results.find((r) => r.httpOk) ?? results[0]);
  const httpOk = results.some((r) => r.httpOk);
  const obsMs = best?.obsMs ?? null;
  const ageHours = obsMs != null ? Math.max(0, (Date.now() - obsMs) / H) : null;
  const { status, note } = classify({ httpOk, hasValue: obsMs != null, ageHours, amberAfter, redAfter });
  const latencyMs = Math.max(...results.map((r) => r.ms));
  const buoyId = best?.id ?? PROBE_BUOYS[0];
  const detail = fresh.length > 1 ? `${note} · ${fresh.length}/${PROBE_BUOYS.length} stations fresh` : note;
  return {
    id: "ndbc", label: `Buoy observations — NDBC (${buoyId})`, category: "supporting", status,
    http_status: best?.httpStatus ?? null, latest_obs_at: obsMs != null ? new Date(obsMs).toISOString() : null,
    age_hours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
    amber_after_hours: amberAfter, red_after_hours: redAfter,
    sample_value: null, latency_ms: latencyMs,
    message: httpOk ? detail : `NDBC ${best?.httpStatus ?? "timeout"} — ${note}`,
  };
}

// ── Open-Meteo forecast probe (supporting) ───────────────────────────────────
async function probeOpenMeteo(): Promise<Probe> {
  const url = `${OPEN_METEO_FORECAST}?latitude=${PROBE_LAT}&longitude=${PROBE_LNG}`
    + "&hourly=wind_speed_10m&wind_speed_unit=kn&timezone=UTC&forecast_days=1&models=gfs_seamless";
  const { res, ms } = await timedFetch(url, 9000);
  const httpOk = !!res && res.ok;
  let hasValue = false;
  if (httpOk) {
    try {
      const d = await res!.json();
      hasValue = Array.isArray(d?.hourly?.time) && d.hourly.time.length > 0;
    } catch { /* false */ }
  }
  const { status, note } = classify({ httpOk, hasValue, ageHours: null, amberAfter: null, redAfter: null });
  return {
    id: "openmeteo", label: "Wind & marine forecast — Open-Meteo (GFS)", category: "supporting", status,
    http_status: res?.status ?? null, latest_obs_at: null, age_hours: null,
    amber_after_hours: null, red_after_hours: null, sample_value: null, latency_ms: ms,
    message: httpOk ? "forecast reachable" : `HTTP ${res?.status ?? "timeout"} — ${note}`,
  };
}

// ── NOAA CO-OPS tide stations probe (supporting) ─────────────────────────────
async function probeCoops(): Promise<Probe> {
  const { res, ms } = await timedFetch(COOPS_MD, 9000);
  const httpOk = !!res && res.ok;
  let count = 0;
  if (httpOk) {
    try {
      const d = await res!.json();
      count = Array.isArray(d?.stations) ? d.stations.length : 0;
    } catch { /* 0 */ }
  }
  const { status, note } = classify({ httpOk, hasValue: count > 0, ageHours: null, amberAfter: null, redAfter: null });
  return {
    id: "coops", label: "Tide predictions — NOAA CO-OPS", category: "supporting", status,
    http_status: res?.status ?? null, latest_obs_at: null, age_hours: null,
    amber_after_hours: null, red_after_hours: null,
    sample_value: count || null, latency_ms: ms,
    message: httpOk ? `${count} prediction stations` : `HTTP ${res?.status ?? "timeout"} — ${note}`,
  };
}

async function runAllProbes(): Promise<Probe[]> {
  // MUR analysed_sst is Kelvin → °F for the sample display.
  const sstScale = (v: number) => Math.round(((v > 200 ? v - 273.15 : v) * 9 / 5 + 32) * 10) / 10;
  return await Promise.all([
    probeErddapPoint({
      id: "sst", label: "Sea-surface temperature — MUR (jplMURSST41)", category: "core",
      base: SST_ERDDAP, dataset: SST_DATASET, varName: SST_VAR, hasAltitude: SST_HAS_ALTITUDE,
      amberAfter: 72, redAfter: 144, scale: sstScale,
    }),
    probeErddapPoint({
      id: "chlor", label: "Chlorophyll — VIIRS DINEOF NRT", category: "core",
      base: CHL_ERDDAP, dataset: CHL_DATASET, varName: CHL_VAR, hasAltitude: CHL_HAS_ALTITUDE,
      amberAfter: 120, redAfter: 240,
    }),
    probeErddapPoint({
      id: "ssh", label: "Altimetry SSH / eddies — BLENDED", category: "core",
      base: ALTIMETRY_ERDDAP, dataset: ALTIMETRY_SSH_DATASET, varName: "sla", hasAltitude: false,
      amberAfter: 96, redAfter: 192,
    }),
    probeErddapPoint({
      id: "altcurrents", label: "Geostrophic currents — BLENDED", category: "core",
      base: ALTIMETRY_ERDDAP, dataset: ALTIMETRY_CUR_DATASET, varName: "u_current", hasAltitude: false,
      amberAfter: 96, redAfter: 192,
    }),
    probeRtofs(),
    probeEtopo(),
    probeBuoy(),
    probeOpenMeteo(),
    probeCoops(),
  ]);
}

function overallOf(probes: Probe[]): Severity {
  let worst: Severity = "green";
  for (const p of probes) if (SEV_RANK[p.status] > SEV_RANK[worst]) worst = p.status;
  return worst;
}

// ── Owner alert email ────────────────────────────────────────────────────────
function statusChip(s: Severity): string {
  const color = s === "red" ? "#ef4444" : s === "amber" ? "#f59e0b" : s === "green" ? "#22c55e" : "#94a3b8";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};font-weight:700;font-size:11px;text-transform:uppercase">${s}</span>`;
}

async function maybeAlert(
  admin: ReturnType<typeof createClient>, probes: Probe[], overall: Severity,
): Promise<{ emailed: boolean; reason: string }> {
  const { data: state } = await admin.from("health_alert_state").select("*").eq("id", 1).maybeSingle();
  const prev = (state?.last_status as Severity) ?? "green";
  const lastAlertAt = state?.last_alert_at ? Date.parse(state.last_alert_at as string) : 0;
  const worsened = SEV_RANK[overall] > SEV_RANK[prev];
  const recovered = overall === "green" && SEV_RANK[prev] > SEV_RANK["green"];
  const degraded = overall === "amber" || overall === "red";
  const stale = Date.now() - lastAlertAt > 24 * H;
  // Notify on: getting worse, first recovery, or a daily reminder while degraded.
  const shouldEmail = worsened || recovered || (degraded && stale);
  if (!shouldEmail) return { emailed: false, reason: `no change (prev=${prev}, now=${overall})` };

  const bad = probes.filter((p) => p.status === "red" || p.status === "amber")
    .sort((a, b) => SEV_RANK[b.status] - SEV_RANK[a.status]);
  const rows = (recovered ? probes : bad).map((p) => `
    <tr>
      <td style="padding:8px 10px;border-top:1px solid rgba(107,191,234,.14)">${esc(p.label)}</td>
      <td style="padding:8px 10px;border-top:1px solid rgba(107,191,234,.14);text-align:center">${statusChip(p.status)}</td>
      <td style="padding:8px 10px;border-top:1px solid rgba(107,191,234,.14);font-size:12px;color:#9ec5e8">${esc(p.message)}</td>
    </tr>`).join("");
  const title = recovered
    ? "✅ Ocean data feeds recovered"
    : overall === "red" ? "🔴 Ocean data feed DOWN" : "🟠 Ocean data feed degraded";
  const html = ownerEmailShell(title, `
    <p style="margin:0 0 12px;font-size:14px;color:#cfe5ff">
      Overall status: ${statusChip(overall)} &nbsp;·&nbsp; ${esc(new Date().toUTCString())}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e8f4ff">
      <thead><tr>
        <th style="text-align:left;padding:0 10px 6px;font-size:11px;color:#6bbfea;text-transform:uppercase">Feed</th>
        <th style="text-align:center;padding:0 10px 6px;font-size:11px;color:#6bbfea;text-transform:uppercase">Status</th>
        <th style="text-align:left;padding:0 10px 6px;font-size:11px;color:#6bbfea;text-transform:uppercase">Detail</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:14px 0 12px;font-size:12px;color:#9ec5e8">
      Open <b>Menu → User Admin → System Health</b> in the app for the full snapshot.
    </p>`);
  const emailed = await sendOwnerEmail({ subject: title, html });
  // Record alert state regardless of email success so we don't hot-loop retries.
  await admin.from("health_alert_state").upsert({
    id: 1, last_status: overall, last_alert_at: new Date().toISOString(),
  }, { onConflict: "id" });
  return { emailed, reason: recovered ? "recovered" : worsened ? "worsened" : "daily reminder" };
}

async function persist(admin: ReturnType<typeof createClient>, probes: Probe[]): Promise<void> {
  const { data: existing } = await admin.from("dataset_health").select("id, status, consecutive_failures");
  const prevMap = new Map<string, { status: string; fails: number }>();
  for (const r of existing ?? []) prevMap.set(r.id as string, { status: r.status as string, fails: (r.consecutive_failures as number) ?? 0 });
  const now = new Date().toISOString();
  const rows = probes.map((p) => {
    const prev = prevMap.get(p.id);
    const fails = p.status === "green" ? 0 : ((prev?.fails ?? 0) + 1);
    return {
      id: p.id, label: p.label, category: p.category, status: p.status,
      http_status: p.http_status, latest_obs_at: p.latest_obs_at, age_hours: p.age_hours,
      amber_after_hours: p.amber_after_hours, red_after_hours: p.red_after_hours,
      sample_value: p.sample_value, latency_ms: p.latency_ms, message: p.message,
      consecutive_failures: fails, checked_at: now, updated_at: now,
    };
  });
  await admin.from("dataset_health").upsert(rows, { onConflict: "id" });
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const ADMIN_EMAILS = new Set(
  (Deno.env.get("ADMIN_EMAILS") ?? "rnovakwvu@gmail.com,natalienovakm@gmail.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
async function isOwnerRequest(authHeader: string): Promise<boolean> {
  if (!authHeader) return false;
  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return false;
    const { data: prof } = await supa.from("profiles").select("is_owner").eq("id", user.id).maybeSingle();
    return !!prof?.is_owner || ADMIN_EMAILS.has((user.email ?? "").toLowerCase());
  } catch { return false; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const CORS = cors(origin);
  const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json", ...extra } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = adminClient();

  // Public snapshot for the health panel + external uptime monitors.
  if (req.method === "GET") {
    const { data } = await admin.from("dataset_health").select("*").order("category").order("id");
    const rows = data ?? [];
    const overall = rows.length
      ? (rows.some((r) => r.status === "red") ? "red"
        : rows.some((r) => r.status === "amber") ? "amber"
        : rows.some((r) => r.status === "unknown") ? "unknown" : "green")
      : "unknown";
    const checkedAt = rows.reduce<string | null>((acc, r) => {
      const t = r.checked_at as string | null;
      return t && (!acc || t > acc) ? t : acc;
    }, null);
    return json({ overall, checked_at: checkedAt, datasets: rows },
      200, { "Cache-Control": "public, max-age=300" });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "run");

  // Authorize the run: cron secret header OR an owner JWT.
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  const viaCron = !!cronSecret && providedSecret === cronSecret;
  const viaOwner = viaCron ? false : await isOwnerRequest(req.headers.get("Authorization") ?? "");
  if (!viaCron && !viaOwner) return json({ error: "Unauthorized" }, 401);

  if (action !== "run") return json({ error: "Unknown action" }, 400);

  try {
    const probes = await runAllProbes();
    const overall = overallOf(probes);
    await persist(admin, probes);
    const alert = await maybeAlert(admin, probes, overall);
    return json({ ok: true, overall, alert, datasets: probes, checked_at: new Date().toISOString() });
  } catch (e) {
    console.error("dataset-health run error", (e as Error)?.message);
    return json({ error: (e as Error)?.message || "Health run failed" }, 500);
  }
});
