# Bluewater Intel — Consolidated Backend Spec

**Version:** 2.0 (consolidated) · June 2026
**This document merges two prior docs into one authority:**
1. *Ocean Data Backend Spec* (the ERDDAP/NOAA/AIS data-source research — which datasets, endpoints, the tile-proxy design, AIS plan, de-identification).
2. *Backend Wiring Instructions* (the no-synthetic-in-production mandate, the verified current state of the code, the client DataSource-seam prerequisite, the build/ship discipline).

Where the two ever differed, the wiring layer wins — it was written against the actual current code. Part I is the governing rules and verified state. Part II is the data-source reference. Part III is the build order, acceptance criteria, and open items.

**Companion file:** `bluewater-intel_9_4_1_4.html` — the live app, ~20,400 lines, single self-contained HTML. Working copy at `/home/claude/`, shipped to `/mnt/user-data/outputs/`.

---
---

# PART I — GOVERNING RULES & VERIFIED STATE

## 0. THE GOVERNING PRINCIPLE — read this first

> **Real data or an honest absence of data. Never synthetic data presented as real — and never any synthetic data in the prediction engine, ever.**

This is a marine safety and trust product. People decide whether to run a boat offshore based on what it shows. A fabricated value that looks real is worse than a blank, because a blank tells the truth ("we don't know here") and a fake number lies confidently.

**The prediction engine is the sharpest case.** The whole point of Bluewater Intel is a prediction built on *real* ocean conditions. A prediction computed from invented SST, chlorophyll, depth, wind, or pressure is not a weaker prediction — it is a false one, and it would send someone to a spot for reasons that do not exist. So:

- **The prediction engine (`scoreCell`, the heat map, per-spot scores) runs on real data or it does not run.** No synthetic fallback, no "behind a flag" synthetic in production, no cosmetic fill. If the real inputs for a cell are not available, that cell is **not scored** — it is withheld and labeled, not estimated.
- This applies offline too. No connection → no live ocean data → **no prediction**, with a clear message. The app does not invent a prediction to fill the screen.

At go-live there is no synthetic data path in production anywhere — most emphatically not in the prediction engine. The synthetic functions in the app today are the legacy placeholder being removed; they survive only as a *development-time* reference for regression testing and are compiled out of / unreachable in production builds.

When real data is unavailable — backend down, offline at sea, a cell the source doesn't cover, a time outside the available frames — the app must **withhold the affected output and say so**, not substitute a generated value.

**The one allowed exception:** static bathymetry and the land-water gate (deterministic geography, can't mislead about current conditions) — see §1.5 and §4.3.

### Why the synthetic functions exist at all right now
Today, in the current build, the prediction engine is fed entirely by synthetic data (`synthSST`, `synthChlor`, `synthDepth`, `thermalBreak`, `synthPressureTrend`, `synthWindDir`, `synthWeatherChange`). That is the legacy state this backend project exists to eliminate. The synthetic code is retained only so the refactor can be proven behavior-preserving (the parity/regression check in §3 and §III) and is then disabled for production. After go-live, nothing a user sees touches it.

## 1. Verified current state (checked against the file, June 2026)

### 1.1 There is NO DataSource abstraction in this file
The original spec assumed `scoreCell` consumed data through an injectable `DataSource` protocol, with a scaffolded `RealDataSource` in `bluewater-realsource.js`. **None of that exists in the HTML app.** There is no `DataSource`, `SyntheticDataSource`, `RealDataSource`, `prime()`, or `bluewater-realsource.js`. `scoreCell` calls the synthetic functions **directly** as free functions. Building the seam is a **prerequisite** (§3), not a one-line swap.

### 1.2 The synthetic functions and exactly what they feed
| Function (line ~) | Returns | Consumed by |
|---|---|---|
| `synthSST(lat,lng)` (4553) | sea-surface temp °F | `scoreCell` (5148), `thermalBreak` (4659–4662), catch auto-fill (8947), conditions readout (9607) |
| `synthChlor(lat,lng)` (4624) | chlorophyll mg/m³ — **distance-offshore + `Math.random()`** | `scoreCell` (5149) |
| `synthDepth(lat,lng)` (4634) | depth m (wraps `seaDepth`) | `scoreCell` (5150) |
| `thermalBreak(lat,lng)` (4655) | SST gradient, derived from `synthSST` | `scoreCell` (5151) |
| `synthPressureTrend()` (4772) | hPa/24h | `scoreCell` (5152), catch auto-fill (8970), conditions readout (9622/9632) |
| `synthWindDir()` (4915) | degrees | `scoreCell` (4964/5438), catch auto-fill (8974), conditions readout (9630) |
| `synthWeatherChange()` (5073) | weather-shift signal | `scoreCell` (5083/5156) |
| `seaDepth(lat,lng)` (6151) | depth m — piecewise model | `synthDepth`, plus **land/water gating** (6254, 6327) |

(Grep for current line numbers; they drift.)

### 1.3 What is ALREADY real (do not rebuild)
- **6-Day Forecast modal** (`showForecast` → `fetchForecast`): real Open-Meteo marine + weather APIs, parallel requests, tolerant of missing marine data nearshore, **caches for offline display** with a "last updated / offline" banner. Wired to BOTH Major Fishing Areas and fishing-waypoint markers. This is the model pattern for honest offline behavior.
- **SST tile layer**: real (GIBS GAMSSA) — coarse, to be upgraded (§II), but real.
- **Chlorophyll tile layer**: real (GIBS MODIS) — gappy, to be upgraded (§II), but real.
- **Weather radar**: real (nowCOAST MRMS observed loop).
- **AI Captain's Brief**: real, wired to Claude/Anthropic. Two-tier: backend `API.getBrief()` (server-side key) → direct `api.anthropic.com` fallback for sandbox/demo only. Prompt fully written. Backend just needs to host the keyed endpoint.
- **Solunar / tide / moon phase**: real astronomical calculations.

### 1.4 The honesty gap, precisely scoped — the defect to eliminate
Synthetic data is confined to the **prediction engine** (`scoreCell` / heat map / per-spot scores) and the **conditions readouts** that share its functions (catch auto-fill, the per-factor explainer). The forecast modal is already real. "Remove synthetic" means: give the prediction engine and conditions readouts **real** inputs, and when those aren't available, **withhold and label** rather than fake it. The prediction engine must never again run on a generated number, in production or behind any fallback.

### 1.5 `seaDepth` does double duty — handle with care
`seaDepth` is not only a scoring input; it gates land-vs-water decisions (`seaDepth(...) > 0`). When real bathymetry (GEBCO/NCEI, §II) replaces the model for *scoring*, the **land/water gate must remain functional offline**, because it's a geometric fact, not a live measurement. Bathymetry is static, so it can be bundled/cached and is allowed to work offline (§4.3). This is the one model-derived value acceptable offline, because it cannot mislead about current conditions.

## 2. Architecture: tile proxy + cache + grid endpoint (do NOT call ERDDAP from the client)

```
 client (iOS / Android / web)
        │  XYZ tile request:  /tiles/{layer}/{time}/{z}/{x}/{y}.png
        ▼
 ┌──────────────────────────────────────────────┐
 │  Bluewater tile backend                        │
 │   1. resolve {layer,time} → ERDDAP datasetID   │
 │   2. cache lookup (object store / CDN)         │
 │   3. on miss: convert XYZ → EPSG:4326 bbox,    │
 │      build ERDDAP WMS GetMap, fetch PNG        │
 │   4. (optional) reproject 4326→3857, colorize  │
 │   5. store + return tile                       │
 └──────────────────────────────────────────────┘
        │
        ▼  ERDDAP WMS (NOAA CoastWatch)
```

**Why a proxy, not direct client→ERDDAP:**
1. **Projection mismatch.** Leaflet/MapKit/Mapbox expect XYZ tiles in Web Mercator (EPSG:3857). ERDDAP serves EPSG:4326 WMS by bbox. The proxy does the XYZ→bbox math (and optional 3857 reproject) once, server-side.
2. **Caching.** Ocean tiles change at most daily. A CDN/object-store cache keyed by `{layer}/{date}/{z}/{x}/{y}` collapses thousands of client requests to one ERDDAP fetch per tile per day. ERDDAP is a shared public resource — don't hammer it from every client.
3. **Stability + swappability.** Dataset IDs change (GIBS renames bit us three times). Centralizing the ID→endpoint mapping server-side means a dead dataset is a server config fix, not an app-store release.
4. **Keys.** CMEMS/Copernicus tokens or any commercial feed stay server-side, never shipped in the app.

**Client contract (stable, provider-agnostic):**
```
GET  /api/ocean/tiles/{layer}/{time}/{z}/{x}/{y}.png   layer ∈ { sst, chlor }
GET  /api/ocean/frames/{layer}?from=<iso>&to=<iso>     → ordered {time, datasetID, label} for slider/playback
GET  /api/ocean/legend/{layer}                         → colorbar stops + units
POST /api/ocean/grid/{layer}  {time, points:[[lat,lng]…]}   → VALUES for the algorithm (see §5)
POST /api/catches                                      → opt-in catch sync (§7)
```
The client never sees ERDDAP, a dataset ID, or a projection. Swapping GAMSSA→CoastWatch→Copernicus later leaves the client contract unchanged.

**Wiring-layer change to the contract:** `/grid` gains a mandatory **status per point** so the client can tell a real reading from absence — no synthetic fill anywhere (§5).

## 3. PREREQUISITE — build the DataSource seam in the client (do this FIRST)

Before any real data can be wired in or synthetic removed safely, the client needs one seam all environmental reads go through.

1. **Define one async interface:**
   ```
   OceanData = {
     async prime(points, timeMs)   // fills an in-memory grid keyed by cell
     get(layer, lat, lng) -> { value, status }   // status: "real" | "nodata"
   }
   ```
   `layer ∈ sst | chlor | depth | thermalBreak | pressureTrend | windDir | weatherChange`.
2. **Route every synthetic call site through it** (the call sites in §1.2): `scoreCell`, `thermalBreak`, catch auto-fill, conditions/explainer readouts.
3. **Two implementations, selected at BUILD time (not runtime):**
   - `RealOceanData` → calls `POST /api/ocean/grid/...` via `prime()`, returns `{value, status:"real"}` or `{value:null, status:"nodata"}`. The only implementation in a production build.
   - `DevSyntheticOceanData` → wraps the existing synth functions. Exists for ONE reason: the parity/regression check proving the seam refactor changed plumbing, not behavior. Compiled out of production, never selectable by a user or any runtime flag/config/fallback, unreachable in shipped code after the production flip. Must never feed `scoreCell` in production — missing data means *no score*, not a synthetic one.
4. **Parity check before going further:** with `DevSyntheticOceanData` behind the seam, the app must produce byte-identical heat-map output to today. Snapshot the heat-map grid for fixed cells × species and diff. This is the interim regression until the Swift/XCTest golden-file harness exists.

Only after the seam exists and passes parity do you wire `RealOceanData` and then disable synthetic for production.

## 4. The no-synthetic mandate — concrete behavior

### 4.1 Prediction heat map (and per-spot scores)
- Computed only from real `/grid` values primed for the visible cells. No synthetic input in production, under any condition.
- A `nodata` cell is **not scored and not drawn** (or drawn in an explicit "no data" treatment — neutral hatch, never a heat color). It must be impossible to mistake "no data" for a low/high score.
- Offline or backend-unreachable → prediction shows **nothing** plus a banner: *"Predictions need a connection — no live ocean data."* No synthetic fallback; no invented map to fill the screen.
- Both consumers covered: heat grid (`scoreCell` ~6583) AND per-spot score (~7596).
- **Stale real data, clearly labeled, is permitted; synthetic never is.** A last-primed real grid may show briefly while it ages, labeled with its age ("ocean data from 3 h ago"), within a short TTL (SST ~6 h). Beyond TTL → nodata. Old-but-real ≠ fake.

### 4.2 Conditions readouts (catch auto-fill, explainer rows)
- Each factor renders its real value or a literal "—/no data" with a short reason ("offshore of coverage", "offline"). No generated numbers.
- Catch auto-fill offline: store the catch with conditions marked **"not captured"** rather than synthesized. A fake SST stamped on a catch permanently poisons the §7 feedback loop.
- The per-factor explainer shows a `forecast | observed | nodata` tag per row (§6).

### 4.3 The one allowed exception: static geography (depth / land-water gate)
- Real bathymetry (GEBCO/NCEI, §II) is static; it may be bundled or cached and used offline, because it's deterministic geography.
- The land/water gate (`seaDepth(...) > 0`) must keep working offline from this bundled bathymetry.
- This is the only model-derived value permitted without a live connection. SST, chlor, wind, pressure, thermal break, AIS get no offline synthetic substitute.

### 4.4 Remove the cosmetic wiggle
Delete `sstDrift` (~4575) and the `Math.random()` in `synthChlor` (~4627–4631) when production-disabling the synth functions. They exist only to make frozen synthetic values look alive — the exact deception this mandate forbids.

## 5. `/grid` contract — status per point (REQUIRED)

No sentinel numbers, no zero-fill. The client must distinguish a real reading from absence.

```
POST /api/ocean/grid/{layer}
  body: { time, points: [[lat,lng], …], units?: "F"|"C"|… }
  → {
      version: 1, layer, datasetID, time, units,
      points: [
        { lat, lng, value: <number>, status: "real" },
        { lat, lng, value: null, status: "nodata", reason: "outside_coverage"|"no_pass"|"land"|"no_frame" },
        …
      ]
    }
```
- `value` is `null` whenever `status !== "real"`. The client treats `null`/`nodata` as withhold-and-label, never as a number.
- `units` explicit per layer (SST °F to match the app; chlor mg/m³; depth meters, negative = below sea level).
- Time-independent layers (`depth`; AIS is seasonal) ignore/loosely-bin `time` and say so.
- Out-of-range time (before earliest / after latest frame) → `status:"nodata"`, `reason:"no_frame"`, not the nearest frame silently.

## 6. Forecast vs. observed — the honesty discipline (extends original spec §5/§6)

The slider must distinguish forecast factors from observed ones, and label no-data factors. Apply across THREE surfaces:

1. **Prediction explainer** — tag each factor `forecast | observed | nodata`; the forward slider changes a value only if that factor has a real forecast source; observed-only and nodata factors are labeled and static. No cosmetic `sstDrift`-style motion in production.
2. **`showForecast` modal** — now a high-traffic shared entry point (Major Fishing Areas AND ~12,000 waypoints). Already real (Open-Meteo); the backend must expect point-forecast requests at arbitrary lat/lng. Add to the acceptance check.
3. **Radar nowcast** — observed MRMS for the past, HRRR `REFC` for the future, with a hard visual split and per-frame labels ("OBSERVED −1:20" vs "FORECAST +2:00 (HRRR)"). No blended ambiguity. Keep the not-for-navigation disclaimer.

**SST forecast decision:** RTOFS (real SST forecast) vs observed-only. Observed-only-honestly-labeled is acceptable and preferable to any modeled value the team can't stand behind; RTOFS is fine if validated. Decide explicitly; never default to a wiggle.

## 7. Catch feedback loop + diagnostics/monetization data SEPARATION (compliance-critical)

Closed loop (per original spec §8.1): authenticated opt-in clients sync catch+condition records → recompute what `scoreCell` would have predicted → validate (precision@score-band, calibration, lift over baseline) → grid-search/fit weights per species, versioned, never auto-deployed, gated behind the golden-file regression. Report calibration with confidence intervals; don't tune on noise.

### 7.1 Honest catches only
Catches logged offline carry conditions marked "not captured," never synthesized. The feedback loop must exclude/flag non-real-condition records so the algorithm is never tuned against fabricated inputs.

### 7.2 Two separate data planes — do not merge
| Plane | Consent | Allowed use | Pipeline |
|---|---|---|---|
| **Diagnostics** (app events, errors, perf via `BWI.track`) | Mandatory (disclosed, no opt-out) | ONLY diagnose/fix/improve app performance | Internal only. Never enters the monetization/aggregate product. No location, no spots. |
| **Catch / usage aggregate** (catch records, regional trends) | Opt-in | Algorithm tuning; de-identified aggregate products may be shared/sold | Must pass the §III de-identification pipeline before anything leaves. |

Keep them in **separate stores with separate access controls.** The Privacy Policy says diagnostics are used *solely* for diagnostics/performance — merging the planes, or letting diagnostics feed a sellable product, breaks that promise. This is a real compliance seam.

---
---

# PART II — DATA-SOURCE REFERENCE (the ERDDAP/NOAA/AIS research)

_This is the original ocean-data research, preserved. It tells you WHICH datasets and endpoints feed the architecture in Part I. All confirmed 2026-06-04; re-verify dataset IDs at build (they drift)._

## II.1 Why finer ocean data is needed
- **SST today** = GIBS `GHRSST_L4_GAMSSA_GDS2_Sea_Surface_Temperature`: gap-filled and complete but only ~0.25° (~28 km) per cell, one daily field — the "blocky SST" problem. CSS blur can't create detail not in the source.
- **Chlorophyll today** = GIBS `MODIS_Aqua_L2_Chlorophyll_A`: single-sensor L2 swath, so large coastal stretches are unimaged daily (the bare-coast problem off Virginia).
- **Same root cause, same fix:** one sensor gives ~one pass/day. Premium services blend multiple sensors (MODIS Terra ~10:30, MODIS Aqua ~13:30, VIIRS on SNPP/NOAA-20/NOAA-21, AVHRR on MetOp) for finer effective resolution, multiple looks/day, and gap-fill. NOAA CoastWatch publishes such blended products via ERDDAP.

## II.2 Confirmed data sources (NOAA CoastWatch ERDDAP)
ERDDAP exposes WMS plus griddap (NetCDF/CSV/PNG). **Projection is EPSG:4326 (geographic), not Web Mercator** — the biggest integration gotcha (§II.5).

### SST — multi-sensor blended (finer SST)
- Dataset family `noaacwecnAVHRRVIIRSmultisensorSSTeastcoast*`; confirmed `…SSTeastcoast7Day` (7-day composite). **TODO at build:** enumerate the Daily/1-Day/3-Day variants from `https://coastwatch.noaa.gov/erddap/info/index.json`. Daily/1-day feeds the sub-daily slider; multi-day composites are the gap-filled fallback.
- AVHRR (MetOp) + VIIRS (SNPP, NOAA JPSS), ACSPO, ~1 km, L3, 2006–present, US East Coast, front-optimized cloud masking.
- WMS pattern (verified): `https://coastwatch.noaa.gov/erddap/wms/<datasetID>/request?service=WMS&version=1.3.0&request=GetMap&bbox=<minLat,minLon,maxLat,maxLon>&crs=EPSG:4326&width=<px>&height=<px>&layers=<datasetID>:<variable>&styles=&format=image/png&transparent=TRUE` (e.g. `:analysed_sst` or `:sea_surface_temperature`).

### Chlorophyll — gap-filled / composite (bare-coast fix)
- Daily single-sensor (sharp, gappy): `noaacwNPPVIIRSchla*` daily sectors (e.g. `…SectorXYDaily`, `…SectorYWDaily`, 750 m NRT).
- Composite (gap-filled): weekly/8-day VIIRS, e.g. `noaacwNPPVIIRSchlaWeekly` (global 4 km L3) + the blended SNPP+NOAA-20 product. **TODO at build:** confirm the East-Coast-node blended/gap-filled chlor dataset ID + cadence.
- Same WMS pattern with the chlor variable (`:chlor_a` or `:chlorophyll`).

### Alternatives (note, don't build yet)
- **JPL MUR** `jplMURSST41` (1 km global L4 gap-filled SST, var `analysed_sst`) — strong global fallback on the same ERDDAP.
- **Copernicus Marine (CMEMS)** — excellent L4 global chlor but needs a free account/token → backend-only, v2 candidate.

### II.2.4 Algorithm inputs that also need real sources (currently synthetic)
**Bathymetry / depth** — drives the depth-gate (`seaDepth`) and feeds `thermalBreak`. Today a synthetic linear shelf (`synthDepth`).
- **GEBCO_2026 Grid** — global 15 arc-sec (~450 m), elevation m (negative = depth), netCDF + WMS. Free, attribution required. `https://www.gebco.net/` · download `https://download.gebco.net/`. Essentially static (annual release) → fetch once, store a server-side depth grid, serve via `/grid?layer=depth`. The EASIEST real-data win; no polling. ~450 m is plenty for the depth-gate.
- **NOAA NCEI** higher-res US coastal bathymetry (ETOPO + multibeam + BlueTopo) for finer nearshore detail: `https://www.ncei.noaa.gov/products/bathymetry`.

**AIS vessel activity** — feeds the `aisDwell` crowd-signal. Two-layer, zero-cost design; `aisDwell` blends both:
- *Live dwell — AISstream.io (free WebSocket, no card):* real-time vessel positions; a charter/commercial boat loitering over structure now = an active-fishing signal. Backend ingests, filters to fishing/charter types, computes a rolling dwell-density grid. **Coverage caveat:** land-based receivers → strong inshore, thins/goes dark far offshore (exactly the canyons offshore anglers care about). This is *why* the seasonal prior is not optional.
- *Seasonal prior — NOAA MarineCadastre (free, historical):* USCG AIS via NOAA/BOEM, EEZ-wide (incl. satellite in the archive, so it HAS the offshore coverage AISstream lacks), 1-min positions by vessel type, monthly archives (~1–2 month lag), 2009–present. `https://hub.marinecadastre.gov/`. Precompute a per-month fishing-vessel dwell-density grid; static once built, cached like bathymetry.
- *How they combine:* "season" = convergence of (a) where the fleet historically works this month and (b) where boats are working right now. A cell lit by both is highest-confidence; offshore the prior carries it; inshore the live term confirms it. With the catch-report signal that's three independent signals agreeing.
- **Honesty caveat (mirrors §6):** the prior reflects *typical* activity, the live term *current* presence with offshore gaps. Don't let the UI imply "boats are there right now" where only the prior fires. Label the two contributions.
- **Not pursued (cost):** MarineTraffic/VesselFinder (paid/enterprise, redistribution forbidden), Spire (paid satellite). AISHub (free co-op, requires contributing a receiver) is a possible later supplement.

## II.3 The slider / cadence logic
Cadence is a property of the product and differs by layer, so the slider is **driven by the backend frame list, not a fixed step.**

| Layer | Real cadence | Slider behavior |
|---|---|---|
| SST (multi-sensor daily/1-day) | multiple passes/day once blended | sub-daily steps (4–6 h) are meaningful |
| Chlor (VIIRS daily + composite) | ~1 usable pass/day | daily steps; sub-daily would repeat |

`/frames` returns actual timestamps; the slider snaps to those. Label each frame with its real timestamp (e.g. "Jun 3, 13:42 UTC — VIIRS NOAA-20"). Playback iterates `/frames` forward. Keep the corrected convention: left = older, right = newest.

## II.4 Weather radar — observed now, forecast (nowcast) later
- **Today:** Weather Radar animates ~4 h of nowCOAST MRMS base reflectivity (GeoServer WMS, time-enabled via ISO-8601 `TIME`; NOAA retains ~4 h, ~4-min cadence). Observed only.
- **Requested feature:** play past radar then forecast where the storm heads — storm **nowcasting**, a predictive model, a backend deliverable.
- **Forecast source options:** (1) **NOAA HRRR** — hourly, ~3 km CONUS, 18–48 h, includes simulated composite reflectivity (`REFC`), free (NOMADS / AWS `noaa-hrrr-bdp-pds`). The natural choice; GRIB2 → render to tiles. (2) MRMS/NSSL extrapolation nowcast — good 0–2 h, degrades fast. (3) Commercial (Tomorrow.io, RainViewer forecast tier) — paid/licensed, RainViewer free tier is personal-use-only (ruled out).
- **Recommendation:** HRRR `REFC` for forecast frames through the same tile proxy; observed MRMS for the past. Honesty requirement per §6 (hard observed/forecast split, per-frame labels, distinct visual treatment).

## II.5 Known gotchas (lessons already paid for)
1. **EPSG:4326 axis order in WMS 1.3.0 is lat,lon** (1.1.1 is lon,lat). Pick 1.3.0, be consistent.
2. **ERDDAP WMS handles the `time` dimension** — pass `&time=<ISO>`; omit for latest. Verify each dataset's time values via `…/erddap/info/<datasetID>/index.json` before assuming cadence.
3. **Dataset IDs drift.** Resolve at deploy from the listing; keep a server-side allowlist + daily health probe (alert on 404/empty — the failure that silently blanked GIBS).
4. **Tile-edge seams.** Reprojecting 4326→3857 per tile: sample with a 1-px bleed; colorize from the raw variable, not an already-colorized PNG.
5. **Coarse-source smoothing still applies** — keep per-layer bilinear + light blur, tuned to the new (smaller) cell size.
6. **CORS.** Server-side fetch avoids the browser CORS failures hit reading GIBS capabilities client-side.

## II.6 Algorithm signal mapping (synthetic → real)
- `sst` → CoastWatch multi-sensor SST · `chlor` → VIIRS/gap-filled chlor · `thermalBreak` → derived server-side from the real SST grid (don't reconstruct client-side from neighbor samples) · `depth` → GEBCO/NCEI (static, easiest) · `aisDwell` → MarineCadastre seasonal prior + AISstream live, labeled · wind/pressure/weatherChange → forecast model (GFS/HRRR) · solunar/tide/moon → already real.

## II.7 Quick reference — endpoints
- ERDDAP base: `https://coastwatch.noaa.gov/erddap/`
- Dataset listing: `https://coastwatch.noaa.gov/erddap/info/index.json`
- WMS per dataset: `https://coastwatch.noaa.gov/erddap/wms/<datasetID>/request?…`
- Per-dataset metadata: `https://coastwatch.noaa.gov/erddap/info/<datasetID>/index.json`
- Multi-sensor SST (7-day): `noaacwecnAVHRRVIIRSmultisensorSSTeastcoast7Day`
- VIIRS chlor daily sectors: `noaacwNPPVIIRSchlaSectorXYDaily`, `…SectorYWDaily`; weekly composite: `noaacwNPPVIIRSchlaWeekly`
- Global L4 SST fallback: `jplMURSST41` (`analysed_sst`)
- GEBCO: `https://www.gebco.net/` · download `https://download.gebco.net/`
- NOAA NCEI bathymetry: `https://www.ncei.noaa.gov/products/bathymetry`
- AIS live: AISstream.io `https://aisstream.io/`; AIS seasonal: MarineCadastre `https://hub.marinecadastre.gov/`
- HRRR (radar REFC + wind): NOMADS / AWS `noaa-hrrr-bdp-pds`
- East Coast node browser: `https://eastcoast.coastwatch.noaa.gov/cw_avhrr-viirs_sst.php`

---
---

# PART III — BUILD ORDER, ACCEPTANCE, OPEN ITEMS

## III.1 Data provenance / attribution
Every real source carries attribution obligations (GEBCO requires it; NOAA/NASA expect citation; Open-Meteo has terms). Extend the existing tile-attribution string and add an in-app **"Data sources & attributions"** view listing GIBS/CoastWatch (SST/chlor), nowCOAST + HRRR (radar), GEBCO/NCEI (bathymetry), Open-Meteo (forecast), AISstream + MarineCadastre (AIS).

## III.2 Regression harness — prerequisite for the production flip
The Swift/XCTest golden-file regression doesn't exist yet. Make it a hard gate: do not disable the synthetic implementation for production until either that harness exists or the interim parity check (§3.4) is green. Without it there's no way to quantify the real-vs-synthetic change. Version weight changes so a regression can roll back.

## III.3 Build checklist (ordered)
1. **Seam first (§3).** Define `OceanData`, route all synthetic call sites through it, add `DevSyntheticOceanData` (dev-only) + `RealOceanData`. Pass the parity check.
2. **Tile proxy + cache** (§2, §II.5): XYZ→4326-bbox→WMS, dataset-ID allowlist + daily health probe.
3. **`/frames` + `/legend`** (§II.3): data-driven slider (not a hardcoded step) + colorbar.
4. **`/grid` with the status-per-point contract (§5).** Wire `RealOceanData.prime()` to it.
5. **Bathymetry (static):** load GEBCO_2026 (+NCEI nearshore) once, serve `/grid?layer=depth`; route `seaDepth`/depth through the seam; keep the land/water gate working offline from bundled bathymetry (§4.3).
6. **Swap client GIBS tile URLs** → `/api/ocean/tiles/...`; remove old GIBS client-side date math (grep so no dead 404-ing date logic lingers).
7. **Flip the prediction engine to `RealOceanData`.** Heat map + per-spot scores compute from real `/grid` only; on nodata/offline withhold-and-label (§4.1–§4.2). No synthetic fallback. Run the regression/parity gate (§III.2).
8. **Remove synthetic from production builds entirely.** Strip/compile-out `DevSyntheticOceanData` and the synth functions; delete `sstDrift` + the `synthChlor` RNG (§4.4). Verify by grep + a runtime check that no flag/config/fallback/error path can route synthetic into `scoreCell` or any displayed value. **Release blocker.**
9. **Forecast/observed tagging (§6)** across the explainer AND `showForecast`; remove any residual cosmetic motion.
10. **AIS two-layer** (live AISstream + MarineCadastre seasonal prior), labeled; feed `/grid?layer=ais`.
11. **Radar nowcast:** HRRR `REFC` future frames + observed MRMS past, hard split + per-frame labels (§II.4, §6).
12. **Observability:** per-layer fetch success, cache hit rate, frame-staleness alerts; alert on any cell served without a real or honest-nodata status (catch a regression that reintroduces fake fill).
13. **Monetization/privacy (§7.2 + below):** de-identification pipeline before ANY aggregate data leaves; diagnostics and catch planes separate; contextual ads by default; DSAR access/correction/deletion across all stores once accounts exist; GPC honoring if targeted ads are ever added.
14. **Provenance/attribution view (§III.1).**

## III.4 Monetization data & privacy compliance (de-identification, ads, consent)
The Terms/Privacy reserve the right to (a) show advertising and (b) share/sell **aggregated or de-identified** data, never personal info that identifies a user. The backend must enforce that. Fishing data is high-risk to "anonymize": waypoint sequences + timestamps are strongly re-identifying. Removing the name is not enough.

**De-identification pipeline (required before ANY aggregate data leaves — catch/aggregate plane only):**
- Aggregate, don't pseudonymize — pooled metrics over many users, never per-user rows.
- Spatial coarsening: bin to ≥10–25 km cells (or appropriate H3 res), never raw lat/lng.
- k-anonymity / small-cell suppression: never emit a cell/trend backed by fewer than k distinct users (k ≥ 20–50).
- Temporal coarsening: bucket to week/month, not exact timestamps.
- No join keys: strip device/account/IP.
- Contractual backstop: recipients barred in writing from re-identification.
- Keep raw per-user data internal-only; only the pipeline output is sellable.

**Advertising:** default to contextual ads (no personal-data sharing → keeps the "we don't sell personal info" promise clean). If targeted/behavioral ads are ever added, the ad SDK's collection likely counts as a "sale"/"sharing" under CCPA/CPRA → you MUST ship a "Do Not Sell or Share My Personal Information" link, a consent mechanism, and Global Privacy Control (GPC) honoring before enabling it.

**Consent & rights endpoints (once accounts/server storage exist):** cookie/consent banner (web) defaulting to reject-non-essential; DSAR access/correction/deletion wired through every store (DB, caches, backups, analytics); honor GPC; per-user opt-out state.

## III.5 Acceptance criteria
- **No synthetic value reaches a user in production, and the prediction engine never runs on synthetic data.** Grep confirms the synthetic implementation is unreachable; a network-off test shows the heat map + per-spot scores withhold-and-label rather than rendering colors/numbers. No flag/config/fallback can route a generated value into `scoreCell`.
- A `nodata` cell is visually distinct from any score color and from a low/high score.
- Conditions readouts and catch auto-fill show "—/no data" (with reason) when data is absent; offline catches store conditions as "not captured."
- The land/water gate still works offline (bundled bathymetry); nothing else does.
- `/grid` returns `status` per point; the client never treats `null` as a number.
- Forecast slider moves only forecastable factors; observed/nodata factors labeled and static; `showForecast` accepts arbitrary lat/lng.
- Diagnostics data provably never in any externally shared product; catch/aggregate data only leaves after de-identification (coarsening + k-anonymity + temporal bucketing).
- Regression/parity gate green before synthetic is disabled.

## III.6 Open items
- **PORTS vs PORT_GROUPS (77 vs 76):** one port is in `PORTS` but not `PORT_GROUPS` (or vice-versa), hiding it from the dropdown. Reconcile before server-side port data is layered on.
- **`thermalBreak` derivation:** compute server-side from the real SST grid; don't reconstruct client-side once SST is real.
- **Stale-data TTL:** pick per layer (SST ~6 h, chlor ~24–48 h, radar minutes). Beyond TTL = nodata.
- **Wind layer** is synthetic but no longer labeled as such in the UI; tutorial text still says "NOAA wind data" — reconcile when wind goes real.
- **Attorney review** of Terms + Privacy (mandatory-analytics posture especially).

## III.7 A note on where this fits with Supabase
Supabase (Postgres + PostGIS + auth + RLS) is the recommended home for the **data + auth + AI-brief** layer: waypoints, ramps, ports, catches, user accounts, and the keyed `/api/brief` endpoint. The **ocean-data tile proxy** in this spec is a separate caching-proxy concern that may live outside Supabase (edge function + CDN/object store). Migrating the waypoint database to Supabase (the recommended first milestone) does not commit the tile-proxy choice and can proceed independently of everything in Part II.
