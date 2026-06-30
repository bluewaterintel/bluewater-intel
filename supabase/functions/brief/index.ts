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
// Claude Haiku 4.5 — fastest + cheapest tier ($1/$5 per MTok). Cheaper still
// with prompt caching of the static system prompt below.
const MODEL = Deno.env.get("BRIEF_MODEL") ?? "claude-haiku-4-5-20251001";

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
  let supa;
  try {
    supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await supa.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Auth check failed." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Premium gate + daily limit (2/day; owners unlimited; free = none) ───────
  // Enforced server-side and atomically via brief_consume() so it can't be
  // bypassed from the client. Only counts against the quota once we're past
  // validation and about to actually generate the brief (consumed below).
  try {
    const { data: gate, error: gerr } = await supa.rpc("brief_consume", { p_limit: 2 });
    if (gerr) {
      return new Response(JSON.stringify({ error: "Could not verify your brief allowance." }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (!gate || !gate.allowed) {
      const reason = gate?.reason;
      const msg = reason === "premium"
        ? "The AI Captain's Brief is a premium feature. Subscribe (or go Lifetime) to unlock up to 2 briefs per day."
        : "You've used both AI Captain's Briefs for today — they reset tomorrow.";
      return new Response(JSON.stringify({ error: msg, reason: reason || "limit" }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Could not verify your brief allowance." }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Parse the rich payload (real data only; any field may be null) ───────────
  // The client sends a structured payload (spot, port, day, conditions, tide,
  // biteScores, etc.). We pass it through to the model as JSON without dropping
  // fields; the prompt instructs the model to omit anything that is null.
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Bad JSON." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }

  const spotLat = num(body.lat), spotLng = num(body.lng);
  if (spotLat === null || spotLng === null) {
    return new Response(JSON.stringify({ error: "Spot coordinates required." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Real great-circle bearing + distance from port → spot, computed here from the
  // real coordinates. DISTANCE ONLY — the prompt forbids converting it to time.
  const portLat = num(body.portLat), portLng = num(body.portLng);
  let bd: { distNm: number; bearingDeg: number; compass: string } | null = null;
  if (portLat !== null && portLng !== null) bd = bearingDistance(portLat, portLng, spotLat, spotLng);

  // Full payload, passed to the model as structured JSON (no fields dropped),
  // augmented with the server-computed port→spot distance/heading for grounding.
  const payloadForModel = { ...body, computedPortToSpot: bd };

  const system = `You are an experienced offshore and inshore fishing captain writing a concise, practical pre-trip brief for another captain. You are given structured JSON for a specific spot, departure port, the day they plan to fish, and target species. Write a brief grounded ONLY in the data provided. Never invent numbers or facts. If a field is null or missing, omit that point rather than guessing. Scope everything to fishDayLabel/fishDate.

ABSOLUTE RULES:
- NEVER state how long it takes to travel anywhere. Never estimate travel time, ETA, arrival time, or boat speed — boat speeds vary too widely for any estimate to be valid. You may state distance in nautical miles, but never convert distance into time.
- NEVER give a go/no-go call, a safety verdict, or tell the captain whether to leave the dock, cancel, or whether conditions are "safe." The decision to go is entirely the captain's. Present weather facts and trends only.
- Predictions are guidance, not guarantees. Confident, plainspoken captain's tone — no hedging filler, no preamble, no sign-off.
- Do not fabricate fishing reports or recent catch activity. You have no report data. Speak only to what is TYPICAL for this species, area, and season, and clearly frame it as general seasonal knowledge — never as a recent report.

WEATHER SAFETY EMPHASIS:
- If the conditions data shows significant or hazardous weather — strong or building winds, high or building seas, thunderstorms, fog, or a clearly deteriorating trend through the day — CALL IT OUT PROMINENTLY at the very TOP of the brief, before any other section, in plain language (e.g. "Heads up: winds building to 20-25 kt from the NE by afternoon, seas to 5-6 ft"). State what the conditions are and how they change through the day. Do NOT tell the captain what to do about it — just make the hazard impossible to miss. If conditions are mild, no callout is needed.

Write these sections, in this order. Use short paragraphs or tight bullets. A captain reads this on a phone before leaving the dock.

1. CONDITIONS — for the selected spot on the selected day: forecast high and low air temperature (airTempHiF/airTempLoF), general weather, wind (windKt, windDir, windGustKt), and sea state (waveHtFt and wavePeriodS). If only current values exist rather than a forecast for that day, say so briefly. Note the data source/buoy if present.

2. WATER — waterTempF and what it means for the target species relative to their preferred range; any temperature-break or water-color context you can infer from chlorophyll; and tide (state plus nextHigh/nextLow if present). If waterTempObservedAtMs shows the reading is old, note that it may be dated.

3. THE BITE — using biteScores[]: for each target species, state how favorable this spot looks (the score, the topFactor driving it, and confidence). If inSeason is false for a species, say plainly that it's out of season or out of range here. With no report data available, add a short, clearly-labeled note on what's typical for this species/area/season — framed as general knowledge, not a recent report.

4. BAITS & LURES — recommend a few specific baits/lures for the target species, with recommended COLORS chosen for the actual water clarity/color and the light/weather in the data: darker, higher-contrast colors in dirty water or low light; natural and translucent patterns in clean water and bright sun. Tie each choice to the conditions you were given.

5. CAPTAIN'S TIPS — 3 to 5 specific, actionable tips for these species and conditions: working temperature breaks and color changes, suggested trolling speeds where relevant, structure and depth to target (use depthFt and nearbyStructure), how the wind and tide interact at this spot, and what to watch for on the water (bird activity, bait, rips, weed lines). Make them specific to the data, not generic filler.

Keep the whole brief tight and scannable. No travel time. No go/no-go call. No preamble or sign-off.`;

  const fishLabel = str(body.fishDayLabel) || str(body.fishDate) || "the selected day";
  const user = `Structured trip data (JSON) for the brief below. Write the brief exactly per your system instructions, scoped to ${fishLabel}. Use ONLY these values, omit any point whose field is null or missing, and never invent numbers.

${JSON.stringify(payloadForModel, null, 2)}`;

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
        // A tight 5-section brief fits comfortably in ~700-900 output tokens.
        max_tokens: 900,
        // Prompt caching: the system prompt is identical on every brief, so mark
        // it cacheable. After the first call, repeat calls within the cache
        // window reuse it at ~90% lower input cost.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
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
    return new Response(JSON.stringify({ brief }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Brief exception", (e as Error)?.message);
    return new Response(JSON.stringify({ error: "Brief generation failed." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
