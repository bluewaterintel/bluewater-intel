# Bluewater Intel — Project Handoff Summary

_Last refreshed: June 2026. Every number here was verified directly against the file at refresh time. Find line numbers by grep, not by the numbers in this doc — they drift with every edit._

## What this is
Bluewater Intel — a single self-contained HTML5 offshore fishing app (US East Coast + Gulf). Mapping, NOAA/NASA data layers, a fishing-prediction algorithm, ~12,000 fishing waypoints, boat ramps, catch logging, a fish encyclopedia, LORAN-C TD lines, an AI Captain's Brief, and GPX export. Goal is eventual native iOS/Android with a shared backend, plus a website — all on one backend.

## Files
- **bluewater-intel_9_4_1_4.html** — the entire app (one file, ~20,400 lines). The only file strictly needed. NOTE the exact filename includes the `_9_4_1_4` suffix.
- **Bluewater-Intel-Backend-Wiring-Instructions.md** — the authority on the ocean-data backend, the no-synthetic-in-production mandate, and the client DataSource-seam prerequisite. Bring this for backend work.
- **ocean-data-backend-spec.md** — the underlying ERDDAP/NOAA/AIS data-source research (which datasets, the tile-proxy design). Bring this for the ocean-data layer specifically.
- **boat_ramps_standardized_.csv** — 643-ramp source data (optional; only if editing ramps).
- Master waypoint CSV (optional; only if updating waypoints). The embedded dataset holds **12,027** points.

Working copy lives at `/home/claude/bluewater-intel_9_4_1_4.html`, shipped to `/mnt/user-data/outputs/` after each change.

## Mandatory workflow (state this to the new chat)
After EVERY edit, run the integrity check BEFORE shipping (before present_files):
1. Strip HTML comments first (a comment containing `<script src>` corrupts extraction), then extract each `<script>` block and `node --check` each.
2. Verify CSS brace balance, `<div>`, `<svg>`, and `<label>` open/close balance via Python.
3. **Current healthy baseline: scripts 11/11 valid, CSS 694/694, DIV 947/947, SVG 99/99, LABEL 38/38.** The real invariant is open == close; if an edit legitimately adds/removes elements, the matched totals stay equal.

Sandbox can't render and key government tile/data endpoints are blocked by the proxy — confirm visuals via phone/desktop screenshots. Broken files have shipped before by calling present_files before the integrity check — always verify first.

## Current state of major features (all complete unless noted)
- **Data layers:** SST (GIBS GAMSSA), Chlorophyll (GIBS MODIS), animated radar loop (nowCOAST MRMS). All real, all working. SST is coarse and chlor is gappy — both slated for upgrade per the backend spec, but real today.
- **Wind layer:** SYNTHETIC. The "PREVIEW" badge was removed at owner request; label now reads "Wind (animated)." **Flag: nothing in the UI signals wind is synthetic, and the tutorial text still says "NOAA wind data." Real wind comes from the backend (GFS/HRRR).**
- **Predictive Heat Map:** label renamed from "Predictive Heat"; BETA badge removed. **Computed entirely from synthetic ocean data today** (see Prediction engine below) — this is the #1 thing the backend project removes.
- **Fishing Waypoints:** 12,027 points (v6), inlined as `window.BW_WAYPOINTS`. 11 types. Viewport-culled, capped at 1200 in DOM, blink-fixed. Hover tooltip + (new) tap-to-forecast popup.
- **Boat Ramps:** 643 points (v3), `window.BW_RAMPS`. Same culling.
- **AI Captain's Brief:** EXISTS and works. Wired to **Claude/Anthropic** (not Grok/Gemini). Two-tier: backend first via `API.getBrief()` using a server-side Anthropic key (secure), falling back to a direct `api.anthropic.com` call for the sandbox/demo only. Prompt is fully written (salty-captain persona, bearing/species/technique/intel/safety). Backend just needs to host the keyed endpoint.
- **6-Day Forecast modal:** REAL today — `showForecast` -> `fetchForecast` calls Open-Meteo marine+weather APIs with offline-cache-and-label fallback. Wired to BOTH Major Fishing Areas and (newly) fishing-waypoint map markers. This is the model pattern for honest offline behavior.
- **Species:** 43, registered across 7 tables.
- **Fish Encyclopedia:** identify / confused-with sections.
- **My Catches:** logs catches w/ auto-filled conditions (currently synthetic); localStorage; analytics needs 5+ catches.
- **GPX export:** one unified export in Waypoints & Structure -> Import/Export.
- **Legal:** Privacy Policy discloses mandatory app-diagnostics collection (no opt-out) for diagnostics/performance only, excluding location/spots/name/email. Terms (Virginia law). **Still needs attorney review before launch — the mandatory-analytics posture especially (GDPR/CCPA consent validity).**
- **Diagnostics/analytics:** mandatory, no opt-out. `BWI.track`, localStorage ring buffer. The opt-out checkbox and privacy/diagnostics statements were removed from the Map Layers panel; only the functional "View diagnostics" button remains. `analyticsOptedOut()` always false, `setAnalyticsOptOut()` a no-op.
- **Map zoom:** capped at 13 on tile layers.
- **Ports:** `PORTS` object has **77** entries; `PORT_GROUPS` has **76** distinct "City, ST" strings. **KNOWN BUG: 77!=76 means one port is in PORTS but not PORT_GROUPS (or vice-versa), hiding it from the top dropdown. This has bitten the project before. Reconcile before layering backend port data.**

## Work completed in the most recent sessions (for continuity)
- **LORAN-C coastline clip:** lines keep their real grid geometry and are cut at a coastline pushed ~6 nm inland (`COAST_BUFFER = 0.12` in `traceLoranLine`, ~line 8356+), so they slightly overshoot onto land rather than leave water gaps (explicit owner preference). Do NOT reintroduce synthesized on-coast endpoints — that caused horizontal/crooked artifacts (tried and reverted twice).
- **Waypoint forecast popup:** fishing-waypoint markers now bind a popup with a "6-Day Forecast" button calling `showForecast(w.lat,w.lng,w.name)`, mirroring canyons. Single-quote escaping handles names like "JOANIE'S REEF".
- **Bug fix:** `startRadarLoop()` now clears any existing `_radarTimer` before creating a new one (was a latent leaked-double-speed-timer bug; toggle entry point was already safe).
- **Perf:** `wpIcon(t)` memoized via `_wpIconCache` (icons depend only on ~11 fixed types); `rampIcon()` memoized via single `_rampIcon`. Previously rebuilt an `L.divIcon` per marker on every pan/zoom redraw (up to 1200 wp + 643 ramps). Zero behavior change.
- **Dead code removed (verified unreferenced):** `exportWaypointsGpx`, `buildGpx` (its only caller), `ocShowSandboxNotice`. Kept `gpxEscape` (still used 11x). Deliberately did NOT touch synthetic functions (needed until backend exists) or refactor `nmBetween`.

## Prediction engine internals (for reference)
- `scoreCell(lat,lng,speciesId)` at ~5139; consumed at the heat grid (~6583) and per-spot score (~7596).
- **Currently fed entirely by synthetic functions, ALL called directly (no DataSource abstraction exists):** `synthSST` (~4553), `synthChlor` (~4624, distance-offshore + `Math.random()`, no time term), `synthDepth` (~4634, wraps `seaDepth`), `thermalBreak` (~4655, derived from synthSST), `synthPressureTrend` (~4772), `synthWindDir` (~4915), `synthWeatherChange` (~5073). `seaDepth` (~6151) also gates land/water.
- `nmBetween()` haversine in nm (~6493). `computePredictionGridAsync` (~6554). `HOME_PORT_ZOOM=7`, `HOME_PORT_RADIUS_NM=200`, `FALLBACK_HOME_PORT="Oregon Inlet, NC"`.

## THE GOVERNING PRINCIPLE FOR ALL BACKEND WORK
**Real data or an honest absence of data. Never synthetic data presented as real — and never any synthetic data in the prediction engine, ever.** When real data is unavailable (offline, backend down, cell uncovered), withhold-and-label; never fabricate. The synthetic functions are legacy placeholders to be removed from the production path — kept only as a dev-time parity reference, compiled out of production. The one allowed offline exception is static bathymetry / the land-water gate (deterministic geography, can't mislead).

## NEXT TASK — backend launch (Supabase-first, recommended path)
Decision reached with the owner: **Supabase is the recommended backend** for the data + auth + AI-brief layer (Postgres fits the relational, geo-radius data; PostGIS does the "within N nm of port" queries natively; built-in auth + row-level security map onto the privacy promises; one platform collapses the most work). The **ocean-data tile proxy is a SEPARATE decision** — it's a caching-proxy job that may live outside Supabase (edge/CDN). Migrating waypoints does NOT commit the tile-proxy choice.

**Build order (each milestone is independently shippable):**
1. **Waypoints + ramps migration (do FIRST — independent of everything else).** Move the 12,027 inlined waypoints + 643 ramps into Supabase Postgres with PostGIS spatial indexing. Swap the client's inlined `BW_WAYPOINTS`/`BW_RAMPS` for Supabase queries. Clean foundational milestone; touches neither the prediction engine nor the AI brief.
2. **Auth + user data.** Accounts, `user_waypoints`/`catches` tables, RLS so private spots stay private (matches Terms). Cross-device sync the app already promises.
3. **AI Captain's Brief endpoint.** Host the keyed `API.getBrief` endpoint server-side (Anthropic key never in the client). Prompt and client wiring already exist — this is just the server endpoint. Provider is a config choice; keep Claude since it's already tuned. Budget paid API calls or gate the feature rather than depending on a free LLM tier.
4. **Ocean-data layer (the big one).** Per the two backend docs: build the client DataSource seam FIRST (prerequisite — no abstraction exists today), then real SST/chlor/depth/AIS/wind via the tile proxy + `/grid` endpoint, withhold-and-label on no-data, disable synthetic in production behind a regression gate.
5. **Diagnostics vs monetization data separation, de-identification pipeline, consent/DSAR** — per backend doc sections 7.2/9, before any aggregate data is shared.

**Division of labor (recommended):** Have the design + code artifacts (Supabase schema SQL, RLS policies, the waypoint/ramp migration seed, Edge Function code, client wiring changes) produced in a Claude chat — these don't need live credentials. Run/deploy/iterate in **Cursor** in your own repo (it can run the Supabase CLI, hold secrets, test against the live project). Caution: an agentic tool like Cursor will quietly "make it work" by reintroducing synthetic fallbacks or loosening privacy/key rules if unsupervised — hold it to the governing principle above and keep the API key server-side.

**Start a fresh chat for the backend work** — this conversation has been compacted and is heavily loaded; the backend build will generate several new files and wants clean room. Bring: this handoff, the app file, and both backend docs.

## Other pending / deferred
- Reconcile PORTS vs PORT_GROUPS (77 vs 76).
- Wind layer synthetic but unlabeled; tutorial text still says "NOAA wind data."
- Attorney review of Terms + Privacy (mandatory analytics).
- Author hand-written port-specific data for the 9 newer ports (Long Beach NY, Freeport NY, Toms River NJ, Atlantic City NJ, Brunswick GA, Melbourne FL, Vero Beach FL, Clearwater FL, Venice FL) across 3 port-keyed datasets — CANYONS (`const CANYONS=[` ~line 2499, `region:"Port, ST"`), vessel zones (`zone:"` ~line 2785, `port:"Port, ST"`), fishing reports (`hoursAgo:` ~line 3142, `port:"Port, ST"`). ~3 entries per port per dataset; real named features, plausible offshore coords, not-for-navigation framing. Verified zero entries currently for Toms River/Brunswick/Melbourne/Vero Beach/Clearwater.
