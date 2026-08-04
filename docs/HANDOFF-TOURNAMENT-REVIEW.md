# Bluewater Intel — Tournament / Captain Tier Review Handoff

**Last updated:** 2026-07-14  
**Branch:** `main` @ `b7675f4` (synced with `origin/main`)  
**Audience:** A new Cursor chat using a high-capability model (e.g. Claude Fable / Opus-class) for a **read-first audit**, not a blind rewrite.

---

## Your mission

Ronald wants a **final polish review** of Bluewater Intel before treating it as **tournament- and charter-captain-grade** tooling. You are the outside expert captain + product engineer.

**Deliver recommendations only** unless Ronald explicitly asks you to implement. Your job is to find the last 10–20% gaps in **UI trust**, **workflow**, and **scoring credibility** — the things that would make a paying captain say *"I'd run my boat off this"* vs *"pretty map, not sure I trust the hot spots."*

### Expected deliverable format

Produce a structured review document (markdown) with:

1. **Executive summary** (5 bullets — what's already strong, what's holding it back)
2. **P0 / P1 / P2** recommendations (P0 = credibility-breaking, P1 = tournament workflow, P2 = polish)
3. **UI & UX** — navigation, explainer, layers, brief, mobile-at-dock friction
4. **Algorithm & data** — bite map, gates, weights, seasonality, structure, reports
5. **Trust & explainability** — where captains will doubt the score and how to fix perception
6. **Tournament captain workflow** — pre-dawn triage, multi-spot run planning, day-of updates
7. **Quick wins** (≤1 day each) vs **structural** (multi-day / architectural)
8. **Do NOT change** — things that are already correct or recently fixed (see below)

Be specific: cite **file + function + line range** when recommending code changes. No vague "improve UX."

---

## Agent rules (prevents crashes)

1. **This is a review thread first.** Read, analyze, recommend. Do not start coding until Ronald picks items.
2. **Never open `bw-core.js` or `index.html` wholesale** (~14k and ~5k lines). Use `grep` and targeted `read` with offsets.
3. **Close heavy editor tabs** before deep reads.
4. **Fact-check fishery claims** against code + encyclopedia — captains will catch biology errors instantly.
5. **Respect the governing principle:** real data or honest absence. Never recommend synthetic ocean weather or invented catch activity.
6. **Only commit/push when Ronald explicitly asks.**

---

## Product positioning

| Item | Detail |
|------|--------|
| **Product** | Bluewater Intel — browser fishing intelligence (Leaflet map + scoring engine) |
| **Users** | Recreational → serious offshore anglers, charter captains, tournament crews |
| **Premium** | Bite Map, ocean/wind layers, charted waypoints, fishing reports, AI Captain's Brief (2/day) |
| **Backend** | Supabase (auth, reports, billing, edge functions: `brief`, `ocean`) |
| **Deployment** | Netlify static + Supabase functions |
| **Offline** | Must keep working via `file://` — **no ES modules** on client data files |

### What "tournament / captain tier" means here

A captain should be able to:

- Pick a port, species, and **tomorrow** forecast window and trust the **top 3 run candidates**
- Understand **why** a cell is hot (explainer factors match their mental model: edge, break, structure, season)
- See **confidence** as actionable (high conf. out-of-season = "don't burn fuel here")
- Get a **Captain's Brief** that reads like a peer captain, grounded in real wind/SST/tide/bite drivers
- Not get burned by **false hotspots** (inner shelf tuna, 3 ft cobia flats, wrong-season species)
- Cross-check **run distance** port→spot (great-circle nm — already server-computed in brief)

---

## Architecture map (read in this order)

### Data layer (species, weights, copy)

| File | Purpose |
|------|---------|
| `bw-data-species.js` | `SPECIES`, `PREDICT_SPECIES_PREFS`, `PREDICT_WEIGHTS`, `REGIONAL_SEASONS`, `MIGRATION_PHASE` |
| `bw-data-encyclopedia.js` | `ENC_SPECIES` — display copy, seasons chart, tips |
| `bw-data-canyons.js` | Named canyon/bank features |
| `bw-data-ports.js` | Departure ports |
| `bw-data-bathy.js` | Regional shelf-width / habitat hints |
| `bw-data-closures.js` | Regulatory closure overlays |
| `bw-data-tackle.js` | Tackle recommendations |

### Ocean / environment

| File | Purpose |
|------|---------|
| `bw-ocean.js` | SST, chlorophyll, currents, altimetry fetch + sampling |
| `bw-wind.js` | Wind field overlay + forecast scrubber (0–96h) |
| `bw-breaks.js` | Thermal + chlorophyll break detection (`BW_BREAKS`) |
| `bw-freshness.js` | Data age / staleness labeling |

### Scoring engine (heart of trust)

| File | Key symbols | Lines (approx) |
|------|-------------|----------------|
| `bw-core.js` | `scoreCell` | ~2671 |
| `bw-core.js` | `reportsBoost` | ~1674 |
| `bw-core.js` | `classifyWaterType` | ~4195 |
| `bw-core.js` | `bottomStructureStrengthAt` | ~5842 |
| `bw-core.js` | `drawPrediction` / hotspot grid | grep first |
| `bw-core.js` | `showPredictionExplainer` | grep first |
| `bw-core.js` | `FORECAST_HOUR_OFFSET` (0/12/24h bite forecast) | ~1724 |
| `bw-core.js` | Blue-water / habitat gates | ~3240+, ~4572 |

**Weight tables** (`PREDICT_WEIGHTS` in `bw-data-species.js` ~1096): separate profiles for `offshore`, `nearshore`, `inshore`, `demersal`.

### UI shell

| File | Purpose |
|------|---------|
| `index.html` | Layout, CSS, tutorial copy, layer panel, map chrome, modals |
| `bw-waypoints-ui.js` | Waypoint / structure picker UI |
| `bw-reports.js` | Fishing reports forum |
| `bw-encyclopedia.js` | Species encyclopedia panel |
| `bw-catch-measure.js` | Catch log + Your Patterns |
| `bw-tackle-engine.js` | Tackle suggestions |
| `bw-billing.js` / `bw-authgate.js` | Paywall + trial |

### AI brief

| File | Purpose |
|------|---------|
| `supabase/functions/brief/index.ts` | Server-side Anthropic call, real-data-only prompt |
| `bw-core.js` | `generateBrief` / payload builder ~12800+, `briefSpotSummary` ~12602 |
| `bw-auth.js` | `callBrief` ~243 |

**Brief model:** `BRIEF_MODEL` secret (deployed default `claude-haiku-4-5`; override to Sonnet 5 or other models as needed). Sonnet 5 thinking-block fix deployed (`b7675f4`).

---

## Scoring pipeline (audit checklist)

`scoreCell(lat, lng, speciesId)` weighted factors:

| Factor | Notes for reviewers |
|--------|---------------------|
| SST / bottom temp | `bottom:true` species use estimated bottom temp, not surface |
| Chlorophyll | Edge vs uniform — `chlorPref: "edge"` species need gradient |
| Depth bands | `depthBands` in prefs; steep shallow decay (÷12 m) |
| Depth gate | Category-specific floor (offshore 0.22, inshore 0.35) |
| Temp gate | Category-specific — inshore more forgiving |
| Thermal break | `tBreak` magnitude |
| Convergence | SST break + chlor edge coincidence (altimetry-assisted) |
| Structure | `bottomStructureStrengthAt` — slope/canyon detector |
| Season | `REGIONAL_SEASONS` (46/50 species) or lat-shifted default |
| Out-of-range guard | Regional table exists but cell outside → seasonScore ≈ 0.04 |
| Pressure / solunar / tide / moon | Real buoy + deterministic astronomy |
| Fishing reports | **Additive only** via `reportsBoost`, max +0.18 |
| Blue-water gate | Offshore pelagics held to shelf edge+ (`prefs.bottom` exempt) |
| Confidence | Freshness, factor agreement, forecast lead, out-of-season boosts |

### Known algorithm pain points (verify / recommend fixes)

These were past bug classes — confirm they're fully resolved or still leaking:

- [ ] Inner-shelf false positives for offshore pelagics (yellowfin, marlin, tuna)
- [ ] Demersal species scored on surface SST / chlorophyll edges they don't chase
- [ ] Depth double-penalty (weight + gate) on coarse bathy
- [ ] Blackfin / species lighting up outside `SPECIES_LAT_RANGE`
- [ ] Gulf vermilion / reef species depth floors too deep
- [ ] Tilefish / blueline ledge depths (**fixed** `40b608e` — verify, don't re-litigate)
- [ ] Reports tutorial claims named-area matching — **code is lat/lng only** today
- [ ] Bite forecast uses 12/24h lead but **ocean map overlays stay observed** (intentional — is UX clear?)
- [ ] Wind forecast scrubber goes to 96h but bite forecast only 0/12/24h — alignment?

### Species coverage gaps (lower priority unless review finds issues)

No `REGIONAL_SEASONS` yet: `croaker`, `cod`, `haddock`, `pollock`. All four have curves that dip, so the season gate can still suppress them; what they lack is the geographic out-of-range guard. `cod`/`haddock`/`pollock` are bounded by `SPECIES_LAT_RANGE [40, 45]`, so only `croaker` is ungated in both dimensions.

**A flat season curve on a species with no regional table is a silent 95%-everywhere bug.** `seasonScore` pins at 1.00, the season gate stays ×1.00, and with no table there is no out-of-range guard either — so the species outranks everything that is genuinely peaking, in every month and every port. This is what golden tilefish and haddock were both doing. `node tests/bite-score-audit.mjs` fails this class out; run it after touching any season data.

---

## UI surface area (audit checklist)

### Map & layers (`index.html` ~2363+, layers modal ~2672)

- [ ] Bite Map toggle + species picker + forecast day (today/tomorrow)
- [ ] Ocean overlays: SST, chlorophyll, currents, altimetry, wind
- [ ] Structure layer (15 closest features near port)
- [ ] Waypoints, ramps, platforms (GOM), closures
- [ ] Hotspot badges / cell tap → explainer popup
- [ ] Port selector + run-distance context

### Prediction explainer (trust-critical)

When a captain taps a cell, they should see **factor name, weight, score, raw value**. Audit:

- [ ] Do factor labels match captain vocabulary? ("Convergence" vs "color line on the break")
- [ ] Is confidence explained when high vs low?
- [ ] Out-of-season / out-of-range messaging clear enough to skip a run?
- [ ] Reports bonus visible when applied?
- [ ] Data freshness shown when SST/wind is stale?

### Captain's Brief modal (`index.html` ~4905, `bw-core.js` brief flow)

- [ ] Brief renders markdown sections 1–5
- [ ] Multi-spot run plan from Bite Map banner
- [ ] Species auto-pick ("Bluewater Choice") explained in brief
- [ ] Run distance uses port→spot nm (not nm offshore from coast)
- [ ] Day offset (tomorrow) scopes forecast correctly

### Workflow panels

- [ ] Tutorial (`index.html` ~3561) — accurate vs actual behavior?
- [ ] Fishing reports forum (`bw-reports.js`)
- [ ] Catch log + Your Patterns (`bw-catch-measure.js`)
- [ ] Encyclopedia (`bw-encyclopedia.js`)
- [ ] Tackle engine (`bw-tackle-engine.js`)
- [ ] Billing / trial gates (`bw-billing.js`)

### Mobile-at-dock UX

Review as if on a phone at 5 AM:

- [ ] Thumb reach, modal scroll, layer panel discoverability
- [ ] Brief readable without horizontal scroll
- [ ] Critical actions ≤3 taps from map

---

## Review methodology (follow this sequence)

### Phase 1 — Read-only architecture (no code changes)

1. Read `PREDICT_WEIGHTS` + sample 5 species prefs (pelagic, demersal, inshore, bottom, multimodal bluefin)
2. Read `scoreCell` factor assembly + gates (~2671–3450 in chunks)
3. Read explainer builder (grep `showPredictionExplainer`, read returned factor list)
4. Skim `index.html` tutorial section for accuracy drift
5. Read `brief/index.ts` prompt + payload fields
6. Read `reportsBoost` + compare to tutorial claims

### Phase 2 — Scenario-based credibility tests (thought experiments + optional spot checks)

Run mental (or node) scenarios captains will test you on:

| Scenario | Expected behavior |
|----------|-------------------|
| Yellowfin, Virginia Beach inner shelf, July | Not peak hot — fish shifted north / canyon water |
| Bluefin, Hatteras, January | Strong if in range + season |
| Blackfin, VA Beach | Suppressed — north of lat range |
| Golden tilefish, Norfolk Canyon 350 ft mud | In-band depth, bottom temp scoring |
| Blueline, 300 ft shelf ledge (not canyon) | In-band, not cold |
| Redfish, Tampa flat 86°F SST | Temp gate soft — not nuked |
| Cobia, 3 ft tidal flat | Depth floor → near zero |
| Offshore pelagic, uniform green water no break | Moderate chlor — not max score for edge species |
| Tomorrow +24h forecast | Confidence tapers; tide/solunar correct for lead time |

### Phase 3 — Prioritized recommendations

Sort every finding into P0/P1/P2 with effort estimate and specific file targets.

---

## Recently completed — do NOT re-litigate

| Commit | What |
|--------|------|
| `b7675f4` | Captain's Brief Sonnet 5 empty response (thinking blocks) |
| `40b608e` | Tilefish / blueline depth bands + encyclopedia |
| `8035da4` + batches | Regional seasons for 44 species |
| Earlier | Blue-water gate, structure signal, demersal weight profile, vermilion depth, bigeye/marlin depth bands |

---

## Open product threads (separate from this review)

These are **planned** but not in scope unless the review elevates them to P0:

- Fishing reports v2 (named-area matching) — see `docs/HANDOFF.md` Workstream A
- COA multi-option brief — see `docs/HANDOFF.md` Workstream B
- `bw-core.js` modularization (long-term crash fix)

---

## Files to avoid

| File | Why |
|------|-----|
| `bw-core.js` (full) | 14k lines — use grep + ranged reads |
| `index.html` (full) | 5k lines — grep IDs/classes |
| `bluewater-intel_9_4_1_4.html` | Legacy snapshot — not live |

---

## Starter prompt (paste into new chat)

```
Read docs/HANDOFF-TOURNAMENT-REVIEW.md end-to-end.

You are doing a READ-FIRST audit for tournament/charter captain tier quality.
Do NOT implement anything yet.

Phase 1: Read the files in the order listed in the handoff (targeted reads only).
Phase 2: Run the scenario credibility table mentally against the code.
Phase 3: Deliver the structured review (Executive summary, P0/P1/P2, UI, Algorithm,
Trust, Tournament workflow, Quick wins vs structural).

Be ruthless about trust-breaking issues. Cite file:line for every recommendation.
Ronald is the product owner — write for a captain who pays $13/mo and runs 60+ nm offshore.
```

---

## Owner preferences

- Fact-checked fishery biology over generic ML optimism
- Minimal diffs — prefer tuning weights/gates/copy over new subsystems
- Real data only — label absence, never fake buoy readings
- Prose in UI should sound like a captain, not a data scientist
- Commit/push only when explicitly requested
