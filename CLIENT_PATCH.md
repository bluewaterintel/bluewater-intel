# Milestone 1 — Client wiring patch (apply in Cursor against your repo)

These are the **exact** edits to `bluewater-intel_9_4_1_4.html` to swap the inlined
waypoint/ramp lookups for the Supabase-backed `BW_DATA` DataSource. Line numbers
drift with edits — locate each block by its **anchor text** (search for the
`OLD` snippet), not by line number.

The design keeps the app's fast pan/zoom path untouched: only the two "full
rebuild" functions (`drawWaypoints`, `drawRamps`) become async and call the
backend. The viewport re-cull on pan/zoom still runs synchronously off the
in-memory `_wpInRangeCache`, so the map stays smooth and works offline once a
port's data is loaded.

---

## Step 0 — Load the DataSource module

Add this `<script>` tag **immediately before** the inlined `window.BW_WAYPOINTS`
script (or anywhere before the main app `<script>`), and fill in your project URL
and anon key in `BW_DATA_CONFIG` inside `bw-data-source.js`:

```html
<script src="bw-data-source.js"></script>
```

For a single-file build, paste the contents of `bw-data-source.js` inline in a
`<script>…</script>` before the app script instead.

**Decide `embeddedFallback`** in `BW_DATA_CONFIG`:
- Native iOS/Android (must work offshore with no signal) → `true`. Keep the
  inlined `BW_WAYPOINTS`/`BW_RAMPS` as the labeled on-device offline cache.
- Website / always-connected → `false`, and you may then delete the inlined
  `BW_WAYPOINTS`/`BW_RAMPS` blocks entirely to drop ~1.2 MB from the page.

---

## Step 1 — `drawWaypoints()` → async backend query

**OLD** (anchor: `function drawWaypoints(){`):

```js
function drawWaypoints(){
  // Full rebuild: recompute the in-range set (haversine over the dataset) and
  // cache it. This only needs to run when port / radius / type filter changes.
  _wpInRangeCache = (!layerVis.waypoints || !activePort) ? null : waypointsInRange();
  renderWaypointMarkers(true);
  updateWaypointPanel(
    _wpInRangeCache ? _wpInRangeCache.length : 0,
    _wpInRangeCache ? Math.min(_wpInRangeCache.length, WP_MAX_DRAW) : 0
  );
  updateWaypointControlVisibility();
  bindWaypointRedraw();
}
```

**NEW**:

```js
let _wpDrawSeq = 0;  // guards against out-of-order async responses (rapid port/radius changes)
async function drawWaypoints(){
  // If the layer is off or no port is selected, clear and bail (no network call).
  if(!layerVis.waypoints || !activePort || !PORTS[activePort]){
    _wpInRangeCache = null;
    renderWaypointMarkers(true);
    updateWaypointPanel(0, 0);
    updateWaypointControlVisibility();
    bindWaypointRedraw();
    return;
  }
  const seq = ++_wpDrawSeq;
  const p = PORTS[activePort];
  // Show a loading state in the panel while the query is in flight.
  updateWaypointPanel(-1, -1); // -1 => "loading…" (see updateWaypointPanel patch)
  const { rows, status } = await window.BW_DATA.waypointsWithin(
    p.lat, p.lng, wpRadiusNm, wpTypeFilter
  );
  // A newer draw started while we were awaiting — discard this stale result.
  if(seq !== _wpDrawSeq) return;
  _wpInRangeCache = rows;
  renderWaypointMarkers(true);
  updateWaypointPanel(
    rows.length,
    Math.min(rows.length, WP_MAX_DRAW),
    status                    // pass data status so the panel can label cached/offline
  );
  updateWaypointControlVisibility();
  bindWaypointRedraw();
}
```

> `waypointsInRange()` is now unused by the live path. Leave it in place — the
> embedded fallback in `bw-data-source.js` reimplements the same haversine, and
> keeping the original is a useful dev-time parity reference (do NOT delete it as
> part of this milestone).

---

## Step 2 — `drawRamps()` → async backend query

**OLD** (anchor: `function drawRamps(){`):

```js
function drawRamps(){
  if(!rampLayerGroup){ rampLayerGroup = L.layerGroup().addTo(MAP); }
  rampLayerGroup.clearLayers();
  rampLayers = [];
  if(!layerVis.ramps || !activePort) return;
  const items = rampsInRange();
  const MAX_DRAW = 1200;  // perf cap, matching waypoints
  for(const r of items.slice(0, MAX_DRAW)){
```

**NEW**:

```js
let _rampDrawSeq = 0;
async function drawRamps(){
  if(!rampLayerGroup){ rampLayerGroup = L.layerGroup().addTo(MAP); }
  rampLayerGroup.clearLayers();
  rampLayers = [];
  if(!layerVis.ramps || !activePort || !PORTS[activePort]) return;
  const seq = ++_rampDrawSeq;
  const p = PORTS[activePort];
  const { rows: items } = await window.BW_DATA.rampsWithin(p.lat, p.lng, wpRadiusNm);
  if(seq !== _rampDrawSeq) return;
  const MAX_DRAW = 1200;  // perf cap, matching waypoints
  for(const r of items.slice(0, MAX_DRAW)){
```

(The rest of the `drawRamps` body — building markers — is unchanged.)

---

## Step 3 — Ramp "not loaded yet" alert (toggle handler)

The old toggle handler used `rampData().length===0` to detect missing data.
That synchronous check no longer applies. **OLD** (anchor:
`The ramp dataset ships empty`):

```js
    drawRamps();
    // The ramp dataset ships empty until a ramp CSV is wired in. If someone turns
    // the layer on and there's no data yet, say so instead of silently doing nothing.
    if(layerVis.ramps && rampData().length===0){
      alert("Boat ramp data isn't loaded yet. This layer is ready and will show public ramps around your port once a ramp dataset is added.");
    } else if(layerVis.ramps && !activePort){
```

**NEW** — drop the empty-data alert (ramps now always load from the backend);
keep the no-port hint:

```js
    drawRamps();
    if(layerVis.ramps && !activePort){
```

(Keep whatever the existing `else if(layerVis.ramps && !activePort){ … }` block
does.)

---

## Step 4 — `updateWaypointPanel()` loading + status label

Extend the panel updater to show a loading state and a freshness label.
**OLD** (anchor: `function updateWaypointPanel(total, drawn){`):

```js
function updateWaypointPanel(total, drawn){
  const el = document.getElementById("wp-count");
  if(!el) return;
  if(!activePort){ el.textContent = "select a port to begin"; return; }
```

**NEW**:

```js
function updateWaypointPanel(total, drawn, status){
  const el = document.getElementById("wp-count");
  if(!el) return;
  if(!activePort){ el.textContent = "select a port to begin"; return; }
  if(total === -1){ el.textContent = "loading waypoints…"; return; }   // in-flight
  // Honest data-status label (governing principle: never present stale/absent as live)
  let tag = "";
  if(status === "cached")           tag = " · cached (reconnecting)";
  else if(status === "offline-embedded") tag = " · offline data";
  else if(status === "unavailable"){ el.textContent = "waypoints unavailable offline — reconnect to load"; return; }
```

(Keep the rest of the original function — the count formatting — and append
`tag` to whatever string it builds, e.g. `el.textContent = \`${drawn} of ${total} shown${tag}\`;`.)

---

## Step 5 — Call sites are already fire-and-forget

All five call sites (`toggleLayer`, `selectPort`, `setWpRadius`, init, and the
nav path) call `drawWaypoints()` / `drawRamps()` without using a return value, so
making them `async` requires **no change at the call sites**. They now kick off
the query and the map updates when it resolves. (Optionally `await` them where you
want to sequence work after the draw, but it is not required.)

---

## Verification after wiring

1. With the backend reachable: select a port, toggle Waypoints — markers appear,
   panel shows the live count. Change radius bands — counts update. Switch ports
   rapidly — no stale flicker (the `_wpDrawSeq` guard handles this).
2. Kill the network (DevTools offline): panel shows "cached (reconnecting)" if a
   prior result exists, "offline data" if `embeddedFallback:true`, or
   "unavailable offline" if `embeddedFallback:false` and no cache.
3. Pan/zoom while offline with a loaded port — markers stay (re-cull is local).
4. Run the integrity check (`node --check` on each extracted `<script>`) — script
   count and DIV/SVG/LABEL/CSS balances must be unchanged.
