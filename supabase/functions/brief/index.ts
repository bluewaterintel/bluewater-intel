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
// Deployed default: Claude Haiku 4.5 — fast + low-cost, ample quality for tactical briefs.
// Override via BRIEF_MODEL secret (e.g. claude-sonnet-5) for a heavier model.
const BRIEF_FN_VERSION = "20260715a";
const MODEL_RAW = Deno.env.get("BRIEF_MODEL") ?? "claude-haiku-4-5";
const MODEL = MODEL_RAW.trim() || "claude-haiku-4-5";

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
    "X-Brief-Function-Version": BRIEF_FN_VERSION,
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

// Sonnet 5+ may return thinking blocks before text; collect all text blocks.
function extractBriefText(d: Record<string, unknown>): string | null {
  const content = d?.content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      if (t) parts.push(t);
    }
  }
  return parts.length ? parts.join("\n") : null;
}

function isAdaptiveThinkingModel(model: string): boolean {
  return /sonnet-5|sonnet-4-6|opus-4-[78]|fable-5|mythos/i.test(model);
}

// Sonnet 5 defaults to adaptive thinking; disable for fast tactical briefs.
// max_tokens is shared between thinking + text on those models — keep headroom.
function briefAnthropicRequest(model: string): { max_tokens: number; thinking?: { type: string } } {
  const adaptive = isAdaptiveThinkingModel(model);
  return {
    max_tokens: adaptive ? 4096 : 2000,
    ...(adaptive ? { thinking: { type: "disabled" } } : {}),
  };
}

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
- Read dataAvailability{} first, then build around what's present. Lead each section with the real numbers that matter ONCE, then translate them into what to look for and where to fish.
- If a field is null, silently skip it. NEVER write sentences about missing data ("no water temp", "wind direction not in dataset", "top factor not specified", "no high/low times available"). Note a genuinely important gap at most once, in a short clause.
- NO NUMBER SPAM: state each quantitative fact at most ONCE in the whole brief (SST °F, chlorophyll mg/m³, break °F/10nm, current kt, depth). Later sections refer back in plain language ("because the water's in range…", "work that same break…", "clean blue calls for…") — never re-quote the same number.
- TECH → TACTIC: Never leave a captain with only a lab unit. If you mention thermalBreakFper10nm (or any °F/10nm), IMMEDIATELY say what to look for on the water using thermalBreakHowToFish when present (color change, rip, weed line, temp-gauge jump) and WHERE to run (troll along the seam, not through it). If you mention chlorophyll, use waterClarityHowToFish and do not restate mg/m³ later. Same for currentEdgeHowToFish.
- BITE SCORES: biteScores[] / speciesTargets[] come from the same Bite Map engine the captain sees on the chart. Quote those scores exactly — never invent a different score for a species. If a secondary species scores low, say so honestly and keep it as a backup bait, not a trip-builder.
- MULTI-SPECIES LOCATIONS: When speciesLocationsDiverge is true (or speciesTargets[] show different runFromPortNm/runCompass ~10+ nm apart), you MUST give each species its OWN fishing location. Open with "## WHERE TO FISH" listing each target from speciesTargets[] as "**Species — runFromPortNm nm runCompass of <port>**" plus spotLabel or nearbyStructure[0].name and depthFt when present. In "## 3. THE BITE", lead each species with that same location before the score. NEVER collapse divergent targets onto one shared Point. Only use one shared spot when speciesLocationsDiverge is false.
- DISTANCE: for each species cite ONLY that species' speciesTargets[].runFromPortNm + runCompass (or biteScores[].runFromPortNm/runCompass). For a single-spot / non-diverging brief, use computedPortToSpot.distNm + compass or top-level runFromPortNm. Never invent, round up, or estimate another distance. If absent, state no distance.
- NEVER state travel time, ETA, or boat speed. NEVER give a go/no-go or safety verdict. NEVER invent numbers, catch reports, or recent activity; frame any seasonal knowledge clearly as general, not a report.
- TIDE: when tide.headerText or tide.nextHigh/nextLow/nextEvents are present, give the inlet tide schedule clearly (state + next High/Low times). Prefer tide.headerText when set. If tide.atPort, say it's read at the departure inlet. Do NOT claim tide times are unavailable when those fields are present.
- SEASONALITY: respect biteScores[].inSeason, seasonStrength (0–1), and outOfRange — they come from regional fisheries data. If seasonStrength is low (<0.5) or inSeason is false, do NOT call it "peak season." Yellowfin tuna: Hatteras/NC peaks late spring–early summer (Apr–Jun); mid-summer (Jul–Aug) fish often stack off MD/DE/NJ canyons as they push north — never claim Hatteras is "as far north as yellowfin go" in July; they routinely reach Ocean City, Delaware Bay, and NJ canyon grounds. A fall push sometimes revisits VA/NC (Sep–Oct).
- Confident, plainspoken captain's voice. No preamble, no sign-off, no restating instructions. Finish EVERY section — never stop mid-sentence; if running long, tighten earlier prose so BAITS & LURES and CAPTAIN'S TIPS are complete.

FORMAT — use "## " headers and **bold**. If speciesLocationsDiverge is false: open with a one-line spot header (depthFt + computedPortToSpot.distNm nm compass of <port>). If speciesLocationsDiverge is true: open with "## WHERE TO FISH" from speciesTargets[] (one line per species) — do NOT invent a single shared Point header. If conditions show significant/building weather (strong/building wind, big/building seas, storms, fog, deteriorating trend), add a one-line "**Heads up:**" before Section 1 stating the hazard + trend as facts (e.g. "SW 18–22 kt gusting 28, seas building to 5–6 ft @ 6 s"). No advice. Omit if mild.

## 1. CONDITIONS — air hi/lo (airTempHiF/airTempLoF), sky (conditions.sky) + precip% (conditions.precipChancePct) if present; wind as speed + DIRECTION + gusts (e.g. "SW 12 kt, gusts 18"); seas as height @ period (and what a short vs long period means for the ride); ocean current as drift + set when currentDriftKt/currentSetDir present (e.g. "1.4 kt setting NE"); flag a strong current edge using currentEdgeHowToFish when present. Attribute source (conditions.source, conditions.buoy). Always state windDir when present.
## 2. WATER — waterTempF vs the target species' preferred range ONCE ("82°F — prime for yellowfin"). If waterTempRegional/median, note in a clause it's an area-wide read. For the break: one short number then thermalBreakHowToFish (what to look for / where to troll). For clarity: chlorophyll once OR waterClarityHowToFish — not both with repeated mg/m³. Then tide from tide.headerText or nextHigh/nextLow/nextEvents (inlet schedule when tide.atPort).
## 3. THE BITE — for each species in biteScores[] / speciesTargets[]: lead with that species' location (runFromPortNm nm runCompass, spotLabel/structure, depthFt) when speciesLocationsDiverge or when a per-species location is present; then score/100 and confidence EXACTLY as given. Explain WHY with topFactor + topFactors[], tied to Sections 1–2 without re-quoting every number. If outOfRange, say it isn't a known fishery here; if inSeason is false, say it's off-season. Add one clearly-labeled line of what's TYPICAL (general knowledge, not a report).
## 4. BAITS & LURES — specific baits/lures with COLORS matched to water clarity + light. Reference clarity/temp conceptually ("clean blue / bright sun") — do NOT paste chlorophyll mg/m³ or SST again if already stated.
## 5. CAPTAIN'S TIPS — 3–5 actionable tips: where to run the boat on the break/rip/current edge, what surface signs to watch (birds, bait, weed, slicks), wind-vs-current stacking, structure/depth when relevant. Every tip tells the captain what to LOOK FOR or WHERE to fish — no bare lab units.`;

  const fishLabel = str(body.fishDayLabel) || str(body.fishDate) || "the selected day";
  const speciesMode = str(body.speciesMode) || "manual";
  const autoPick = body.speciesAutoPick && typeof body.speciesAutoPick === "object" ? body.speciesAutoPick : null;
  const autoNote = speciesMode === "auto" && autoPick
    ? `\nSPECIES SELECTION: speciesMode is "auto" (Bluewater Recommendation). The app ranked every viable local species using the bite-map engine — score, confidence, and seasonal fit for ${fishLabel} — and auto-selected the targets in species[] and biteScores[]. speciesAutoPick.primaryTarget is the #1 recommendation. Open "## 3. THE BITE" by naming that primary target first and explaining why it wins today using the real biteScores[] drivers and seasonality. Briefly note the runner-up species and when they make sense. In "## 4. BAITS & LURES" lead with the primary target, then cover the backups. Make it clear this is a data-driven recommendation for a captain who didn't pick a species — not a guess. Quote biteScores[].score exactly as given.\n`
    : "";
  const runNote = isRunPlan
    ? `\nRUN PLAN MODE: runPlan[] holds ${runPlan!.length} spots ranked best-first (rank 1 = top pick; the top-level spot/conditions/tide describe rank 1's area, and because the spots are close together those conditions apply to all). Write a MULTI-SPOT plan:
- Open with a one-line header: port, day (${fishLabel}), and how many spots.
- "## RUN PLAN" listing each spot IN ORDER as "**Run N — <distance> nm <compass> of port, <depthFt> ft**" using ONLY that spot's runFromPortNm or computedPortToSpot.distNm/compass. For each: bite score(s) + confidence + top factor, nearby structure, and one reason to fish it / how it differs (closer, deeper, better break). Rank honestly by the data.
- Then "## CONDITIONS", "## WATER", "## BAITS & LURES", "## CAPTAIN'S TIPS" for the AREA (rank 1's readings apply), noting spot-specific structure/depth tactics where they matter.\n`
    : "";
  const diverge = !!(body as { speciesLocationsDiverge?: boolean }).speciesLocationsDiverge;
  const speciesLocNote = diverge
    ? `\nMULTI-SPECIES GROUNDS: speciesLocationsDiverge is true. speciesTargets[] lists each fish's best Bite Map cell with runFromPortNm, runCompass, depthFt, and spotLabel. You MUST open with "## WHERE TO FISH" (one line per species) and give each species its own location in "## 3. THE BITE". Do not invent a single shared Point for all targets.\n`
    : "";
  const user = `Structured trip data (JSON) for the brief below. Write it exactly per your system instructions, scoped to ${fishLabel}. Use ONLY these values, omit any field that is null/missing, never invent numbers.${autoNote}${runNote}${speciesLocNote}

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
        ...briefAnthropicRequest(MODEL),
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
    const d = await r.json() as Record<string, unknown>;
    const brief = extractBriefText(d);
    if (!brief) {
      const stopReason = str(d.stop_reason);
      const blockTypes = Array.isArray(d.content)
        ? (d.content as Array<Record<string, unknown>>).map((b) => str(b.type)).filter(Boolean).join(", ")
        : "";
      let msg = `Empty brief from ${MODEL}.`;
      if (stopReason === "refusal") {
        msg = "Brief was declined by the model safety filter. Try a different spot or species.";
      } else if (blockTypes.includes("thinking")) {
        msg = `Brief returned no text — ${MODEL} used thinking tokens only. Redeploy brief function ${BRIEF_FN_VERSION} (thinking disabled for Sonnet 5) or set BRIEF_MODEL=claude-haiku-4-5.`;
      } else if (stopReason === "max_tokens") {
        msg = "Brief was truncated before any text was returned. Increase max_tokens or use a lighter model.";
      } else if (!blockTypes) {
        msg = `Brief returned no content blocks (model=${MODEL}, fn=${BRIEF_FN_VERSION}). Check BRIEF_MODEL secret and redeploy.`;
      }
      console.error("Empty brief", { model: MODEL, stopReason, blockTypes, fn: BRIEF_FN_VERSION });
      return new Response(JSON.stringify({ error: msg, fnVersion: BRIEF_FN_VERSION, model: MODEL, stopReason, blockTypes }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ brief, fnVersion: BRIEF_FN_VERSION }), { headers: { ...cors, "Content-Type": "application/json" } });
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
