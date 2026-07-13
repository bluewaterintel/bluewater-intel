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
// Claude Haiku 4.5 — fast + low-cost, ample quality for these tactical briefs.
// Override via BRIEF_MODEL secret if you want a heavier model.
const MODEL = Deno.env.get("BRIEF_MODEL") ?? "claude-haiku-4-5";

// Reflect the caller's Origin (fallback to configured list / "*"). Strict
// matching returned the apex domain for www./mobile-webview callers, which the
// browser rejects — the AI Captain's Brief then failed with "Couldn't reach the
// Captain's Brief service." Auth is enforced by the JWT bearer token, not CORS,
// and no cookies are used, so echoing the origin is safe across every hostname.
function corsHeaders(origin: string | null) {
  const allow = origin || (ALLOWED_ORIGINS[0] ?? "*");
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
        ? "The AI Captain's Brief is a premium feature. Subscribe to unlock up to 2 briefs per day."
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

  // RUN PLAN (optional): the client may send runPlan[] — the top 2-3 Bite-Map
  // spots ranked best-first, to be covered in this ONE call. Compute each spot's
  // real bearing/distance from port here (same rule as the primary spot) so the
  // model never has to guess a distance.
  let runPlan = Array.isArray(body.runPlan) ? (body.runPlan as Array<Record<string, unknown>>) : null;
  if (runPlan && portLat !== null && portLng !== null) {
    runPlan = runPlan.map((s) => {
      const la = num(s.lat), ln = num(s.lng);
      const cbd = (la !== null && ln !== null) ? bearingDistance(portLat, portLng, la, ln) : null;
      return { ...s, computedPortToSpot: cbd };
    });
  }
  const isRunPlan = !!(runPlan && runPlan.length >= 2);

  // Full payload, passed to the model as structured JSON (no fields dropped),
  // augmented with the server-computed port→spot distance/heading for grounding.
  const payloadForModel = { ...body, computedPortToSpot: bd, runPlan };

  const system = `You are a veteran offshore + inshore charter captain writing a sharp, practical pre-trip brief for another captain who is PAYING for this. You get structured JSON for one spot (or a runPlan[] of spots), the departure port, the day to fish, and target species. Ground the brief ONLY in the data given, but USE EVERY REAL VALUE. Scope everything to fishDayLabel/fishDate. Be concise — a captain reads this on a phone at the dock.

RULES:
- Read dataAvailability{} first, then build around what's present. Lead each section with the real numbers (water temp, wind, seas, current, break strength, bite drivers). Never write generic "typically in July" filler when a real value exists.
- If a field is null, silently skip it. NEVER write sentences about missing data ("no water temp", "wind direction not in dataset", "top factor not specified"). Note a genuinely important gap at most once, in a short clause.
- Turn each datum into a concrete tactic — don't just restate it.
- DISTANCE: the only run distance you may cite is computedPortToSpot.distNm (great-circle nm from port to spot) with computedPortToSpot.compass, or runFromPortNm. Never invent, round up, or estimate another distance. If absent, state no distance.
- NEVER state travel time, ETA, or boat speed. NEVER give a go/no-go or safety verdict. NEVER invent numbers, catch reports, or recent activity; frame any seasonal knowledge clearly as general, not a report.
- Confident, plainspoken captain's voice. No preamble, no sign-off, no restating instructions. Finish EVERY section — never stop mid-sentence; if running long, tighten earlier prose so BAITS & LURES and CAPTAIN'S TIPS are complete.

FORMAT — use "## " headers and **bold**. Open with a one-line spot header: depth (depthFt) if present + the run as "computedPortToSpot.distNm nm computedPortToSpot.compass of <port>". If conditions show significant/building weather (strong/building wind, big/building seas, storms, fog, deteriorating trend), add a one-line "**Heads up:**" before Section 1 stating the hazard + trend as facts (e.g. "SW 18–22 kt gusting 28, seas building to 5–6 ft @ 6 s"). No advice. Omit if mild.

## 1. CONDITIONS — air hi/lo (airTempHiF/airTempLoF), sky (conditions.sky) + precip% (conditions.precipChancePct) if present; wind as speed + DIRECTION + gusts (e.g. "SW 12 kt, gusts 18"); seas as height @ period (and what a short vs long period means for the ride); ocean current as drift + set when currentDriftKt/currentSetDir present (e.g. "1.4 kt setting NE"); flag a strong current edge when conditions.currentEdgeKtPer10nm is meaningful. Attribute source (conditions.source, conditions.buoy). Always state windDir when present.
## 2. WATER — waterTempF vs the target species' preferred range, specifically ("82°F — prime for yellowfin"). If waterTempRegional/median, note in a clause it's an area-wide read, then use it. If conditions.thermalBreakFper10nm is meaningful (>~1°F/10nm), call out the break as the edge to fish. Use chlorophyll for water color/clarity (higher = greener/dirtier/more productive; low = clean blue). Then tide: state + nextHigh/nextLow (say it's read at the inlet when tide.atPort). If waterTempObservedAtMs is clearly old, note it in one clause.
## 3. THE BITE — for each species in biteScores[]: score/100, confidence, and WHY using topFactor + topFactors[] (factor + detail), tied to Sections 1–2. If topFactor is null but SST/break/current exist, explain from those. If outOfRange, say it isn't a known fishery here; if inSeason is false, say it's off-season. Add one clearly-labeled line of what's TYPICAL (general knowledge, not a report).
## 4. BAITS & LURES — specific baits/lures with COLORS matched to the ACTUAL water color/clarity + light: dark/high-contrast in green/dirty water & low light; natural/translucent in clean blue & bright sun. Reference the real temp/chlorophyll/sky.
## 5. CAPTAIN'S TIPS — 3–5 data-driven tips: working the break/color change (gradient + chlorophyll), the current edge (currentEdgeKtPer10nm) as a drift/weed line, trolling speed where relevant, structure/depth (depthFt, nearbyStructure), how wind vs current/tide stack bait (windDir vs currentSetDir/tide), and what to watch for (birds, bait, rips, weed lines). Every tip references the data — no filler.`;

  const fishLabel = str(body.fishDayLabel) || str(body.fishDate) || "the selected day";
  const speciesMode = str(body.speciesMode) || "manual";
  const autoPick = body.speciesAutoPick && typeof body.speciesAutoPick === "object" ? body.speciesAutoPick : null;
  const autoNote = speciesMode === "auto" && autoPick
    ? `\nSPECIES SELECTION: speciesMode is "auto" (Captain's Choice). The app ranked every viable local species using the bite-map engine — score, confidence, and seasonal fit for ${fishLabel} — and auto-selected the targets in species[] and biteScores[]. speciesAutoPick.primaryTarget is the #1 recommendation. Open "## 3. THE BITE" by naming that primary target first and explaining why it wins today using the real biteScores[] drivers and seasonality. Briefly note the runner-up species and when they make sense. In "## 4. BAITS & LURES" lead with the primary target, then cover the backups. Make it clear this is a data-driven recommendation for a captain who didn't pick a species — not a guess.\n`
    : "";
  const runNote = isRunPlan
    ? `\nRUN PLAN MODE: runPlan[] holds ${runPlan!.length} spots ranked best-first (rank 1 = top pick; the top-level spot/conditions/tide describe rank 1's area, and because the spots are close together those conditions apply to all). Write a MULTI-SPOT plan:
- Open with a one-line header: port, day (${fishLabel}), and how many spots.
- "## RUN PLAN" listing each spot IN ORDER as "**Run N — <distance> nm <compass> of port, <depthFt> ft**" using ONLY that spot's runFromPortNm or computedPortToSpot.distNm/compass. For each: bite score(s) + confidence + top factor, nearby structure, and one reason to fish it / how it differs (closer, deeper, better break). Rank honestly by the data.
- Then "## CONDITIONS", "## WATER", "## BAITS & LURES", "## CAPTAIN'S TIPS" for the AREA (rank 1's readings apply), noting spot-specific structure/depth tactics where they matter.\n`
    : "";
  const user = `Structured trip data (JSON) for the brief below. Write it exactly per your system instructions, scoped to ${fishLabel}. Use ONLY these values, omit any field that is null/missing, never invent numbers.${autoNote}${runNote}

${JSON.stringify(payloadForModel)}`;

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
        // Output tokens are the main cost driver on Haiku, and the prompt now
        // asks for a tight brief. 2000 still covers a multi-species / run-plan
        // brief across all 5 sections without truncating mid-section.
        max_tokens: 2000,
        // Prompt caching: the system prompt is identical on every brief, so mark
        // it cacheable. After the first call, repeat calls within the cache
        // window reuse it at ~90% lower input cost.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }),
      // A full multi-species 5-section brief can take well over 30s to generate,
      // so the old 30s abort was firing mid-generation and surfacing as a
      // "timed out" failure. 90s leaves ample headroom while staying inside the
      // platform's request budget.
      signal: AbortSignal.timeout(90000),
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
