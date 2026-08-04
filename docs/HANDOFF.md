# Bluewater Intel — Agent Handoff

**Last updated:** 2026-07-14  
**Branch:** `main` @ `40b608e` (synced with `origin/main`)  
**Use this doc:** Paste into the **first message** of a new Cursor chat. Pick **one workstream** per thread.

---

## Agent rules (read first — prevents crashes)

1. **Do NOT open `bw-core.js` wholesale** (~14k lines). Use the line ranges below or `grep`/`read` with `offset`+`limit`.
2. **Close heavy tabs** (`bw-core.js`, `index.html`, canvas) before editing.
3. **One feature per chat.** Do not combine Workstream A + B in the same thread.
4. **Minimize diff scope.** Match existing conventions in surrounding code.
5. **Only commit/push when the user explicitly asks.**

---

## Project snapshot

**Bluewater Intel** — browser-based fishing intelligence app. Classic `<script>` modules (not ES modules — `file://` offline must keep working). Supabase backend for auth, fishing reports, AI brief.

### Scoring pipeline (Bite Map)

`scoreCell(lat, lng, speciesId)` in `bw-core.js` (~2671) combines weighted factors:

| Factor | Source |
|--------|--------|
| SST / bottom temp | Satellite + depth model (`bottom:true` species) |
| Chlorophyll | ERDDAP grid |
| Depth bands | `PREDICT_SPECIES_PREFS` in `bw-data-species.js` |
| Thermal break | `BW_BREAKS` |
| Structure | `bottomStructureStrengthAt()` |
| **Fishing reports** | `reportsBoost()` — **additive bonus only** |
| Season | `REGIONAL_SEASONS` or lat-shifted `ENC_SPECIES.seasons` |
| Pressure, wind, tide, solunar, moon | Real forecast + buoy data |

Species prefs/weights: `bw-data-species.js`  
Encyclopedia copy: `bw-data-encyclopedia.js`

### Recently completed (do not redo)

- **Tilefish depth bands** (`40b608e`): golden `[[75,140],[175,420]]` m; blueline `[[70,250]]` m. Encyclopedia aligned. Shelf ledges no longer cold from depth floor.
- **Regional seasons:** 46/50 species have `REGIONAL_SEASONS`. **Still without:** `croaker`, `cod`, `haddock`, `pollock` — these only lack the geographic out-of-range guard; all four have curves that dip, and cod/haddock/pollock are bounded by `SPECIES_LAT_RANGE [40, 45]`.
- **Tilefish season overhaul:** golden tilefish had a flat all-3 default curve AND no regional table, so its `seasonScore` was pinned at 1.00 and the season gate at ×1.00 — it read 95% coast-wide, every month, and could not be suppressed by anything. It now has a canyon-belt regional table. Blueline's table had the season **inverted** (peak Nov–Apr, "slow" Jun–Sep) when the recreational season is May 1–Aug 31 south of the NC/VA border and May 15–Nov 14 north of it; it is now split at that border. Haddock had the identical flat-all-3 defect and now reflects its March closure. Verify with `node tests/bite-score-audit.mjs` — do not reintroduce a flat curve on a species with no regional table.

---

## Workstream A — Fishing reports → score (v2)

### Goal

Improve how **community fishing reports** influence Bite Map scores. Reports should boost realistic hotspots without requiring GPS on every post, and without lighting up the whole coast from vague forum chatter.

### What exists today

| Piece | Location | Behavior |
|-------|----------|----------|
| Supabase table | `fishing_reports` → public view `fishing_reports_public` | De-identified: hashed handle, coords rounded ~6 nm |
| Client auth | `bw-auth.js` ~212–235 | `postReport`, `fetchReports` |
| Feed load | `bw-core.js` ~256–291 | `loadReports()` → `SOCIAL[]` via `mapReport()` |
| Spatial boost | `bw-core.js` ~1674–1698 | `reportsBoost(lat, lng, speciesId)` |
| Score integration | `bw-core.js` ~3041–3042, ~3189–3196 | Additive: `reportScore * 0.55`, max **+0.18** to final score |
| UI | `bw-reports.js` | Forum list, filters, post flow |
| Tutorial claim | `index.html` ~3791 | Mentions **~22 named offshore areas** for spatial matching |

### `reportsBoost` current logic

```
- Requires p.lat && p.lng (region-only posts → NO spatial boost)
- Species filter: post.species must include speciesId (or post has no species → all)
- Recency: exp(-hoursAgo/12), drop after 72h
- Distance: <24nm → 0.20, <48nm → 0.10, <90nm → 0.05
- Sum capped at 0.35 before final scaling
```

### `SOCIAL` internal shape (after `mapReport`)

```js
{ id, region, species: [id], area, port, lat, lng, hoursAgo, src, srcName, snippet, createdAt }
```

### Known gaps (likely v2 scope)

1. **Named-area matching** — Tutorial promises known canyons/banks/ledges; boost is **lat/lng only**. No `KNOWN_AREAS` table in code today. Candidates: `bw-data-canyons.js`, `bw-waypoints.js`, new `bw-data-areas.js`.
2. **Region-only reports** — Posts with `region` but no coords contribute **zero** to scoring (forum only).
3. **Catch log → report** — Shared catches may not always geocode to useful coords for boost.
4. **No negative signal** — Skunk reports / "nothing biting" don't reduce scores.
5. **No quality weight** — Photo, size, verified catch vs one-line chatter treated equally.

### Open decisions (pick in Plan mode)

- **A1:** Add named-area centroids so "Norfolk Canyon" posts boost cells within X nm of that area even without GPS?
- **A2:** Should region-only posts get a **weak** port-coast boost (risk: over-broad)?
- **A3:** Keep reports **additive-only** (current) or allow small negative decay for "no bite" reports?
- **A4:** Weight by recency curve — keep ~8 hr half-life or tighten for offshore?

### Suggested files to touch

| File | Why |
|------|-----|
| `bw-core.js` ~1674–1698 | `reportsBoost` |
| `bw-core.js` ~258–274 | `mapReport` (enrich with resolved area coords) |
| `bw-reports.js` | Post UI — area picker, geocoding |
| `bw-data-canyons.js` | Named offshore features |
| `bw-auth.js` | Schema if new report fields needed |
| `index.html` ~3791 | Tutorial if behavior changes |

### Acceptance criteria (A)

- [ ] Report with named area (no GPS) boosts cells near that area within defined radius
- [ ] Report with GPS still works; species + recency filters unchanged
- [ ] No boost for reports >72h old or wrong species
- [ ] Explainer shows "Recent catch reports" when boost applied
- [ ] `invalidatePredictCache()` called after `loadReports()` (already wired — preserve)
- [ ] Spot-check: post near Norfolk Canyon / Hatteras shelf → nearby cells warm for target species

### Out of scope (A)

- Scraping third-party report sites
- ML sentiment on report text

---

## Workstream B — Course of action / multi-option brief

### Goal

Extend the **AI Captain's Brief** into a structured **course-of-action** tool: e.g. Plan A (run offshore), Plan B (shelf edge), Plan C (stay inshore) with tradeoffs — grounded in real data, not invented conditions.

### What exists today

| Piece | Location | Behavior |
|-------|----------|----------|
| Edge function | `supabase/functions/brief/index.ts` | Claude Haiku 4.5; JWT + premium gate; 2 briefs/day |
| Client trigger | `bw-core.js` ~12684+ | Builds rich payload, sets `aiCOA` |
| Multi-spot | `_briefRunPlanSpots`, `runPlan[]` | Top 2–3 Bite Map spots in **one** model call |
| Payload | `bw-core.js` ~12903+ | coords, port, `runFromPortNm`, depth, structure, conditions, tide, `biteScores[]`, `dataAvailability{}` |
| Output | Markdown sections 1–5 | CONDITIONS, WATER, THE BITE, BAITS, TIPS |
| Billing | `brief_consume()` RPC | Owners unlimited |

### Governing principle (do not break)

> **Real data or honest absence.** Prompt forbids inventing numbers, catch reports, or ETAs. Distance = `computedPortToSpot.distNm` only.

### Likely v2 scope

1. **Structured output** — JSON schema alongside markdown: `{ options: [{ id, label, runNm, targetSpecies, biteScore, pros, cons, goIf }] }`
2. **Option generation inputs** — Pre-compute 2–4 candidate spots (Bite Map top-N + port proximity + weather ceiling)
3. **Weather go/no-go framing** — Currently prompt **forbids** safety verdicts; COA may need "Heads up" hazard lines only (already in prompt)
4. **UI** — Cards for Plan A/B/C vs single markdown wall
5. **Persistence** — Optional save last COA to `user_logs`

### Open decisions (pick in Plan mode)

- **B1:** Options generated **client-side** (deterministic from bite map) then narrated by LLM, vs fully LLM-proposed spots?
- **B2:** Same 2/day quota or separate COA quota?
- **B3:** Markdown-only v1 or JSON+markdown from day one?
- **B4:** Inshore/nearshore COA or offshore-only (current brief skew)?

### Suggested files to touch

| File | Why |
|------|-----|
| `supabase/functions/brief/index.ts` | Prompt + optional JSON response |
| `bw-core.js` ~12602 `briefSpotSummary` | Candidate spot summaries |
| `bw-core.js` ~12898+ | Payload builder |
| `bw-core.js` ~12287+ | Brief modal render |
| `index.html` | COA UI if new panel |

### Acceptance criteria (B)

- [ ] User gets 2–3 distinct options with different run distances / species / bite scores
- [ ] Every cited number traces to payload (spot-check distNm, SST, wind)
- [ ] No invented catch reports or travel times
- [ ] Works for single-spot and multi-spot (`runPlan`) flows
- [ ] Premium gate + `brief_consume` still enforced server-side
- [ ] Graceful fallback if Anthropic unavailable

### Out of scope (B)

- Autonomous route planning / chart plotter integration
- Real-time VHF or fleet AIS fusion

---

## Key file map

| File | Lines | Contents |
|------|-------|----------|
| `bw-core.js` | ~2671 | `scoreCell` |
| `bw-core.js` | ~1674–1698 | `reportsBoost` |
| `bw-core.js` | ~256–291 | `SOCIAL` / `loadReports` |
| `bw-core.js` | ~12602+ | Brief builders |
| `bw-data-species.js` | ~64+ | `PREDICT_SPECIES_PREFS`, `REGIONAL_SEASONS` |
| `bw-data-encyclopedia.js` | | `ENC_SPECIES` display copy |
| `bw-reports.js` | | Reports forum UI |
| `bw-auth.js` | ~212+ | Supabase report CRUD |
| `supabase/functions/brief/index.ts` | | AI brief edge function |

**Avoid loading:** full `bw-core.js`, `index.html` (4920 lines), `bluewater-intel_9_4_1_4.html` (legacy snapshot).

---

## Module load order (index.html)

Data modules load before app:

`bw-data-species.js` → `bw-data-encyclopedia.js` → … → `bw-core.js` → `bw-reports.js` → …

Globals stay `const` at top level — **not ES modules**.

---

## Git / deploy notes

- Commits: user must ask explicitly
- Push: `git push origin main`
- Edge functions: `npm run deploy:functions` (needs Supabase CLI + secrets)
- Config: `npm run config` generates `bw-config.js`

---

## Suggested first message for new chat

Copy-paste and fill in the workstream:

```
Read docs/HANDOFF.md. Workstream: [A or B].

Scope: only the files listed for that workstream.
Do not open full bw-core.js — use line ranges from the handoff.

Start in Plan mode: propose 2–3 design options with tradeoffs, then implement the one I pick.
```

---

## Contact / product context

- **Ronald Novak** — product owner; prefers fact-checked fishery biology, minimal diffs, no over-engineering
- **Premium features:** Bite Map, ocean layers, waypoints, fishing reports, AI Captain's Brief (2/day)
- **Data honesty:** Real observations or labeled absence — never synthetic ocean weather
