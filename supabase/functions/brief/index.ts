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
//     • runFromPortNm (nm)       → real great-circle run from port → spot
//                                   (client-computed; the ONLY run distance cited)
//     • named nearby structure   → real, web-verified features (client sends)
//     • target species           → real SPECIES selections
//     • conditions{}             → REAL air temp, wind (speed/dir/gust), seas
//                                   (Open-Meteo GFS/marine + NDBC buoy when near),
//                                   water temp (satellite SST grid, incl. area
//                                   median), chlorophyll, thermal break strength,
//                                   ocean current drift/set, sky, precip chance
//     • tide{}                   → real NOAA CO-OPS stage + next high/low
//     • biteScores[]             → the SAME engine that drives the Bite Map:
//                                   score, confidence, topFactor + topFactors[]
//                                   (the weighted drivers), inSeason/outOfRange
//     • dataAvailability{}       → a manifest of which real signals are present
//   Every value is REAL or null. The prompt forbids inventing numbers, but it
//   MUST fully use the real data provided — leading with what's known and only
//   briefly noting genuine gaps.
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
// Claude Sonnet 4.6 — balanced quality for tactical briefs. Override via BRIEF_MODEL secret.
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

  const system = `You are a veteran offshore and inshore charter captain writing a sharp, practical pre-trip brief for another captain who is PAYING for this. You receive structured JSON for a specific spot, departure port, the day they plan to fish, and target species. Write the brief grounded ONLY in the data provided, but USE EVERY REAL DATUM YOU ARE GIVEN. Scope everything to fishDayLabel/fishDate.

MINDSET — this is a premium product, and a data-poor brief is a FAILURE:
- You are DATA-RICH. The payload carries real air temp, wind (speed + direction + gusts), seas (height + period), water temp (satellite SST — sometimes an area median), chlorophyll, thermal-break strength, ocean current (drift + set) and the current EDGE, sky/precip, tide (from the inlet), and a full bite-score breakdown with the weighted drivers. Read dataAvailability{} FIRST to see exactly what is present, then BUILD THE BRIEF AROUND WHAT YOU HAVE.
- Lead with real numbers in every section. This is the #1 rule: a captain paying for this must see their actual water temp, wind, seas, current, break strength, and bite drivers — never generic "typically in July…" filler when the real value is sitting in the payload.
- BANNED: sentences whose main content is the ABSENCE of data. Do NOT write "No water temperature data is available", "wind direction not in the dataset", "structure data is absent", "no tide data", or "Top factor: Not specified". If a field is null, silently skip it and move on. You may note a genuinely important gap ONCE, in a short clause — never a sentence, never a paragraph, never a bullet dedicated to it.
- Turn data into tactics. A water temp, a break gradient, a current set, a wind-vs-tide interaction — each should drive a concrete recommendation, not just get restated.
- If dataAvailability shows a signal is present, you MUST use its value. Check waterTemp, thermalBreak, chlorophyll, current, currentEdge, wind, windDir, seas, tide, and biteScores and put each present value to work.

HARD RULES (never violate):
- DISTANCE: the ONLY run distance you may cite is computedPortToSpot.distNm (great-circle nm from the departure port to the spot) or the equivalent runFromPortNm field — use that exact number and its compass bearing (computedPortToSpot.compass). NEVER invent, round up, or estimate a different distance, and NEVER describe the spot as "X nm offshore" using any other figure. If neither field is present, do not state a run distance at all.
- NEVER state or imply travel time, ETA, arrival time, or boat speed — boat speeds vary too widely. Distance in nautical miles is fine; never convert distance to time.
- NEVER give a go/no-go call or safety verdict, and never tell the captain to leave, cancel, or that conditions are "safe/unsafe." Present the weather facts and how they trend; the decision is the captain's.
- NEVER invent numbers, catch reports, or recent activity. You have no live reports. When you speak to what's typical for the species/area/season, clearly frame it as general seasonal knowledge — never as a recent report, and never as a substitute for a real value that's in the payload.
- Confident, plainspoken captain's voice. No hedging filler, no preamble, no sign-off, no restating these instructions.

WEATHER CALLOUT (top of brief):
- If conditions show significant or building weather — strong/building wind, high/building seas, thunderstorms, fog, or a clearly deteriorating trend — put a one-line **Heads up:** at the very TOP, before Section 1, stating the hazard and its trend in plain terms (e.g. "Heads up: SW wind 18–22 kt with gusts to 28, seas building to 5–6 ft @ 6 s by afternoon"). State the facts; do not tell the captain what to do. If conditions are mild, omit the callout entirely.

Write these sections in this order. Short paragraphs or tight bullets — a captain reads this on a phone at the dock. Use "## " markdown headers for each numbered section (e.g. "## 1. CONDITIONS") and bold with **…**. Finish EVERY section — never stop mid-sentence; if you are running long, tighten earlier prose so BAITS & LURES and CAPTAIN'S TIPS are always complete.

Open with a one-line spot header before the Heads up / Section 1: the depth (depthFt) if present and the run as "computedPortToSpot.distNm nm computedPortToSpot.compass of <port>" — using ONLY that distance.

1. CONDITIONS — Air high/low (airTempHiF/airTempLoF), sky (conditions.sky) and precip chance (conditions.precipChancePct) if present. Wind as speed + DIRECTION + gusts (e.g. "SW 12 kt, gusts 18"). Seas as height @ period (e.g. "3.8 ft @ 7 s" — and read what a short vs long period means for the ride). Ocean current when currentDriftKt/currentSetDir are present (e.g. "1.4 kt setting NE"), and flag a strong current edge if conditions.currentEdgeKtPer10nm is meaningful. Attribute the source (conditions.source, and conditions.buoy when a buoy is cited). If windDir is present, ALWAYS state the wind direction — it is in the data; do not claim it is missing.

2. WATER — waterTempF and what it means for the target species vs their preferred range (be specific: "82°F — prime blue-water range for yellowfin"). If waterTempSource says it's an area median or waterTempRegional is true, note in a short clause that the value is an area-wide read, not a pinpoint pixel — then still use it. Use conditions.thermalBreakFper10nm: if present and meaningful (>~1°F/10nm), call out that a temperature break is set up here and that it's the edge to fish. Use chlorophyll for water-color/clarity context (higher = greener/dirtier/more productive; low = clean blue). Then tide: state + nextHigh/nextLow — when tide.atPort is true, say the tide is read at the inlet/port (that's the timing for your run out and back). If waterTempObservedAtMs is clearly old, note the reading may be dated in one clause.

3. THE BITE — For each species in biteScores[]: give the score/100, the confidence, and EXPLAIN it using topFactor and topFactors[] (each has factor + detail, e.g. "Water temperature — 82°F", "Temp break — 2.3°F/10nm"). Tie the drivers to the numbers from Sections 1–2. If topFactor is null but SST/break/current values exist in conditions, explain the score from those instead of writing "top factor not specified". If outOfRange is true, say plainly the species isn't part of a known fishery here. If inSeason is false, say it's off its seasonal window. Then add a short, clearly-labeled line of what's TYPICAL for this species/area/season (general knowledge, not a report).

4. BAITS & LURES — A few specific baits/lures for the target species, with COLORS chosen for the ACTUAL water clarity/color and light in the data: darker/higher-contrast in green or dirty water and low light; natural/translucent in clean blue water and bright sun. Tie each pick to the water temp, color (chlorophyll), and sky you were given — reference them explicitly.

5. CAPTAIN'S TIPS — 3–5 specific, data-driven tips: how to work the thermal break / color change (use the gradient and chlorophyll), the current edge (currentEdgeKtPer10nm) as a drift/weed line, trolling speed where relevant, structure and depth to target (depthFt, nearbyStructure), how wind and tide/current interact at this spot to stack bait (use windDir vs currentSetDir/tide), and what to watch for on the water (birds, bait, rips, weed lines). No generic filler — every tip should reference something in the data.

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
        // A full 5-section brief (conditions, water, per-species bite, baits &
        // lures, captain's tips) needs headroom so it never truncates mid-section
        // — the earlier 1100 cap cut off BAITS & LURES entirely. 2400 covers a
        // multi-species brief with margin.
        max_tokens: 2400,
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
      // Surface a SAFE, specific reason to the (signed-in, premium) caller so a
      // failure is diagnosable instead of a dead-end "try again". The Anthropic
      // error body contains an error type/message (e.g. a retired/unknown model,
      // an invalid key, or an exhausted credit balance) — never the API key — so
      // a trimmed copy is safe to return. We also map the common cases to plain
      // guidance since model retirements are the usual culprit over time.
      let reason = "";
      try { const j = JSON.parse(detail); reason = j?.error?.message || j?.error?.type || ""; } catch { reason = detail.slice(0, 160); }
      let msg: string;
      if (r.status === 404 || /model/i.test(reason)) {
        msg = `Brief model "${MODEL}" was rejected by Anthropic (it may be retired or misspelled). Update BRIEF_MODEL to a current model and redeploy.`;
      } else if (r.status === 401 || /api[-_ ]?key|authentication|x-api-key/i.test(reason)) {
        msg = "Anthropic rejected the API key (invalid or expired). Update the ANTHROPIC_API_KEY secret and redeploy.";
      } else if (r.status === 429 || /rate limit|overloaded|credit balance/i.test(reason)) {
        msg = "Anthropic is rate-limited or the account is out of credits. Try again shortly or top up the Anthropic account.";
      } else {
        msg = `Brief generation failed upstream (${r.status})${reason ? ": " + reason.slice(0, 160) : ""}.`;
      }
      return new Response(JSON.stringify({ error: msg, upstreamStatus: r.status }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const d = await r.json();
    const brief = d?.content?.[0]?.text ?? null;
    if (!brief) return new Response(JSON.stringify({ error: "Empty brief." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ brief }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    const em = (e as Error)?.message || "";
    console.error("Brief exception", em);
    // Distinguish a timeout (the 30s AbortSignal fired) from other failures so
    // the caller knows whether to simply retry.
    const timedOut = (e as Error)?.name === "TimeoutError" || /abort|timed? ?out/i.test(em);
    const msg = timedOut
      ? "The brief timed out generating (Anthropic took too long). Please try again."
      : "Brief generation failed before reaching Anthropic. Please try again.";
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
