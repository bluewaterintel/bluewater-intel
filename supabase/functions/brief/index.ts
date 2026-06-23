// ============================================================================
// Bluewater Intel — Milestone 3: AI Captain's Brief endpoint
// Supabase Edge Function (Deno). Deploy: supabase functions deploy brief
//
// PURPOSE: hold the Anthropic API key SERVER-SIDE so it never ships to the
// client. The browser calls this function; this function calls Anthropic.
//
// GOVERNING PRINCIPLE — real data or an honest absence of data:
//   The brief is built ONLY from real inputs the client sends:
//     • port + spot coordinates  → real bearing & distance (computed here)
//     • distance offshore (nm)   → real (client computes from coastline)
//     • named nearby structure   → real, web-verified features (client sends)
//     • target species           → real SPECIES selections
//   It does NOT accept or invent live weather/sea conditions or "fleet intel."
//   Those are synthetic in the app today and are deferred to Milestone 4, when
//   real SST/wind/seas/AIS arrive. The prompt explicitly forbids the model from
//   fabricating conditions and instructs it to say conditions aren't live yet.
//
// SECURITY:
//   • ANTHROPIC_API_KEY is read from function secrets, never sent to the client.
//   • Requires a valid Supabase user JWT (Authorization: Bearer <token>); the
//     brief is a signed-in feature (Milestone 2 made accounts required).
//   • CORS limited to your app origin(s) via ALLOWED_ORIGINS secret.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const MODEL = Deno.env.get("BRIEF_MODEL") ?? "claude-sonnet-4-6";

function corsHeaders(origin: string | null) {
  const allow = origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) ? origin : (ALLOWED_ORIGINS[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Great-circle bearing + distance — computed HERE from real coordinates so the
// brief's "bearing and distance from port" is accurate, not model-guessed.
function bearingDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const R = 3440.065; // nm
  const dLat = toRad(toLat - fromLat), dLng = toRad(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const distNm = 2 * R * Math.asin(Math.sqrt(a));
  const y = Math.sin(toRad(toLng - fromLng)) * Math.cos(toRad(toLat));
  const x = Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
            Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(toRad(toLng - fromLng));
  const brg = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const compass = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(brg / 22.5) % 16];
  return { distNm: Math.round(distNm * 10) / 10, bearingDeg: Math.round(brg), compass };
}

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Brief service not configured." }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Require a signed-in user (accounts are required as of Milestone 2) ──────
  const authHeader = req.headers.get("Authorization") ?? "";
  try {
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await supa.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Auth check failed." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Validate inputs (REAL data only) ────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Bad JSON." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }

  const spotLat = num(body.lat), spotLng = num(body.lng);
  const portName = str(body.port).slice(0, 80);
  const portLat = num(body.portLat), portLng = num(body.portLng);
  // species: array of {name} or strings — real selections from the SPECIES registry
  const speciesNames = Array.isArray(body.species)
    ? (body.species as unknown[]).map((s) => (typeof s === "string" ? s : str((s as Record<string, unknown>)?.name))).filter(Boolean).slice(0, 6)
    : [];
  // nearbyStructure: array of real named features the client found near the spot
  // e.g. [{name:"Norfolk Canyon", nm:4.2}] — REAL, from the verified CANYONS data.
  const nearby = Array.isArray(body.nearbyStructure)
    ? (body.nearbyStructure as unknown[]).map((f) => {
        const o = f as Record<string, unknown>;
        return { name: str(o?.name).slice(0, 60), nm: num(o?.nm) };
      }).filter((f) => f.name).slice(0, 5)
    : [];
  const nmOffshore = num(body.nmOffshore);

  if (spotLat === null || spotLng === null) {
    return new Response(JSON.stringify({ error: "Spot coordinates required." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Compute REAL bearing/distance if we have the port coordinates.
  let bd: { distNm: number; bearingDeg: number; compass: string } | null = null;
  if (portLat !== null && portLng !== null) bd = bearingDistance(portLat, portLng, spotLat, spotLng);

  // ── Build the prompt from real inputs only ──────────────────────────────────
  const facts: string[] = [];
  facts.push(`Spot: ${spotLat.toFixed(3)}N ${Math.abs(spotLng).toFixed(3)}W`);
  if (portName) facts.push(`Departure port: ${portName}`);
  if (bd) facts.push(`From port to spot: ${bd.distNm} nm on a ${bd.bearingDeg}° (${bd.compass}) heading (great-circle, computed)`);
  if (nmOffshore !== null) facts.push(`Distance offshore: ~${Math.round(nmOffshore)} nm`);
  if (nearby.length) facts.push(`Named structure near the spot (real charted features): ${nearby.map((f) => f.nm !== null ? `${f.name} (~${Math.round(f.nm)} nm)` : f.name).join("; ")}`);
  facts.push(`Target species: ${speciesNames.length ? speciesNames.join(", ") : "best species for this location and season"}`);

  const system = `You are an elite US East Coast and Gulf offshore fishing captain with 30+ years of experience from the Gulf of Maine through the Mid-Atlantic canyons, the Outer Banks, Florida, and the Gulf. You write tight, practical tactical briefs.

CRITICAL HONESTY RULES — follow exactly:
- Use ONLY the facts provided below. They are real.
- Do NOT state or invent live weather, water temperature, wind, sea state, currents, or "current bite"/fleet reports. None of that is provided and you must not fabricate it.
- You MAY discuss general seasonal patterns and species behavior that are common knowledge for the region and time of year, framed as general guidance ("this time of year, X often…"), never as a live observation of present conditions.
- If giving a safety note, frame it as a reminder to check real marine forecasts (NWS offshore, NDBC buoys) before departing — do NOT assert what the conditions are.
- End with one short line noting that live conditions (SST, wind, seas) are not yet integrated and the captain should confirm them from official sources.`;

  const user = `Write a 4-6 sentence tactical captain's brief using these real facts:

${facts.join("\n")}

Cover: (1) the run from port — restate the real bearing and distance; (2) the top 1-2 species to target here and why, based on the location, structure, and season; (3) a specific, concrete technique and likely productive timing (tide/light) for those species in this kind of spot; (4) how to fish the named structure if any is listed. Direct, salty, no filler, no invented numbers.`;

  // ── Call Anthropic (key stays here) ─────────────────────────────────────────
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("Anthropic error", r.status, detail.slice(0, 300));
      return new Response(JSON.stringify({ error: "Brief generation failed upstream." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const d = await r.json();
    const brief = d?.content?.[0]?.text ?? null;
    if (!brief) return new Response(JSON.stringify({ error: "Empty brief." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    // Echo the computed real bearing/distance so the client can display/verify it.
    return new Response(JSON.stringify({ brief, computed: bd }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Brief exception", (e as Error)?.message);
    return new Response(JSON.stringify({ error: "Brief generation failed." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
