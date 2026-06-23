#!/usr/bin/env node
/**
 * Apply Milestone 1 CLIENT_PATCH.md edits to index.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
let html = readFileSync(htmlPath, 'utf8');

const replacements = [
  {
    name: 'script tag for bw-data-source',
    old: '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>',
    new: `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<script src="bw-config.js"></script>
<script src="bw-data-source.js"></script>`,
  },
  {
    name: 'drawWaypoints',
    old: `function drawWaypoints(){
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
}`,
    new: `let _wpDrawSeq = 0;  // guards against out-of-order async responses (rapid port/radius changes)
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
  updateWaypointPanel(-1, -1); // -1 => "loading…"
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
    status
  );
  updateWaypointControlVisibility();
  bindWaypointRedraw();
}`,
  },
  {
    name: 'drawRamps header',
    old: `function drawRamps(){
  if(!rampLayerGroup){ rampLayerGroup = L.layerGroup().addTo(MAP); }
  rampLayerGroup.clearLayers();
  rampLayers = [];
  if(!layerVis.ramps || !activePort) return;
  const items = rampsInRange();
  const MAX_DRAW = 1200;  // perf cap, matching waypoints
  for(const r of items.slice(0, MAX_DRAW)){`,
    new: `let _rampDrawSeq = 0;
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
  for(const r of items.slice(0, MAX_DRAW)){`,
  },
  {
    name: 'ramp toggle alert',
    old: `    drawRamps();
    // The ramp dataset ships empty until a ramp CSV is wired in. If someone turns
    // the layer on and there's no data yet, say so instead of silently doing nothing.
    if(layerVis.ramps && rampData().length===0){
      alert("Boat ramp data isn't loaded yet. This layer is ready and will show public ramps around your port once a ramp dataset is added.");
    } else if(layerVis.ramps && !activePort){`,
    new: `    drawRamps();
    if(layerVis.ramps && !activePort){`,
  },
  {
    name: 'updateWaypointPanel',
    old: `function updateWaypointPanel(total, drawn){
  const el = document.getElementById("wp-count");
  if(!el) return;
  if(!activePort){ el.textContent = "select a port to begin"; return; }
  if(total === undefined){
    const items = waypointsInRange();
    total = items.length; drawn = Math.min(total, 1200);
  }
  if(total === 0){ el.textContent = \`none within \${wpRadiusNm} nm of \${PORTS[activePort]?.short||activePort}\`; return; }
  const capped = drawn < total ? \` (showing nearest \${drawn})\` : "";
  el.textContent = \`\${total} within \${wpRadiusNm} nm\${capped}\`;
}`,
    new: `function updateWaypointPanel(total, drawn, status){
  const el = document.getElementById("wp-count");
  if(!el) return;
  if(!activePort){ el.textContent = "select a port to begin"; return; }
  if(total === -1){ el.textContent = "loading waypoints…"; return; }
  let tag = "";
  if(status === "cached")           tag = " · cached (reconnecting)";
  else if(status === "offline-embedded") tag = " · offline data";
  else if(status === "unavailable"){ el.textContent = "waypoints unavailable offline — reconnect to load"; return; }
  if(total === undefined){
    const items = waypointsInRange();
    total = items.length; drawn = Math.min(total, 1200);
  }
  if(total === 0){ el.textContent = \`none within \${wpRadiusNm} nm of \${PORTS[activePort]?.short||activePort}\${tag}\`; return; }
  const capped = drawn < total ? \` (showing nearest \${drawn})\` : "";
  el.textContent = \`\${total} within \${wpRadiusNm} nm\${capped}\${tag}\`;
}`,
  },
];

for (const r of replacements) {
  if (!html.includes(r.old)) {
    console.error(`PATCH FAILED (${r.name}): anchor not found`);
    process.exit(1);
  }
  html = html.replace(r.old, r.new);
  console.log(`Applied: ${r.name}`);
}

writeFileSync(htmlPath, html);
console.log('All patches applied to index.html');
