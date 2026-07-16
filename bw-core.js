/* Bluewater Intel — Core engine — map, layers, prediction/bite-map, ports & canyons
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

// ════════════════════════════════════════════════════════════════════════════
// DATA
// ════════════════════════════════════════════════════════════════════════════
// PORTS moved to bw-data-ports.js (Approach A modularization)

// SPECIES moved to bw-data-species.js (Approach A modularization)

// Canyon diamonds — labeled markers at verified 100fm center coords + dashed shelf break line
// Sources: Tidal Fish Forum GPS, ROFFS oceanographic analysis, NOAA bathymetry, Wikipedia
// CANYONS moved to bw-data-canyons.js (Approach A modularization)

// (Static HEAT zone data removed — was the data source for the legacy
//  "Heat Map (Static)" layer. The predictive engine supersedes it.)

// (AIS-derived "active fishing areas" removed — we never had a live AIS
//  feed and the static demo zones misrepresented real vessel activity.)

// ════════════════════════════════════════════════════════════════════════════
// LIVE DATA API CLIENT — connects to backend if available, falls back to demo
// ════════════════════════════════════════════════════════════════════════════
const API_BASE = (function(){
  // Detect API host — same origin in production, localhost:3001 in dev
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
  if (h === '' || h === 'null') return null; // artifact sandbox — disabled
  return ''; // same origin (production)
})();

const API = {
  available: false,
  lastCheck: 0,

  async ping(){
    if(API_BASE === null) return false;
    try{
      const r = await fetch(`${API_BASE}/api/status`, {signal:AbortSignal.timeout(3000)});
      const ok = r.ok;
      this.available = ok;
      this.lastCheck = Date.now();
      return ok;
    }catch{
      this.available = false;
      return false;
    }
  },

  async get(path){
    if(!this.available) return null;
    try{
      const r = await fetch(`${API_BASE}${path}`, {signal:AbortSignal.timeout(8000)});
      if(!r.ok) return null;
      return await r.json();
    }catch(e){
      console.warn('API fetch failed:', path, e.message);
      return null;
    }
  },

  async post(path, body){
    if(!this.available) return null;
    try{
      const r = await fetch(`${API_BASE}${path}`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(30000),
      });
      if(!r.ok) return null;
      return await r.json();
    }catch(e){
      console.warn('API POST failed:', path, e.message);
      return null;
    }
  },

  async getWeather(lat, lng){
    const d = await this.get(`/api/weather/point?lat=${lat}&lng=${lng}`);
    return d || null;
  },
  async getSocial(){
    const d = await this.get('/api/social');
    return d?.posts || null;
  },
  async getBrief(payload){
    const d = await this.post('/api/brief', payload);
    return d?.brief || null;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// APP INFRASTRUCTURE — analytics, crash logging, connectivity, freshness, cache
// ════════════════════════════════════════════════════════════════════════════
// All of this is privacy-preserving and local-first. Nothing here transmits a
// user's location, saved spots, or identity anywhere. Events are buffered in
// localStorage and only ever sent to YOUR backend (never third parties), and
// only once a backend is wired up and the user hasn't opted out. Until then it
// is purely a local ring buffer that helps you see what's used and what breaks.

const BWI = {
  // ── Lightweight, privacy-preserving analytics ────────────────────────────
  // Records anonymous usage EVENTS (e.g. "opened forecast", "toggled SST") with
  // a timestamp — never coordinates, names, or personal data. Capped ring
  // buffer in localStorage so it can't grow unbounded. A future backend can
  // pull/flush these; for now they're inspectable via BWI.dumpEvents().
  ANALYTICS_KEY: "bwi.analytics.v1",
  ANALYTICS_OPTOUT_KEY: "bwi.analytics.optout",
  MAX_EVENTS: 500,

  analyticsOptedOut(){
    // Diagnostics/performance collection is required for the app to function
    // and is disclosed in the Privacy Policy; there is no user opt-out.
    return false;
  },
  setAnalyticsOptOut(v){
    // No-op: collection of app diagnostics and performance data is mandatory.
  },
  track(event, props){
    if(this.analyticsOptedOut()) return;
    try {
      const buf = JSON.parse(localStorage.getItem(this.ANALYTICS_KEY) || "[]");
      // Strip anything that looks like a coordinate or personal field — defense
      // in depth so a careless caller can't leak location into analytics.
      const safeProps = {};
      if(props && typeof props === "object"){
        for(const k in props){
          if(/lat|lng|lon|coord|name|email|gps/i.test(k)) continue;
          const v = props[k];
          if(typeof v === "number" || typeof v === "string" || typeof v === "boolean") safeProps[k] = v;
        }
      }
      buf.push({ e:event, t:Date.now(), ...safeProps });
      while(buf.length > this.MAX_EVENTS) buf.shift();
      localStorage.setItem(this.ANALYTICS_KEY, JSON.stringify(buf));
    } catch(e){ /* analytics must never throw into the app */ }
  },
  dumpEvents(){
    try { return JSON.parse(localStorage.getItem(this.ANALYTICS_KEY) || "[]"); } catch(e){ return []; }
  },
  clearEvents(){
    try { localStorage.removeItem(this.ANALYTICS_KEY); } catch(e){}
  },

  // ── Crash / error visibility ─────────────────────────────────────────────
  // Captures uncaught errors and promise rejections into a local ring buffer so
  // problems are visible (in Settings → Diagnostics) instead of vanishing into
  // the console. No stack traces are sent anywhere automatically.
  ERROR_KEY: "bwi.errors.v1",
  MAX_ERRORS: 50,

  logError(kind, message, detail){
    try {
      const buf = JSON.parse(localStorage.getItem(this.ERROR_KEY) || "[]");
      buf.push({ kind, message:String(message||"").slice(0,300), detail:String(detail||"").slice(0,500), t:Date.now() });
      while(buf.length > this.MAX_ERRORS) buf.shift();
      localStorage.setItem(this.ERROR_KEY, JSON.stringify(buf));
    } catch(e){}
  },
  dumpErrors(){
    try { return JSON.parse(localStorage.getItem(this.ERROR_KEY) || "[]"); } catch(e){ return []; }
  },
  clearErrors(){
    try { localStorage.removeItem(this.ERROR_KEY); } catch(e){}
  },

  // ── Connectivity ─────────────────────────────────────────────────────────
  online: (typeof navigator !== "undefined" ? navigator.onLine : true),
  _connListeners: [],
  onConnChange(fn){ this._connListeners.push(fn); },
  _emitConn(){ for(const fn of this._connListeners){ try { fn(this.online); } catch(e){} } },

  // ── Forecast cache (offline resilience) ──────────────────────────────────
  // Stores the last successful forecast per spot keyed to a rounded lat/lng, so
  // when the user is offline (common offshore) they still see the most recent
  // outlook with a clear "as of" timestamp instead of a blank error.
  FORECAST_CACHE_KEY: "bwi.forecast.cache.v2",
  MAX_FORECAST_CACHE: 40,

  _fcKey(lat, lng){ return `${lat.toFixed(2)},${lng.toFixed(2)}`; },
  saveForecast(lat, lng, slots){
    try {
      const all = JSON.parse(localStorage.getItem(this.FORECAST_CACHE_KEY) || "{}");
      all[this._fcKey(lat,lng)] = { slots, savedAt: Date.now() };
      // Trim oldest if over cap
      const keys = Object.keys(all);
      if(keys.length > this.MAX_FORECAST_CACHE){
        keys.sort((a,b)=>all[a].savedAt-all[b].savedAt);
        delete all[keys[0]];
      }
      localStorage.setItem(this.FORECAST_CACHE_KEY, JSON.stringify(all));
    } catch(e){}
  },
  loadForecast(lat, lng){
    try {
      const all = JSON.parse(localStorage.getItem(this.FORECAST_CACHE_KEY) || "{}");
      return all[this._fcKey(lat,lng)] || null;
    } catch(e){ return null; }
  },

  // ── Freshness helper ─────────────────────────────────────────────────────
  // Turns a timestamp into a friendly "updated 2h ago" string for trust labels.
  ago(ts){
    if(!ts) return "unknown";
    const s = Math.max(0, Math.floor((Date.now() - ts)/1000));
    if(s < 60) return "just now";
    const m = Math.floor(s/60); if(m < 60) return `${m} min ago`;
    const h = Math.floor(m/60); if(h < 24) return `${h}h ago`;
    const d = Math.floor(h/24); return `${d}d ago`;
  },
};

// Wire global error + rejection capture (must never interfere with the app).
if(typeof window !== "undefined"){
  window.addEventListener("error", (e) => {
    BWI.logError("error", e.message, (e.filename||"") + ":" + (e.lineno||""));
  });
  window.addEventListener("unhandledrejection", (e) => {
    BWI.logError("promise", (e.reason && e.reason.message) || e.reason, "");
  });
  window.addEventListener("online",  () => { BWI.online = true;  BWI._emitConn(); BWI.track("conn_online"); });
  window.addEventListener("offline", () => { BWI.online = false; BWI._emitConn(); BWI.track("conn_offline"); });
}

// ════════════════════════════════════════════════════════════════════════════
// COMMUNITY FISHING REPORTS (first-party forum)
// ────────────────────────────────────────────────────────────────────────────
// REAL user-posted reports only — the old scraped/synthetic feed is gone. Reports
// are loaded DE-IDENTIFIED from Supabase (BW_AUTH.fetchReports → the public view:
// no user_id/PII, hashed handle, coords rounded ~6nm) into SOCIAL, in a shape the
// rest of the app already understands. The reports factor (reportsBoost) reads the
// real lat/lng + recency + species from these.
// ════════════════════════════════════════════════════════════════════════════
const REGIONS = [
  { id: "new_england", label: "New England" },
  { id: "mid_atlantic", label: "Mid-Atlantic" },
  { id: "southeast",    label: "Southeast" },
  { id: "gulf",         label: "Gulf" },
];
const REGION_LABELS = Object.fromEntries(REGIONS.map(r => [r.id, r.label]));

// Coarse US East + Gulf region from coordinates (defaults the post region).
function regionFor(lat, lng){
  if(lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return null;
  if(lng < -81.5 && lat < 31) return "gulf";     // FL Gulf coast, AL, MS, LA, TX
  if(lat >= 40.5) return "new_england";           // ~NY/CT through ME
  if(lat >= 36.5) return "mid_atlantic";          // NJ, DE, MD, VA
  return "southeast";                             // NC, SC, GA, FL Atlantic
}

// Live community reports (empty until users post; populated from the backend).
let SOCIAL = [];

// Map a de-identified public report row into the app's internal report shape.
function mapReport(r){
  return {
    id: r.id,
    region: r.region,
    species: r.species ? [r.species] : [],
    area: REGION_LABELS[r.region] || r.region,
    port: null,
    lat: (r.lat == null ? null : r.lat),
    lng: (r.lng == null ? null : r.lng),
    hoursAgo: r.created_at ? Math.max(0, (Date.now() - new Date(r.created_at).getTime()) / 3600000) : 999,
    src: "USER",
    srcName: r.handle || "Angler",
    snippet: r.body || "",
    createdAt: r.created_at,
  };
}

// Load recent community reports (de-identified) into SOCIAL; refresh dependent UI.
let _reportsLoading = false;
async function loadReports(){
  if(_reportsLoading) return;
  if(typeof window === "undefined" || !window.BW_AUTH || !window.BW_AUTH.fetchReports) return;
  _reportsLoading = true;
  const prevReportSig = (typeof SOCIAL !== "undefined" && SOCIAL.length)
    ? `${SOCIAL.length}:${SOCIAL[0]?.hoursAgo ?? ""}:${SOCIAL[0]?.id ?? ""}`
    : "0";
  try {
    const rows = await window.BW_AUTH.fetchReports({ sinceDays: 21, limit: 400 });
    SOCIAL = (rows || []).map(mapReport);
    const newReportSig = SOCIAL.length
      ? `${SOCIAL.length}:${SOCIAL[0]?.hoursAgo ?? ""}:${SOCIAL[0]?.id ?? ""}`
      : "0";
    if(prevReportSig === newReportSig) return;
    invalidatePredictCache();
    const ov = document.getElementById("rp-overlay");
    if(typeof rpRender === "function" && ov && ov.style.display === "block") rpRender();
    if(typeof drawPrediction === "function" && typeof activeSpId !== "undefined" && activeSpId && activeSpId !== "all" && typeof activePort !== "undefined" && activePort){
      drawPrediction();
    }
  } catch(e){ console.warn("loadReports failed", e); }
  finally { _reportsLoading = false; }
}

// ════════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════════
let MAP, activeSpId=null, activePort=null;
let pinLL=null;
// When the Captain's Brief is launched from the banner button it can cover the
// top 2-3 Bite-Map spots as a ranked "run plan" in a SINGLE model call. Holds
// the chosen hotspot cells; null for the normal single-spot brief (tap a spot).
let _briefRunPlanSpots=null;
let portMarkers=[], canyonLayers=[], catchLayers=[], closureLayers=[];
let layerVis={spots:true, ports:true, predict:false, loran:false, catches:false, sst:false, chlor:false, radar:false, closures:false, platforms:false, wind:false, currents:false, altimetry:false, waypoints:false, ramps:false};
let predictLayers=[], predictionData=null, predictionExplainer=null;
// PERFORMANCE: instead of creating one interactive L.circleMarker per grid cell
// (which was thousands of SVG nodes Leaflet had to reposition on every zoom —
// the dominant cause of zoom lag), we keep the scored grid here and do a single
// nearest-cell hit test on map click/mousemove. _predictHandlersBound ensures we
// only attach the map-level handlers once.
let _predictGrid = null, _predictSpecies = null, _predictTooltip = null, _predictHandlersBound = false, _predictZooming = false;
// Cached bite-map result for the active port + species + forecast hour. Zoom/pan
// must NOT recompute this — only repaint the heat mask. Recomputing on every tile
// load (old behavior) produced different hotspot rankings as bathy/ocean data
// arrived in different order, which is why the #1/#2/#3 badges jumped on zoom.
let _predictResultCache = null; // { key, heatGrid, hotspots, badges, gridStep, gridOriginLat, gridOriginLng }
let osmLayer=null, seaLayer=null, bathyLayer=null, esriOceanLayer=null, satelliteLayer=null, satelliteLabelsLayer=null, sstLayer=null, chlorLayer=null, radarLayer=null;
// Satellite-imagery date control (SEPARATE from the prediction forecast slider).
// Satellite layers (SST/chlor) are OBSERVED data — they only go backward. This
// is days back from the most-recent expected image (GIBS lags ~2 days). The
// forecast slider drives the algorithm FORWARD; this slider steps imagery BACK.
let satDayOffset = 0;   // 0 = most recent (the resolved freshest published date)
const SAT_MAX_DAYS_BACK = 14;
// Resolved "freshest available" GIBS publish lag per product (days back from UTC
// today) and the real date string being shown. Defaults to 1 day (these products
// typically publish within ~24h); ensureFreshestSatDates() probes GIBS and tightens
// this to today / yesterday / 2-days-back as soon as it confirms which date is
// actually published, so imagery is as fresh as possible and its REAL date is
// shown — never silently presented as "current".
let SAT_FRESH_BACK = { sst: 1, chlor: 1 };
let SAT_FRESH_DATE = { sst: null, chlor: null };
// Per-layer display opacity for the ocean overlays, driven by the vertical
// opacity slider on the right of the map. Defaults match the values the layers
// were originally built with (SST .65, chlor .55). Persisted so a user's
// preferred dim level survives navigation and reloads.
const OCEAN_OPACITY_DEFAULT = { sst: 0.65, chlor: 0.55 };
let oceanOpacity = { ...OCEAN_OPACITY_DEFAULT };
try {
  const saved = JSON.parse(localStorage.getItem("bwi_ocean_opacity") || "null");
  if(saved && typeof saved === "object"){
    if(typeof saved.sst === "number")   oceanOpacity.sst   = Math.max(0, Math.min(1, saved.sst));
    if(typeof saved.chlor === "number") oceanOpacity.chlor = Math.max(0, Math.min(1, saved.chlor));
  }
} catch(e){}
let briefSp=[], briefAutoPick=false, aiCOA="", aiLoading=false, briefDayOffset=0;  // briefDayOffset: 0=today,1=tomorrow,...
let briefRunZone=null;  // inshore | nearshore | offshore — where the captain plans to fish
const BRIEF_ZONE_NM = { inshore: 3, nearshore: 12, offshore: 35 };
const BRIEF_MAX_SPECIES = 3;  // hard cap — keeps brief tokens + captain focus tight
const BRIEF_HISTORY_KEY = "bwi_brief_history_v1";
const BRIEF_HISTORY_TTL_MS = 48 * 3600 * 1000;  // recall window
const BRIEF_HISTORY_MAX = 12;
let layersPanelOpen=false;

// ════════════════════════════════════════════════════════════════════════════
// MAP INIT
// ════════════════════════════════════════════════════════════════════════════
async function initMap(){
  // Restore saved preferences (default port, basemap, etc.) before any view
  // logic reads them, so the app opens with the user's chosen defaults.
  if(typeof prefLoad === "function") prefLoad();
  MAP=L.map("map",{center:[29.0,-85.0],zoom:5,zoomControl:false,attributionControl:true,maxZoom:13,
    // Trackpad/mouse-wheel zoom is handled by our own debounced handler below
    // (bindTrackpadZoom). Leaflet's built-in scrollWheelZoom accumulates the many
    // tiny wheel events a trackpad fires and ends up jumping 2-3 levels per
    // gesture, so we disable it here and step exactly ONE level per gesture.
    scrollWheelZoom:false,
    zoomSnap:1, zoomDelta:1});

  // ── Custom trackpad / mouse-wheel zoom ────────────────────────────────────
  // One scroll gesture (a single notch on a mouse, or one swipe on a trackpad)
  // = exactly one zoom level. Trackpads emit a rapid burst of small wheel
  // events; we accumulate their direction, act once, then ignore the rest of
  // the burst until a short quiet period resets us. This removes the 2-3x
  // over-zoom the user was seeing.
  (function bindTrackpadZoom(){
    const container = MAP.getContainer();
    let cooldown = false;       // true right after a zoom step, blocks the burst tail
    let cooldownTimer = null;
    container.addEventListener("wheel", function(e){
      e.preventDefault();       // stop the page/native zoom
      if(cooldown) {
        // Still inside the same gesture burst — keep the quiet timer alive so we
        // don't zoom again until the trackpad actually stops sending events.
        clearTimeout(cooldownTimer);
        cooldownTimer = setTimeout(()=>{ cooldown = false; }, 140);
        return;
      }
      const dir = e.deltaY < 0 ? 1 : -1;   // up = zoom in, down = zoom out
      // Zoom toward the cursor, not the map center, so it feels natural.
      const rect = container.getBoundingClientRect();
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
      const target = MAP.containerPointToLatLng(point);
      const newZoom = MAP.getZoom() + dir;
      if(newZoom >= MAP.getMinZoom() && newZoom <= MAP.getMaxZoom()){
        MAP.setZoomAround(target, newZoom, {animate:true});
      }
      cooldown = true;
      clearTimeout(cooldownTimer);
      cooldownTimer = setTimeout(()=>{ cooldown = false; }, 140);
    }, {passive:false});
  })();

  // Auto-detect if tiles are blocked (Claude artifact sandbox limitation) and show subtle notice
  let tileStats={loaded:0,errored:0};
  function showDemoNotice(){
    // Disabled: demo/preview banners removed ahead of backend wiring.
    return;
  }

  // ── DEFAULT: Esri World Imagery satellite (Maxar/Earthstar), free, no API key ──
  satelliteLayer=L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {maxZoom:18,minZoom:0,crossOrigin:'anonymous',attribution:'© Esri · Maxar · Earthstar Geographics'}
  ).addTo(MAP);
  satelliteLayer.on('tileload',()=>{
    tileStats.loaded++;
    // New basemap tile arrived → invalidate sampler cache and schedule a
    // single deferred repaint so the heat layer picks up the new tiles.
    BasemapSampler.invalidate();
    if(!BasemapSampler._repaintScheduled){
      BasemapSampler._repaintScheduled = true;
      requestAnimationFrame(() => {
        BasemapSampler._repaintScheduled = false;
        // Repaint the heat land-mask only — never re-score the grid on tile load.
        // drawPrediction() here was the root cause of hotspot badges shifting on zoom.
        if(_heatLayer && typeof _heatLayer._scheduleReset === "function"){
          _heatLayer._scheduleReset();
        }
      });
    }
  });
  satelliteLayer.on('tileerror',()=>{tileStats.errored++; if(tileStats.errored>=4&&tileStats.loaded===0)showDemoNotice();});

  // Add ocean/coastline labels overlay on top of satellite
  satelliteLabelsLayer=L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    {maxZoom:18,minZoom:0,attribution:'',opacity:0.7}
  ).addTo(MAP);

  // ── OCEAN BATHYMETRIC: Esri Ocean Base + NOAA BlueTopo hillshade (US) ──
  // World_Ocean_Reference is intentionally omitted — it draws lat/lon graticule
  // lines that read as a distracting grid over the chart.
  esriOceanLayer=L.layerGroup([
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
      {maxZoom:19,maxNativeZoom:13,minZoom:0,crossOrigin:'anonymous',attribution:'© Esri · GEBCO · NOAA · NGA'}
    ),
    L.tileLayer(
      "https://nowcoast.noaa.gov/geoserver/gwc/service/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0"
        + "&LAYER=bluetopo%3Ahillshade&STYLE=nbs_hillshade&TILEMATRIXSET=EPSG%3A3857"
        + "&TILEMATRIX=EPSG%3A3857%3A{z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng8",
      // BlueTopo GWC serves survey-resolution relief to z20 — cap native at 16 (fine
      // detail: ledges, humps, wrecks) and let Leaflet upscale past that so the layer
      // never disappears when the user zooms in tight. Was mistakenly capped at z9,
      // which only showed coarse regional relief.
      {maxZoom:19,maxNativeZoom:16,minZoom:0,crossOrigin:'anonymous',opacity:0.78,
        attribution:'© NOAA OCS · BlueTopo CUDEM',errorTileUrl:"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"}
    ),
  ]);

  // ── STREET + SEAMARKS ──
  osmLayer=L.layerGroup([
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {maxZoom:19,minZoom:0,crossOrigin:'anonymous',attribution:'© OpenStreetMap contributors',subdomains:'abc'}),
    L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
      {maxZoom:18,crossOrigin:'anonymous',attribution:'© OpenSeaMap',opacity:0.9})]);

  bathyLayer=esriOceanLayer; // alias for backward compat

  // ── Dedicated pane for satellite ocean overlays ──
  // SST and Chlorophyll go in their own pane so the BasemapSampler (which
  // classifies water vs land from basemap pixel colors) doesn't include
  // their colored tiles — those would falsely classify ocean as land and
  // break the heat-map land mask.
  MAP.createPane("ocean-overlays");
  MAP.getPane("ocean-overlays").style.zIndex = 400;       // above basemap (200), below heat (450)
  MAP.getPane("ocean-overlays").style.pointerEvents = "none";
  // SMOOTHING: both overlays are now 1km (z7) products. Force smooth bilinear
  // interpolation on the overlay tiles so the gradients blend when zoomed in
  // past native resolution — cosmetic only (adds no real detail), but a smooth
  // gradient is a more faithful picture of the water than hard upscaled cells.
  // Vendor prefixes cover Safari/WebKit and Firefox; 'auto' = smooth.
  (function smoothOceanOverlays(){
    const p = MAP.getPane("ocean-overlays");
    // Two-part smoothing:
    //  1. image-rendering bilinear on every tile (set inline per-tile below so
    //     nothing can override it), and
    //  2. a light CSS blur applied PER-LAYER (not pane-wide). Both MUR SST and
    //     VIIRS chlor are now z7 (~1km cells) so they share a gentle blur — the
    //     old heavy SST blur was tuned for the coarse ~28km GAMSSA grid and
    //     would smear away the fine fronts MUR actually resolves.
    p.style.imageRendering = "auto";
    p.classList.add("ocean-overlays-smooth");
    const scoped = document.createElement("style");
    scoped.textContent =
      '.ocean-overlays-smooth img.leaflet-tile { image-rendering:auto !important; image-rendering:smooth !important; }' +
      // Blur the whole tile CONTAINER per layer so seams between tiles smooth too.
      '.sst-smooth   { filter: blur(1px) contrast(1.45) saturate(1.35); }' +   // fallback GIBS — sharpen warm fronts
      '.chlor-smooth { filter: blur(1px) contrast(1.55) saturate(1.4); }'; // fallback GIBS — sharpen color edges
    document.head.appendChild(scoped);
  })();
  // Stamp each ocean-overlay tile inline as it loads — inline styles win over
  // any Leaflet/UA default, guaranteeing the bilinear smoothing applies.
  function attachTileSmoothing(layer){
    if(!layer || !layer.on) return layer;
    layer.on("tileload", e => {
      if(e && e.tile){
        e.tile.style.imageRendering = "auto";
        e.tile.style.imageRendering = "smooth";
      }
    });
    return layer;
  }

  // ══════════════════════════════════════════════════════════════════════
  // SATELLITE OCEAN OVERLAYS — NASA GIBS WMTS service.
  //
  // The map overlays are deliberately pointed at the SAME data products the
  // bite-score engine reads, so what a captain SEES matches what the score
  // is computed from (no more "the map shows green water but the score
  // disagrees"):
  //
  // SST (sea surface temperature):
  //   GHRSST L4 MUR (Multi-scale Ultra-high Resolution) — 1km, daily,
  //   gap-filled (cloud-free by construction). This is the SAME MUR analysis
  //   the ocean function scores from (jplMURSST41), rendered as GIBS tiles.
  //   Level7 tile set → ~1km native detail vs GAMSSA's coarse ~25km.
  //   Color scale: dark blue (cold) → cyan → green → yellow → red (warm).
  //
  // Chlorophyll-a (water color / productivity):
  //   VIIRS NOAA-20 Chlorophyll-a — 1km, daily. Same VIIRS sensor family the
  //   score's gap-filled DINEOF product is built from (replaces the old MODIS
  //   Aqua overlay, a different sensor). Color: blue (clear) → green → red.
  //
  // Why not 6-8 images/day like some imagery services? Those stitch every
  // individual polar-orbiter pass (VIIRS on SNPP/NOAA-20/21, MODIS Aqua/Terra)
  // plus geostationary GOES ABI. We instead render ONE daily gap-filled L4
  // analysis: it's cloud-free everywhere in a single frame (no swath holes to
  // slide past) and is the exact grid the bite score uses. Multi-pass
  // compositing is a backend pipeline we can add later; for planning, one
  // complete cloud-free frame/day is more useful than 8 partial cloudy ones.
  //
  // Both products have a ~1 day processing lag. Tile failures degrade to
  // transparent (no broken images). Layers are NOT added to the map on init —
  // they're attached via toggleLayer() only when the user enables them.
  // ══════════════════════════════════════════════════════════════════════
  // Factory builders for the satellite layers, so initial creation and the
  // date-slider rebuild share ONE definition (URLs/options can't drift).
  // satDayOffset = extra days back beyond the resolved freshest published date.
  window.buildSstLayer = function(dayOffset){
    const date = gibsRecentDate(SAT_FRESH_BACK.sst + (dayOffset||0));
    const lyr = L.tileLayer(
      // MUR — GHRSST L4, 1km, gap-filled (cloud-free). Same product the bite
      // score reads. Level7 native detail; maxNativeZoom keeps it visible past z7.
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/${date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
      { maxZoom:18, maxNativeZoom:7, minZoom:0, opacity:oceanOpacity.sst, crossOrigin:'anonymous',
        pane:"ocean-overlays", className:"sst-smooth", attribution:'© NASA GIBS · GHRSST MUR L4 1km (JPL)',
        errorTileUrl:"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" });
    return attachTileSmoothing(lyr);
  };
  window.buildChlorLayer = function(dayOffset){
    const date = gibsRecentDate(SAT_FRESH_BACK.chlor + (dayOffset||0));
    const lyr = L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_Chlorophyll_a/default/${date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
      { maxZoom:18, maxNativeZoom:7, minZoom:0, opacity:oceanOpacity.chlor, crossOrigin:'anonymous',
        pane:"ocean-overlays", className:"chlor-smooth", attribution:'© NASA GIBS · VIIRS NOAA-20 Chlorophyll-a',
        errorTileUrl:"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" });
    return attachTileSmoothing(lyr);
  };
  sstLayer   = window.buildSstLayer(0);
  chlorLayer = window.buildChlorLayer(0);
  // Probe GIBS for the freshest published SST/chlor dates and tighten the lag
  // (and on-screen date label) as soon as it resolves. Fire-and-forget so init
  // isn't blocked; until it resolves the conservative 1-day-back default applies.
  if(typeof ensureFreshestSatDates === "function") ensureFreshestSatDates();

  // ── Live weather radar (NOAA nowCOAST MRMS base reflectivity) ──
  // NOAA retired the old /arcgis/ radar service; nowCOAST moved to a GeoServer
  // WMS backend. Layer "weather_radar:conus_base_reflectivity_mosaic" — official
  // NWS Multi-Radar/Multi-Sensor mosaic, ~4-min refresh, EPSG:3857, WMS 1.3.0,
  // no API key. Confirmed working via the radar diagnostic. Leaflet's built-in
  // WMS client handles the bbox tiling. (No crossOrigin: not needed for display,
  // and it can trigger CORS failures on some setups.)
  radarLayer = L.tileLayer.wms(
    "https://nowcoast.noaa.gov/geoserver/observations/weather_radar/ows",
    {
      layers: "weather_radar:conus_base_reflectivity_mosaic",
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      maxZoom: 18,
      minZoom: 0,
      opacity: 0.55,
      pane: "ocean-overlays",
      attribution: '© NOAA/NWS nowCOAST · MRMS base reflectivity',
    });

  // ── Bathymetric contour overlay ──
  // High-res US relief is on the Ocean Bathymetric basemap via NOAA BlueTopo WMTS
  // (bluetopo:hillshade / nbs_hillshade, EPSG:3857, z0–9). Scoring depth comes from
  // CUDEM 1/9 arc-sec NCSS tiles in the ocean edge function (ETOPO fallback offshore).

  L.control.zoom({position:"topleft"}).addTo(MAP);
  MAP.on("click",onMapClick);
  // Live wind point-readout (speed / gusts / direction under the cursor)
  bindWindReadout();
  // Initial scale bar draw + wire to zoom/move events
  updateScaleBar();
  MAP.on("zoomend moveend", updateScaleBar);
  // Position the scale bar relative to any bottom control bars from the start
  // (no bars visible yet → it just rests at its default spot, but this also sets
  // the phone-correct bottom so it never starts at the overlapping fallback).
  restackBottomControls();
  // When the map view changes, the basemap snapshot is stale — invalidate it
  // so the next heat repaint takes a fresh snapshot of the new view.
  MAP.on("zoomend moveend", () => { BasemapSampler.invalidate(); });

  // ── Block the forecast slider from passing touches to the map underneath ──
  // Without this, dragging the slider thumb also pans the map — because the
  // slider element sits inside #map, Leaflet's gesture handlers see the
  // touchstart/touchmove first. L.DomEvent helpers prevent click + scroll
  // propagation; we also add explicit listeners for pointer/touch events so
  // the slider's native input behavior takes precedence on mobile.
  const sliderEl = document.getElementById("forecast-slider");
  if(sliderEl && typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.disableClickPropagation(sliderEl);
    L.DomEvent.disableScrollPropagation(sliderEl);
    const stopAll = e => { e.stopPropagation(); };
    sliderEl.addEventListener("pointerdown",  stopAll);
    sliderEl.addEventListener("pointermove",  stopAll);
    sliderEl.addEventListener("touchstart",   stopAll, {passive: true});
    sliderEl.addEventListener("touchmove",    stopAll, {passive: true});
    sliderEl.addEventListener("mousedown",    stopAll);
    sliderEl.addEventListener("mousemove",    stopAll);
  }
  // Same guard for the satellite imagery date control — without this Leaflet
  // grabs the drag and pans the map instead of moving the slider thumb.
  const satEl = document.getElementById("sat-date-control");
  if(satEl && typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.disableClickPropagation(satEl);
    L.DomEvent.disableScrollPropagation(satEl);
    const stopAllSat = e => { e.stopPropagation(); };
    satEl.addEventListener("pointerdown",  stopAllSat);
    satEl.addEventListener("pointermove",  stopAllSat);
    satEl.addEventListener("touchstart",   stopAllSat, {passive: true});
    satEl.addEventListener("touchmove",    stopAllSat, {passive: true});
    satEl.addEventListener("mousedown",    stopAllSat);
    satEl.addEventListener("mousemove",    stopAllSat);
  }
  const altiEl = document.getElementById("alti-date-control");
  if(altiEl && typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.disableClickPropagation(altiEl);
    L.DomEvent.disableScrollPropagation(altiEl);
    const stopAllAlti = e => { e.stopPropagation(); };
    altiEl.addEventListener("pointerdown", stopAllAlti);
    altiEl.addEventListener("pointermove", stopAllAlti);
    altiEl.addEventListener("touchstart",  stopAllAlti, {passive: true});
    altiEl.addEventListener("touchmove",   stopAllAlti, {passive: true});
    altiEl.addEventListener("mousedown",   stopAllAlti);
    altiEl.addEventListener("mousemove",   stopAllAlti);
  }
  const windCtl = document.getElementById("wind-forecast-slider");
  if(windCtl && typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.disableClickPropagation(windCtl);
    L.DomEvent.disableScrollPropagation(windCtl);
    const stopAllWind = e => { e.stopPropagation(); };
    windCtl.addEventListener("pointerdown", stopAllWind);
    windCtl.addEventListener("pointermove", stopAllWind);
    windCtl.addEventListener("touchstart",  stopAllWind, {passive: true});
    windCtl.addEventListener("touchmove",   stopAllWind, {passive: true});
    windCtl.addEventListener("mousedown",   stopAllWind);
    windCtl.addEventListener("mousemove",   stopAllWind);
  }
  const radarCtl = document.getElementById("radar-loop-control");
  if(radarCtl && typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.disableClickPropagation(radarCtl);
    L.DomEvent.disableScrollPropagation(radarCtl);
    const stopAllRadar = e => { e.stopPropagation(); };
    radarCtl.addEventListener("pointerdown",  stopAllRadar);
    radarCtl.addEventListener("touchstart",   stopAllRadar, {passive: true});
    radarCtl.addEventListener("mousedown",    stopAllRadar);
  }
  const wpCtl = document.getElementById("waypoint-legend");
  if(wpCtl && typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.disableClickPropagation(wpCtl);
    L.DomEvent.disableScrollPropagation(wpCtl);
    const stopAllWp = e => { e.stopPropagation(); };
    wpCtl.addEventListener("pointerdown",  stopAllWp);
    wpCtl.addEventListener("touchstart",   stopAllWp, {passive: true});
    wpCtl.addEventListener("mousedown",    stopAllWp);
  }

  // ── Initial port + map view ──
  // Three cases:
  //   1. User has a saved default port in Settings → set it as active and
  //      center the map on it (no empty-state prompt).
  //   2. User has no saved default → leave activePort unset, show the
  //      "Select your Home Port" prompt. The map opens framed on a neutral
  //      east-coast region so the chart isn't blank.
  //   3. (Defensive) Saved port no longer exists in PORTS → treat as #2.
  const savedDefault = (typeof USER_PREFS !== "undefined" && USER_PREFS.defaultPort) || null;
  // If we have a saved map view from a previous visit, restore it so returning
  // to the page keeps the user's zoom + position instead of snapping back to a
  // default. The active port still resolves from the saved default below.
  const savedView = loadMapView();
  if (savedDefault && PORTS[savedDefault]) {
    activePort = savedDefault;
    if (savedView) {
      MAP.setView([savedView.lat, savedView.lng], savedView.zoom);
    } else {
      MAP.setView([PORTS[savedDefault].lat, PORTS[savedDefault].lng], HOME_PORT_ZOOM);
    }
    const portLbl = document.getElementById("port-name");
    if (portLbl) {
      portLbl.textContent = savedDefault;
      portLbl.style.opacity = "1";
    }
  } else {
    // No saved default — open with a neutral US east-coast framing but
    // leave activePort empty so the "Select port" empty-state shows.
    if (savedView) {
      MAP.setView([savedView.lat, savedView.lng], savedView.zoom);
    } else {
      MAP.setView([PORTS[FALLBACK_HOME_PORT].lat, PORTS[FALLBACK_HOME_PORT].lng], HOME_PORT_ZOOM);
    }
    // Port label keeps its default "Select port…" placeholder.
  }
  // Start remembering the map view from here on (after the initial setView so we
  // don't immediately overwrite a restored view with the default).
  startMapViewPersistence();

  drawCanyons();
  drawPortMarkers();
  drawCatchPins();
  drawClosures();
  // User waypoints/catches hydrate from account on sign-in (bwOnSignedIn).
  drawUserWaypoints();
  buildSpDropdown();
  buildPortDropdown();
  updateLegend();
  // Populate the account section so it's correct from first menu open.
  if(typeof renderAccountSection === "function") renderAccountSection();
  if(typeof refreshBriefRecallUi === "function") refreshBriefRecallUi();
  if(typeof applyAdminNavVisibility === "function") applyAdminNavVisibility();

  // Initialize offline tile caching (Service Worker)
  initOfflineCache();

  if(typeof BWI !== "undefined") BWI.track("app_open");

  // Show empty-state overlay until user picks port + species
  updateEmptyState();
  updateBriefFab();

  initUserGeoTimezone();

  // If we opened with no connectivity and a trip is saved, load it straight onto
  // the map — the whole point of "Download my trip".
  try{
    if(!navigator.onLine && typeof tripLoad === "function" && tripLoad()){
      setTimeout(() => { if(!navigator.onLine && typeof dtOpenTrip === "function"){ dtOpenTrip(); showToast("Offline — loaded your saved trip.", "info"); } }, 900);
    }
  }catch(e){}

  if(activePort) primeOceanDataForPort(PORTS[activePort]);
  else requestAnimationFrame(syncHeaderHeightVar);
}

// ════════════════════════════════════════════════════════════════════════════
// OFFLINE TILE CACHING via Service Worker
//
// Strategy: a Service Worker intercepts requests to known tile servers
// (Esri, OSM, NOAA, OpenSeaMap) and caches successful responses in the
// browser's Cache Storage API. Tiles you've viewed once are then available
// offline. Plus: a "Cache current view" button pre-fetches all tiles for the
// visible map area at zoom levels 6-12 so users can prep before a trip.
// ════════════════════════════════════════════════════════════════════════════
const TILE_CACHE_NAME = "bwi-tiles-v1";

let swReg = null;

async function initOfflineCache(){
  const stateEl = document.getElementById("offline-state");
  const sizeEl  = document.getElementById("offline-size");
  if(!stateEl || !sizeEl) return;   // tile controls live on Download My Trip screen
  if(!("serviceWorker" in navigator)){
    stateEl.textContent = "⚠ Not supported by this browser";
    sizeEl.textContent = "Offline caching needs a modern browser.";
    const pf = document.getElementById("offline-prefetch-btn");
    const cl = document.getElementById("offline-clear-btn");
    if(pf) pf.disabled = true;
    if(cl) cl.disabled = true;
    return;
  }
  // Service Workers require a secure context (HTTPS or localhost). file:// will fail.
  if(location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1"){
    stateEl.textContent = "⚠ Offline cache requires HTTPS";
    sizeEl.textContent = "Available when the app is served from a secure server.";
    const pf = document.getElementById("offline-prefetch-btn");
    const cl = document.getElementById("offline-clear-btn");
    if(pf) pf.disabled = true;
    if(cl) cl.disabled = true;
    return;
  }
  try {
    swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    stateEl.textContent = "✓ Offline cache active";
    refreshCacheStats();
  } catch(err) {
    stateEl.textContent = "⚠ Cache setup failed";
    sizeEl.textContent = String(err).slice(0, 80);
    console.error("Offline cache init failed:", err);
  }
}

// Refresh tile-cache status on the Download My Trip screen after render.
function dtRefreshOfflineUI(){
  const stateEl = document.getElementById("offline-state");
  if(!stateEl) return;
  initOfflineCache();
}

function postToSW(msg){
  return new Promise((resolve) => {
    if(!navigator.serviceWorker.controller){
      resolve(null);
      return;
    }
    const ch = new MessageChannel();
    ch.port1.onmessage = e => resolve(e.data);
    // Most browsers don't route Channel messages from controller — use a listener
    const handler = e => {
      if(e.data && (e.data.type === "STATS_RESULT" || e.data.type === "CLEAR_DONE")){
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(e.data);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    navigator.serviceWorker.controller.postMessage(msg);
    // Safety timeout
    setTimeout(() => resolve(null), 2000);
  });
}

async function refreshCacheStats(){
  const sizeEl = document.getElementById("offline-size");
  const stats = await postToSW({type:"STATS"});
  if(stats && typeof stats.count === "number"){
    // Tiles are ~10-25KB on average. Estimate at 15KB.
    const est = stats.count * 15;
    const fmt = est > 1024 ? (est/1024).toFixed(1) + " MB" : est + " KB";
    sizeEl.textContent = `${stats.count.toLocaleString()} tiles cached · ~${fmt}`;
  } else if(navigator.serviceWorker.controller){
    sizeEl.textContent = "Tiles you view are cached automatically.";
  } else {
    sizeEl.textContent = "Reload the page to activate the cache.";
  }
}

// ── Pre-fetch tiles for the current map view (zoom levels 6 to 12) ──
async function prefetchCurrentView(){
  if(!navigator.serviceWorker.controller){
    showToast("Cache not yet active. Reload the page and try again.", "warning");
    return;
  }
  const btn = document.getElementById("offline-prefetch-btn");
  if(btn) btn.disabled = true;
  const origText = btn ? btn.textContent : "";
  const bounds = MAP.getBounds();

  // Determine which base layer is active to pick the right tile URLs
  const activeBase = document.querySelector('input[name="base"]:checked')?.value || "satellite";
  const urlBuilders = {
    satellite: (z,x,y) => [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`],
    ocean: (z,x,y) => [
      `https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/${z}/${y}/${x}`],
    osm: (z,x,y) => [
      `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
      `https://tiles.openseamap.org/seamark/${z}/${x}/${y}.png`],
  };
  const buildUrls = urlBuilders[activeBase] || urlBuilders.satellite;

  // Helper: convert lat/lng to tile coords for a given zoom
  const latLngToTile = (lat, lng, z) => {
    const n = Math.pow(2, z);
    const xt = Math.floor((lng + 180) / 360 * n);
    const lat_rad = lat * Math.PI / 180;
    const yt = Math.floor((1 - Math.log(Math.tan(lat_rad) + 1/Math.cos(lat_rad)) / Math.PI) / 2 * n);
    return {x: xt, y: yt};
  };

  // Generate the full list of tile URLs to fetch (zooms 6 through 12)
  const tasks = [];
  const minZ = 6, maxZ = 12;
  for(let z = minZ; z <= maxZ; z++){
    const nw = latLngToTile(bounds.getNorth(), bounds.getWest(), z);
    const se = latLngToTile(bounds.getSouth(), bounds.getEast(), z);
    // Safety: cap the number of tiles per zoom to prevent runaway downloads
    const tileCount = (se.x - nw.x + 1) * (se.y - nw.y + 1);
    if(tileCount > 1200){
      console.warn(`Skipping zoom ${z}: ${tileCount} tiles is too many for one view`);
      continue;
    }
    for(let x = nw.x; x <= se.x; x++){
      for(let y = nw.y; y <= se.y; y++){
        buildUrls(z, x, y).forEach(url => tasks.push(url));
      }
    }
  }

  // Fetch in batches of 8 to avoid overwhelming the network
  let done = 0, errored = 0;
  const total = tasks.length;
  const batchSize = 8;
  for(let i = 0; i < tasks.length; i += batchSize){
    const batch = tasks.slice(i, i + batchSize);
    await Promise.all(batch.map(url =>
      fetch(url, {mode: "cors"})
        .then(r => { if(r.ok) done++; else errored++; })
        .catch(() => { errored++; })
    ));
    if(btn) btn.textContent = `Caching... ${i + batch.length}/${total}`;
  }
  if(btn) btn.textContent = `✓ Cached ${done} tiles`;
  setTimeout(() => {
    if(btn){ btn.textContent = origText; btn.disabled = false; }
    refreshCacheStats();
  }, 1500);
}

async function clearTileCache(){
  if(!confirm("Clear all cached tiles? You'll need to be online to view them again.")) return;
  const btn = document.getElementById("offline-clear-btn");
  if(btn){ btn.disabled = true; btn.textContent = "Clearing..."; }
  const origText = btn ? "🗑 Clear tile cache" : "";
  await postToSW({type:"CLEAR"});
  // Also try clearing directly in case the SW didn't respond
  try { await caches.delete(TILE_CACHE_NAME); } catch(e){}
  if(btn) btn.textContent = "✓ Cleared";
  setTimeout(() => {
    if(btn){ btn.textContent = origText; btn.disabled = false; }
    refreshCacheStats();
  }, 1200);
}

// ════════════════════════════════════════════════════════════════════════════
// DOWNLOAD MY TRIP — offline snapshot of a run
//
// Captures everything a captain needs to run offshore even if cell/sat signal
// drops: the bite map (heat grid + hotspots), the AI Captain's Brief (if one has
// been generated), tide predictions, in-range waypoints, and the map tiles for
// the fishing area. Stored in localStorage (JSON) + Cache Storage (tiles via the
// service worker). When offline, the normal port/species flow transparently
// falls back to this snapshot (see buildPredictInputs / drawWaypoints /
// updateHeaderTide fallbacks below).
// ════════════════════════════════════════════════════════════════════════════
const TRIP_CACHE_KEY = "bwi.trip.v1";
let LAST_PREDICT_INPUTS = null;   // {bbox, data, fcHour, atMs} — captured by buildPredictInputs
let _dtBusy = false;

function _tround(n, d){ if(n==null||!isFinite(n)) return n; const m=Math.pow(10,d==null?3:d); return Math.round(n*m)/m; }
function tripLoad(){ try{ const s=localStorage.getItem(TRIP_CACHE_KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
function tripClear(){ try{ localStorage.removeItem(TRIP_CACHE_KEY); }catch(e){} }
function tripSave(obj){
  try{ localStorage.setItem(TRIP_CACHE_KEY, JSON.stringify(obj)); return true; }
  catch(e){
    // Quota exceeded — retry without the (largest) predictInputs payload; the
    // cached heat grid alone still lets the bite map paint offline.
    try{ const slim=Object.assign({},obj,{predictInputs:null}); localStorage.setItem(TRIP_CACHE_KEY, JSON.stringify(slim)); return true; }
    catch(e2){ return false; }
  }
}

// Does a cached trip snapshot's predictInputs bbox cover this request? Used as
// the offline fallback source for the bite map inputs.
function tripPredictInputsCovering(latMin, latMax, lngMin, lngMax){
  const t = tripLoad();
  if(!t || !t.predictInputs || !t.predictInputs.data || !t.predictInputs.bbox) return null;
  const b = t.predictInputs.bbox, tol = 0.2;
  if(latMin >= b.latMin-tol && latMax <= b.latMax+tol && lngMin >= b.lngMin-tol && lngMax <= b.lngMax+tol){
    return t.predictInputs.data;
  }
  return null;
}
function tripWaypointsFor(port){ const t=tripLoad(); return (t && t.port===port && Array.isArray(t.waypoints)) ? t.waypoints : null; }
function tripTideHeaderFor(port){ const t=tripLoad(); return (t && t.port===port && t.tides && t.tides.headerText) ? t.tides.headerText : null; }

// Format the header tide string from a fetchNextTideEvent() result (mirrors the
// live formatting in updateHeaderTide so cached + live look identical).
function formatTideHeader(next){
  if(!next || !next.events || !next.events.length) return null;
  const stateTxt = next.state === "rising" ? "Rising" : next.state === "falling" ? "Falling" : next.state === "slack" ? "Slack" : "";
  const seq = next.events.slice(0,2).map(e => `${e.type === "H" ? "High" : "Low"} ${e.timeTxt}`).join(" → ");
  return stateTxt ? `${stateTxt} · ${seq}` : seq;
}

// Run the bite-grid compute once and resolve with the full payload.
function dtComputeGrid(speciesId){
  return new Promise((resolve) => {
    let settled = false;
    const done = (full) => { if(settled) return; settled = true; resolve(full); };
    try { computePredictionGridAsync(speciesId, null, done); }
    catch(e){ done(null); }
    setTimeout(() => done(null), 60000);  // safety: never hang the download
  });
}

async function dtFetchTides(p){
  try{
    if(typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchOcean) return null;
    const o = await BW_OCEAN.fetchOcean(p.lat + 0.05, p.lng + 0.05);
    const station = o && o.sources ? o.sources.tide : null;
    if(!station) return null;
    const next = await fetchNextTideEvent(station);
    if(!next) return null;
    return { station, state: next.state, events: next.events, headerText: formatTideHeader(next) };
  }catch(e){ return null; }
}

async function dtFetchWaypoints(p){
  try{
    const sbc = window.BW_AUTH && window.BW_AUTH._sb;
    if(!sbc) return [];
    const types = (typeof wpTypeFilter !== "undefined" && wpTypeFilter) ? [...wpTypeFilter] : null;
    const radius = (typeof wpRadiusNm !== "undefined") ? wpRadiusNm : 40;
    const { data, error } = await sbc.rpc("pack_waypoints_within", {
      p_port: activePort, p_lat: p.lat, p_lng: p.lng, p_radius_nm: radius, p_types: types,
    });
    if(error) return [];
    // The RPC only returns positions to entitled users; cap for snapshot size.
    return (data || [])
      .slice(0, 2500)
      .map(r => ({ name: r.name, lat: _tround(r.lat,4), lng: _tround(r.lng,4), t: r.type_code, nm: _tround(r.nm,1) }));
  }catch(e){ return []; }
}

// Pre-fetch map tiles (zoom 6–12) for a lat/lng bounds via the service worker
// cache. Returns {done,total}. Reports progress through onProgress(done,total).
async function dtPrefetchTiles(bounds, onProgress){
  if(!navigator.serviceWorker || !navigator.serviceWorker.controller) return { done:0, total:0, unavailable:true };
  const activeBase = document.querySelector('input[name="base"]:checked')?.value || "satellite";
  const urlBuilders = {
    satellite: (z,x,y) => [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`],
    ocean: (z,x,y) => [
      `https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/${z}/${y}/${x}`],
    osm: (z,x,y) => [
      `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
      `https://tiles.openseamap.org/seamark/${z}/${x}/${y}.png`],
  };
  const buildUrls = urlBuilders[activeBase] || urlBuilders.satellite;
  const latLngToTile = (lat, lng, z) => {
    const n = Math.pow(2, z);
    const xt = Math.floor((lng + 180) / 360 * n);
    const latR = lat * Math.PI / 180;
    const yt = Math.floor((1 - Math.log(Math.tan(latR) + 1/Math.cos(latR)) / Math.PI) / 2 * n);
    return { x: xt, y: yt };
  };
  const tasks = [];
  for(let z = 6; z <= 12; z++){
    const nw = latLngToTile(bounds.n, bounds.w, z);
    const se = latLngToTile(bounds.s, bounds.e, z);
    if((se.x - nw.x + 1) * (se.y - nw.y + 1) > 1400) continue;  // skip runaway zooms
    for(let x = nw.x; x <= se.x; x++)
      for(let y = nw.y; y <= se.y; y++)
        buildUrls(z, x, y).forEach(url => tasks.push(url));
  }
  let done = 0;
  const total = tasks.length;
  for(let i = 0; i < tasks.length; i += 8){
    const batch = tasks.slice(i, i + 8);
    await Promise.all(batch.map(url => fetch(url, { mode:"cors" }).then(r => { if(r.ok) done++; }).catch(() => {})));
    if(onProgress) onProgress(Math.min(i + 8, total), total);
  }
  return { done, total };
}

// Compute the fishing-area bbox from the water cells actually scored (falls back
// to the current map view). Used for tile prefetch + map framing on reload.
function dtBboxFromGrid(heatGrid){
  if(heatGrid && heatGrid.length){
    let s=Infinity,n=-Infinity,w=Infinity,e=-Infinity;
    for(const c of heatGrid){ if(c.lat<s)s=c.lat; if(c.lat>n)n=c.lat; if(c.lng<w)w=c.lng; if(c.lng>e)e=c.lng; }
    if(isFinite(s)) return { s:s-0.1, n:n+0.1, w:w-0.1, e:e+0.1, latMin:s-0.1, latMax:n+0.1, lngMin:w-0.1, lngMax:e+0.1 };
  }
  const b = MAP.getBounds();
  return { s:b.getSouth(), n:b.getNorth(), w:b.getWest(), e:b.getEast(),
           latMin:b.getSouth(), latMax:b.getNorth(), lngMin:b.getWest(), lngMax:b.getEast() };
}

// ── Download the current trip ────────────────────────────────────────────────
async function dtDownload(){
  if(_dtBusy) return;
  if(!activePort || !PORTS[activePort]){ showToast("Pick a home port first, then download.", "warning"); dtRender(); return; }
  if(!activeSpId || activeSpId === "all"){ showToast("Pick a target species first, then download.", "warning"); dtRender(); return; }
  if(typeof BW_PREMIUM !== "undefined" && !BW_PREMIUM){ if(typeof openPricing==="function") openPricing(); return; }
  _dtBusy = true;
  const p = PORTS[activePort];
  const species = SPECIES.find(s => s.id === activeSpId);
  const setStep = (id, state, note) => dtSetStep(id, state, note);

  dtRenderProgress();
  try{
    // 1) Bite map (heat grid + hotspots). This also fetches + caches the ocean
    //    inputs into LAST_PREDICT_INPUTS.
    setStep("grid", "run", "Scoring the bite map…");
    const full = await dtComputeGrid(activeSpId);
    const heatGrid = (full && full.heatGrid) ? full.heatGrid : [];
    const hotspots = (full && full.hotspots) ? full.hotspots : [];
    if(!heatGrid.length){ setStep("grid","warn","Couldn't build the bite map (need connection)"); }
    else setStep("grid","ok", `${heatGrid.length.toLocaleString()} cells · ${hotspots.length} hotspots`);

    // 2) Tides
    setStep("tides","run","Fetching tide predictions…");
    const tides = await dtFetchTides(p);
    setStep("tides", tides ? "ok" : "warn", tides ? (tides.headerText || "cached") : "No tide station nearby");

    // 3) Waypoints
    setStep("wp","run","Pulling in-range waypoints…");
    const waypoints = await dtFetchWaypoints(p);
    setStep("wp", waypoints.length ? "ok" : "warn", waypoints.length ? `${waypoints.length.toLocaleString()} points` : "None available");

    // 4) Brief (only if one has already been generated this session)
    setStep("brief","run","Checking for a saved brief…");
    const brief = (typeof aiCOA === "string" && aiCOA.trim()) ? { text: aiCOA, atMs: Date.now() } : null;
    setStep("brief", brief ? "ok" : "skip", brief ? "Included" : "Generate a brief first to include it");

    // 5) Map tiles for the fishing area
    const bbox = dtBboxFromGrid(heatGrid);
    setStep("tiles","run","Caching map tiles…");
    const tileRes = await dtPrefetchTiles(bbox, (d,t) => dtSetStep("tiles","run", `Caching map tiles… ${d}/${t}`));
    setStep("tiles", tileRes.unavailable ? "warn" : "ok",
      tileRes.unavailable ? "Tile cache not active (reload once online)" : `${tileRes.done.toLocaleString()} tiles cached`);

    // Assemble + persist the snapshot.
    const center = MAP.getCenter();
    const snapshot = {
      version: 1,
      savedAtMs: Date.now(),
      port: activePort,
      speciesId: activeSpId,
      speciesName: species ? species.name : activeSpId,
      forecastHour: (typeof FORECAST_HOUR_OFFSET !== "undefined") ? (FORECAST_HOUR_OFFSET || 0) : 0,
      mapView: { lat: _tround(center.lat,4), lng: _tround(center.lng,4), zoom: MAP.getZoom() },
      bbox: { latMin: bbox.latMin, latMax: bbox.latMax, lngMin: bbox.lngMin, lngMax: bbox.lngMax },
      biteGrid: {
        heat: heatGrid.map(c => [_tround(c.lat,3), _tround(c.lng,3), _tround(c.score,3)]),
        hotspots: hotspots.slice(0, 80).map(c => Object.assign({}, c, { lat:_tround(c.lat,4), lng:_tround(c.lng,4), score:_tround(c.score,3) })),
        gridStep: (full && full.gridStep) || 0.1,
        gridOrigin: full ? { lat: full.gridOriginLat, lng: full.gridOriginLng } : null,
      },
      predictInputs: LAST_PREDICT_INPUTS ? { bbox: LAST_PREDICT_INPUTS.bbox, data: LAST_PREDICT_INPUTS.data } : null,
      tides,
      waypoints,
      brief,
      counts: { heat: heatGrid.length, hotspots: hotspots.length, waypoints: waypoints.length, hasBrief: !!brief, hasTides: !!tides },
    };
    const ok = tripSave(snapshot);
    if(typeof BWI !== "undefined") BWI.track("trip_download", { port: activePort, species: activeSpId, heat: heatGrid.length, wp: waypoints.length });
    _dtBusy = false;
    if(ok) showToast("Trip saved for offline use.", "success");
    else showToast("Couldn't save — device storage is full.", "warning");
    dtRender();
  }catch(e){
    _dtBusy = false;
    if(typeof BWI !== "undefined") BWI.logError && BWI.logError("trip_download", e);
    showToast("Download failed. Check your connection and try again.", "warning");
    dtRender();
  }
}

// ── Load a saved trip onto the map (works offline) ───────────────────────────
function dtOpenTrip(){
  const t = tripLoad();
  if(!t){ showToast("No saved trip yet.", "warning"); return; }
  closeDownloadTrip();
  // Prime globals from cached ocean inputs so scoring/taps work with no network.
  if(t.predictInputs && t.predictInputs.data){
    const d = t.predictInputs.data;
    try{
      if(d.bathy) applyPredictBathyData(d.bathy);
      if(d.chlor) applyChlorData(d.chlor);
      if(d.sst) applySstData(d.sst);
      if(Array.isArray(d.field)) applyOceanField(d.field, d.fieldStepNm);
      PREDICT_ALTI_GRID = (d.altimetry && typeof buildAltiGrid === "function") ? buildAltiGrid(d.altimetry) : null;
      PREDICT_CUR_GRID  = (d.current  && typeof buildCurGrid  === "function") ? buildCurGrid(d.current)   : null;
    }catch(e){}
  }
  // Restore trip context. selectPort/selectSp trigger the normal draws which,
  // when offline, fall back to this same snapshot for inputs/waypoints/tides.
  if(t.port && PORTS[t.port] && typeof selectPort === "function") selectPort(t.port);
  if(t.speciesId && typeof selectSp === "function") selectSp(t.speciesId);
  if(t.mapView && MAP) MAP.setView([t.mapView.lat, t.mapView.lng], t.mapView.zoom, { animate:false });
  // Restore the cached brief text so the Captain's Brief panel shows it offline.
  if(t.brief && t.brief.text && typeof aiCOA !== "undefined") aiCOA = t.brief.text;
  // Paint the cached bite grid immediately (fast path — doesn't wait on recompute).
  dtRenderCachedGrid(t);
  // Seed cached tides into the header so it shows without a network call.
  if(t.tides && t.tides.headerText){
    const el = document.getElementById("hdr-tide"); const cell = document.getElementById("hdr-tide-cell");
    if(el){ el.textContent = t.tides.headerText; if(cell) cell.style.display=""; }
    if(typeof _hdrTide !== "undefined") _hdrTide = { key: t.port, text: t.tides.headerText, atMs: Date.now() };
  }
  showToast(`Trip loaded: ${t.speciesName} out of ${t.port}.`, "success");
}

function dtRenderCachedGrid(t){
  if(!t || !t.biteGrid || !MAP || typeof renderPrediction !== "function") return;
  const sp = SPECIES.find(s => s.id === t.speciesId) || { id: t.speciesId, name: t.speciesName, color: "#7dd3fc" };
  activeSpId = t.speciesId;
  if(typeof _predictSpecies !== "undefined") _predictSpecies = sp;
  layerVis.predict = true;
  const chk = document.getElementById("chk-predict"); if(chk) chk.checked = true;
  const heatGrid = (t.biteGrid.heat || []).map(a => ({ lat:a[0], lng:a[1], score:a[2] }));
  const hotspots = (t.biteGrid.hotspots || []);
  if(typeof _predictGrid !== "undefined") _predictGrid = hotspots;
  if(!_predictHandlersBound && typeof bindPredictInteractionHandlers === "function"){ bindPredictInteractionHandlers(); _predictHandlersBound = true; }
  renderPrediction(hotspots, sp, true, heatGrid, t.biteGrid.gridStep, t.biteGrid.gridOrigin || null);
  if(typeof updateForecastSliderVisibility === "function") updateForecastSliderVisibility();
}

// ── UI: overlay open/close + render ──────────────────────────────────────────
function openDownloadTrip(){
  const ov = document.getElementById("dt-overlay");
  if(!ov) return;
  ov.style.display = "block";
  document.body.style.overflow = "hidden";
  dtRender();
}
// Entry points from the map UI (layers panel, forecast bar) — same Pro gate as
// the nav menu item.
function openDownloadTripGated(){
  if(!BW_PREMIUM){ if(typeof openPricing === "function") openPricing(); return; }
  const lm = document.getElementById("layers-modal");
  if(lm && lm.classList.contains("open")) toggleLayersPanel();
  openDownloadTrip();
}
function closeDownloadTrip(){
  const ov = document.getElementById("dt-overlay");
  if(!ov) return;
  ov.style.display = "none";
  document.body.style.overflow = "";
}

function dtFmtAge(ms){
  const s = Math.floor((Date.now() - ms) / 1000);
  if(s < 60) return "just now";
  const m = Math.floor(s/60); if(m < 60) return `${m} min ago`;
  const h = Math.floor(m/60); if(h < 24) return `${h} hr ago`;
  const d = Math.floor(h/24); return `${d} day${d===1?"":"s"} ago`;
}

const DT_STEPS = [
  { id:"grid",   label:"Bite map (heat + hotspots)" },
  { id:"tides",  label:"Tide predictions" },
  { id:"wp",     label:"Waypoints in range" },
  { id:"brief",  label:"AI Captain's Brief" },
  { id:"tiles",  label:"Map tiles for the area" },
];
function dtStepIcon(state){
  if(state==="ok")   return '<span style="color:#34d399">✓</span>';
  if(state==="warn") return '<span style="color:#fbbf24">!</span>';
  if(state==="skip") return '<span style="color:#7d9bb8">–</span>';
  if(state==="run")  return '<span class="alti-spinner" style="border-top-color:#7dd3fc;border-color:rgba(125,211,252,.3)"></span>';
  return '<span style="color:#3f5875">○</span>';
}
function dtSetStep(id, state, note){
  const el = document.getElementById(`dt-step-${id}`);
  if(!el) return;
  const ic = el.querySelector(".dt-step-ic"); const nt = el.querySelector(".dt-step-note");
  if(ic) ic.innerHTML = dtStepIcon(state);
  if(nt && note != null) nt.textContent = note;
}
function dtRenderProgress(){
  const body = document.getElementById("dt-body");
  if(!body) return;
  body.innerHTML = `
    <div style="padding:20px 20px 8px">
      <div class="dt-progress-title">Downloading your trip…</div>
      ${DT_STEPS.map(s => `
        <div id="dt-step-${s.id}" style="display:flex;align-items:center;gap:13px;padding:11px 0;border-bottom:1px solid rgba(107,191,234,.08)">
          <span class="dt-step-ic" style="width:20px;text-align:center;flex-shrink:0;font-weight:800;font-size:16px">${dtStepIcon("wait")}</span>
          <span style="flex:1;min-width:0">
            <span class="dt-step-label">${s.label}</span>
            <span class="dt-step-note">waiting…</span>
          </span>
        </div>`).join("")}
    </div>`;
}
function dtWhatGetsSavedHtml(){
  return `
    <div class="dt-what-box">
      <div class="dt-section-title">What Download My Trip saves</div>
      <ul class="dt-checklist">
        <li>Bite map scores &amp; hotspots for your species</li>
        <li>Tide predictions for your port</li>
        <li>Waypoints in range</li>
        <li>Captain's Brief (if you generated one)</li>
        <li>Chart tiles for your fishing area</li>
      </ul>
      <p class="dt-note">This is the full package for offshore. One download — reopen anytime, even with no signal.</p>
    </div>`;
}
function dtTileOnlyHtml(){
  return `
    <div class="dt-advanced">
      <div class="dt-section-title">Map tiles only (optional)</div>
      <p class="dt-body">Download My Trip already caches chart tiles for your fishing area. Use this section only if you want extra map background for a <b style="color:#e8f4ff">different</b> area you're viewing right now — chart imagery only, no bite data or tides.</p>
      <div class="dt-advanced-box">
        <div id="offline-state" class="dt-cache-state">Checking tile cache…</div>
        <div id="offline-size" class="dt-cache-size"></div>
        <button type="button" onclick="prefetchCurrentView()" id="offline-prefetch-btn" class="dt-secondary-btn" style="
          background:rgba(41,121,181,.18);border:1px solid rgba(41,121,181,.4);color:#7dd3fc;
        ">📥 Cache tiles for current map view</button>
        <button type="button" onclick="clearTileCache()" id="offline-clear-btn" class="dt-secondary-btn" style="
          background:rgba(220,38,38,.10);border:1px solid rgba(220,38,38,.3);color:#f87171;
        ">🗑 Clear tile cache</button>
      </div>
    </div>`;
}
function dtRender(){
  const body = document.getElementById("dt-body");
  if(!body) return;
  if(_dtBusy){ dtRenderProgress(); return; }
  const t = tripLoad();
  const online = (typeof BWI !== "undefined") ? BWI.online : navigator.onLine;
  const portReady = activePort && PORTS[activePort];
  const spReady = activeSpId && activeSpId !== "all";
  const spName = spReady ? ((SPECIES.find(s => s.id === activeSpId) || {}).name || activeSpId) : null;

  const canDownload = portReady && spReady && online;
  const readyLine = !online
    ? `<div class="dt-status dt-status-warn">You're offline — connect to download a new trip.</div>`
    : (!portReady
      ? `<div class="dt-status dt-status-warn">Pick a home port to enable download.</div>`
      : (!spReady
        ? `<div class="dt-status dt-status-warn">Pick a target species to enable download.</div>`
        : `<div class="dt-status dt-status-ok">Ready: <b style="color:#e8f4ff">${spName}</b> out of <b style="color:#e8f4ff">${activePort}</b></div>`));

  let savedBlock = "";
  if(t){
    const chips = [
      t.counts.heat ? `${t.counts.heat.toLocaleString()} bite cells` : null,
      t.counts.hotspots ? `${t.counts.hotspots} hotspots` : null,
      t.counts.waypoints ? `${t.counts.waypoints.toLocaleString()} waypoints` : null,
      t.counts.hasTides ? "tides" : null,
      t.counts.hasBrief ? "brief" : null,
    ].filter(Boolean).map(c => `<span class="dt-chip">${c}</span>`).join("");
    savedBlock = `
      <div class="dt-saved-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px">
          <div class="dt-saved-title">${t.speciesName} · ${t.port}</div>
          <span class="dt-saved-age">saved ${dtFmtAge(t.savedAtMs)}</span>
        </div>
        <div style="margin:8px 0 4px">${chips || '<span style="color:#7d9bb8;font-size:15px">Snapshot saved</span>'}</div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button onclick="dtOpenTrip()" class="dt-primary-btn" style="flex:1;min-width:160px;margin-top:0;padding:14px 16px;font-size:16px">Open this trip</button>
          <button onclick="dtConfirmClear()" class="dt-secondary-btn" style="flex:0 0 auto;min-width:100px;background:rgba(255,255,255,.06);border:1px solid rgba(255,120,120,.35);color:#fca5a5">Delete</button>
        </div>
      </div>`;
  }

  body.innerHTML = `
    <div style="padding:20px 20px 28px">
      <p class="dt-lead">Save everything for your run before you leave the dock. If you lose cell service offshore, open your saved trip and keep fishing with the same intel.</p>
      ${dtWhatGetsSavedHtml()}
      ${readyLine}
      <button onclick="dtDownload()" class="dt-primary-btn" ${canDownload ? "" : "disabled"}>
        ${t ? "⬇  Update this trip" : "⬇  Download this trip"}
      </button>
      ${savedBlock}
      ${dtTileOnlyHtml()}
      <p class="dt-footer">Stored privately on this device. Open a saved trip anytime — even in airplane mode — from MENU → My Tools → Download My Trip.</p>
    </div>`;
  dtRefreshOfflineUI();
}
function dtConfirmClear(){
  if(!confirm("Delete the saved trip from this device?")) return;
  tripClear();
  showToast("Saved trip deleted.", "info");
  dtRender();
}

// ── DIAGNOSTICS & ANALYTICS OPT-OUT ──────────────────────────────────────────
// Reflects the analytics opt-out checkbox and a one-line summary in the panel,
// and opens a simple read-only view of recent events + errors. Everything is
// local; nothing here transmits data.
function refreshDiagSummary(){
  if(typeof BWI === "undefined") return;
  const sum = document.getElementById("diag-summary");
  if(sum){
    const ev = BWI.dumpEvents().length;
    const er = BWI.dumpErrors().length;
    sum.textContent = `${ev} event${ev===1?"":"s"} · ${er} error${er===1?"":"s"} logged on this device`;
  }
}

function showDiagnostics(){
  if(typeof BWI === "undefined") return;
  const events = BWI.dumpEvents().slice(-40).reverse();
  const errors = BWI.dumpErrors().slice(-20).reverse();
  const fmt = (t) => new Date(t).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
  const evRows = events.length
    ? events.map(e => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <span style="color:#e8f4ff">${e.e}</span><span style="color:#7d9bb8;white-space:nowrap">${fmt(e.t)}</span></div>`).join("")
    : `<div style="color:#7d9bb8;font-size:12.5px;padding:6px 0">No events logged yet.</div>`;
  const erRows = errors.length
    ? errors.map(e => `<div style="font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <div style="color:#fca5a5;font-weight:600">${e.kind}: ${e.message||"(no message)"}</div>
        ${e.detail?`<div style="color:#7d9bb8;font-size:11px">${e.detail}</div>`:""}
        <div style="color:#5d96c4;font-size:11px">${fmt(e.t)}</div></div>`).join("")
    : `<div style="color:#86efac;font-size:12.5px;padding:6px 0">No errors — all clear.</div>`;

  let modal = document.getElementById("diag-modal");
  if(!modal){
    modal = document.createElement("div");
    modal.id = "diag-modal";
    modal.className = "fc-modal";
    modal.addEventListener("click",(e)=>{ if(e.target===modal) modal.classList.remove("open"); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-dialog" style="max-width:460px;max-height:82vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <span>Diagnostics</span>
        <button class="layers-close-btn" onclick="document.getElementById('diag-modal').classList.remove('open')" aria-label="Close">&times;</button>
      </div>
      <div style="padding:14px 16px;overflow-y:auto">
        <div style="font-size:12.5px;color:#9ec5e8;line-height:1.5;margin-bottom:12px">
          Stored on this device only. No location or personal data is included, and
          nothing is sent anywhere automatically.
        </div>
        <div style="font-size:13px;font-weight:700;color:#fb923c;letter-spacing:.05em;margin-bottom:4px">RECENT EVENTS</div>
        ${evRows}
        <div style="font-size:13px;font-weight:700;color:#f87171;letter-spacing:.05em;margin:14px 0 4px">ERRORS</div>
        ${erRows}
        <button onclick="BWI.clearEvents();BWI.clearErrors();showDiagnostics();refreshDiagSummary();" style="
          width:100%;margin-top:16px;background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.35);
          color:#f87171;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
          Clear all diagnostics
        </button>
      </div>
    </div>`;
  modal.classList.add("open");
  BWI.track("diag_open");
}

// ════════════════════════════════════════════════════════════════════════════
// PREDICTIVE HEAT MAP ENGINE
// Combines SST, chlorophyll, bathymetry, ocean currents/altimetry, recent catch
// reports, and Gulf Stream proximity to produce per-cell probability scores for
// the target species.
//
// The scoring runs client-side but reads ONLY real data — the ocean edge
// function serves live NASA/NOAA/ERDDAP grids (MUR SST, VIIRS chlorophyll,
// bathymetry, currents) which this engine scores. There is no synthetic data
// fallback: cells with no real input are left unscored rather than invented.
// ════════════════════════════════════════════════════════════════════════════

// Species temperature & habitat preferences (research-derived).
// depthBands is an array of [minMeters, maxMeters] ranges — a species
// is "in ideal depth" if its current location's depth falls inside ANY
// listed band. Most species have a single band; flexible species like
// bluefin tuna get multiple bands to capture their real-world variability
// (NC fall schoolies inshore + Mid-Atlantic giants offshore + canyon water).
// PREDICT_SPECIES_PREFS moved to bw-data-species.js (Approach A modularization)

// ════════════════════════════════════════════════════════════════════════════
// MARINE CLOSURES & PROTECTED AREAS
//
// Static spatial closures: National Marine Sanctuaries, no-take reserves,
// and Habitat Areas of Particular Concern (HAPCs). These are PERMANENT
// boundaries with stable coordinates — unlike seasonal closures which we
// link out to via the Regulations page (those change year-to-year).
//
// IMPORTANT DISCLAIMER: This data is for reference only and may be
// out of date. Always verify current regulations with the responsible
// agency (NOAA NMFS, state agencies, sanctuary office) before fishing.
//
// Polygons are simplified (5-15 vertices each) for performance. Real
// boundaries can be 50-200 vertices but the difference is invisible at
// fishing-relevant zoom levels.
//
// Type tags:
//   "sanctuary"  → National Marine Sanctuary (multiple-use, mostly open
//                  to fishing with gear/area restrictions)
//   "noTake"     → strict no-fishing reserves
//   "hapc"       → Habitat Area of Particular Concern (bottom-gear bans)
//   "closure"    → seasonal/conservation closures (rotating closed areas)
// ════════════════════════════════════════════════════════════════════════════
// MARINE_CLOSURES moved to bw-data-closures.js (Approach A modularization)

// ════════════════════════════════════════════════════════════════════════════
// MIGRATION PHASE
//
// Most coastal species have peak fishing months that shift with latitude due
// to migration. A bluefin tuna's peak in Cape Cod (lat 42°N) is months apart
// from its peak in Outer Banks (lat 35°N) — same fish following the same SST
// front, just arriving at different latitudes at different times.
//
// Rather than encode a season array per species × per port (hundreds of
// entries), we use two numbers per species:
//
//   refLat   — the latitude where the species' ENC_SPECIES.seasons array is
//              calibrated. Typically ~38°N (Mid-Atlantic) for East Coast
//              species, lower for tropical species.
//   latPhase — months the seasonal peak shifts per degree of latitude north.
//              0.4 = strongly migratory (bluefin), 0.0 = resident species.
//
// The scoring function looks up data from `seasons[shifted_month]` where
// shifted_month = current_month - (port_lat - refLat) * latPhase. For ports
// NORTH of refLat, we read from EARLIER months in the table (because the
// peak hasn't arrived yet; spring fishing peaks later at higher latitudes).
//
// Species not listed here get treated as latPhase: 0 (resident, no shift).
// ════════════════════════════════════════════════════════════════════════════
// MIGRATION_PHASE moved to bw-data-species.js (Approach A modularization)

// ════════════════════════════════════════════════════════════════════════════
// REGIONAL SEASONS
//
// For species whose fisheries differ FUNDAMENTALLY by region — not just
// shifted in time, but DIFFERENT in shape — a single curve + latitude phase
// shift can't capture reality. Example: striper trophy run hits NC/VA in
// Dec-Jan, but NJ stripers are GONE in those months (they're in NC).
// No latitude shift can encode "peak here in winter AND peak elsewhere in
// summer" because shifting one peak creates a false peak somewhere else.
//
// For these species, define per-region season curves. The scorer finds
// region(s) within range and blends them by inverse distance for smooth
// transitions. If no region matches, falls back to the default seasons +
// latitude shift path (so distant ports still get a reasonable answer).
//
// Format per region:
//   centerLat / centerLng — region center coordinates
//   radiusNm              — influence radius in nautical miles
//   seasons               — Jan-Dec values 0-3 (same scale as ENC_SPECIES)
// ════════════════════════════════════════════════════════════════════════════
// REGIONAL_SEASONS moved to bw-data-species.js (Approach A modularization)

// Returns a blended seasons curve for the given species at the given fishing
// cell location, OR null if the species has no regional seasons defined
// (caller should fall back to default + lat shift path).
// Uses inverse-distance weighting so transitions between regions are smooth.
function getRegionalSeasons(speciesId, lat, lng){
  const regions = REGIONAL_SEASONS[speciesId];
  if(!regions || regions.length === 0) return null;
  // Find regions within their influence radius, weighted by inverse distance
  const matches = [];
  for(const r of regions){
    const distNm = nmBetween(lat, lng, r.centerLat, r.centerLng);
    if(distNm <= r.radiusNm){
      // Weight is higher for closer regions. Add small epsilon so a cell
      // exactly at a region center doesn't divide by zero.
      const weight = 1 / (distNm + 1);
      matches.push({region: r, weight});
    }
  }
  if(matches.length === 0) return null;
  // Blend: weighted average of each month's value across matching regions
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const totalWeight = matches.reduce((s, m) => s + m.weight, 0);
  const blended = {};
  for(const mName of months){
    let v = 0;
    for(const m of matches){
      v += (m.region.seasons[mName] || 0) * m.weight;
    }
    blended[mName] = v / totalWeight;
  }
  return blended;
}

// Ocean data helpers — date math for satellite tiles plus the real-data
// resolvers the scoring engine reads. No synthetic generators remain here.

// ── NASA GIBS DATE HELPER ──
// Returns a YYYY-MM-DD (UTC) date string for use in GIBS tile URLs. Defaults to
// 1 day back (these products usually publish within ~24h). The exact freshest
// date is resolved at runtime by ensureFreshestSatDates() below — this helper is
// just the date-math. If you want today's data, pass 0; for yesterday, 1.
function gibsRecentDate(daysBack){
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (typeof daysBack === "number" ? daysBack : 1));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// SST is sourced ONLY from real data (MUR grid + NDBC buoy hybrid via the ocean
// backend), resolved in scoreCell as: cell's own real sample → nearest real
// sample → regional real median → null. The old synthSST/synthDepth/thermalBreak
// synthetic models were removed — no fabricated SST anywhere. Thermal breaks are
// measured from the real SST grid/field by thermalBreakReal/thermalBreakGrid.

// ── Freshest-available GIBS date resolver ──
// GIBS 404s (image onerror) for dates it hasn't published yet, and serves a real
// 200 tile (even if transparent over a swath gap) for dates it HAS. We probe a
// low-zoom tile for today, then step back day-by-day, and use the most recent
// date whose tile actually exists. Nothing is fabricated: if the freshest real
// imagery is still a couple days old, that real date is what we resolve + display.
const _gibsDateCache = {}; // layerId -> { date, daysBack, atMs }
function probeGibsTile(layerId, tileSet, ext, date){
  return new Promise((resolve) => {
    // A low-zoom (z2) tile so any published date returns a real (200) tile.
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerId}/default/${date}/${tileSet}/2/1/1.${ext}`;
    const img = new Image();
    let settled = false;
    const done = (ok) => { if(settled) return; settled = true; resolve(ok); };
    img.onload  = () => done(true);   // date is published
    img.onerror = () => done(false);  // 404 — not published yet
    setTimeout(() => done(false), 4500); // network stall → treat as unavailable
    img.src = url;
  });
}
// Resolve the freshest published date for one layer, trying today..maxBack days
// back. Cached ~30 min. Returns { date, daysBack, atMs }; atMs===0 means the
// probe could not confirm anything (e.g. offline) and the caller should keep its
// conservative default.
async function resolveFreshestGibsDate(layerId, tileSet, ext, maxBack){
  const cap = (typeof maxBack === "number") ? maxBack : 3;
  const hit = _gibsDateCache[layerId];
  if(hit && Date.now() - hit.atMs < 30 * 60 * 1000) return hit;
  for(let b = 0; b <= cap; b++){
    const date = gibsRecentDate(b);
    /* eslint-disable no-await-in-loop */
    const ok = await probeGibsTile(layerId, tileSet, ext, date);
    if(ok){
      const res = { date, daysBack: b, atMs: Date.now() };
      _gibsDateCache[layerId] = res;
      return res;
    }
  }
  return { date: gibsRecentDate(1), daysBack: 1, atMs: 0 }; // unconfirmed — keep default
}
// Re-point an SST/chlor overlay to the current date. A visible layer crossfades
// smoothly to the new date; a hidden one is just rebuilt so it carries the right
// date the moment it's toggled on (toggleLayer reuses the stored layer object).
function refreshSatLayerDate(which){
  const visible = (typeof layerVis !== "undefined") && layerVis[which];
  if(visible && typeof crossfadeLayer === "function"){ crossfadeLayer(which); return; }
  if(which === "sst"   && typeof window.buildSstLayer   === "function") sstLayer   = window.buildSstLayer(satDayOffset);
  if(which === "chlor" && typeof window.buildChlorLayer === "function") chlorLayer = window.buildChlorLayer(satDayOffset);
}
// Probe SST (MUR L4 1km) + chlor (VIIRS NOAA-20), tighten SAT_FRESH_BACK/DATE to
// the freshest confirmed date, re-point the overlays to it, and refresh the label.
let _ensuringFreshDates = false;
async function ensureFreshestSatDates(){
  if(_ensuringFreshDates) return;
  _ensuringFreshDates = true;
  try {
    const [sst, chl] = await Promise.all([
      resolveFreshestGibsDate("GHRSST_L4_MUR_Sea_Surface_Temperature", "GoogleMapsCompatible_Level7", "png", 3),
      resolveFreshestGibsDate("VIIRS_NOAA20_Chlorophyll_a", "GoogleMapsCompatible_Level7", "png", 3),
    ]);
    let sstChanged = false, chlChanged = false;
    if(sst && sst.atMs){ sstChanged = SAT_FRESH_BACK.sst   !== sst.daysBack; SAT_FRESH_BACK.sst   = sst.daysBack; SAT_FRESH_DATE.sst   = sst.date; }
    if(chl && chl.atMs){ chlChanged = SAT_FRESH_BACK.chlor !== chl.daysBack; SAT_FRESH_BACK.chlor = chl.daysBack; SAT_FRESH_DATE.chlor = chl.date; }
    // Only re-point when viewing the freshest frame (satDayOffset 0); if the user
    // has stepped back in history, leave their chosen frame alone.
    if(satDayOffset === 0){
      if(sstChanged) refreshSatLayerDate("sst");
      if(chlChanged) refreshSatLayerDate("chlor");
    }
    if(typeof updateSatDateDisplay === "function") updateSatDateDisplay();
  } catch(e){ /* leave conservative defaults in place */ }
  finally { _ensuringFreshDates = false; }
}

// Reports proximity boost — looks at SOCIAL feed if recent posts mention nearby canyons/spots
function reportsBoost(lat, lng, speciesId){
  // Real first-party community reports only (SOCIAL is loaded de-identified from
  // the backend). Only reports that include an approximate location move the score;
  // region-only forum chatter shows in the forum but carries no spatial signal.
  if(!Array.isArray(SOCIAL) || !SOCIAL.length) return 0;
  let boost = 0;
  for(const p of SOCIAL){
    if(p.lat == null || p.lng == null) continue;
    // Species match when the post specifies a species; species-less posts apply to all.
    if(p.species && p.species.length && speciesId && !p.species.includes(speciesId)) continue;
    // ── Recency decay (~8.3hr half-life): 2h ≈ full, 12h ≈ 37%, 24h ≈ 14%. ──
    const hoursAgo = (typeof p.hoursAgo === "number") ? p.hoursAgo : 999;
    if(hoursAgo > 72) continue;  // older than 3 days: no longer actionable
    const recency = Math.exp(-hoursAgo / 12);
    const distNm = (typeof nmBetween === "function")
      ? nmBetween(lat, lng, p.lat, p.lng)
      : Math.sqrt((p.lat-lat)**2 + (p.lng-lng)**2) * 60;  // fallback ~nm
    let contribution = 0;
    if(distNm < 24) contribution = 0.20;
    else if(distNm < 48) contribution = 0.10;
    else if(distNm < 90) contribution = 0.05;
    boost += contribution * recency;
  }
  return Math.min(boost, 0.35);
}

// ── CORE SCORING FUNCTION ────────────────────────────────────────────────────
// Barometric pressure trend comes ONLY from real NDBC buoy data (the ocean
// backend computes latest-minus-~24h pressure). No synthetic pressure model.

// ── Moon phase (0 = new, 0.5 = full, 1 = new again) ────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// FORECAST TIME OFFSET
//
// Lets the user preview predictions for a future point in time — typically
// when they're planning tomorrow's trip or checking conditions at dawn for
// today's outing. The offset is in HOURS from "now" (0=now, 12=+12h, etc.).
//
// All time-dependent modeling functions (moon phase, tide stage, pressure
// trend, wind direction, weather change) use forecastTimeMs() instead of
// Date.now() so they update coherently when the user picks a forecast time.
//
// Astronomical values (moon phase, tide, solunar) are GENUINELY correct
// for the forecast time — those are deterministic calculations.
//
// Environmental values (SST, wind, pressure, wave) come from real sources via
// the ocean data function (NDBC buoys + Open-Meteo forecast + ERDDAP grids);
// the same offset selects the forecast hour. When a real value isn't available
// it is withheld and labeled — never synthesized.
// ════════════════════════════════════════════════════════════════════════════
let FORECAST_HOUR_OFFSET = 0;  // 0=now, 12=+12h, 24=+24h. Drives the BITE SCORE
                               // forecast (weather/tide/solunar/pressure — all
                               // reliably forecast via Open-Meteo + deterministic
                               // astronomy). The ocean MAP overlays stay observed
                               // (see OCEAN_OVERLAY_FORECAST_ENABLED below).

function normalizeForecastHour(hours){
  // Snap the requested lead time to the supported horizons (0 / 12 / 24 h). The
  // bite forecast reads real Open-Meteo forecast weather + deterministic tide/
  // solunar/moon at this offset — SST/chlorophyll hold at the latest observation
  // (they move little over a day), so a future bite score is trustworthy.
  const h = Number(hours);
  if(!isFinite(h) || h <= 0) return 0;
  if(h <= 6)  return 0;
  if(h <= 18) return 12;
  return 24;
}

// The ocean MAP overlays (SST tiles, currents field, altimetry) are OBSERVED-ONLY:
// the RTOFS model at lead time referenced to a local box mean was not comparable
// to the observed products and painted false eddies / large false SST swings. So
// the overlays ignore FORECAST_HOUR_OFFSET even when the bite forecast uses it.
// Flip to true only if a trustworthy gridded ocean forecast is wired up.
const OCEAN_OVERLAY_FORECAST_ENABLED = false;
function oceanOverlayForecastHour(){
  return OCEAN_OVERLAY_FORECAST_ENABLED ? (FORECAST_HOUR_OFFSET || 0) : 0;
}

function forecastTimeMs(){
  return Date.now() + FORECAST_HOUR_OFFSET * 3600 * 1000;
}

// ── Local time for forecast UI ───────────────────────────────────────────────
// Bite-score times follow the selected home port when set; otherwise the user's
// GPS fix; otherwise the browser timezone. Longitude buckets cover US fishing
// coasts without pulling in a timezone library.
let _userGeoTz = null;  // { lat, lng, tz } from a one-shot geolocation read

function ianaTimezoneForCoords(lat, lng){
  if(lng == null || !Number.isFinite(lng)) return null;
  if(lat != null && lng < -154 && lat >= 18 && lat <= 23) return "America/Honolulu";
  if(lng < -125) return "America/Los_Angeles";
  if(lng < -115) return "America/Denver";
  if(lng < -90) return "America/Chicago";
  return "America/New_York";
}

function displayTimezone(){
  if(typeof activePort !== "undefined" && activePort && typeof PORTS !== "undefined" && PORTS[activePort]){
    const p = PORTS[activePort];
    const tz = ianaTimezoneForCoords(p.lat, p.lng);
    if(tz) return tz;
  }
  if(_userGeoTz && _userGeoTz.tz) return _userGeoTz.tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch(e){
    return "UTC";
  }
}

function calendarDayKeyInTz(ms, tz){
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
}

function nextCalendarDayKeyInTz(nowMs, tz){
  const today = calendarDayKeyInTz(nowMs, tz);
  for(let h = 20; h <= 36; h++){
    const k = calendarDayKeyInTz(nowMs + h * 3600000, tz);
    if(k !== today) return k;
  }
  return today;
}

function formatTimeInTz(ms, tz){
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(ms));
}

function formatWeekdayInTz(ms, tz){
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short",
  }).format(new Date(ms));
}

function initUserGeoTimezone(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      _userGeoTz = { lat, lng, tz: ianaTimezoneForCoords(lat, lng) };
      if(typeof updateBiteBanner === "function") updateBiteBanner();
      if(typeof updateForecastSliderDisplay === "function") updateForecastSliderDisplay();
      if(typeof updateWindForecastDisplay === "function") updateWindForecastDisplay();
    },
    () => {},
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}

// Forecast horizons with labels for UI
const FORECAST_OPTIONS = [
  { hours:  0, label: "Now",   short: "Now"   },
  { hours: 12, label: "+12 h", short: "+12h"  },
  { hours: 24, label: "+24 h", short: "+24h"  },
];

// Returns a human-readable date/time for the forecast moment
// (e.g. "Today 5:30 PM" or "Tomorrow 8:00 AM" or "Thu 6:00 AM").
function forecastTimeDisplay(hoursOverride){
  const lead = (typeof hoursOverride === "number") ? hoursOverride : FORECAST_HOUR_OFFSET;
  const ms = Date.now() + lead * 3600 * 1000;
  const nowMs = Date.now();
  const tz = displayTimezone();
  const time = formatTimeInTz(ms, tz);
  const todayKey = calendarDayKeyInTz(nowMs, tz);
  const targetKey = calendarDayKeyInTz(ms, tz);
  if(targetKey === todayKey) return `Today ${time}`;
  if(targetKey === nextCalendarDayKeyInTz(nowMs, tz)) return `Tomorrow ${time}`;
  return `${formatWeekdayInTz(ms, tz)} ${time}`;
}

// Map Captain's Brief day (0=today, 1=tomorrow) to bite-score forecast lead.
function forecastHourForBriefDay(dayOffset){
  return (dayOffset >= 1) ? 24 : 0;
}

// Run a callback with FORECAST_HOUR_OFFSET temporarily set; restores on exit.
function withForecastHour(hours, fn){
  const prev = FORECAST_HOUR_OFFSET;
  FORECAST_HOUR_OFFSET = normalizeForecastHour(hours);
  try { return fn(); }
  finally { FORECAST_HOUR_OFFSET = prev; }
}

// Captain-facing note when bite forecast is ahead of now but SST/chlor stay observed.
function forecastOceanFieldsDisclaimer(){
  if(!FORECAST_HOUR_OFFSET) return "";
  return "SST & chlorophyll use the latest satellite pass; wind, tide, pressure & solunar are forecasted for this time.";
}

// Shared captain vocabulary — bite breakdown, map layers & tutorial use the same words.
const BITE_FACTOR_TEMP_BREAK = "Temperature break";
const BITE_FACTOR_FRONT_CONVERGENCE = "Front convergence";
const MAP_LAYER_FRONT_CONVERGENCE = "Front Convergence (SSH)";
const MAP_CONVERGENCE_DATE_LABEL = "Convergence Date";

function biteForecastTimeLabel(){
  if(!FORECAST_HOUR_OFFSET) return "Now";
  const opt = FORECAST_OPTIONS.find(o => o.hours === FORECAST_HOUR_OFFSET);
  return opt ? opt.short : `+${FORECAST_HOUR_OFFSET}h`;
}

function windBiteTimesMisaligned(){
  return !!layerVis.predict && WIND_FORECAST_HOUR !== FORECAST_HOUR_OFFSET;
}

function windBiteTimeMismatchHtml(){
  if(!windBiteTimesMisaligned()) return "";
  const biteLbl = biteForecastTimeLabel();
  const windLbl = windForecastLabel(WIND_FORECAST_HOUR);
  return `<div style="margin-top:5px;padding:5px 8px;border-radius:6px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);font-size:9px;color:#fde68a;line-height:1.4">
    <b style="color:#fbbf24">Times differ:</b> Bite score ${biteLbl} · Wind layer ${windLbl}
  </div>`;
}

function updateWindBiteSyncHints(){
  const hint = document.getElementById("wind-bite-sync-hint");
  if(!hint) return;
  if(layerVis.predict && windBiteTimesMisaligned()){
    hint.textContent = `Bite score: ${biteForecastTimeLabel()} — times differ`;
    hint.style.color = "#fbbf24";
  } else if(layerVis.predict && FORECAST_HOUR_OFFSET > 0){
    hint.textContent = `Bite score: ${biteForecastTimeLabel()}`;
    hint.style.color = "#9ec5e8";
  } else {
    hint.textContent = "GFS/HRRR blend · 3-hour steps";
    hint.style.color = "";
  }
}

function moonPhase(){
  // Reference new moon: Jan 6 2000 18:14 UTC. Synodic period: 29.53059 days.
  const refNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const synodic = 29.530588853 * 24 * 3600 * 1000;
  const phase = ((forecastTimeMs() - refNewMoon) % synodic) / synodic;
  return phase;
}

// ── MOON PHASE SCORE ──
// Independent of solunar (which is intra-day moon transit timing). This factor
// captures the multi-day lunar influence on feeding:
//   • FULL moon  (phase ~0.5) → max bite. Spring tides + full moonlight at night
//     drive aggressive feeding cycles. Tarpon/striper/snook anglers swear by it.
//   • NEW moon   (phase ~0/1) → strong bite. Spring tides too; darker nights
//     embolden ambush predators that avoid bright light.
//   • QUARTER moons (phase ~0.25 / 0.75) → weakest. Neap tides; modest currents.
// Returns 0-1.
function moonPhaseScore(){
  const phase = moonPhase();
  // cos(2*PI*phase) is 1 at new/full, -1 at quarters. abs() folds it to 0-1
  // peaking at 0 and 0.5. We rescale to put baseline at 0.25 (quarter moons
  // still produce SOME bite, just not as strong) and peak at 1.0.
  const raw = Math.abs(Math.cos(2 * Math.PI * phase));
  return 0.25 + 0.75 * raw;
}

// ── Solunar major/minor period detection ───────────────────────────────────
// Major periods: moon transit (overhead/underfoot). Minor periods: moonrise/set.
// Each major lasts ~2 hours, each minor ~1 hour. Returns 0-1 score representing
// how strong the current solunar window is.
function solunarScore(lat, lng){
  // Approximate moon transit time using lunar age + solar noon
  const phase = moonPhase();
  const now = new Date(forecastTimeMs());
  const hourLocal = now.getUTCHours() + lng/15 + now.getUTCMinutes()/60;
  // Moon transits about (12 + 24*phase) hours after midnight at the lng meridian
  const transitHour = (12 + 24 * phase) % 24;
  const oppositeTransit = (transitHour + 12) % 24;
  // Distance to nearest major (transit or opposite transit)
  const distToMajor = Math.min(
    Math.abs(hourLocal - transitHour),
    Math.abs(hourLocal - oppositeTransit),
    Math.abs(hourLocal - transitHour - 24),
    Math.abs(hourLocal - oppositeTransit - 24)
  );
  // Distance to nearest minor (moonrise/moonset, ~6 hours from transit)
  const minor1 = (transitHour + 6) % 24;
  const minor2 = (transitHour - 6 + 24) % 24;
  const distToMinor = Math.min(
    Math.abs(hourLocal - minor1),
    Math.abs(hourLocal - minor2),
    Math.abs(hourLocal - minor1 - 24),
    Math.abs(hourLocal - minor2 - 24)
  );
  // Build score: 1.0 during major (within 1hr), 0.6 during minor, fade out otherwise
  let score = 0;
  if(distToMajor < 1) score = Math.max(score, 1.0 - distToMajor * 0.3);
  else if(distToMajor < 2) score = Math.max(score, 0.7 - (distToMajor-1) * 0.3);
  if(distToMinor < 1) score = Math.max(score, 0.6 - distToMinor * 0.2);
  else if(distToMinor < 1.5) score = Math.max(score, 0.4);
  // New and full moons amplify everything (~bigger tides, more feeding activity)
  const phaseBoost = (Math.abs(phase - 0.5) < 0.08 || phase < 0.08 || phase > 0.92) ? 0.15 : 0;
  return Math.min(1.0, score + phaseBoost);
}

// Tide stage and wind direction come ONLY from real data: tide from NOAA CO-OPS
// and wind from NDBC buoys / forecast model, both via the ocean backend. The old
// synthetic semi-diurnal tide model and rotating-wind model were removed — no
// fabricated tide or wind anywhere; missing values resolve to "no data".

// ════════════════════════════════════════════════════════════════════════════
// REAL WIND FIELD — single source of truth for the animated wind layer.
//
// Returns {u, v, speedKts, dirDeg} at a given location from REAL ocean-feed
// wind observations sampled across the visible map. No synthetic fallback:
// if the feed has no speed+direction, the layer stays empty and labels that.
// ════════════════════════════════════════════════════════════════════════════
let WIND_FIELD = { samples: [], builtAtMs: 0, status: "idle", seq: 0, boundsKey: "", forecastHour: 0 };
let WIND_FORECAST_HOUR = 0;

function windStatusLabel(){
  if(WIND_FIELD.status === "loading") return "loading real wind...";
  const t = WIND_FIELD.forecastHour ? `+${WIND_FIELD.forecastHour}h` : "now";
  if(WIND_FIELD.status === "live") return `forecast model · ${t}`;
  if(WIND_FIELD.status === "cached") return `cached forecast · ${t}`;
  if(WIND_FIELD.status === "unavailable") return "real wind unavailable";
  return "real wind";
}

function windForecastLabel(hours){
  const h = Math.max(0, Math.min(96, Math.round(Number(hours)||0)));
  if(h === 0) return "Current";
  return `+${h}h`;
}

function windForecastDateParts(hours){
  const h = Math.max(0, Math.min(96, Math.round(Number(hours)||0)));
  if(h === 0) return { date: "Current", time: "" };
  const ms = Date.now() + h * 3600000;
  const tz = displayTimezone();
  return {
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", month: "short", day: "numeric",
    }).format(new Date(ms)),
    time: formatTimeInTz(ms, tz),
  };
}

function updateWindForecastDisplay(){
  const parts = windForecastDateParts(WIND_FORECAST_HOUR);
  const pill = document.getElementById("wind-forecast-display-pill");
  if(pill){
    pill.textContent = WIND_FORECAST_HOUR === 0
      ? "Current"
      : `${parts.date} · ${parts.time || windForecastLabel(WIND_FORECAST_HOUR)}`;
  }
  const label = document.getElementById("wind-forecast-display");
  if(label) label.textContent = windForecastLabel(WIND_FORECAST_HOUR);
  const slider = document.getElementById("wind-forecast-input");
  if(slider){
    const pos = Math.round(WIND_FORECAST_HOUR / 3);
    if(+slider.value !== pos) slider.value = pos;
  }
  const prev = document.getElementById("wind-prev-btn");
  const next = document.getElementById("wind-next-btn");
  if(prev) prev.disabled = WIND_FORECAST_HOUR <= 0;
  if(next) next.disabled = WIND_FORECAST_HOUR >= 96;
  updateWindBiteSyncHints();
}

function onWindSliderInput(val){ setWindForecastHour((val|0) * 3); }

function updateWindForecastSliderVisibility(){
  const box = document.getElementById("wind-forecast-slider");
  if(!box) return;
  box.style.display = layerVis.wind ? "block" : "none";
  if(layerVis.wind) updateWindForecastDisplay();
  restackBottomControls();
}

function setWindForecastHour(hours){
  WIND_FORECAST_HOUR = Math.max(0, Math.min(96, Math.round((Number(hours)||0) / 3) * 3));
  updateWindForecastDisplay();
  if(layerVis.predict && typeof updateBiteBanner === "function") updateBiteBanner();
  if(windLayer && layerVis.wind && typeof windLayer.refreshForecast === "function"){
    windLayer.refreshForecast();
  }
}

function stepWindForecast(delta){ setWindForecastHour(WIND_FORECAST_HOUR + delta); }

// ── Fixed wind GRID (Windy-style) ────────────────────────────────────────────
// Wind is rendered from a fixed-resolution geographic grid fetched once per
// region and cached, NOT re-sampled per viewport. Because the grid is fixed
// absolute data, the field is IDENTICAL at every zoom/pan (no colour jumping,
// no IDW "blobs") and re-renders instantly from cache. Each node stores the
// real GFS wind as u/v (m/s) so bilinear interpolation is smooth.
let WIND_GRID = null;

function applyWindGrid(data){
  WIND_GRID = null;
  if(!data || !Array.isArray(data.rows) || !data.rows.length || !window.BW_WIND) return;
  const step = data.stepDeg || 0.25;
  let mnLa=Infinity,mxLa=-Infinity,mnLn=Infinity,mxLn=-Infinity;
  for(const r of data.rows){ const la=r[0],ln=r[1]; if(la<mnLa)mnLa=la; if(la>mxLa)mxLa=la; if(ln<mnLn)mnLn=ln; if(ln>mxLn)mxLn=ln; }
  const nLat=Math.max(1,Math.round((mxLa-mnLa)/step)+1);
  const nLng=Math.max(1,Math.round((mxLn-mnLn)/step)+1);
  const u=new Float32Array(nLat*nLng).fill(NaN);
  const v=new Float32Array(nLat*nLng).fill(NaN);
  const gust=new Float32Array(nLat*nLng).fill(NaN);
  for(const r of data.rows){
    const vec = window.BW_WIND.vectorFromObservation({ value:r[2], dir:r[3] });
    if(!vec) continue;
    const i=Math.round((r[0]-mnLa)/step), j=Math.round((r[1]-mnLn)/step);
    if(i>=0&&i<nLat&&j>=0&&j<nLng){
      u[i*nLng+j]=vec.u; v[i*nLng+j]=vec.v;
      if(r.length>4 && Number.isFinite(r[4])) gust[i*nLng+j]=r[4];
    }
  }
  WIND_GRID = { step, minLat:mnLa, minLng:mnLn, nLat, nLng, u, v, gust,
    bounds:{ s:mnLa, n:mxLa, w:mnLn, e:mxLn },
    hour:(data.hour!=null ? data.hour : WIND_FORECAST_HOUR) };
}

// Does the cached grid box fully contain the current view? If so we can reuse it
// (no refetch) — the field then stays identical through pans/zooms inside it.
function windGridCoversView(view){
  const g = WIND_GRID; if(!g) return false;
  return g.bounds.s <= view.getSouth()+1e-9 && g.bounds.n >= view.getNorth()-1e-9
      && g.bounds.w <= view.getWest()+1e-9  && g.bounds.e >= view.getEast()-1e-9;
}

const _WIND_MS_TO_KT = 1.943844;
function getWindField(lat, lng){
  const g = WIND_GRID; if(!g || !g.nLat) return null;
  const fi=(lat-g.minLat)/g.step, fj=(lng-g.minLng)/g.step;
  if(fi < -0.001 || fj < -0.001 || fi > g.nLat-1+0.001 || fj > g.nLng-1+0.001) return null;
  const i0=Math.max(0,Math.min(g.nLat-2,Math.floor(fi)));
  const j0=Math.max(0,Math.min(g.nLng-2,Math.floor(fj)));
  const di=Math.max(0,Math.min(1,fi-i0)), dj=Math.max(0,Math.min(1,fj-j0));
  const idx=(i,j)=>i*g.nLng+j;
  // Bilinear over the (up to 4) corners that have data — NaN corners (land / no
  // model value) are skipped so the field stays continuous along coastlines.
  let su=0,sv=0,sw=0;
  const corners=[[i0,j0,(1-di)*(1-dj)],[i0,j0+1,(1-di)*dj],[i0+1,j0,di*(1-dj)],[i0+1,j0+1,di*dj]];
  for(const c of corners){
    const ci=c[0], cj=c[1], wt=c[2];
    if(ci<0||cj<0||ci>=g.nLat||cj>=g.nLng) continue;
    const uu=g.u[idx(ci,cj)], vv=g.v[idx(ci,cj)];
    if(!isFinite(uu)||!isFinite(vv)) continue;
    su+=uu*wt; sv+=vv*wt; sw+=wt;
  }
  if(sw<=0) return null;
  const u=su/sw, v=sv/sw;
  const speedKts=Math.hypot(u,v)*_WIND_MS_TO_KT;
  const dirTo=(Math.atan2(u,v)*180/Math.PI+360)%360;
  // Gust: bilinear max of the (up to 4) valid gust corners, matches speed interp
  let gustKts=null;
  if(g.gust){
    let sgust=0,sgw=0;
    for(const c of corners){
      const ci=c[0],cj=c[1],wt=c[2];
      if(ci<0||cj<0||ci>=g.nLat||cj>=g.nLng) continue;
      const gg=g.gust[idx(ci,cj)];
      if(!isFinite(gg)) continue;
      sgust+=gg*wt; sgw+=wt;
    }
    if(sgw>0) gustKts=sgust/sgw;
  }
  return { u, v, speedKts, dirDeg:(dirTo+180)%360, gustKts, sources:1 };
}

// Snap a raw degree step to a fixed "nice" ladder so the wind sampling lattice
// only changes with ZOOM, never with pan. Keeping the step on a fixed ladder is
// what lets the absolute lattice below stay aligned across map moves.
function windLatticeStep(){
  // NESTED ladder: every step is 2x the previous, so a coarser lattice's points
  // are a strict SUBSET of a finer one's. Combined with the absolute alignment in
  // windSampleGridForMap, zooming then keeps the existing sample points and only
  // ADDS detail between them, instead of re-sampling at shifted locations. That
  // stops the wind field from visibly changing as you zoom in/out. Finest 0.1°
  // (~the GFS model resolution — finer buys nothing). Based on the E-W span, which
  // is pan-invariant at a given zoom, so panning never changes the step.
  const LADDER = [0.1, 0.2, 0.4, 0.8, 1.6, 3.2];
  const spanLng = MAP ? (MAP.getBounds().getEast() - MAP.getBounds().getWest()) : 1.5;
  const target = spanLng / 10;   // ~10 samples across the view
  for(const s of LADDER){ if(s >= target) return s; }
  return LADDER[LADDER.length - 1];
}

// Wind samples are taken on a FIXED geographic lattice (absolute multiples of a
// zoom-derived step), NOT by slicing the live viewport. Previously the grid was
// divided from the current bounds, so every sample point moved with the map and
// a fixed location (e.g. Norfolk Canyon) was interpolated from a DIFFERENT set
// of points after a pan — making its displayed/forecast wind change just from
// scrolling. Anchoring to an absolute lattice means the same location always
// keeps the same surrounding samples (until you zoom), so the wind it shows is
// stable under panning.
function windSampleGridForMap(){
  if(!MAP) return [];
  const b = MAP.getBounds().pad(0.18);
  const step = windLatticeStep();
  const iLatMin = Math.floor(b.getSouth() / step), iLatMax = Math.ceil(b.getNorth() / step);
  const iLngMin = Math.floor(b.getWest()  / step), iLngMax = Math.ceil(b.getEast()  / step);
  const pts = [];
  for(let i = iLatMin; i <= iLatMax; i++){
    const lat = +(i * step).toFixed(4);
    for(let j = iLngMin; j <= iLngMax; j++){
      const lng = +(j * step).toFixed(4);
      if(typeof isFishableWater === "function" && !isFishableWater(lat, lng)) continue;
      pts.push([lat, lng]);
    }
  }
  return pts;
}

async function buildWindFieldForMap(){
  const seq = ++WIND_FIELD.seq;
  if(typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchWindGrid || !window.BW_WIND || !MAP){
    WIND_GRID = null;
    WIND_FIELD = { samples: [], builtAtMs: Date.now(), status: "unavailable", seq, boundsKey: "", forecastHour: WIND_FORECAST_HOUR };
    updateOceanLegend();
    return WIND_FIELD;
  }

  // REUSE the cached grid when it still covers the view and the forecast hour is
  // unchanged — this is what makes the wind field hold steady (and render
  // instantly) through pans and zooms instead of re-fetching/re-sampling.
  const view = MAP.getBounds();
  if(WIND_GRID && WIND_GRID.hour === WIND_FORECAST_HOUR && windGridCoversView(view)){
    if(WIND_FIELD.status !== "live"){ WIND_FIELD.status = "live"; updateOceanLegend(); }
    return WIND_FIELD;
  }

  WIND_FIELD.status = "loading";
  updateOceanLegend();
  // Fetch a GENEROUS box (≈3× the view) so subsequent pans and zoom-ins stay
  // inside the cached grid — the field then holds steady without refetching.
  // (One request; the server caches and auto-picks resolution for the box.)
  const b = view.pad(1.0);
  const data = await BW_OCEAN.fetchWindGrid(b.getSouth(), b.getNorth(), b.getWest(), b.getEast(), WIND_FORECAST_HOUR);
  if(seq !== WIND_FIELD.seq) return WIND_FIELD;
  applyWindGrid(data);
  WIND_FIELD = {
    samples: [],
    builtAtMs: Date.now(),
    status: WIND_GRID ? "live" : "unavailable",
    forecastHour: WIND_FORECAST_HOUR,
    seq,
    boundsKey: WIND_GRID ? `${WIND_GRID.bounds.s},${WIND_GRID.bounds.n},${WIND_GRID.bounds.w},${WIND_GRID.bounds.e}` : "",
    stepDeg: WIND_GRID ? WIND_GRID.step : 0,
  };
  updateOceanLegend();
  return WIND_FIELD;
}
function windScore(lat, lng, speciesPrefs, windDir){
  // windDir is the REAL wind direction (degrees FROM) from the nearest NDBC buoy,
  // passed in from the ocean field. No real observation → neutral (we never
  // synthesize a direction).
  if(windDir == null || !isFinite(windDir)) return 0.5;
  // Onshore wind on the East Coast = wind FROM the east (~45° to 135°).
  // Offshore wind = FROM the west (~225° to 315°).
  const isOnshore = (windDir >= 45 && windDir <= 135);
  const isOffshore = (windDir >= 225 && windDir <= 315);
  // Offshore species generally prefer some onshore wind (stacks bait against structure)
  // but not too strong; light onshore is ideal.
  // Inshore species like calm or light offshore wind (clearer water).
  // A species counts as "inshore" if its deepest preferred band tops out below 50m.
  const deepestMax = (speciesPrefs.depthBands || [[0,2000]]).reduce((m, b) => Math.max(m, b[1]), 0);
  const isInshore = deepestMax < 50;
  if(isInshore){
    if(isOffshore) return 0.85;
    if(isOnshore)  return 0.40;  // too much wave action inshore
    return 0.70;                  // calm or cross
  } else {
    if(isOnshore)  return 0.85;
    if(isOffshore) return 0.50;  // can scatter bait offshore
    return 0.70;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PER-CATEGORY WEIGHT TABLES
//
// Different species categories live in fundamentally different ecosystems, so
// the algorithm uses different weighting for each. Key principles:
//
// OFFSHORE (canyon/bluewater pelagics): Gulf Stream proximity is dominant,
// chlorophyll edges matter, tide barely matters (deep water moves on currents
// not tides), weather change peaks 24-72h post-front.
//
// NEARSHORE (reef/wreck/structure 30-200ft): Wind direction is huge (stacks
// bait against structure), temperature and structure dominate, Gulf Stream
// has indirect effect via warm-water push but not direct. Tide matters more
// than offshore because shallower water moves with tide cycles.
//
// INSHORE (bays/sounds/<80ft): Tide is dominant — moving water makes the bite,
// solunar windows are huge for predators, Gulf Stream is COMPLETELY irrelevant
// (sheepshead never see it), and recent reports are less useful since
// inshore fishing is more dispersed across small craft.
//
// All weight tables sum to exactly 1.000.
// ════════════════════════════════════════════════════════════════════════════
// PREDICT_WEIGHTS moved to bw-data-species.js (Approach A modularization)

// Helper — return the appropriate weight table for a species
function predictWeightsFor(speciesId){
  const sp = (typeof SPECIES !== "undefined") ? SPECIES.find(s => s.id === speciesId) : null;
  const cat = sp ? sp.cat : "offshore";
  // Nearshore splits into two archetypes with opposite drivers: roving pelagics
  // (mackerel, albies, cobia) chase temp/bait/color edges, while reef/bottom
  // demersals (snapper, grouper, tog, AJ, sea bass, etc.) key on structure +
  // current. Route the demersal/bottom-flagged nearshore fish to the reef table.
  if(cat === "nearshore"){
    const prefs = (typeof PREDICT_SPECIES_PREFS !== "undefined") ? PREDICT_SPECIES_PREFS[speciesId] : null;
    if(prefs && (prefs.demersal || prefs.bottom)) return PREDICT_WEIGHTS.nearshoreReef;
  }
  return PREDICT_WEIGHTS[cat] || PREDICT_WEIGHTS.offshore;
}

// ── Recent weather change (24-48h shift) ───────────────────────────────────
// Fish RESET their patterns after a significant weather shift (cold front,
// storm, big temperature swing). Right after the change = scattered, slow bite.
// 24-72 hours after = best (fish re-orient, feed aggressively to recover).
// Steady conditions for many days = neutral.
// ════════════════════════════════════════════════════════════════════════════
// SCORE NORMALIZATION
//
// Maps the raw weighted-average score (which clusters in ~0.20-0.70 because
// secondary factors dilute the mean) onto the full 0-1 display range so the
// heat map and bite-score readouts use their whole dynamic range.
//
// Implemented as piecewise-linear interpolation through calibrated anchor
// points. Anchors derived from QA scenarios across FL/Gulf/Northeast:
//   raw 0.70 (perfect temp+depth+structure)  → 0.93  excellent / fiery red
//   raw 0.55 (strong)                         → 0.74  very good
//   raw 0.42 (typical "good" spot)            → 0.52  fair-good boundary
//   raw 0.28 (marginal)                       → 0.24  poor
//   raw 0.15 (off)                            → 0.07  very poor
//   raw 0.00 / 1.00 pinned to 0 / 1 (extremes preserved)
//
// Strictly monotonic increasing → preserves cell ranking exactly. We are
// only adjusting CONTRAST, never reordering which spots are best.
// ════════════════════════════════════════════════════════════════════════════
const _SCORE_ANCHORS = [
  [0.00, 0.00],
  [0.15, 0.07],
  [0.28, 0.24],
  [0.42, 0.52],
  [0.55, 0.74],
  [0.70, 0.93],
  [1.00, 1.00],
];
function normalizeScore(raw){
  if(raw <= 0) return 0;
  if(raw >= 1) return 1;
  const A = _SCORE_ANCHORS;
  for(let i = 1; i < A.length; i++){
    if(raw <= A[i][0]){
      const [x0, y0] = A[i-1];
      const [x1, y1] = A[i];
      const t = (raw - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return raw;  // unreachable (raw < 1 handled above)
}

// Real ocean field cache for the current heatmap render (coarse grid prefetch).
let OCEAN_FIELD = { samples: [], builtAtMs: 0 };

// Real bathymetry grid (NOAA CUDEM / BlueTopo on US coast, ETOPO fallback) for the
// active prediction area. Built once per port render and sampled per cell so depth
// reflects the ACTUAL shelf/break, not a static estimate.
let BATHY_GRID = null;
let PREDICT_BATHY_GRID = null;  // port-scoped bathy for bite scoring only — never clobbers map-wide depth

function _buildBathyGridFromRows(data){
  if(!data || !data.rows || !data.rows.length) return null;
  const step = data.stepDeg || 0.05;
  let mnLa = Infinity, mxLa = -Infinity, mnLn = Infinity, mxLn = -Infinity;
  for(const [la, ln] of data.rows){
    if(la < mnLa) mnLa = la; if(la > mxLa) mxLa = la;
    if(ln < mnLn) mnLn = ln; if(ln > mxLn) mxLn = ln;
  }
  const nLat = Math.max(1, Math.round((mxLa - mnLa) / step) + 1);
  const nLng = Math.max(1, Math.round((mxLn - mnLn) / step) + 1);
  const depth = new Float32Array(nLat * nLng).fill(NaN);
  for(const [la, ln, d] of data.rows){
    if(d == null) continue;
    const i = Math.round((la - mnLa) / step);
    const j = Math.round((ln - mnLn) / step);
    if(i >= 0 && i < nLat && j >= 0 && j < nLng) depth[i * nLng + j] = d;
  }
  return { step, minLat: mnLa, minLng: mnLn, nLat, nLng, depth };
}

function depthAtFromGrid(g, lat, lng){
  if(!g) return null;
  const fi = (lat - g.minLat) / g.step;
  const fj = (lng - g.minLng) / g.step;
  if(fi < -0.5 || fj < -0.5 || fi > g.nLat - 0.5 || fj > g.nLng - 0.5) return null;
  const i = Math.max(0, Math.min(g.nLat - 1, Math.round(fi)));
  const j = Math.max(0, Math.min(g.nLng - 1, Math.round(fj)));
  const v = g.depth[i * g.nLng + j];
  return (typeof v === "number" && isFinite(v)) ? v : null;
}

async function buildBathyGrid(latMin, latMax, lngMin, lngMax){
  BATHY_GRID = null;
  if(typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchBathy) return;
  let data = null;
  try { data = await BW_OCEAN.fetchBathy(latMin, latMax, lngMin, lngMax); }
  catch(e){ data = null; }
  applyBathyData(data);
}

// Build BATHY_GRID from an already-fetched {stepDeg, rows} payload.
function applyBathyData(data){
  BATHY_GRID = _buildBathyGridFromRows(data);
}

// Bite-map-only bathy — keeps map-wide BATHY_GRID intact for currents, waypoints, depth popups.
function applyPredictBathyData(data){
  PREDICT_BATHY_GRID = _buildBathyGridFromRows(data);
}

// Gap-filled chlorophyll composite for the active prediction area. Built once per
// port render: a list of cells, each carrying the freshest real chlor value.
let CHLOR_GRID = null;
async function buildChlorGrid(latMin, latMax, lngMin, lngMax){
  CHLOR_GRID = null;
  if(typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchChlorGrid) return;
  let data = null;
  try { data = await BW_OCEAN.fetchChlorGrid(latMin, latMax, lngMin, lngMax); }
  catch(e){ data = null; }
  applyChlorData(data);
}

// Build CHLOR_GRID from an already-fetched {stepDeg, rows} payload.
function applyChlorData(data){
  CHLOR_GRID = null;
  if(!data || !data.rows || !data.rows.length) return;
  // rows: [lat, lng, value, observedAtMs]
  let freshest = 0;
  for(const r of data.rows){ if(r[3] > freshest) freshest = r[3]; }
  const step = data.stepDeg || 0.08;
  // Spatial bucket index. The bite map calls chlorGridAt/chlorBreakGrid for
  // hundreds of cells; a linear scan of every chlor row per call was millions of
  // nmBetween ops. Bucketing rows by a coarse cell lets each lookup touch only
  // the handful of rows near the query point — identical results, far less work.
  const bucketDeg = Math.max(0.1, step * 2);
  const index = new Map();
  for(const r of data.rows){
    const key = Math.floor(r[0] / bucketDeg) + "," + Math.floor(r[1] / bucketDeg);
    let arr = index.get(key);
    if(!arr){ arr = []; index.set(key, arr); }
    arr.push(r);
  }
  CHLOR_GRID = { step, rows: data.rows, freshestMs: freshest || null, index, bucketDeg };
}

// Candidate chlor rows within radNm of a point, using the bucket index. Falls
// back to all rows if an older snapshot has no index. Callers still do the exact
// nmBetween check, so this only prunes the search — it never changes results.
function _chlorRowsNear(g, lat, lng, radNm){
  if(!g || !g.index) return (g && g.rows) || [];
  const latRad = radNm / 60 + g.bucketDeg;
  const lngRad = radNm / (60 * Math.max(0.2, Math.cos(lat * Math.PI / 180))) + g.bucketDeg;
  const biMin = Math.floor((lat - latRad) / g.bucketDeg), biMax = Math.floor((lat + latRad) / g.bucketDeg);
  const bjMin = Math.floor((lng - lngRad) / g.bucketDeg), bjMax = Math.floor((lng + lngRad) / g.bucketDeg);
  const out = [];
  for(let bi = biMin; bi <= biMax; bi++){
    for(let bj = bjMin; bj <= bjMax; bj++){
      const arr = g.index.get(bi + "," + bj);
      if(arr) for(const r of arr) out.push(r);
    }
  }
  return out;
}

// Nearest gap-filled chlorophyll value to a point (within ~2 grid cells).
function chlorGridAt(lat, lng){
  const g = CHLOR_GRID;
  if(!g || !g.rows.length) return null;
  const maxNm = (g.step * 60) * 2.5;
  let best = null, bestNm = Infinity;
  const cand = _chlorRowsNear(g, lat, lng, maxNm);
  for(const r of cand){
    const d = nmBetween(lat, lng, r[0], r[1]);
    if(d <= maxNm && d < bestNm){ bestNm = d; best = r; }
  }
  return best ? { value: best[2], observedAtMs: best[3] } : null;
}

// SST grid (MUR L4) for the active prediction area, sampled densely so the
// temperature break is real and SST no longer needs ~90 per-point calls.
let SST_GRID = null;
function applySstData(data){
  SST_GRID = null;
  if(!data || !data.rows || !data.rows.length) return;
  const step = data.stepDeg || 0.05;
  let mnLa = Infinity, mxLa = -Infinity, mnLn = Infinity, mxLn = -Infinity, freshest = 0;
  const vals = [];
  for(const r of data.rows){
    if(r[0] < mnLa) mnLa = r[0]; if(r[0] > mxLa) mxLa = r[0];
    if(r[1] < mnLn) mnLn = r[1]; if(r[1] > mxLn) mxLn = r[1];
    if(r[2] != null) vals.push(r[2]);
    if(r[3] && r[3] > freshest) freshest = r[3];
  }
  const nLat = Math.max(1, Math.round((mxLa - mnLa) / step) + 1);
  const nLng = Math.max(1, Math.round((mxLn - mnLn) / step) + 1);
  const val = new Float32Array(nLat * nLng).fill(NaN);
  for(const r of data.rows){
    if(r[2] == null) continue;
    const i = Math.round((r[0] - mnLa) / step), j = Math.round((r[1] - mnLn) / step);
    if(i >= 0 && i < nLat && j >= 0 && j < nLng) val[i * nLng + j] = r[2];
  }
  const s = [...vals].sort((a,b)=>a-b); const m = s.length>>1;
  const median = s.length ? (s.length%2 ? s[m] : (s[m-1]+s[m])/2) : null;
  SST_GRID = {
    step, minLat: mnLa, minLng: mnLn, nLat, nLng, val, median, freshestMs: freshest || data.observedAtMs || null,
    _forecast: !!data._forecast,
    forecastHour: data.forecastHour || 0,
    source: data.source || null,
  };
}

// SST (°F) at a point from the grid (nearest cell); null if unavailable.
function sstGridAt(lat, lng){
  const g = SST_GRID;
  if(!g) return null;
  const fi = (lat - g.minLat) / g.step, fj = (lng - g.minLng) / g.step;
  if(fi < -0.5 || fj < -0.5 || fi > g.nLat - 0.5 || fj > g.nLng - 0.5) return null;
  const i = Math.max(0, Math.min(g.nLat-1, Math.round(fi)));
  const j = Math.max(0, Math.min(g.nLng-1, Math.round(fj)));
  const v = g.val[i * g.nLng + j];
  return (typeof v === "number" && isFinite(v))
    ? { value: v, observedAtMs: g.freshestMs, ...(g._forecast ? { _forecast: true, forecastHour: g.forecastHour } : {}) }
    : null;
}

// Thermal break (°F per 10nm) from the dense SST grid around a point.
function thermalBreakGrid(lat, lng){
  const g = SST_GRID;
  if(!g) return null;
  const radNm = 18;
  const dLat = radNm / 60, dLng = radNm / (60 * Math.cos(lat * Math.PI/180));
  const near = [];
  const iC = Math.round((lat - g.minLat) / g.step), jC = Math.round((lng - g.minLng) / g.step);
  const di = Math.max(1, Math.round(dLat / g.step)), dj = Math.max(1, Math.round(dLng / g.step));
  for(let i = iC - di; i <= iC + di; i++){
    for(let j = jC - dj; j <= jC + dj; j++){
      if(i < 0 || j < 0 || i >= g.nLat || j >= g.nLng) continue;
      const v = g.val[i * g.nLng + j];
      if(typeof v !== "number" || !isFinite(v)) continue;
      near.push({ la: g.minLat + i * g.step, ln: g.minLng + j * g.step, v });
    }
  }
  if(near.length < 2) return null;
  let maxGrad = 0;
  for(let a = 0; a < near.length; a++){
    for(let b = a + 1; b < near.length; b++){
      const dNm = nmBetween(near[a].la, near[a].ln, near[b].la, near[b].ln);
      if(dNm < 1) continue;
      const grad = Math.abs(near[a].v - near[b].v) / dNm;
      if(grad > maxGrad) maxGrad = grad;
    }
  }
  return maxGrad * 10;
}

// Chlorophyll color-edge gradient (mg/m³ per 10nm) from the dense CHLOR_GRID
// composite around a point. Mirrors thermalBreakGrid: the per-point field samples
// no longer carry chlorophyll (it's a grid now), so the convergence factor reads
// its color edge here. Returns null when the grid has no usable coverage here.
function chlorBreakGrid(lat, lng){
  const g = CHLOR_GRID;
  if(!g || !g.rows || !g.rows.length) return null;
  const radNm = 18;
  const near = [];
  for(const r of _chlorRowsNear(g, lat, lng, radNm)){
    if(r[2] == null) continue;
    if(nmBetween(lat, lng, r[0], r[1]) <= radNm) near.push({ la:r[0], ln:r[1], v:r[2] });
  }
  if(near.length < 2) return null;
  if(typeof BW_BREAKS !== "undefined" && BW_BREAKS.maxGradientPer10nm){
    return BW_BREAKS.maxGradientPer10nm(near, lat, lng, radNm);
  }
  return null;
}

// Real depth (meters) at a point from the map-wide CUDEM/ETOPO grid; null if unavailable.
function realDepthAt(lat, lng){
  return depthAtFromGrid(BATHY_GRID, lat, lng);
}

// Depth used by the prediction engine: prefer bite-map bathy, then map-wide grid,
// then the shelf model. No synthetic shallow placeholder — buildPredictInputs
// finishes before the grid scores, so a fake 15 m reading can't flash on the map.
function predictDepth(lat, lng){
  const real = depthAtFromGrid(PREDICT_BATHY_GRID, lat, lng) ?? realDepthAt(lat, lng);
  if(real != null) return real;
  return seaDepth(lat, lng);
}

// Water test for the prediction heat map. Prefers REAL bathymetry (CUDEM/ETOPO), so
// land inside bays/rivers — where the static model's coarse bay rectangles bleed
// across land (e.g. the whole Chesapeake box) — is correctly excluded and the
// heat map no longer paints over land. CUDEM/ETOPO store land as depth 0, water > 0.
// Falls back to the static model only outside the fetched bathy grid.
// Inland freshwater bodies that must NEVER be treated as fishable saltwater,
// even though a global bathymetry/elevation grid stores them as water
// with a positive depth. Without this, hotspots appeared in places like Lake
// Okeechobee — a pure freshwater lake — because realDepthAt() read a positive
// depth there. Each entry is a lat/lng bounding box. Add others (large inland
// lakes, reservoirs) here if they ever surface on the map.
const FRESHWATER_EXCLUDE = [
  // Lake Okeechobee, FL — big enough to dominate the South FL inland area.
  { b: [26.68, 27.21, -81.12, -80.61], name: "Lake Okeechobee" },
];
function isInlandFreshwater(lat, lng){
  for(const z of FRESHWATER_EXCLUDE){
    const [laMin, laMax, lnMin, lnMax] = z.b;
    if(lat >= laMin && lat <= laMax && lng >= lnMin && lng <= lnMax) return true;
  }
  return false;
}

function isPredictWater(lat, lng){
  // Inland freshwater (Lake Okeechobee, etc.) is never a saltwater fishing
  // spot, regardless of what the bathymetry grid says — exclude it first.
  if(isInlandFreshwater(lat, lng)) return false;
  // Prefer the port-scoped bite-map bathy grid (stable for the whole fishing
  // range). BATHY_GRID is often viewport-sized (currents layer), so using it
  // here made the scored cells change as the user zoomed/panned.
  const real = depthAtFromGrid(PREDICT_BATHY_GRID, lat, lng) ?? realDepthAt(lat, lng);
  if(real != null) return real > 0;
  return (typeof isFishableWater === "function") ? isFishableWater(lat, lng) : false;
}

function decimateOceanPts(pts, max){
  if(pts.length <= max) return pts;
  const out = [];
  const step = pts.length / max;
  for(let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

async function buildOceanField(latMin, latMax, lngMin, lngMax, opts){
  if(typeof BW_OCEAN === "undefined"){ OCEAN_FIELD = { samples: [], builtAtMs: Date.now(), spacingNm: 0 }; return; }
  const o = opts || {};
  const maxPoints = o.maxPoints || 90;
  // Choose a grid spacing that fills the requested box up to maxPoints water
  // cells. A tighter box (one port's fishing area) yields ~8-15nm spacing —
  // dense enough that SST/chlorophyll come from genuinely nearby pixels and a
  // real temperature break (SST gradient) can be measured per cell. (The old
  // version sampled the WHOLE coast and decimated to 60 points ≈ 150nm apart,
  // so SST was coarse, chlorophyll often null/far, and thermal break was always
  // zero — exactly the "missing inputs" the heat map showed.)
  const midLat = (latMin + latMax) / 2;
  const latNm = Math.max(1, (latMax - latMin) * 60);
  const lngNm = Math.max(1, (lngMax - lngMin) * 60 * Math.cos(midLat * Math.PI / 180));
  let stepNm = 8;
  let pts = [];
  for(let guard = 0; guard < 8; guard++){
    const stepLat = stepNm / 60;
    const stepLng = stepNm / (60 * Math.cos(midLat * Math.PI / 180));
    pts = [];
    for(let la = latMin; la <= latMax + 1e-9; la += stepLat)
      for(let ln = lngMin; ln <= lngMax + 1e-9; ln += stepLng)
        if(isFishableWater(la, ln)) pts.push([la, ln]);
    if(pts.length <= maxPoints) break;
    stepNm += 3;  // coarsen until we fit the request budget
  }
  if(pts.length > maxPoints) pts = decimateOceanPts(pts, maxPoints);
  // Throttle the prefetch: firing every request at once overwhelms the upstream
  // ocean feed (ERDDAP/NDBC), which rate-limits the burst and returns null for
  // most points. A small concurrency pool keeps each request reliable.
  const CONCURRENCY = 8;
  const results = new Array(pts.length);
  let next = 0;
  async function worker(){
    while(next < pts.length){
      const i = next++;
      const [la, ln] = pts[i];
      // Pass the selected forecast horizon (0/12/24/48/72h) so the backend can
      // return FORECAST wind/pressure/weather for that time, not just current
      // conditions. When the user scrubs the forecast slider into the future,
      // the bite score should reflect predicted weather. Backend fetchOcean must
      // accept this hour offset; if it ignores the extra arg, behavior is
      // unchanged (current conditions), so this is safe to pass unconditionally.
      const p = await BW_OCEAN.fetchOcean(la, ln, FORECAST_HOUR_OFFSET || 0);
      results[i] = { la, ln, p };
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pts.length) }, worker));
  applyOceanField(results.filter(Boolean), stepNm);
}

// Build OCEAN_FIELD (samples + regional baselines) from a list of {la,ln,p}.
// Regional baselines = MEDIAN real SST/chlorophyll across the area + freshest
// observation time. Cells whose own pixel is cloud-gapped use these so a no-data
// spot is scored against the regional AVERAGE instead of being dropped (which
// previously skewed the map toward cells that happened to have a satellite read).
function applyOceanField(samples, spacingNm){
  samples = samples || [];
  const med = (arr) => { if(!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
  const collect = (key) => {
    const vals = [], times = [];
    for(const s of samples){ const f = s.p && s.p[key]; if(f && f.value != null){ vals.push(f.value); if(f.observedAtMs != null) times.push(f.observedAtMs); } }
    return { median: med(vals), freshest: times.length ? Math.max(...times) : null, coverage: samples.length ? vals.length / samples.length : 0 };
  };
  const sstAgg = collect("sst"), chlorAgg = collect("chlor");
  OCEAN_FIELD = {
    samples, builtAtMs: Date.now(), spacingNm: spacingNm || 12,
    medianSst: sstAgg.median, freshestSstMs: sstAgg.freshest, sstCoverage: sstAgg.coverage,
    medianChlor: chlorAgg.median, freshestChlorMs: chlorAgg.freshest, chlorCoverage: chlorAgg.coverage,
  };
}

// ── ONE-REQUEST prediction inputs ────────────────────────────────────────────
// Fetch bathymetry grid + chlorophyll composite + per-point ocean field in a
// single combined call. Falls back to the separate builders if the combined
// endpoint is unavailable, so behavior is preserved either way.
async function buildPredictInputs(latMin, latMax, lngMin, lngMax){
  let data = null;
  const fcHour = (typeof FORECAST_HOUR_OFFSET !== "undefined") ? (FORECAST_HOUR_OFFSET || 0) : 0;
  const predictUsable = (payload) => {
    if(!payload || !Array.isArray(payload.field) || !payload.field.length) return false;
    const sstRows = Array.isArray(payload.sst?.rows) ? payload.sst.rows.filter(r => r && r[2] != null).length : 0;
    const windPts = payload.field.filter(f => f?.p?.wind?.value != null).length;
    return sstRows > 0 && windPts > 0;
  };
  if(typeof BW_OCEAN !== "undefined" && BW_OCEAN.fetchPredictInputs){
    try { data = await BW_OCEAN.fetchPredictInputs(latMin, latMax, lngMin, lngMax, 90, fcHour); }
    catch(e){ data = null; }
    // One immediate retry — cold edge starts / mobile blips were caching hollow
    // responses and leaving the bite map on depth-only scoring.
    if(!predictUsable(data)){
      if(typeof BW_OCEAN.clearPredictInputsCache === "function") BW_OCEAN.clearPredictInputsCache();
      try { data = await BW_OCEAN.fetchPredictInputs(latMin, latMax, lngMin, lngMax, 90, fcHour); }
      catch(e){ data = null; }
    }
  }
  if(!predictUsable(data) && typeof tripPredictInputsCovering === "function"){
    const cached = tripPredictInputsCovering(latMin, latMax, lngMin, lngMax);
    if(predictUsable(cached)) data = cached;
  }
  if(predictUsable(data)){
    applyPredictBathyData(data.bathy);
    if(!BATHY_GRID && data.bathy) applyBathyData(data.bathy);
    applyChlorData(data.chlor);
    applySstData(data.sst);
    applyOceanField(data.field, data.fieldStepNm);
    PREDICT_ALTI_GRID = (data.altimetry && typeof buildAltiGrid === "function") ? buildAltiGrid(data.altimetry) : null;
    PREDICT_CUR_GRID  = (data.current  && typeof buildCurGrid  === "function") ? buildCurGrid(data.current)   : null;
    LAST_PREDICT_INPUTS = { bbox: { latMin, latMax, lngMin, lngMax }, data, fcHour, atMs: Date.now() };
    return;
  }
  // Partial payload — still apply any grids we got (especially bathy for depth).
  if(data){
    if(data.bathy?.rows?.length){
      applyPredictBathyData(data.bathy);
      if(!BATHY_GRID) applyBathyData(data.bathy);
    }
    if(data.chlor?.rows?.length) applyChlorData(data.chlor);
    if(data.sst?.rows?.length) applySstData(data.sst);
    if(Array.isArray(data.field) && data.field.length) applyOceanField(data.field, data.fieldStepNm);
  }
  console.warn("buildPredictInputs: combined endpoint unavailable — falling back to per-point fetch");
  await Promise.all([
    buildBathyGrid(latMin, latMax, lngMin, lngMax),
    buildChlorGrid(latMin, latMax, lngMin, lngMax),
    buildOceanField(latMin, latMax, lngMin, lngMax, { maxPoints: 90 }),
  ]);
  // Fallback path only populated BATHY_GRID — mirror it for bite scoring too.
  if(!PREDICT_BATHY_GRID && BATHY_GRID) PREDICT_BATHY_GRID = BATHY_GRID;
}

function nearestSample(lat, lng){
  let best = null, bestNm = Infinity;
  for(const s of OCEAN_FIELD.samples){
    const d = nmBetween(lat, lng, s.la, s.ln);
    if(d < bestNm){ bestNm = d; best = s; }
  }
  return best ? best.p : null;
}

// Nearest sample whose given field actually has a real value. Satellite pixels
// (especially chlorophyll) are frequently cloud-gapped, so the closest sample
// can be null while a neighbor a few miles away has a valid, recent reading.
// This pulls the field from the nearest VALID local sample instead of dropping
// it — using only real measured values, with their real observedAt.
function nearestFieldSample(lat, lng, key, maxNm){
  const limit = maxNm || (OCEAN_FIELD.spacingNm ? OCEAN_FIELD.spacingNm * 3 : 45);
  let best = null, bestNm = Infinity;
  for(const s of OCEAN_FIELD.samples){
    const f = s.p && s.p[key];
    if(!f || f.value == null) continue;
    const d = nmBetween(lat, lng, s.la, s.ln);
    if(d <= limit && d < bestNm){ bestNm = d; best = f; }
  }
  return best;
}

// Thermal break = strongest SST gradient near this point, expressed in
// °F per 10nm (the natural scale for a Gulf Stream / temperature-break edge).
// Uses the LOCAL ocean field samples; the search radius is tied to the field's
// own spacing so there are always enough neighbors to measure a gradient.
function thermalBreakReal(lat, lng){
  // Prefer the dense SST grid (best gradient resolution) when available.
  const fromGrid = thermalBreakGrid(lat, lng);
  if(fromGrid != null) return fromGrid;
  const radiusNm = (OCEAN_FIELD.spacingNm ? OCEAN_FIELD.spacingNm * 2.2 : 35);
  const near = [];
  for(const s of OCEAN_FIELD.samples){
    const d = nmBetween(lat, lng, s.la, s.ln);
    if(d <= radiusNm && s.p?.sst?.value != null) near.push({ la: s.la, ln: s.ln, v: s.p.sst.value });
  }
  if(near.length < 2) return 0;
  let maxGrad = 0;  // °F per nm
  for(let i = 0; i < near.length; i++){
    for(let j = i + 1; j < near.length; j++){
      const dNm = nmBetween(near[i].la, near[i].ln, near[j].la, near[j].ln);
      if(dNm < 1) continue;  // ignore near-duplicate samples
      const grad = Math.abs(near[i].v - near[j].v) / dNm;
      if(grad > maxGrad) maxGrad = grad;
    }
  }
  return maxGrad * 10;  // convert to °F per 10nm
}

function scoreCell(lat, lng, speciesId){
  let prefs = PREDICT_SPECIES_PREFS[speciesId];
  if(!prefs) return null;
  // Pacific tuning pass: score West-Coast cells against Pacific-specific habitat
  // prefs (e.g. offshore-only bluefin) while leaving Atlantic/Gulf scores intact.
  if(typeof isPacificContext === "function" && isPacificContext(lat, lng) &&
     typeof PACIFIC_SPECIES_PREFS !== "undefined" && PACIFIC_SPECIES_PREFS[speciesId]){
    prefs = PACIFIC_SPECIES_PREFS[speciesId];
  }

  // ── Get the right weight table for this species category ──
  const W = predictWeightsFor(speciesId);
  const sp = (typeof SPECIES !== "undefined") ? SPECIES.find(s => s.id === speciesId) : null;
  const speciesCat = sp ? sp.cat : "offshore";

  const ocean = nearestSample(lat, lng);
  // SST and chlorophyll are satellite fields with frequent cloud gaps. Resolve
  // each in three tiers so missing pixels don't skew the map toward data-present
  // cells: (1) this cell's own pixel, (2) the nearest valid pixel in the area,
  // (3) the regional MEDIAN for the whole fishing area (a real aggregate, labeled
  // regional). Every cell is then scored on the SAME factors with equal weight.
  // SST resolve: dense MUR grid → cell's own pixel/nearest field sample →
  // regional median. (Grid is gap-filled MUR L4, identical data to per-point.)
  let sstObj = sstGridAt(lat, lng);
  if(!sstObj || sstObj.value == null){
    sstObj = (ocean?.sst?.value != null ? ocean.sst : nearestFieldSample(lat, lng, "sst"));
  }
  if((!sstObj || sstObj.value == null)){
    const regSst = (SST_GRID && SST_GRID.median != null) ? { value: SST_GRID.median, observedAtMs: SST_GRID.freshestMs, _regional: true }
      : (OCEAN_FIELD.medianSst != null ? { value: OCEAN_FIELD.medianSst, observedAtMs: OCEAN_FIELD.freshestSstMs, _regional: true } : null);
    if(regSst) sstObj = regSst;
  }
  sstObj = sstObj ?? { value: null, observedAtMs: null };
  // Chlorophyll resolve order: gap-filled composite grid (best coverage) →
  // this cell's own pixel → nearest valid pixel → regional median.
  let chlorObj = chlorGridAt(lat, lng);
  if(!chlorObj || chlorObj.value == null){
    chlorObj = (ocean?.chlor?.value != null ? ocean.chlor : nearestFieldSample(lat, lng, "chlor"));
  }
  if((!chlorObj || chlorObj.value == null) && OCEAN_FIELD.medianChlor != null){
    chlorObj = { value: OCEAN_FIELD.medianChlor, observedAtMs: OCEAN_FIELD.freshestChlorMs, _regional: true };
  }
  chlorObj = chlorObj ?? { value: null, observedAtMs: null };
  const windObj  = ocean?.wind  ?? { value: null, dir: null, observedAtMs: null };
  const presObj  = ocean?.pressure ?? { value: null, observedAtMs: null };
  const tideObj  = ocean?.tide  ?? { value: null, observedAtMs: null };

  const sst   = sstObj.value;
  const chlor = chlorObj.value;
  const depth = predictDepth(lat, lng);
  const tBreak = thermalBreakReal(lat, lng);
  // Chlorophyll color-edge gradient + convergence with the SST break. Real data
  // only (uses the same OCEAN_FIELD samples). 0 when the module/data isn't ready.
  let chlorBreak = 0, convergence = 0;
  if (typeof BW_BREAKS !== "undefined") {
    // Prefer the dense chlorophyll composite grid (field samples no longer carry
    // chlor); fall back to OCEAN_FIELD samples only where the grid has no cover.
    const cbGrid = chlorBreakGrid(lat, lng);
    if (cbGrid != null) {
      chlorBreak = cbGrid;
    } else if (OCEAN_FIELD && OCEAN_FIELD.samples) {
      const radiusNm = (OCEAN_FIELD.spacingNm ? OCEAN_FIELD.spacingNm * 2.2 : 35);
      chlorBreak = BW_BREAKS.chlorBreak(OCEAN_FIELD.samples, lat, lng, radiusNm);
    }
    convergence = BW_BREAKS.convergenceScore(tBreak, chlorBreak);
  }
  const pressureTrend = presObj.value;
  const solunar = solunarScore(lat, lng);
  const tide = tideObj.value;          // real NOAA CO-OPS tide stage (0..1) or null
  const moon = moonPhase();

  // ── Factor 1: SST match (Gaussian-based for smooth continuous scoring) ──
  // Inside the species' ideal range → 1.0 (plateau of perfect conditions).
  // Outside ideal but inside working → smooth Gaussian falloff to ~0.05 at
  // the working edge. Beyond working → same Gaussian continues, so 2-3°F
  // past the working edge approaches 0 (lethal/uninhabitable). The cold
  // and warm sides decay independently because species often have very
  // different tolerances on each side (cold typically more lethal than warm).
  //
  // BOTTOM-DWELLER CORRECTION: deep demersal species (golden & blueline
  // tilefish) live on the bottom in 150-700m where the water is cold and
  // STABLE year-round — completely decoupled from the summer-warm surface.
  // Scoring them on surface SST was zeroing them out everywhere in summer
  // (78°F surface vs a 48-60°F preference), which is exactly why golden
  // tilefish wasn't populating Norfolk Canyon or the Mid-Atlantic deep. For
  // these species we estimate a BOTTOM temperature from depth and score on
  // that instead of the surface skin. NOTE: this is a depth→temp APPROXIMATION
  // for this region's slope water, not a measured value — replace with a real
  // subsurface/bottom-temp feed (e.g. HYCOM/GLORYS reanalysis) when available.
  //   ~100m ≈ 60°F, ~200m ≈ 54°F, ~350m ≈ 50°F, ~500m+ ≈ 47°F.
  const _isBottom = !!prefs.bottom;
  // SHELF DEMERSAL CORRECTION (Gulf fix): reef/bottom species like red &
  // vermilion snapper, grouper, amberjack, triggerfish etc. live ON structure
  // in ~20-200m. Below the summer thermocline the water they actually sit in is
  // meaningfully cooler than the 85-88°F Gulf surface skin. Scoring them purely
  // on surface SST was pushing them past their warm working edge and zeroing
  // the bite everywhere in summer — exactly the "no red hotspots for snapper"
  // symptom. We blend surface SST toward a shelf bottom-temp estimate so the
  // warm surface is damped without pretending they live in deep cold water like
  // the true deep tilefish (`bottom`) case above.
  const _isDemersal = !!prefs.demersal && !_isBottom;
  let tempForScore = sst;
  if(_isBottom && depth != null && depth > 0){
    // Piecewise-linear bottom-temp estimate (°F) from depth (m).
    let bt;
    if(depth <= 50)       bt = 68;
    else if(depth <= 100) bt = 68 - (depth - 50) / 50 * 8;     // 68→60
    else if(depth <= 200) bt = 60 - (depth - 100) / 100 * 6;   // 60→54
    else if(depth <= 350) bt = 54 - (depth - 200) / 150 * 4;   // 54→50
    else if(depth <= 600) bt = 50 - (depth - 350) / 250 * 3;   // 50→47
    else                  bt = 47;
    tempForScore = bt;
  } else if(_isDemersal && sst != null && depth != null && depth > 0){
    // THERMOCLINE bottom-temp estimate (°F), stratification-aware so ONE formula
    // works from the Gulf to the Gulf of Maine without region hardcoding.
    //
    // Step 1 — fully-stratified profile (warm-surface summer, e.g. the Gulf/SE):
    // a warm near-surface mixed layer to ~30m (100 ft); a sharp thermocline
    // through ~60-100m (200-330 ft) where temperature plunges ~10-20°F; a slow
    // decline toward cold deep water that levels near a constant ~40°F below
    // ~1200m (≈3,900 ft). Anchored so 300 ft under an 84°F surface reads ≈69°F.
    const d = depth; // meters
    let btFull;
    if(d <= 30)       btFull = sst;                                   // mixed layer ≈ surface
    else if(d <= 60)  btFull = sst - (d - 30) / 30 * 4;               // top of thermocline: 0→4°F
    else if(d <= 100) btFull = sst - 4 - (d - 60) / 40 * 14;         // sharp drop: 4→18°F (≈300 ft ⇒ sst−15)
    else if(d <= 200) btFull = sst - 18 - (d - 100) / 100 * 8;       // easing: 18→26°F
    else if(d <= 1200){
      // Slow decline from the shelf-break value toward the near-constant ~40°F
      // deep water (~3,900 ft). Rarely reached by shelf demersal species.
      const shelf = sst - 26;
      btFull = shelf - (d - 200) / 1000 * (shelf - 40);
    } else            btFull = 40;                                    // near-constant abyssal water
    btFull = Math.max(btFull, 40);
    // Step 2 — scale the deficit by stratification strength. A warm surface over
    // cold deep water stratifies (full thermocline); a cold surface (NE winter,
    // high latitude) means a well-mixed column where the bottom ≈ the surface.
    // So a 42°F Gulf-of-Maine surface in January produces ~no deficit (mixed),
    // while an 84°F Gulf surface in July produces the full drop. This fixes NE
    // groundfish being wrongly penalized by warm summer surface AND wrongly
    // refrigerated by a season-agnostic deficit in winter.
    // (Heuristic — replace with a real subsurface/bottom-temp feed, e.g.
    //  HYCOM/GLORYS reanalysis, for the true Mid-Atlantic cold pool.)
    const strat = Math.max(0, Math.min(1, (sst - 50) / (78 - 50)));
    const deficit = Math.max(0, sst - btFull);
    tempForScore = Math.max(40, sst - strat * deficit);
  }
  let tempScore = 0;
  if(tempForScore != null && tempForScore >= prefs.tempIdeal[0] && tempForScore <= prefs.tempIdeal[1]){
    tempScore = 1.0;
  } else if(tempForScore != null && tempForScore < prefs.tempIdeal[0]){
    // COLD side — falloff from ideal_min down to working_min and beyond.
    // Sigma chosen so that score ≈ 0.05 exactly at the working edge.
    const buffer = Math.max(0.5, prefs.tempIdeal[0] - prefs.tempWorking[0]);
    const sigma = buffer / 2.355;  // 2.355σ ≈ score 0.05
    const delta = prefs.tempIdeal[0] - tempForScore;
    tempScore = Math.exp(-(delta * delta) / (2 * sigma * sigma));
  } else if(tempForScore != null) {
    // WARM side — falloff from ideal_max up to working_max and beyond.
    const buffer = Math.max(0.5, prefs.tempWorking[1] - prefs.tempIdeal[1]);
    const sigma = buffer / 2.355;
    const delta = tempForScore - prefs.tempIdeal[1];
    tempScore = Math.exp(-(delta * delta) / (2 * sigma * sigma));
  }
  // Floor at 0 (Math.exp is always > 0 but small values are effectively zero;
  // explicit floor avoids passing tiny epsilon values into downstream math).
  if(tempScore < 0.01) tempScore = 0;

  // ── Pelagic warm-water bias (offshore species) ──
  // Tuna/billfish/wahoo relate to the warm Gulf Stream surface even though they
  // drop into cooler water a couple degrees below the SST skin. So for offshore
  // pelagics we (a) do NOT penalize SST above the ideal max until it nears the
  // lethal working edge — warm water is GOOD, the fish just go deeper — and
  // (b) add a warm-side bias so the bite concentrates toward the warmest fishable
  // SST (the Stream edge, e.g. The Point) rather than the cool inshore side.
  // Bottom-dwellers (tilefish) are scored on bottom temp above and have NO
  // relationship to the warm surface skin, so they are excluded here.
  //
  // BLUEFIN EXEMPTION: bluefin are a COLD-water tuna (ideal 58–68°F). The
  // warm-side logic below — full credit past the ideal max + a bias toward the
  // warmest fishable SST — is correct for warm pelagics (yellowfin/marlin) but
  // backwards for bluefin: it discounted their prime 58–63°F water and rewarded
  // the too-warm edge. Bluefin therefore use the plain symmetric Gaussian above,
  // which correctly peaks in the cool ideal band and falls off on BOTH sides.
  if(speciesCat === "offshore" && speciesId !== "bluefin" && !_isBottom && sst != null){
    const warmEdge = prefs.tempWorking[1];
    if(sst >= prefs.tempIdeal[1]){
      // Warm side: full credit through the ideal/working band; only fall off once
      // past the working max (genuinely too hot at the surface).
      tempScore = sst <= warmEdge ? 1.0 : Math.max(0, 1 - (sst - warmEdge) / 4);
    }
    // Warm-side bias: 0 at the cool edge of ideal → 1 at the warm working edge.
    const span = Math.max(1, warmEdge - prefs.tempIdeal[0]);
    const warmBias = Math.max(0, Math.min(1, (sst - prefs.tempIdeal[0]) / span));
    tempScore = Math.min(1, tempScore * (0.7 + 0.4 * warmBias));
  }

  // ── Warm-adapted nearshore/inshore pelagics (Gulf fix) ──
  // King/Spanish/cero mackerel and cobia are warm-water fish that are perfectly
  // happy — often best — in the 84-88°F Gulf summer surface. The generic
  // Gaussian warm-side falloff was penalizing them for being in exactly the
  // water they thrive in, killing the bite map at their peak season. Treat warm
  // surface as GOOD (full credit through the working edge, gentle falloff only
  // once genuinely past it), matching how offshore pelagics are handled.
  if(prefs.warmAdapted && speciesCat !== "offshore" && !_isBottom && sst != null){
    const warmEdge = prefs.tempWorking[1];
    if(sst >= prefs.tempIdeal[1]){
      tempScore = Math.max(tempScore, sst <= warmEdge ? 1.0 : Math.max(0, 1 - (sst - warmEdge) / 5));
    }
  }

  // ── Factor 2: Chlorophyll preference ──
  let chlorScore = 0;
  if(chlor != null){
    chlorScore = 0.5;
    if(prefs.chlorPref === "low")  chlorScore = chlor < 0.2 ? 1.0 : chlor < 0.5 ? 0.6 : 0.2;
    if(prefs.chlorPref === "high") chlorScore = chlor > 1.0 ? 1.0 : chlor > 0.5 ? 0.6 : 0.2;
    if(prefs.chlorPref === "edge"){
      // "Edge" species want the COLOR CHANGE, not flat green water. A concentration
      // in the productive band is necessary but NOT sufficient: a uniform field
      // (no break) scores only moderate, and the score climbs toward 1.0 only when
      // a real chlorophyll gradient is present at this cell. chlorBreak (mg/m³ per
      // 10nm) is the gradient computed above; chlorEdgeStrength normalizes it 0..1.
      // This stops the map from rewarding areas that are simply green.
      const gradScore = (typeof BW_BREAKS !== "undefined" && BW_BREAKS.chlorEdgeStrength)
        ? BW_BREAKS.chlorEdgeStrength(chlorBreak) : 0;
      const inBand = (chlor >= 0.1 && chlor <= 0.45);      // clean-to-productive edge water
      const bandScore = inBand ? 1.0 : (chlor < 0.1 ? 0.5 : 0.35); // sterile blue mid / pea-green low
      chlorScore = Math.min(1, 0.35 * bandScore + 0.65 * gradScore);
    }
    if(prefs.chlorPref === "any")  chlorScore = 0.7;
  }

  // ── Factor 3: Depth/structure match ──
  // depthBands is an array of [min, max] ranges in meters. The score for
  // each band is 1.0 if depth is inside, decaying with distance outside.
  // Final depthScore = MAX across all bands so flexible species (bluefin
  // with multiple bands) get full credit in any of their preferred zones.
  let depthScore = 0;
  const bands = prefs.depthBands || [[0, 2000]];
  // HARD SHALLOW FLOOR: regardless of species, water shallower than ~1.5 m
  // (~5 ft) is not a place we recommend a fishing hotspot — it's tidal flat /
  // skinny water you'd run aground in, and a pin there (like the 3 ft cobia
  // spot) is never right. Inshore species that genuinely use very skinny water
  // (redfish tailing flats) can be exempted later via a prefs flag, but the
  // current species set is all boat-fished, so a 5 ft floor is safe and kills
  // the nonsensical flats hotspots at the source.
  const MIN_FISHABLE_DEPTH_M = 1.5;
  if(depth != null && depth >= 0 && depth < MIN_FISHABLE_DEPTH_M){
    depthScore = 0;
  } else {
  for(const [bMin, bMax] of bands){
    let bandScore;
    if(depth >= bMin && depth <= bMax){
      bandScore = 1.0;
    } else if(depth < bMin){
      // TOO SHALLOW: decay STEEPLY. Being well shallower than a species' minimum
      // depth is disqualifying, not a minor penalty — a 3 ft flat is not "almost"
      // cobia water. The old gentle 1/120 m decay let 0.9 m (3 ft) score ~0.97
      // for a [5,40] m species, which put hotspots on tidal flats. We decay over
      // ~12 m on the shallow side so a spot a few meters under the floor falls
      // off fast and anything truly skinny (a few feet) is near zero.
      const below = bMin - depth;
      bandScore = Math.max(0, 1 - below / 12);
    } else {
      // TOO DEEP: gentler decay (a species can stray a bit deeper than ideal).
      const above = depth - bMax;
      bandScore = Math.max(0, 1 - above / 120);
    }
    if(bandScore > depthScore) depthScore = bandScore;
  }
  }
  // Canyon-edge bonus only applies if at least one band actually wants
  // canyon-depth water (otherwise we'd be giving a free boost to flounder
  // happening to drift over a canyon).
  const wantsCanyon = bands.some(([mn, mx]) => mx >= 150);
  const canyonBoost = (wantsCanyon && depth > 100 && depth < 500) ? 0.10 : 0;
  depthScore = Math.min(1, depthScore + canyonBoost);

  // ── Factor 4: Thermal break (temperature gradient / color line) ──
  // Pelagic predators hunt the EDGE between cold and warm water. The
  // gradient magnitude tBreak (in °F across ~9nm) tells us how sharp the
  // break is. Strong breaks ≥ 4°F suggest a serious feature; weak breaks
  // <1.5°F mean we're in uniform water.
  // This works globally: captures Gulf Stream edges on East Coast AND
  // Loop Current / river plume fronts in the Gulf of Mexico.
  let breakScore = 0.5;
  if(prefs.breakPref === "edge"){
    // Wants strong breaks
    if(tBreak >= 4.0) breakScore = 1.0;
    else if(tBreak >= 2.0) breakScore = 0.7;
    else if(tBreak >= 1.0) breakScore = 0.4;
    else breakScore = 0.2;
  }
  if(prefs.breakPref === "stable"){
    // Wants uniform water (inshore/bay species)
    if(tBreak < 1.0) breakScore = 1.0;
    else if(tBreak < 2.0) breakScore = 0.6;
    else breakScore = 0.3;
  }
  if(prefs.breakPref === "any") breakScore = 0.7;

  // ── FRONT FUSION (offshore, edge-seeking pelagics only) ─────────────────────
  // Fold satellite ALTIMETRY (SSH front) into the temperature break → "Front
  // strength", and surface-CURRENT shear into the SST×chlor convergence → "Front
  // convergence". SST is cloud-masked/laggy; SSH and currents see the same Gulf
  // Stream wall / eddy rim through clouds in near-real time. Gated to offshore,
  // non-bottom, edge-seeking species so inshore/bottom scores are untouched, and
  // the SSH term can only RAISE Front strength (it fills SST's gaps, never lowers
  // a real thermal break). Weights are unchanged — we enrich the two existing
  // factors rather than adding correlated duplicate rows.
  let frontSensor = "sst";
  let _sshEdge01 = 0, _curEdge01 = 0;
  if(speciesCat === "offshore" && !_isBottom && prefs.breakPref === "edge" && typeof BW_BREAKS !== "undefined"){
    const sshGrad = (typeof sshBreakAt === "function") ? sshBreakAt(lat, lng) : null;
    if(sshGrad != null){
      _sshEdge01 = BW_BREAKS.sshEdgeStrength(sshGrad);
      const sshBreakScore = _sshEdge01 >= 1.0 ? 1.0 : _sshEdge01 >= 0.7 ? 0.7 : _sshEdge01 >= 0.4 ? 0.4 : _sshEdge01 > 0 ? 0.3 : 0;
      if(sshBreakScore > breakScore){ breakScore = sshBreakScore; frontSensor = "ssh"; }
      else if(sshBreakScore > 0 && frontSensor === "sst" && tBreak <= 0) frontSensor = "ssh";
    }
    const curShear = (typeof currentShearAt === "function") ? currentShearAt(lat, lng) : null;
    if(curShear != null) _curEdge01 = BW_BREAKS.currentEdgeStrength(curShear);
    if(_sshEdge01 > 0 || _curEdge01 > 0){
      convergence = BW_BREAKS.frontConvergence(convergence, _sshEdge01, _curEdge01);
    }
  }

  // ── WARM-CORE GULF STREAM INFLUENCE (warm-water offshore pelagics) ──────────
  // The Gulf Stream and its warm-core rings/filaments transport tropical blue
  // water — and the pelagics that ride it — well beyond a species' calendar
  // "normal." When a tongue of warm water is actively FLOWING into an area
  // (strong RTOFS current + genuinely warm SST), tuna/marlin/dolphin/wahoo push
  // in with it, even early/late in the run. We detect that intrusion from REAL
  // data: warm SST × strong current drift. It requires BOTH — a warm but slack
  // patch (no flow) or cold fast water (winter shelf) won't trigger it, so the
  // warm-SST term self-limits this to physically realistic Stream water.
  //
  // Gated to warm-water offshore pelagics (marlin, sail, spearfish, yellowfin,
  // blackfin, skipjack, wahoo, mahi — working edge ≥80°F). Bottom fish and cool
  // canyon species (swordfish, bigeye) are excluded.
  let _streamInf01 = 0;
  const _warmPelagic = speciesCat === "offshore" && !_isBottom &&
                       prefs.tempWorking && prefs.tempWorking[1] >= 80;
  if(_warmPelagic && sst != null && typeof sampleCurrentGrid === "function" &&
     typeof PREDICT_CUR_GRID !== "undefined" && PREDICT_CUR_GRID){
    const cur = sampleCurrentGrid(PREDICT_CUR_GRID, lat, lng);
    const driftKt = cur && cur.driftKts != null ? cur.driftKts : 0;
    // Warmth ramp: 0 at 72°F → 1 at 80°F (tropical Stream water).
    const warmth01 = Math.max(0, Math.min(1, (sst - 72) / (80 - 72)));
    // Flow ramp: 0 at 0.6 kt → 1 at 2.0 kt (core Stream / strong filament).
    const flow01 = Math.max(0, Math.min(1, (driftKt - 0.6) / (2.0 - 0.6)));
    _streamInf01 = warmth01 * flow01;
    // A real warm-water intrusion is also a front-adjacent signal — let it lift
    // the convergence/front factor (never lower it).
    if(_streamInf01 > 0){
      convergence = Math.max(convergence, 0.5 * _streamInf01);
      if(_curEdge01 <= 0) _curEdge01 = 0.4 * _streamInf01;   // reflect flow in the factor label
    }
  }

  // ── Factor: Bottom structure (offshore edge pelagics) ──────────────────────
  // Slope/steepness of the bottom — shelf-edge lip, canyon walls, humps. Only
  // computed where it carries weight (offshore table sets W.structure > 0; it's
  // 0 for near/inshore, which use the separate structure-proximity bonus below).
  let structureScore = 0;
  if((W.structure || 0) > 0 && typeof bottomStructureStrengthAt === "function"){
    structureScore = bottomStructureStrengthAt(lat, lng);
  }

  // ── Factor 5: Recent fishing reports ──
  const reportScore = reportsBoost(lat, lng, speciesId);

  // ── Factor 7: Seasonal alignment (regional override OR latitude phase shift) ──
  // Two paths:
  //   A) REGIONAL: species like striper/bluefin/cobia have fundamentally
  //      different fishery shapes per region (NC winter stripers vs NE summer
  //      stripers — opposite seasons). Use blended regional seasons directly;
  //      no latitude shift because regional data is already location-tuned.
  //   B) LATITUDE-SHIFTED: for migratory pelagics that DO follow a simple
  //      south-to-north SST sweep (yellowfin, mahi, marlin, etc.), shift the
  //      default seasons curve by latitude per MIGRATION_PHASE entry.
  //   Species with neither override get their unshifted default curve.
  let seasonScore = 0.5;
  let _seasonGateActive = false;   // only gate when a real seasonal curve exists
  let _seasonOutOfRange = false;   // species has a regional map but cell is outside it
  if(typeof ENC_SPECIES !== "undefined"){
    const spEnc = ENC_SPECIES.find(s => s.id === speciesId);
    if(spEnc && spEnc.seasons){
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const now = new Date();
      const dayOfMonth = now.getDate() - 1;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const calMonth = now.getMonth() + dayOfMonth / daysInMonth;

      // ── Path A: regional seasons (if defined and cell is near a region) ──
      const hasRegionalTable = (typeof REGIONAL_SEASONS !== "undefined")
        && Array.isArray(REGIONAL_SEASONS[speciesId])
        && REGIONAL_SEASONS[speciesId].length > 0;
      const regionalCurve = (typeof getRegionalSeasons === "function")
        ? getRegionalSeasons(speciesId, lat, lng) : null;

      // OUT-OF-RANGE GUARD: if a species HAS a regional fishery map but this
      // cell sits outside every one of its regions, the fish isn't part of any
      // known fishery here — that's a strong "not present" signal, NOT a reason
      // to fall back to the generic peak curve. Falling back was the bug behind
      // blackfin lighting up red off VA Beach: blackfin's real range is Hatteras
      // south, VA Beach is outside all its regions, yet the generic Jul:3 curve
      // made it look like peak season. We instead score it near-zero so the
      // season gate suppresses it everywhere out of range.
      if(hasRegionalTable && !regionalCurve){
        seasonScore = 0.04;          // effectively out of range
        _seasonGateActive = true;
        _seasonOutOfRange = true;
      } else {
        const curve = regionalCurve || spEnc.seasons;

      // ── Path B: apply latitude shift ONLY when using the default curve ──
      let monthIdx = calMonth;
      if(!regionalCurve){
        const phase = (typeof MIGRATION_PHASE !== "undefined") ? MIGRATION_PHASE[speciesId] : null;
        if(phase && typeof phase.latPhase === "number" && typeof phase.refLat === "number"){
          monthIdx -= (lat - phase.refLat) * phase.latPhase;
        }
      }
      // Wrap and interpolate
      monthIdx = ((monthIdx % 12) + 12) % 12;
      const m0 = Math.floor(monthIdx);
      const m1 = (m0 + 1) % 12;
      const frac = monthIdx - m0;
      const v0 = curve[months[m0]] || 0;
      const v1 = curve[months[m1]] || 0;
      const v = v0 * (1 - frac) + v1 * frac;
      seasonScore = v / 3;
      _seasonGateActive = true;   // a real curve drove seasonScore — gate it
      }
    }
  }

  // ── Factor 8: Barometric pressure trend ──
  let pressureScore = 0.5;
  if(pressureTrend != null){
    if(pressureTrend < -3) pressureScore = 1.0;
    else if(pressureTrend < -1) pressureScore = 0.85;
    else if(pressureTrend < 1) pressureScore = 0.6;
    else if(pressureTrend < 3) pressureScore = 0.4;
    else pressureScore = 0.25;
  }

  // ── Factor 9: Solunar window ──
  const solunarScoreVal = solunar;

  // ── Factor 10: Tide stage (real NOAA CO-OPS predictions) ──
  // For inshore species: full tide influence (it's dominant for them).
  // For nearshore: moderate. For offshore: tide weight in W is 0, so this is irrelevant.
  // No tide data for this point (no station within range) → neutral, not synthetic.
  const tideScoreVal = tide == null ? 0.5
    : speciesCat === "inshore"
      ? (0.3 + 0.7 * tide)      // strong tide dependence
      : (0.55 + 0.45 * tide);   // moderate

  // ── Factor 11: Wind direction relative to structure (real buoy wind) ──
  const windScoreVal = windScore(lat, lng, prefs, windObj.dir);

  // ── Factor 12: Recent weather change ──
  const wxChangeScoreVal = 0.5;

  // ── Factor 13: Moon phase (multi-day lunar energy, independent of solunar) ──
  // Captures the full/new vs quarter moon influence on feeding aggression
  // through tidal range amplification and nighttime light. Same value
  // everywhere on the map at a given time — it's a multiplier on bite quality
  // for the day, not a spatial signal.
  const moonPhaseScoreVal = moonPhaseScore();

  // ── Weighted combination using the per-category weight table ──
  // Note: 'reports' is NOT in this weighted sum. Lack of a report is not
  // a negative signal — anglers just may not be posting. Reports are instead
  // applied as a pure additive bonus below.
  //
  // Use BW_FRESHNESS.combine when available so missing real feeds (SST/chlor/etc.)
  // are excluded and their weights are redistributed to surviving factors. That
  // keeps a map visible from depth/season/structure while confidence tells the
  // truth about unavailable feeds.
  const now = forecastTimeMs();
  const scoreFactors = [
    { key:"temp",   variable:"sst",      baseWeight:W.temperature,   score:tempScore,        observedAtMs:sstObj.observedAtMs },
    { key:"chlor",  variable:"chlor",    baseWeight:W.chlorophyll,   score:chlorScore,       observedAtMs:chlorObj.observedAtMs },
    { key:"wind",   variable:"wind",     baseWeight:W.wind,          score:windScoreVal,     observedAtMs:windObj.observedAtMs },
    { key:"pres",   variable:"pressure", baseWeight:W.pressure,      score:pressureScore,    observedAtMs:presObj.observedAtMs },
    { key:"depth",  variable:"depth",    baseWeight:W.depthStruct,   score:depthScore,       observedAtMs:now },
    { key:"structure", variable:"depth", baseWeight:(W.structure||0), score:structureScore,  observedAtMs:now },
    { key:"break",  variable:"sst",      baseWeight:W.thermalBreak,  score:breakScore,       observedAtMs:sstObj.observedAtMs },
    { key:"convergence", variable:"sst",  baseWeight:(W.convergence||0), score:convergence,  observedAtMs:sstObj.observedAtMs },
    { key:"solunar", variable:null,       baseWeight:W.solunar,       score:solunarScoreVal },
    { key:"tide",    variable:null,       baseWeight:W.tide,          score:tideScoreVal },
    { key:"season",  variable:null,       baseWeight:W.season,        score:seasonScore },
    { key:"weather", variable:null,       baseWeight:W.weatherChange, score:wxChangeScoreVal },
    { key:"moon",    variable:null,       baseWeight:W.moonPhase||0,  score:moonPhaseScoreVal },
  ];
  const fr = (typeof BW_FRESHNESS !== "undefined" && BW_FRESHNESS.combine)
    ? BW_FRESHNESS.combine(scoreFactors, now)
    : null;
  let finalScore = fr && typeof fr.finalScore === "number" ? fr.finalScore : (
    tempScore         * W.temperature   +
    chlorScore        * W.chlorophyll   +
    depthScore        * W.depthStruct   +
    structureScore    * (W.structure || 0) +
    breakScore        * W.thermalBreak  +
    convergence       * (W.convergence || 0) +
    seasonScore       * W.season        +
    pressureScore     * W.pressure      +
    solunarScoreVal   * W.solunar       +
    tideScoreVal      * W.tide          +
    windScoreVal      * W.wind          +
    wxChangeScoreVal  * W.weatherChange +
    moonPhaseScoreVal * (W.moonPhase || 0)
  );

  // ── REPORTS BONUS (additive, never subtractive) ──
  // reportScore is 0 when there are no nearby reports for this species; in
  // that case nothing is added. When positive reports exist, the score gets
  // a meaningful boost — proportional to the strength of the report match.
  // reportsBoost() returns up to 0.35, scaled here to a max +0.18 bonus.
  if(reportScore > 0){
    finalScore = finalScore + Math.min(reportScore * 0.55, 0.18);
  }
  // ── TEMPERATURE GATE ──
  // Like depth, temperature influences fish presence — but HOW MUCH depends on
  // the species category, which is the key correction here:
  //   • Offshore pelagics are temperature-LOCKED — a tuna physically cannot
  //     hold in 86°F water, so wrong temp is near-disqualifying (firm gate).
  //   • Inshore species (redfish, trout, sheepshead) are eurythermal — they
  //     tolerate wide temp swings and just shift to deeper water or feed at
  //     dawn/dusk rather than leaving. Temperature should barely gate them.
  //   • Nearshore sits in between.
  // Applying one temp gate to all categories wrongly crushed legitimate
  // inshore spots (e.g. redfish on a Tampa flat reading 86°F SST).
  //
  // NOTE ON GATE STRENGTH: SST comes from MUR L4 1km now, but demersal/reef and
  // warm-adapted species are scored on damped/bottom temps (see tempForScore),
  // so the gate stays moderate rather than nuking a fish sitting on a cool reef
  // under a hot surface.
  //   floor by category — gate = floor + (1-floor)*tempScore^exp
  const _tempGateFloor = speciesCat === "inshore"  ? 0.50   // firmer — cold water now actually bites
                       : speciesCat === "nearshore" ? 0.42
                       : 0.30;                                // offshore = firm
  const _tempGateExp   = speciesCat === "inshore"  ? 0.85 : 0.70;
  const tempGate = sst == null ? 1 : _tempGateFloor + (1 - _tempGateFloor) * Math.pow(tempScore, _tempGateExp);
  finalScore = finalScore * tempGate;

  // ── DEPTH GATE ──
  // Depth is decisive for ALL categories — a redfish can't be in 105m and a tuna
  // can't be on an 8m flat. Offshore stays firm (floor 0.22). Inshore/nearshore
  // use a softer floor (0.35): those zones already carry a high depthStruct weight
  // AND lean on imprecise/coarse depth, so a firm gate on top double-penalizes
  // the same reading. The higher floor relieves that without letting truly
  // wrong-depth water off the hook.
  //
  //   offshore  depthScore 0.0 → gate 0.22
  //   in/near   depthScore 0.0 → gate 0.35 (wrong-depth suppressed, not nuked twice)
  //   depthScore 1.0 → gate 1.00 (no penalty) in every zone
  // Tighten when real GEBCO bathymetry replaces synthDepth.
  const _depthGateFloor = (speciesCat === "inshore" || speciesCat === "nearshore") ? 0.35 : 0.22;
  const depthGate = _depthGateFloor + (1 - _depthGateFloor) * Math.pow(depthScore, 0.65);
  finalScore = finalScore * depthGate;

  // ── BLUE-WATER GATE (offshore pelagics only) ───────────────────────────────
  // GENERAL FIX for the "tuna lit up against the beach" glitch. True offshore
  // pelagics (tuna, billfish, wahoo, mahi) live on the SHELF EDGE and the warm
  // Gulf-Stream blue water beyond it — not on the inner shelf, even when the
  // inner-shelf temperature happens to be tolerable. The depth gate alone wasn't
  // enough: species like blackfin have a depth band starting at ~30m, which off
  // VA Beach is reached only a few miles out, so warm July inner-shelf water
  // scored red right up to shore.
  //
  // This gate requires genuine depth (a proxy for "you've reached the canyons /
  // Stream") for offshore species. It does NOT touch inshore/nearshore species,
  // and it intentionally EXEMPTS bluefin, which legitimately push onto the shelf
  // in the cold months (their depth bands include 18-40m). It also exempts deep
  // bottom-dwellers (tilefish), which live deep but aren't shelf-edge pelagics —
  // their depth band requirement already places them correctly. Depth is meters.
  const _bluewaterExempt = (speciesId === "bluefin") || !!prefs.bottom;
  if(speciesCat === "offshore" && !_bluewaterExempt && depth != null && depth > 0){
    // Ramp: <50m (inner shelf) heavily suppressed, ~50-180m (shelf edge)
    // climbing, >180m (true blue water) full credit. Smooth so the heat map
    // transitions cleanly from green inshore to red at the edge.
    let bluewaterGate;
    if(depth >= 180)      bluewaterGate = 1.0;
    else if(depth >= 50)  bluewaterGate = 0.35 + 0.65 * ((depth - 50) / (180 - 50));
    else                  bluewaterGate = 0.10 + 0.25 * (depth / 50);   // 0.10–0.35
    finalScore = finalScore * bluewaterGate;
  }

  // ── SEASON GATE ──
  // Seasonality, like temperature and depth, is DECISIVE, not a minor nudge.
  // As a plain weighted factor (W.season ≈ 0.04) a dead-wrong month only shaved
  // ~4% off the score, so an out-of-season fish on great-looking structure could
  // still read 90%+ (e.g. bluefin off Oregon Inlet in July, when they are simply
  // not in NC waters — the Hatteras run is a Dec-Mar winter fishery). A fish that
  // isn't present cannot be caught no matter how good the water is, so we gate the
  // whole score by seasonal presence.
  //
  // Only applied when this species actually has a seasonal curve for THIS
  // location (regional curve, or a default curve). If neither exists we leave the
  // score untouched (gate = 1) rather than guessing.
  //   seasonScore 1.0 (peak)  → gate 1.00 (no penalty)
  //   seasonScore 0.66 (good) → gate ~0.88
  //   seasonScore 0.33 (slow) → gate ~0.55
  //   seasonScore 0.0 (off)   → gate 0.06 (effectively absent — "poor")
  // Floor is a small non-zero so a freak straggler still shows a faint trace
  // rather than a hard zero, but it can never read "good"/"excellent".
  if(_seasonGateActive){
    // WARM-CORE RANGE EXTENSION: an active warm-water Stream intrusion (real warm
    // SST + strong current) pulls pelagics in early/late, so treat the LOCAL
    // season as somewhat stronger for the gate only — the displayed Season factor
    // is unchanged. Bounded at +0.30 and capped at 0.85 so a Stream filament can
    // make a shoulder-season area fish well, but can never manufacture a "prime"
    // reading out of a dead month. (Deep winter self-excludes: no warm SST → no
    // _streamInf01, so this term is 0 there.)
    const effSeason = _streamInf01 > 0
      ? Math.min(0.85, seasonScore + 0.30 * _streamInf01)
      : seasonScore;
    const _seasonGateFloor = 0.06;
    const seasonGate = _seasonGateFloor + (1 - _seasonGateFloor) * Math.pow(effSeason, 0.55);
    finalScore = finalScore * seasonGate;
    // Out-of-season is also a HIGH-confidence call (the fish simply aren't here),
    // which is handled in the confidence-adjustment block below. Here we cap the
    // score so an off-season fish can't read good/excellent no matter how good
    // the water looks.
    if(effSeason < 0.2){
      finalScore = Math.min(finalScore, 0.22);   // hard ceiling = "poor"
    } else if(effSeason < 0.4){
      finalScore = Math.min(finalScore, 0.45);   // ceiling = low "fair"
    }
  }

  // ── SALINITY GATE (salinity-sensitive species) ─────────────────────────────
  // The model classifies water by depth/geography but has no salinity field, so
  // brackish, low-salinity water up inside rivers and the upper bay was scoring
  // as good habitat for species that actually need higher salinity. Cobia and
  // redfish, for example, hold near the bay MOUTH and lower river — not up the
  // brackish James/upper Chesapeake. We apply a salinity proxy: estimate
  // relative salinity (0 = fresh, 1 = full-strength ocean) from how far a point
  // sits up an estuary, then penalize species that want salt when salinity is
  // low. This pulls the recommended cobia/redfish spots down to the saltier
  // lower/mid bay where they belong, instead of up the river.
  const _salPref = prefs.salinityPref || (prefs.chlorPref === "high" ? "high" : "any");
  if(_salPref !== "any" && typeof estuarySalinity === "function"){
    const sal = estuarySalinity(lat, lng);   // 0..1, 1 = ocean
    if(sal != null){
      // "high"   → needs salt (cobia, redfish, flounder, drum, sheepshead…)
      // "moderate" → tolerant but still wants brackish-to-salty (striper, snook)
      let salScore;
      if(_salPref === "high"){
        // Below ~18 ppt (sal ~0.5) these fish thin out fast; below ~10 ppt rare.
        salScore = Math.max(0, Math.min(1, (sal - 0.28) / (0.85 - 0.28)));
      } else { // moderate / brackish-tolerant
        salScore = Math.max(0, Math.min(1, (sal - 0.08) / (0.55 - 0.08)));
      }
      // Gate: salinity is decisive for these fish. Floor keeps a faint trace.
      const salGate = 0.10 + 0.90 * Math.pow(salScore, 0.7);
      finalScore = finalScore * salGate;
    }
  }

  // ── STRUCTURE-PROXIMITY BONUS (structure-oriented species) ─────────────────
  // Open flat bay/sound bottom was scoring as well as nearby ledges, rips, and
  // shoals. For structure-oriented fish (those whose breakPref is "stable" —
  // reef/ledge/wreck holders like sea bass, tog, sheepshead, cobia on shoals)
  // proximity to mapped structure should lift the score so the ledges read
  // hotter than the open sound (e.g. Cape Cod: the rips/ledges should beat
  // open Nantucket Sound). We give a smooth bonus that decays with distance to
  // the nearest mapped structure of interest, capped so it shapes — not
  // dominates — the field.
  if(prefs.breakPref === "stable" && typeof nearestStructureNm === "function"){
    const dNm = nearestStructureNm(lat, lng, speciesId);
    if(dNm != null){
      // Full bonus within ~2nm of structure, fading to none by ~12nm.
      const prox = Math.max(0, Math.min(1, (12 - dNm) / (12 - 2)));
      finalScore = finalScore * (1 + 0.35 * prox);   // up to +35% on structure
    }
  }

  // Cap at 1.0 so we don't exceed the heat-map's full-intensity range (the
  // structure-proximity bonus above can push slightly past 1.0).
  finalScore = Math.min(1.0, finalScore);

  // ── SCORE NORMALIZATION ──
  // The raw weighted average compresses into ~0.25-0.70 because most secondary
  // factors (solunar, season, tide, pressure, moon) rarely hit 1.0 even under
  // great conditions — they pull the weighted mean toward the middle. That
  // makes the heat map hard to read: a genuinely excellent spot (0.68 raw)
  // looks similar to a mediocre one (0.45 raw).
  //
  // normalizeScore expands the realistic operating band across the full 0-1
  // display range. It's strictly monotonic, so cell RANKING is unchanged —
  // we're only stretching contrast, not reordering hotspots.
  const rawScoreBeforeNorm = finalScore;
  finalScore = normalizeScore(finalScore);

  const confidenceFallback = { confidence: Math.min(95, 25 + [tempScore, chlorScore, depthScore, breakScore].filter(s => s > 0.7).length * 5), annotations: [] };
  const frSummary = fr || confidenceFallback;
  let confidence = frSummary.confidence;
  const freshnessAnnotations = (frSummary.annotations || []).slice();

  // ── CONFIDENCE ADJUSTMENTS (certainty, not favorability) ───────────────────
  // Confidence answers "how SURE are we about this bite score?", in EITHER
  // direction. The base figure above only rises with positive data, so it has no
  // way to express "we are very sure the bite is POOR." These adjustments fix
  // that: some conditions make the prediction MORE certain (we can confidently
  // call it bad), while genuinely ambiguous conditions make it LESS certain.
  // Each adjustment also adds a one-line note to the "What's affecting
  // confidence" panel so the number is explainable.

  // 1) OUT OF SEASON / OUT OF RANGE → HIGH confidence the bite is poor.
  //    If the fish isn't in this region this month, that's one of the most
  //    reliable predictions we can make. We don't water it down — we RAISE
  //    confidence and say why. Strength scales with how far out of season it is.
  if(_seasonOutOfRange){
    confidence = Math.max(confidence, 92);
    freshnessAnnotations.push({ variable: "season",
      message: "Outside this species' known range here — high confidence the bite is poor." });
  } else if(_seasonGateActive && seasonScore < 0.2){
    confidence = Math.max(confidence, 90);
    freshnessAnnotations.push({ variable: "season",
      message: "Out of season here — high confidence the bite is poor this month." });
  } else if(_seasonGateActive && seasonScore < 0.4){
    confidence = Math.max(confidence, 75);
    freshnessAnnotations.push({ variable: "season",
      message: "Marginal season — fish are mostly elsewhere this month." });
  }

  // 2) STRONG MULTI-FACTOR AGREEMENT → more certain (in either direction).
  //    When the major spatial signals (temp, depth, thermal break, chlorophyll)
  //    all point the SAME way — all hot, or all cold — the prediction is robust.
  //    When they disagree (one screaming hot, others flat), we're genuinely less
  //    sure, so we trim confidence. Variance of the core factor scores measures
  //    this directly.
  {
    const core = [tempScore, depthScore, breakScore, chlorScore];
    const mean = core.reduce((a, b) => a + b, 0) / core.length;
    const variance = core.reduce((a, b) => a + (b - mean) * (b - mean), 0) / core.length;
    if(variance > 0.10){
      // Factors strongly disagree → real ambiguity.
      confidence = Math.max(20, confidence - 12);
      freshnessAnnotations.push({ variable: "agreement",
        message: "Signals disagree (one factor strong, others weak) — lower certainty." });
    } else if(variance < 0.02){
      // Tight agreement → modest confidence boost, capped so freshness still rules.
      confidence = Math.min(95, confidence + 6);
    }
  }

  // 3) FORECASTING INTO THE FUTURE → less certain the further out we look.
  //    A "now" prediction leans on observed conditions; a +72h prediction leans
  //    on a model forecast that drifts. Taper confidence with lead time so the
  //    number honestly reflects that growing uncertainty.
  {
    const leadHrs = Math.max(0, (now - Date.now()) / 3600000);
    if(leadHrs >= 6){
      const drop = Math.min(20, Math.round(leadHrs / 12) * 4);  // ~4% per 12h, max 20%
      if(drop > 0){
        confidence = Math.max(20, confidence - drop);
        freshnessAnnotations.push({ variable: "leadtime",
          message: `Forecast is ${Math.round(leadHrs)}h out — certainty tapers with lead time.` });
      }
    }
  }

  // 4) WRONG TEMPERATURE FOR AN OFFSHORE PELAGIC → confident it's poor.
  //    Tuna/marlin are temperature-locked; water well outside their tolerance is
  //    a near-disqualifier, so a low temp score on an offshore species is a
  //    high-confidence "no", not a maybe.
  if(speciesCat === "offshore" && !_isBottom && sst != null && tempScore < 0.25){
    confidence = Math.max(confidence, 80);
    freshnessAnnotations.push({ variable: "temp",
      message: "Water is well outside this species' range — confidently poor." });
  }

  // 5) OFFSHORE PELAGIC IN SHALLOW SHELF WATER → confident it's poor.
  //    Tuna/billfish hold at the shelf edge and beyond; inner-shelf water is the
  //    wrong habitat regardless of temperature, so this is a high-confidence "no".
  //    Excludes bluefin (shelf-feeders in season) and bottom-dwellers (tilefish).
  if(speciesCat === "offshore" && !(speciesId === "bluefin") && !_isBottom && depth != null && depth > 0 && depth < 50){
    confidence = Math.max(confidence, 82);
    freshnessAnnotations.push({ variable: "depth",
      message: "Too far inshore for an offshore species — the bite is at the shelf edge." });
  }

  confidence = Math.max(20, Math.min(95, Math.round(confidence)));

  // ── Build factor contributions for the explainer panel ──
  // Skip factors with zero weight (they don't apply to this species category)
  const moonName = moon < 0.08 || moon > 0.92 ? "new" :
                   Math.abs(moon - 0.5) < 0.08 ? "full" :
                   moon < 0.5 ? "waxing" : "waning";
  // Weather-change factor is held neutral in the production path (synthetic
  // weather data was removed and no real weather-shift feed is wired yet), so the
  // label is a fixed neutral value rather than reading the removed wxChange object.
  const wxLabel = "steady";

  const allFactors = [
    {name:"Water temperature",  weight:W.temperature,   score:tempScore,        raw: (_isBottom || _isDemersal) ? (tempForScore != null ? `~${Math.round(tempForScore)}°F bottom` : "—") : (sst != null ? `${sst.toFixed(1)}°F` : "—")},
    {name:"Depth/structure",    weight:W.depthStruct,   score:depthScore,       raw:`${Math.round(depth * 3.28084)} ft`},
    {name:"Bottom structure",   weight:(W.structure||0), score:structureScore,
     raw: structureScore > 0.05 ? `${Math.round(structureScore*100)}% · edge/slope` : "flat bottom"},
    {name:"Pressure trend",     weight:W.pressure,      score:pressureScore,    raw:pressureTrend != null ? `${pressureTrend.toFixed(1)} hPa` : "—"},
    {name:"Chlorophyll",        weight:W.chlorophyll,   score:chlorScore,
     raw: chlor != null
          ? `${chlor.toFixed(2)} mg/m³` + (prefs.chlorPref === "edge" && chlorBreak > 0 ? ` · ${chlorBreak.toFixed(2)}/10nm edge` : "")
          : "—"},
    // Reports: only shown when there ARE positive nearby reports. Absence of
    // reports is not a negative signal so we don't display a "—" row that
    // suggests one. Weight shown is an effective bonus weight.
    ...(reportScore > 0.05 ? [{name:"🎣 Recent catch reports", weight:0.18, score:Math.min(1, reportScore * 2.5), raw:"+bonus"}] : []),
    {name:"Solunar window",     weight:W.solunar,       score:solunarScoreVal,  raw:solunar > 0.7 ? "MAJOR" : solunar > 0.4 ? "minor" : "off"},
    {name:BITE_FACTOR_TEMP_BREAK, weight:W.thermalBreak,  score:breakScore,
     raw: frontSensor === "ssh"
          ? (tBreak > 0 ? `SSH front · ${tBreak.toFixed(1)}°F/10nm` : "SSH front")
          : (tBreak > 0 ? `${tBreak.toFixed(1)}°F/10nm` : (_sshEdge01 > 0 ? "SSH front" : "—"))},
    {name:BITE_FACTOR_FRONT_CONVERGENCE, weight:(W.convergence||0), score:convergence,
     raw: convergence > 0
          ? `${Math.round(convergence*100)}% stack` + (
              [_sshEdge01>0?"SSH":null, _curEdge01>0?"current":null, chlorBreak>0?"color":null]
                .filter(Boolean).length
                ? ` · ` + [_sshEdge01>0?"SSH":null, _curEdge01>0?"current":null, chlorBreak>0?"color":null].filter(Boolean).join("+")
                : ""
            )
          : "—"},
    {name:"Tide stage",         weight:W.tide,          score:tideScoreVal,     raw:tide == null ? "—" : (tideObj.state ? tideObj.state + (tide > 0.6 ? " (ripping)" : tide > 0.25 ? " (moving)" : " (slack)") : (tide > 0.6 ? "ripping" : tide > 0.25 ? "moving" : "slack"))},
    {name:"Weather change",     weight:W.weatherChange, score:wxChangeScoreVal, raw:wxLabel},
    {name:"Season alignment",   weight:W.season,        score:seasonScore,      raw:seasonScore > 0.66 ? "peak" : seasonScore > 0.33 ? "good" : "off"},
    {name:"Moon phase",         weight:W.moonPhase || 0,score:moonPhaseScoreVal,raw:moonName.toUpperCase()},
    {name:"Wind direction",     weight:W.wind,          score:windScoreVal,     raw:windObj.dir != null ? `${Math.round(windObj.dir)}°` : "—"}]
  // Drop factors that aren't applicable to this species category
  .filter(f => f.weight > 0)
  // Keep BOTH the factor's own 0–1 quality (how good this signal is here — drives
  // the display bar so "peak"/"MAJOR" reads as a full bar) AND its weighted
  // contribution (quality×weight — drives the sort so the biggest drivers lead).
  .map(f => ({...f, quality: Math.max(0, Math.min(1, f.score)), score: f.score*f.weight}))
  .sort((a,b) => b.score - a.score);

  // Human-readable top-factor summary for the brief & explainer. allFactors is
  // already sorted by weighted contribution, so [0] is the single biggest driver
  // of this cell's score. We surface the top few with their raw readings so the
  // Captain's Brief can explain the "why" in the SAME language as the map.
  const _rankedFactors = allFactors
    .filter(f => f && f.name)
    .map(f => ({ factor: String(f.name).replace(/^[^\w]+\s*/, ""), detail: (f.raw != null && f.raw !== "—") ? String(f.raw) : null }));
  const topFactor = _rankedFactors.length ? _rankedFactors[0].factor : null;
  const topFactors = _rankedFactors.slice(0, 3);

  return {
    score: Math.max(0, Math.min(1, finalScore)),
    rawScore: Math.max(0, Math.min(1, rawScoreBeforeNorm)),
    confidence,
    freshnessAnnotations,
    sst, chlor, depth, tBreak,
    pressureTrend, solunar, tide, moon: moonName,
    weatherShift: wxLabel,
    speciesCat,
    factors: allFactors,
    // Surfaced for the Captain's Brief (were previously missing → brief showed
    // "Top factor: Not specified"). inSeason reflects whether this species
    // actually belongs in this area/time; seasonStrength is the 0–1 seasonal fit.
    topFactor,
    topFactors,
    inSeason: !_seasonOutOfRange,
    outOfRange: _seasonOutOfRange,
    seasonStrength: Math.round(seasonScore * 100) / 100,
  };
}

// ── COMPUTE GRID ─────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// GEOGRAPHY HELPERS — coast/shore reference functions
//
// These four functions form the foundation of the land/water classifier.
// They identify which "coast context" a given lat/lng belongs to (Atlantic
// vs Gulf) and provide the shoreline reference for distance-to-coast and
// land-side rejection logic.
// ════════════════════════════════════════════════════════════════════════════

// Returns TRUE if this lat/lng is in the Gulf of Mexico region (where the
// water-is-south-of-shore rule applies), FALSE if it's in the Atlantic
// region (water-is-east-of-shore). The threshold roughly follows the FL
// peninsula's tip and the FL panhandle.
function isGulfContext(lat, lng){
  // West of the Gulf of Mexico's western edge (~-98°) is the Pacific / Mexican
  // Pacific — NOT the Gulf. Without this guard the old `lng < -84` rule wrongly
  // classified the entire US West Coast as "Gulf", which broke Pacific ranges,
  // shelf depth, and offshore reach for California ports.
  if(lng < -98.5) return false;
  if(lng < -82.0 && lat < 30.7) return true;
  if(lng < -84.0) return true;
  return false;
}

// US Pacific (Southern/Central California) context. Kept fully separate from the
// Atlantic/Gulf model so West-Coast fishing gets its own bite-map extent and
// species list without changing any East Coast behavior. All US Pacific fishing
// water sits west of ~-116.5°; no Atlantic/Gulf port is anywhere near that
// longitude, so this can never trigger for an East Coast/Gulf location.
function isPacificContext(lat, lng){
  return lng != null && lng <= -116.5 && lat >= 28.0 && lat <= 42.5;
}

// ── Florida peninsula coast constraint ──────────────────────────────────────
// The FL peninsula separates the Gulf (west) from the Atlantic (east). A boat
// out of a Gulf-coast port (e.g. Naples) will NOT run around the tip to fish the
// Atlantic side, and vice-versa — so the bite map / hotspots must stay on the
// SAME coast as the departure port. The Keys (south of the tip) are exempt: from
// there a captain can run either direction. Outside the peninsula (panhandle, GA
// and north) the coastline is continuous and the fishing range can't reach the
// opposite ocean, so no constraint is applied there.

// Approx longitude of the peninsula land "spine" by latitude. Water WEST of this
// is the Gulf side; water EAST is the Atlantic side. (Water cells sit well to one
// side of land, so the threshold need only be roughly down the middle.)
function flPeninsulaDivide(lat){
  if(lat >= 30.0) return -82.4;
  if(lat >= 29.0) return -82.0;
  if(lat >= 28.0) return -81.7;
  if(lat >= 27.0) return -81.5;
  if(lat >= 26.0) return -81.1;
  return -80.9; // 25.3 .. 26.0
}
// Which FL coast a port sits on: "gulf", "atlantic", or null (no constraint —
// Keys ports, panhandle/west of the peninsula, and everything north of FL).
function portCoastSide(port){
  if(!port || typeof port.lat !== "number" || typeof port.lng !== "number") return null;
  if(port.lat < 25.3 || port.lat > 30.9) return null;  // Keys / non-peninsula
  if(port.lng < -88.0) return null;                    // panhandle (Gulf only)
  return port.lng < flPeninsulaDivide(port.lat) ? "gulf" : "atlantic";
}
// True if a candidate cell is reachable from the port without rounding the tip of
// Florida. Only constrains the peninsula band; Keys-band cells and ports without
// a coast side are always reachable.
function reachableFromPort(port, lat, lng){
  const side = portCoastSide(port);
  if(!side) return true;                 // no peninsula constraint for this port
  if(lat < 25.3 || lat > 30.9) return true;  // Keys / outside the peninsula band
  const cellSide = lng < flPeninsulaDivide(lat) ? "gulf" : "atlantic";
  return cellSide === side;
}

// Gulf-side shoreline reference: returns the LATITUDE of the shore for a
// given longitude. Water lies SOUTH of (lat < return value). 28 bands from
// Brownsville TX east to Naples FL.
function gulfShoreLat(lng){
  if(lng < -97.0) return 27.20;
  if(lng < -96.5) return 27.70;
  if(lng < -95.7) return 28.40;
  if(lng < -95.0) return 28.80;
  if(lng < -94.3) return 29.20;
  if(lng < -93.5) return 29.65;
  if(lng < -92.0) return 29.55;
  if(lng < -91.0) return 29.30;
  if(lng < -90.3) return 29.20;
  if(lng < -89.6) return 29.00;
  if(lng < -89.0) return 29.00;
  if(lng < -88.4) return 30.25;
  if(lng < -87.8) return 30.20;
  if(lng < -87.4) return 30.25;
  if(lng < -86.8) return 30.30;
  if(lng < -86.0) return 30.35;
  if(lng < -85.4) return 30.10;
  if(lng < -84.5) return 29.65;
  if(lng < -83.8) return 29.85;
  if(lng < -83.2) return 29.40;
  if(lng < -83.0) return 29.10;
  if(lng < -82.8) return 28.65;
  if(lng < -82.7) return 28.00;
  if(lng < -82.5) return 27.50;
  if(lng < -82.3) return 26.95;
  if(lng < -82.0) return 26.50;
  if(lng < -81.85) return 26.00;
  return 25.80;
}

// Returns approximate nautical miles offshore from the nearest shoreline.
// Used by the weather widget for buoy distance display. Now delegates to the
// more accurate mainlandCoastLng function.
function nmOffshore(lat, lng){
  if(isGulfContext(lat, lng)){
    const shoreLat = gulfShoreLat(lng);
    return Math.max(0, (shoreLat - lat) * 60);
  } else {
    const shoreLng = mainlandCoastLng(lat);
    const nmPerDegLng = 60 * Math.cos(lat * Math.PI / 180);
    return Math.max(0, (lng - shoreLng) * nmPerDegLng);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BATHYMETRY-BASED HABITAT MODEL
//
// Water depth is the right primary signal for fish habitat — not distance
// from shore. Sailfish at 200m depth off Miami (4nm out) are in the same
// habitat as sailfish at 200m depth off NC (40nm out). Same fish, same depth,
// same conditions.
//
// seaDepth() returns the approximate depth in meters at a given location,
// using regionally-tuned shelf-width parameters. Returns 0 or negative on
// land. The model captures:
//   - Wide continental shelf in the Mid-Atlantic (60-90nm to shelf break)
//   - Narrow shelf at Cape Hatteras (25-30nm to canyons)
//   - Very narrow shelf off SE Florida (5-15nm to deep blue water)
//   - Extremely wide Gulf shelf (100nm+ in much of TX/LA/west FL)
//   - Outer Banks barrier islands AND mainland coast separately
// ════════════════════════════════════════════════════════════════════════════

// Returns the mainland coast longitude — where the actual continent ends.
// This is the line that, west of it, is solid land (no fishing). For OBX
// region this is the mainland shore, NOT the barrier islands.
function mainlandCoastLng(lat){
  // New England
  if(lat > 43.5) return -70.40;
  if(lat > 43.0) return -70.65;
  if(lat > 42.5) return -70.55;
  if(lat > 42.1) return -70.40;
  if(lat > 41.8) return -70.05;
  if(lat > 41.4) return -71.30;
  if(lat > 41.0) return -71.65;
  if(lat > 40.5) return -73.50;   // Long Island
  if(lat > 40.0) return -73.95;   // NJ
  if(lat > 39.5) return -74.40;
  if(lat > 38.8) return -74.90;
  if(lat > 38.2) return -75.05;
  if(lat > 37.5) return -75.65;
  if(lat > 37.0) return -76.10;
  if(lat > 36.5) return -75.95;   // VA Beach
  // NC Mainland coast — Pamlico/Albemarle region
  if(lat > 36.0) return -76.10;
  if(lat > 35.5) return -76.50;   // Mainland west of Pamlico Sound
  if(lat > 35.0) return -76.65;
  if(lat > 34.85) return -76.70;  // Mainland near Cedar Island
  if(lat > 34.65) return -76.75;  // Mainland near Morehead City (actual mainland)
  if(lat > 34.50) return -76.85;  // Mainland Bogue area
  if(lat > 34.2) return -77.80;   // Wilmington area mainland
  if(lat > 33.7) return -78.10;
  if(lat > 33.2) return -78.65;
  if(lat > 32.7) return -79.40;   // Charleston
  if(lat > 32.0) return -80.50;   // Savannah
  if(lat > 31.0) return -81.20;
  if(lat > 30.4) return -81.45;   // Jacksonville
  if(lat > 29.5) return -80.90;
  if(lat > 28.5) return -80.60;
  if(lat > 27.5) return -80.30;
  if(lat > 26.5) return -80.10;
  if(lat > 25.5) return -80.15;
  return -80.40;
}

// Returns the EFFECTIVE eastern coastline longitude — for the Outer Banks
// region this is the barrier island position. East of this is the open
// Atlantic. Between barrierLng and mainlandLng is sound/bay water.
function barrierCoastLng(lat){
  // Most of the East Coast: mainland IS the eastern coast (no barrier islands).
  // Only OBX/Delmarva have significant barrier island chains.
  // Delmarva (VA/MD coast): mainland coast already at the eastern edge of
  //   the peninsula at -75.x, so barrierLng = mainlandLng essentially.
  // Outer Banks (NC): barrier islands sit 10-25nm east of mainland.
  if(lat >= 36.0 && lat <= 36.55){
    return -75.65;  // Currituck Banks (north OBX)
  }
  if(lat >= 35.55 && lat < 36.0){
    return -75.45;  // Nags Head / Bodie Island
  }
  if(lat >= 35.20 && lat < 35.55){
    return -75.45;  // Hatteras Island (curves east)
  }
  if(lat >= 34.95 && lat < 35.20){
    return -75.75;  // Ocracoke
  }
  if(lat >= 34.65 && lat < 34.95){
    return -76.30;  // Core Banks → Cape Lookout
  }
  if(lat >= 34.55 && lat < 34.65){
    return -76.60;  // Bogue Banks / Shackleford
  }
  // Default: no significant barrier island offset
  return mainlandCoastLng(lat);
}

// Gulf-side shoreline (already used by isGulfContext). Water lies SOUTH.
// Reused from earlier; keeping the function definition local for clarity.
// (gulfShoreLat is defined elsewhere in the file.)

// ── Region-specific shelf width parameters ──
// For each Atlantic latitude band, returns the distance (in degrees of
// longitude) from the barrier coastline to the shelf break (where depth
// rapidly drops from ~200m to >1000m). Captures real shelf width variation.
function atlanticShelfWidthDeg(lat){
  if(lat > 42.5) return 1.6;    // Georges Bank — very wide
  if(lat > 41.5) return 1.4;
  if(lat > 40.5) return 1.2;
  if(lat > 39.5) return 1.10;   // Hudson Canyon area
  if(lat > 38.5) return 1.00;
  if(lat > 37.5) return 0.95;   // Norfolk Canyon (the "550 line" - ~70nm out)
  if(lat > 36.5) return 0.85;
  if(lat > 35.7) return 0.45;   // Oregon Inlet shelf - narrowing
  if(lat > 35.3) return 0.35;   // Hatteras shelf - very narrow at the cape
  if(lat > 35.0) return 0.40;
  if(lat > 34.5) return 0.55;   // Cape Lookout
  if(lat > 33.5) return 0.80;   // Frying Pan
  if(lat > 32.5) return 0.85;   // Charleston
  if(lat > 31.5) return 0.95;
  if(lat > 30.5) return 0.85;
  if(lat > 29.5) return 0.50;   // NE FL narrowing
  if(lat > 28.5) return 0.25;   // Canaveral
  if(lat > 27.5) return 0.15;   // FL east coast - narrow shelf
  if(lat > 26.0) return 0.10;   // Palm Beach - very narrow
  return 0.10;                   // Miami, Keys - extremely narrow
}

// Gulf shelf width — generally very wide.
function gulfShelfWidthDeg(lng){
  if(lng < -97.0) return 1.5;
  if(lng < -95.0) return 1.8;
  if(lng < -92.0) return 2.0;   // Louisiana mid-shelf - wide
  if(lng < -89.0) return 1.6;
  if(lng < -88.0) return 0.4;   // Mississippi River canyon close to shore
  if(lng < -86.5) return 0.7;
  if(lng < -84.5) return 0.5;   // FL panhandle (Desoto Canyon)
  if(lng < -83.0) return 2.5;   // Big Bend / Apalachee Bay - very wide flats
  return 1.5;                    // West FL
}

// ════════════════════════════════════════════════════════════════════════════
// COASTLINE POLYGONS — the source of truth for land vs water.
//
// Each polygon is an array of [lat, lng] vertices traced along the actual
// coastline. Point-in-polygon ray casting determines if any lat/lng is on
// land or in water. This replaces the old lat/lng-band approach which failed
// at peninsulas (Delmarva, Florida) and capes (Cod, Hatteras) where a single
// "shore longitude per latitude" couldn't represent the real geometry.
//
// MAIN_COAST is the continental US from approximately Eastport ME south down
// the East Coast, around the FL peninsula, west across the Gulf, ending at
// the TX/Mexico border. The polygon is closed by tracing far inland (across
// the continental interior) so anything west/inland of the coast is captured
// as "land".
//
// Additional polygons handle separate landmasses: Long Island, Cape Cod arm,
// FL Keys chain.
// ════════════════════════════════════════════════════════════════════════════

const MAIN_COAST = [
  // ── MAINE/NH/MA northern coast (Eastport south to Cape Ann) ──
  [44.90, -66.95], [44.50, -67.40], [44.10, -68.20], [43.85, -68.95],
  [43.65, -69.65], [43.30, -70.20], [42.95, -70.75], [42.65, -70.62],
  // ── MA outer coast: Cape Ann → MA Bay (note: MA_MAINLAND_FILL covers
  // Boston/South Shore mainland separately so we can keep MAIN_COAST as a
  // clean arc here without trying to trace the harbor in detail) ──
  [42.55, -70.80],
  // ── Direct jump to RI/CT coast — the gap is filled by MA_MAINLAND_FILL ──
  [41.55, -71.10],
  // ── CT coast / Long Island Sound's north shore ──
  [41.30, -71.85], [41.10, -73.10], [40.90, -73.65], [40.80, -73.90], [40.70, -74.05],
  // ── NJ coast ──
  [40.55, -74.10], [40.40, -74.05], [40.10, -74.05], [39.75, -74.10],
  [39.40, -74.40], [39.05, -74.80], [38.95, -74.95],
  // ── Delaware Bay mouth → Cape May NJ jumps to Cape Henlopen DE ──
  [38.80, -75.05], [38.45, -75.05],
  // ── Delmarva ATLANTIC side (south down peninsula) ──
  [38.20, -75.10], [37.95, -75.25], [37.60, -75.55], [37.20, -75.75],
  // ── Mouth of Chesapeake (Cape Charles tip → cross to Virginia Beach) ──
  [37.10, -75.95], [37.00, -75.95], [36.92, -75.97], [36.85, -75.95],
  // ── VA Beach coastline (oceanfront) ──
  [36.80, -75.95], [36.70, -75.92],
  // ── NC Outer Banks coast (barrier islands trace, south to Cape Lookout) ──
  [36.55, -75.85], [36.10, -75.70], [35.85, -75.50], [35.55, -75.45],
  [35.25, -75.45], [35.05, -75.55], [34.80, -76.30], [34.65, -76.55],
  // ── NC south coast (Cape Lookout south to SC) ──
  [34.55, -76.80], [34.35, -77.30], [34.00, -77.85], [33.85, -78.00],
  // ── SC coast ──
  [33.70, -78.45], [33.50, -78.95], [33.20, -79.20], [32.80, -79.55],
  [32.50, -80.00],
  // ── GA coast ──
  [32.15, -80.50], [31.90, -80.85], [31.40, -81.20], [31.00, -81.40],
  [30.70, -81.45],
  // ── FL Atlantic coast (north to south) ──
  [30.40, -81.45], [30.10, -81.30], [29.60, -81.20], [29.20, -80.95],
  [28.80, -80.70], [28.40, -80.55], [28.00, -80.50], [27.50, -80.30],
  [27.00, -80.15], [26.50, -80.05], [26.00, -80.10], [25.70, -80.10],
  [25.40, -80.15],
  // ── FL southern tip (continental, NOT the Keys arc — that's a separate poly) ──
  [25.30, -80.30], [25.20, -80.55], [25.10, -80.85], [25.10, -81.10],
  [25.20, -81.25], [25.40, -81.35], [25.65, -81.40],
  // ── FL Gulf coast (south to north) ──
  [25.85, -81.55], [26.10, -81.75], [26.40, -81.95], [26.55, -82.05],
  [26.75, -82.10], [27.00, -82.25], [27.40, -82.45], [27.70, -82.60],
  [28.00, -82.75], [28.30, -82.70], [28.65, -82.75], [28.90, -82.80],
  [29.20, -82.90], [29.55, -83.20], [29.80, -83.55], [29.95, -84.00],
  // ── FL Panhandle (Apalachicola west) ──
  [29.85, -84.50], [29.75, -84.85], [29.70, -85.30], [30.00, -85.60],
  [30.15, -86.00], [30.20, -86.50], [30.25, -86.85], [30.30, -87.25],
  // ── AL coast ──
  [30.20, -87.70], [30.35, -87.95], [30.40, -88.20],
  // ── MS coast ──
  [30.30, -88.60], [30.25, -89.00], [30.20, -89.40], [30.20, -89.80],
  // ── LA coast (Mississippi delta, Barataria, Atchafalaya, Vermilion) ──
  [30.15, -90.30], [29.95, -90.50], [29.70, -90.20], [29.40, -90.10],
  [29.20, -90.30], [29.00, -90.60], [28.90, -91.00], [29.00, -91.40],
  [29.30, -91.80], [29.55, -92.20], [29.65, -92.80], [29.70, -93.30],
  // ── TX coast (Sabine, Galveston, Matagorda, Corpus, south to border) ──
  [29.70, -93.80], [29.65, -94.20], [29.40, -94.70], [29.25, -94.90],
  [29.00, -95.20], [28.65, -95.70], [28.45, -96.00], [28.20, -96.50],
  [27.85, -97.00], [27.50, -97.20], [27.20, -97.40], [26.85, -97.40],
  [26.50, -97.40], [26.10, -97.20], [25.85, -97.15],
  // ── Close the polygon by tracing far inland (continental interior) ──
  // These vertices don't trace real geography — they just close the loop
  // so that ALL points inside the continent are classified as land.
  [25.50, -98.50], [26.00, -100.00], [30.00, -102.00], [35.00, -100.00],
  [40.00, -90.00], [44.00, -80.00], [45.00, -75.00], [45.00, -68.00],
  // ── Back to start ──
  [44.90, -66.95],
];

// Long Island, NY (separate landmass east of NYC). Traced as a closed
// polygon: south shore east to Montauk, then north shore back west.
const LONG_ISLAND = [
  // South shore from Coney Island east to Montauk Point
  [40.57, -74.00],   // Coney Island / Brooklyn south
  [40.60, -73.75],   // JFK area
  [40.62, -73.50],   // Long Beach
  [40.65, -73.00],   // Jones Beach
  [40.70, -72.60],   // Westhampton south
  [40.78, -72.30],   // Quogue
  [40.90, -72.10],   // Southampton
  [41.05, -71.85],   // Montauk
  // North shore from Montauk back west
  [41.10, -72.10],   // North Fork tip
  [41.05, -72.40],   // Greenport
  [40.97, -72.60],   // Riverhead
  [40.93, -73.00],   // Smithtown / Northport
  [40.88, -73.30],   // Oyster Bay
  [40.82, -73.55],   // Manhasset
  [40.75, -73.85],   // Queens NE
  [40.65, -73.95],   // Brooklyn east
  [40.57, -74.00],   // back to start
];

// Cape Cod (separate landmass — fishhook shape from Bourne to Provincetown
// and back south to Chatham/Monomoy). The polygon traces the outer shore
// counter-clockwise so interior = land.
const CAPE_COD = [
  // Start at the southwest (Woods Hole / Falmouth) and trace clockwise
  [41.50, -70.72],   // Woods Hole SW (extended further west and south)
  [41.55, -70.50],   // South Cape coast
  [41.55, -70.20],   // Hyannis
  [41.55, -69.95],   // Chatham SW
  [41.65, -69.92],   // Chatham
  [41.80, -69.93],   // Wellfleet outer
  [41.95, -69.97],   // Truro outer
  [42.05, -70.00],   // Race Point
  [42.10, -70.15],   // Provincetown tip (extended slightly west to be safe)
  [42.05, -70.25],   // Truro bay-side
  [41.95, -70.10],   // Wellfleet bay-side
  [41.85, -70.10],   // Eastham bay-side
  [41.75, -70.20],   // Brewster bay-side
  [41.78, -70.40],   // Barnstable bay-side
  [41.80, -70.50],   // Sandwich bay-side (extended west to include Sandwich town)
  [41.78, -70.55],   // canal east mouth
  [41.65, -70.62],   // Bourne / canal area
  [41.55, -70.66],   // Falmouth west shore
  [41.50, -70.72],   // back to start
];

// Martha's Vineyard (south of Cape Cod)
const MARTHAS_VINEYARD = [
  [41.48, -70.83],   // Aquinnah / Gay Head (west tip)
  [41.48, -70.55],   // Oak Bluffs / Vineyard Haven (north shore)
  [41.42, -70.46],   // Edgartown (east tip)
  [41.36, -70.47],   // Chappaquiddick south
  [41.32, -70.55],   // South Beach
  [41.32, -70.78],   // Squibnocket south
  [41.36, -70.83],   // Aquinnah south
  [41.48, -70.83],   // back to start
];

// Nantucket (south-east of Martha's Vineyard)
const NANTUCKET = [
  [41.30, -70.20],   // Madaket (west)
  [41.30, -69.95],   // Sankaty (east)
  [41.24, -69.95],   // Sconset south
  [41.23, -70.05],   // South Shoals
  [41.24, -70.20],   // Madaket south
  [41.30, -70.20],   // back to start
];

// Florida Keys arc (Key Largo → Key West)
const FL_KEYS = [
  [25.20, -80.30], [25.10, -80.40], [24.95, -80.55], [24.80, -80.75],
  [24.70, -81.00], [24.60, -81.30], [24.55, -81.55], [24.55, -81.80],
  [24.65, -81.85], [24.75, -81.65], [24.85, -81.40], [25.00, -81.10],
  [25.10, -80.85], [25.20, -80.55], [25.20, -80.30],
];

// ── MA mainland fill — explicit land mask for the South Shore and Plymouth
// peninsula areas that the MAIN_COAST coastline trace tends to miss. The
// region between Boston Harbor and the Cape Cod Canal has a complex shape
// that's hard to trace accurately, so this rectangular fill guarantees
// Hingham/Marshfield/Plymouth/Manomet/Sandwich/Bourne stay masked.
// It's a simple right-trapezoid west of -70.50, which is the western edge
// of Cape Cod Bay's water — so the fill won't accidentally cover bay water.
const MA_MAINLAND_FILL = [
  [42.45, -71.10],   // NW corner (near Boston/Brookline)
  [42.45, -70.85],   // NE corner (Boston Harbor west shore)
  [42.25, -70.78],   // east of Hingham
  [42.05, -70.66],   // east of Marshfield/Plymouth
  [41.92, -70.55],   // east of Manomet
  [41.78, -70.50],   // east of Sandwich (mainland side of canal)
  [41.72, -70.62],   // canal mainland
  [41.70, -70.85],   // Buzzards Bay coast
  [41.55, -71.10],   // RI/MA border
  [41.85, -71.40],   // inland (Worcester area, well off any water)
  [42.45, -71.10],   // back to start
];

const LAND_POLYGONS = [MAIN_COAST, LONG_ISLAND, CAPE_COD, FL_KEYS, MA_MAINLAND_FILL, MARTHAS_VINEYARD, NANTUCKET];

// ── Point-in-polygon test (ray casting algorithm) ──
// Returns true if (lat, lng) lies inside the polygon. Uses the horizontal
// ray crossing count: odd = inside, even = outside.
function pointInPolygon(lat, lng, poly){
  let inside = false;
  const n = poly.length;
  for(let i = 0, j = n - 1; i < n; j = i++){
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

// Returns true if (lat, lng) is on any land polygon. The single source of
// truth for the entire app's land/water boundary.
function isOnLand(lat, lng){
  for(const poly of LAND_POLYGONS){
    if(pointInPolygon(lat, lng, poly)) return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// BATHYMETRY REFERENCE POINTS
//
// 140+ real-world depth references covering US East Coast + Gulf of Mexico
// at canyons, banks, ledges, shelf-break stations, and basin centers.
// Depths are in METERS, sourced from NOAA chart annotations and published
// bathymetry. These anchor the depth interpolation in seaDepth() — for any
// query point, the function blends nearby reference depths via inverse-
// distance weighting on top of the 1D shelf-width baseline.
//
// Each entry: {lat, lng, depth (meters), name (optional, for debugging)}
// ════════════════════════════════════════════════════════════════════════════
// BATHY_REFS moved to bw-data-bathy.js (Approach A modularization)

// ── Helper: distance-weighted depth from BATHY_REFS ──
// Returns a blended depth in meters from the nearest reference points,
// or null if no references are within the influence radius. Uses inverse-
// square distance weighting so the closest reference dominates but distant
// ones still contribute. The radius is in degrees-equivalent (loose proxy
// for nautical miles since 1° lat ≈ 60nm).
function bathyRefDepth(lat, lng){
  const RADIUS_DEG = 1.5;   // ~90nm influence radius
  const RADIUS_SQ = RADIUS_DEG * RADIUS_DEG;
  let weightSum = 0, depthSum = 0, hitCount = 0;
  for(const r of BATHY_REFS){
    const dy = r.lat - lat;
    const dx = (r.lng - lng) * Math.cos(lat * Math.PI / 180);  // longitude scaling
    const distSq = dx*dx + dy*dy;
    if(distSq > RADIUS_SQ) continue;
    // Inverse-square weighting with small epsilon to avoid divide-by-zero
    const w = 1 / (distSq + 0.0004);  // 0.02° ≈ 1.2nm minimum effective distance
    weightSum += w;
    depthSum += w * r.depth;
    hitCount++;
  }
  if(hitCount === 0) return null;
  return depthSum / weightSum;
}

// ── Main bathymetry function ──
// Returns depth in meters at (lat, lng). Negative on land.
// Depth model: linear from 0 at shore → 200m at shelf break → 2000m+ in deep
// blue water beyond the shelf, with regional shelf-width parameters.
// Now also blends in nearby BATHY_REFS reference depths to capture real
// bathymetric features (canyons, banks, ledges) that the 1D shelf model
// can't represent.
function seaDepth(lat, lng){
  // Out of envelope → just return abyssal (irrelevant)
  if(lat < 22 || lat > 45) return 3000;
  if(lng < -98 || lng > -64) return 3000;

  // ── STEP 1: Bay/sound polygons (act as "holes" in the land polygon) ──
  // The main coastline polygon traces the outer coast and treats Chesapeake
  // Bay, Delaware Bay, etc. as "inside" (land). These rectangles override
  // that by explicitly marking known fishable bay water FIRST.
  const bayDepths = [
    {b:[36.95, 39.55, -77.30, -75.95], depth: 12},  // Chesapeake
    {b:[38.85, 39.35, -75.45, -75.05], depth: 15},  // Delaware
    {b:[35.20, 36.10, -76.30, -75.50], depth: 8},   // Pamlico Sound + Oregon Inlet
    {b:[35.85, 36.20, -76.70, -75.85], depth: 6},   // Albemarle
    {b:[34.65, 34.78, -76.70, -76.55], depth: 5},   // Bogue Sound water (between mainland & barrier)
    {b:[34.55, 34.85, -76.55, -76.30], depth: 4},   // Core Sound / Back Sound
    {b:[40.95, 41.20, -73.70, -71.95], depth: 25},  // Long Island Sound
    {b:[41.78, 42.03, -70.55, -70.15], depth: 35},  // Cape Cod Bay (tightened from coastal overlap)
    {b:[41.45, 41.75, -71.45, -71.20], depth: 18},  // Narragansett
    {b:[41.45, 41.70, -71.05, -70.70], depth: 20},  // Buzzards
    {b:[25.40, 25.75, -80.25, -80.15], depth: 4},   // Biscayne
    {b:[24.95, 25.25, -81.10, -80.50], depth: 3},   // Florida Bay
    {b:[27.20, 29.00, -80.78, -80.62], depth: 3},   // Indian River
    {b:[26.40, 26.75, -82.20, -81.85], depth: 4},   // Charlotte Harbor
    {b:[27.55, 28.05, -82.75, -82.45], depth: 8},   // Tampa Bay
    {b:[29.65, 29.85, -85.10, -84.70], depth: 5},   // Apalachicola
    {b:[30.20, 30.65, -88.20, -87.50], depth: 10},  // Mobile Bay
    {b:[29.10, 29.55, -90.50, -89.50], depth: 5},   // Barataria
    {b:[29.20, 29.55, -94.95, -94.60], depth: 7},   // Galveston
    {b:[28.10, 28.55, -96.70, -96.20], depth: 4},   // San Antonio
    {b:[27.55, 27.95, -97.40, -97.05], depth: 4},   // Corpus Christi
  ];
  for(const bay of bayDepths){
    const [latMin, latMax, lngMin, lngMax] = bay.b;
    if(lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax){
      return bay.depth;
    }
  }

  // ── STEP 2: Coastline polygon — anything inside is solid land ──
  // The land polygons are the source of truth for the outer land/water
  // boundary. By this point we've already handled all the major bays.
  if(isOnLand(lat, lng)) return -100;

  // ── STEP 3: Open-ocean depth ──
  // First compute the baseline from the regional shelf-width model. This is
  // the same 1D shelf-edge model as before — solid as a default but blind to
  // real features like canyons, banks, and ledges.
  let baseline;
  if(isGulfContext(lat, lng)){
    const shoreLat = gulfShoreLat(lng);
    const offshoreDeg = shoreLat - lat;
    if(offshoreDeg < 0.04){ baseline = 2; }
    else {
      const shelfWidth = gulfShelfWidthDeg(lng);
      if(offshoreDeg < shelfWidth * 0.3) baseline = 10 + offshoreDeg * 200;
      else if(offshoreDeg < shelfWidth * 0.7) baseline = 30 + offshoreDeg * 150;
      else if(offshoreDeg < shelfWidth) baseline = 100 + (offshoreDeg - shelfWidth*0.7) * 600;
      else if(offshoreDeg < shelfWidth * 1.3) baseline = 300 + (offshoreDeg - shelfWidth) * 3000;
      else baseline = 1200 + (offshoreDeg - shelfWidth * 1.3) * 1500;
    }
  } else {
    const barrier = barrierCoastLng(lat);
    const offshoreDeg = Math.max(0, lng - barrier);
    const shelfWidth = atlanticShelfWidthDeg(lat);
    if(offshoreDeg < 0.04) baseline = 4;
    else if(offshoreDeg < shelfWidth * 0.2) baseline = 8 + offshoreDeg * 250;
    else if(offshoreDeg < shelfWidth * 0.6) baseline = 30 + (offshoreDeg - shelfWidth*0.2) * 200;
    else if(offshoreDeg < shelfWidth) baseline = 100 + (offshoreDeg - shelfWidth*0.6) * 250;
    else if(offshoreDeg < shelfWidth * 1.15) baseline = 200 + (offshoreDeg - shelfWidth) * 5000;
    else if(offshoreDeg < shelfWidth * 1.4) baseline = 950 + (offshoreDeg - shelfWidth*1.15) * 4000;
    else baseline = 2000 + (offshoreDeg - shelfWidth * 1.4) * 1000;
  }

  // ── STEP 4: Blend with BATHY_REFS for real-feature awareness ──
  // bathyRefDepth() returns the inverse-distance-weighted average depth of
  // nearby reference points, or null if none are in range. When a reference
  // is present we blend it with the baseline. The blend favors the reference
  // when it's closely supported (many nearby points) and falls back toward
  // the baseline when references are sparse.
  //
  // Why blend rather than replace: the 1D shelf model is smooth and reliable
  // everywhere; references are sparse points. A pure-reference approach
  // would create depth "lumps" around isolated points. Blending keeps the
  // smooth shelf gradient AND adds real-feature accuracy where data exists.
  const refDepth = bathyRefDepth(lat, lng);
  if(refDepth === null) return baseline;

  // Blend weight: 0.65 toward references gives them clear authority where
  // they exist while still respecting the baseline. (A pure replacement
  // would make heat predictions twitch when a single nearby reference
  // happens to be unusually deep or shallow.)
  return 0.65 * refDepth + 0.35 * baseline;
}

// Note: `isFishableWater` (defined below) wraps seaDepth > 0 and is the
// canonical "is this fishable" check used by the renderer and predictor.
// `isOnLand` is used internally by seaDepth as one input among several.

// ════════════════════════════════════════════════════════════════════════════
// LAND/WATER DETECTION — uses bathymetry. Any point with depth > 0 is water.
// ════════════════════════════════════════════════════════════════════════════
function isFishableWater(lat, lng){
  if(typeof isInlandFreshwater === "function" && isInlandFreshwater(lat, lng)) return false;
  return seaDepth(lat, lng) > 0;
}

// ════════════════════════════════════════════════════════════════════════════
// WATER TYPE CLASSIFICATION — by DEPTH, not distance from shore.
//
// This is the key fix: sailfish off Miami at 200m depth and sailfish off
// NC at 200m depth are in the same habitat category. Distance-from-shore
// gave wrong answers because the shelf width varies enormously by region.
//
// Depth thresholds:
//   bay        — inside a bay polygon (shallow protected water)
//   inshore    — 0-30m depth (typical nearshore)
//   shelf      — 30-150m depth (continental shelf)
//   offshore   — 150m+ depth (shelf break, slope, abyssal — pelagic habitat)
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// WATER TYPE CLASSIFICATION — by DEPTH IN FEET.
//
// Inshore   0-30 ft  (0-9 m)   — surf zone, grass flats, oyster bars
// Nearshore 30-100 ft (9-30 m) — close reefs, wrecks, kingfish range
// Offshore  100+ ft  (30 m+)   — shelf and beyond (pelagic habitat)
// Bay       (inside bay polygon) — protected sound/estuary water
//
// Same depth = same category, regardless of how far from shore you are.
// Sailfish 4nm off Miami in 600 ft and sailfish 40nm off NC in 600 ft
// are both "offshore" — same habitat.
// ════════════════════════════════════════════════════════════════════════════
function classifyWaterType(lat, lng){
  // Bay polygons — protected shallow water inside sounds/bays
  const bays = [
    [36.95, 39.55, -77.30, -75.95],
    [38.85, 39.35, -75.45, -75.05],
    [35.20, 36.10, -76.30, -75.50],
    [35.85, 36.20, -76.70, -75.85],
    [34.65, 34.78, -76.70, -76.55],  // Bogue Sound
    [34.55, 34.85, -76.55, -76.30],  // Core/Back Sound
    [40.95, 41.20, -73.70, -71.95],
    [41.75, 42.05, -70.65, -70.10],
    [41.45, 41.75, -71.45, -71.20],
    [41.45, 41.70, -71.05, -70.70],
    [25.30, 25.80, -80.30, -80.10],
    [24.85, 25.30, -81.20, -80.40],
    [27.00, 29.10, -80.85, -80.55],
    [30.30, 30.55, -81.55, -81.35],
    [24.55, 24.95, -81.85, -81.00],
    [26.40, 26.75, -82.20, -81.85],
    [27.55, 28.05, -82.75, -82.45],
    [28.50, 29.20, -82.85, -82.60],
    [29.65, 29.85, -85.10, -84.70],
    [30.15, 30.45, -86.60, -86.30],
    [30.30, 30.55, -87.30, -86.95],
    [30.20, 30.65, -88.20, -87.50],
    [30.10, 30.45, -88.95, -88.40],
    [30.05, 30.25, -89.60, -89.05],
    [29.95, 30.35, -90.50, -89.60],
    [29.10, 29.55, -90.50, -89.50],
    [29.30, 29.75, -91.30, -90.50],
    [29.50, 29.90, -92.30, -91.30],
    [29.20, 29.55, -94.95, -94.60],
    [28.55, 28.90, -96.20, -95.70],
    [28.10, 28.55, -96.70, -96.20],
    [28.00, 28.30, -97.10, -96.65],
    [27.55, 27.95, -97.40, -97.05],
    [26.95, 27.50, -97.50, -97.15],
  ];
  for(const [latMin, latMax, lngMin, lngMax] of bays){
    if(lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax){
      return "bay";
    }
  }

  // Depth-based classification in FEET. Prefer REAL bathymetry (CUDEM/ETOPO) so the
  // shelf/nearshore/offshore split matches actual depth, not the static model.
  const depthM = (typeof predictDepth === "function") ? predictDepth(lat, lng) : seaDepth(lat, lng);
  const depthFt = depthM * 3.281;
  if(depthFt < 30)  return "inshore";       // 0-30 ft
  if(depthFt < 100) return "nearshore";     // 30-100 ft
  return "offshore";                         // 100+ ft (whole shelf + canyons)
}

// Species → valid habitat types
// Each species lists the water types where it can realistically be encountered.
const SPECIES_HABITAT = {
  // True offshore pelagics — canyon/Gulf Stream species, never in bays.
  // "nearshore" is included for canyon-edge fish (Hatteras Canyon at 27nm is
  // nearshore-classed in narrow-shelf areas but still 1000m+ deep — these
  // species are absolutely caught there).
  bluemarlin:    ["offshore", "nearshore"],
  whitemarlin:   ["offshore", "nearshore"],
  spearfish:     ["offshore"],
  sailfish:      ["offshore", "nearshore"],
  swordfish:     ["offshore", "nearshore"],
  yellowfin:     ["offshore", "nearshore"],
  bigeye:        ["offshore", "nearshore"],
  bluefin:       ["offshore", "nearshore"],
  wahoo:         ["offshore", "nearshore"],
  mahi:          ["offshore", "nearshore"],
  blackfin:      ["offshore", "nearshore"],
  skipjack:      ["offshore", "nearshore"],
  // Shelf species — wrecks/reefs/structure, sometimes nearshore
  cod:           ["nearshore", "offshore"],
  haddock:       ["nearshore", "offshore"],
  pollock:       ["nearshore", "offshore"],
  tilefish:      ["offshore"],
  // Nearshore reef/structure species — shelf and inshore
  kingmack:      ["nearshore", "inshore"],
  spanishmack:   ["nearshore", "inshore"],
  cobia:         ["nearshore", "inshore", "bay"],   // Cobia move into bays (CBBT!)
  blackseabass:  ["nearshore", "inshore"],
  triggerfish:   ["nearshore"],
  spadefish:     ["nearshore", "inshore"],
  grouper:       ["nearshore", "offshore"],
  snapper:       ["nearshore", "offshore"],
  bonito:        ["nearshore", "inshore"],
  falsealbacore: ["nearshore", "inshore"],
  bluefish:      ["inshore", "nearshore", "bay"],   // Blues run everywhere
  // Inshore/bay species — bays, sounds, shoreline
  striper:       ["bay", "inshore"],            // Stripers ARE bay fish (Chesapeake!)
  redfish:       ["bay", "inshore"],
  flounder:      ["bay", "inshore", "nearshore"],
  speckledtrout: ["bay", "inshore"],
  croaker:       ["bay", "inshore"],
  sheepshead:    ["bay", "inshore"],
  tautog:        ["inshore", "nearshore"],
  // ── FLORIDA / TROPICAL SPECIES ────────────────────────────────────
  tarpon:        ["bay", "inshore"],            // FL flats, lagoons, passes
  snook:         ["bay", "inshore"],            // FL east coast inlets & lagoons
  bonefish:      ["bay", "inshore"],            // FL Keys flats
  permit:        ["bay", "inshore", "nearshore"],   // Flats + nearshore wrecks
  ceromack:      ["nearshore", "inshore"],          // Like Spanish mackerel but warmer water
  hogfish:       ["nearshore", "inshore"],          // FL reefs
  muttonsnap:    ["nearshore", "inshore"],          // FL Keys reefs
  // ── GULF COAST + DEEP REEF SPECIES ────────────────────────────────
  bluelinetile:  ["nearshore", "offshore"],         // Deeper reef edge tilefish
  gaggrouper:    ["nearshore", "inshore"],          // Gulf and FL reefs
  amberjack:     ["nearshore", "offshore"],         // Wrecks, reefs, rigs
  tripletail:    ["nearshore", "inshore"],          // Floating debris, buoys
  pompano:       ["inshore", "bay"],            // Surf and inshore beaches
  // Vermilion (beeliner) live on hard bottom / ledges in ~100-300 ft. Since
  // classifyWaterType() calls anything ≥100 ft "offshore", a nearshore-only mask
  // blanked out the ENTIRE depth range where they actually hold (the Gulf shelf
  // edge off Pensacola etc.), so the bite map rendered nothing. Allow both the
  // 30-100 ft nearshore band AND the 100 ft+ shelf so their real grounds paint.
  vermilion:     ["nearshore", "offshore"],          // Deeper reefs / shelf ledges
  lanesnap:      ["nearshore", "inshore"],          // Gulf reefs
  yellowtail:    ["nearshore", "inshore"],          // FL Keys reefs, classic Keys species
  // ── PACIFIC / SOUTHERN CALIFORNIA ─────────────────────────────────
  cayellowtail:  ["nearshore", "offshore"],         // SoCal banks, kelp edges, hard bottom, paddies
};

function speciesAllowedInWater(speciesId, waterType){
  const allowed = SPECIES_HABITAT[speciesId];
  if(!allowed) return true;  // unknown species: allow everywhere (safe default)
  return allowed.includes(waterType);
}

// ════════════════════════════════════════════════════════════════════════════
// ESTUARY SALINITY PROXY
//
// The app has no live salinity field, but salinity is decisive for many bay
// species (cobia, redfish, drum, sheepshead want salt; they aren't up the
// brackish rivers). We approximate RELATIVE salinity (0 = fresh river water,
// 1 = full-strength ocean) for the major estuaries from geometry: salinity is
// highest at the ocean mouth and falls as you move up-bay and up the rivers.
//
// Each estuary entry defines a "mouth" point (where ocean salt enters) and a
// length scale (nm) over which salinity decays to brackish. A point's salinity
// is a function of its distance from that mouth, clamped to [0,1]. Points not
// inside any estuary are treated as full ocean salinity (1) — the open coast
// and shelf are always salty.
//
// This is a coarse proxy, not measured PSU. It exists to stop the map from
// recommending low-salinity river water for high-salinity species. Replace
// with a real salinity layer (e.g. NOAA CBOFS for the Chesapeake) when wired.
const ESTUARY_SALINITY = [
  // Chesapeake Bay: salt enters at the bay mouth (~37.0, -76.0, between Cape
  // Henry and Cape Charles) and weakens going north up the bay and west up the
  // James/York/Rappahannock/Potomac. ~150nm from mouth to fresh head of bay.
  { name:"Chesapeake", mouthLat:37.00, mouthLng:-76.02, lengthNm:150,
    box:[36.90, 39.60, -77.40, -75.90] },
  // Delaware Bay: mouth near Cape May/Cape Henlopen (~38.8, -75.05), fresh up
  // toward the Delaware River. ~90nm scale.
  { name:"Delaware", mouthLat:38.80, mouthLng:-75.05, lengthNm:90,
    box:[38.80, 40.20, -75.60, -74.85] },
  // Pamlico/Albemarle (NC): these sounds are naturally LOW salinity (barrier-
  // island enclosed, big river input), salt enters at the inlets. Short scale
  // so most of the sound reads brackish.
  { name:"Albemarle", mouthLat:35.90, mouthLng:-75.65, lengthNm:55,
    box:[35.80, 36.50, -76.70, -75.55] },
];
function estuarySalinity(lat, lng){
  for(const e of ESTUARY_SALINITY){
    const [laMin, laMax, lnMin, lnMax] = e.box;
    if(lat >= laMin && lat <= laMax && lng >= lnMin && lng <= lnMax){
      const dNm = (typeof nmBetween === "function")
        ? nmBetween(lat, lng, e.mouthLat, e.mouthLng)
        : Math.hypot((lat - e.mouthLat) * 60, (lng - e.mouthLng) * 48);
      // 1 at the mouth, decaying linearly to ~0 at lengthNm up-estuary.
      return Math.max(0, Math.min(1, 1 - dNm / e.lengthNm));
    }
  }
  return 1;  // open coast / shelf — full ocean salinity
}

// Nearest mapped structure (reef/wreck/lump/shoal/ledge) to a point, in nm,
// considering only structures relevant to the species when fish info is given.
// Used to lift structure-oriented species' scores near real structure so the
// ledges/rips read hotter than open flat bottom. Returns null if none in range.
function nearestStructureNm(lat, lng, speciesId){
  if(typeof CANYONS === "undefined" || !Array.isArray(CANYONS)) return null;
  let best = null;
  for(const c of CANYONS){
    if(c.lat == null || c.lng == null) continue;
    // If the structure lists target species, prefer ones that include this
    // species; otherwise any mapped structure counts.
    if(speciesId && Array.isArray(c.fish) && c.fish.length && !c.fish.includes(speciesId)) continue;
    const d = (typeof nmBetween === "function")
      ? nmBetween(lat, lng, c.lat, c.lng)
      : Math.hypot((lat - c.lat) * 60, (lng - c.lng) * 48);
    if(best == null || d < best) best = d;
  }
  return best;
}

// ════════════════════════════════════════════════════════════════════════════
// SPECIES GEOGRAPHIC RANGE
//
// Latitude bounds where each species is actually caught. Most species range
// up and down the entire Atlantic coast or Gulf, so they're omitted here —
// only species with genuine geographic limits get an entry. Bounds are based
// on actual species biology (NOAA / state DNR range maps), with a small
// buffer on each end for occasional stragglers.
//
// Two formats supported:
//   1. Flat array `[minLat, maxLat]` — single contiguous range that applies
//      to both coasts (e.g. cod, pompano).
//   2. Object `{atlantic: [lo, hi], gulf: [lo, hi]}` — separate ranges for
//      the two coasts. Use when a species has disconnected populations
//      (e.g. bluefin: NC-Maine on Atlantic, plus a separate Gulf spawning
//      population, but NOT in S. FL Atlantic between them). Either key can
//      be omitted to exclude that coast entirely.
// ════════════════════════════════════════════════════════════════════════════
const SPECIES_LAT_RANGE = {
  // ── TROPICAL / SUBTROPICAL — Florida and Keys ─────────────────────────
  bonefish:      [24.0, 28.0],   // FL Keys, S. FL flats
  permit:        [24.0, 28.0],   // FL Keys, S. FL
  ceromack:      [24.0, 28.5],   // FL Keys, S. FL
  hogfish:       [24.0, 32.0],   // FL east + Gulf coast
  muttonsnap:    {atlantic: [24.0, 31.0], gulf: [24.5, 30.0, -84.0, -80.5]},  // S. FL/Keys/FL reefs + SE Atlantic; FL Gulf reefs only, not N. Gulf
  yellowtail:    {atlantic: [24.0, 29.5], gulf: [24.5, 29.0, -84.0, -80.5]},  // FL Keys/S. FL reefs; FL Gulf reefs only, not N. Gulf
  lanesnap:      [24.0, 30.5],   // FL + Gulf
  tarpon:        [24.0, 32.5],   // FL through GA; rare strays to NC summer
  // Snook: a tropical inshore fish on BOTH Florida coasts, but NOT the northern
  // Gulf (LA/MS/AL/TX). Latitude alone can't separate FL's Gulf coast from
  // Louisiana (Venice LA at 29.3°N is the same latitude as FL's Big Bend), so
  // the Gulf band carries a longitude bound (east of -84°W = FL west coast).
  // Atlantic side: S. FL up past Canaveral, straying a bit north in warm years.
  snook:         {atlantic: [24.0, 29.5], gulf: [25.0, 29.3, -84.0, -80.5]},
  // ── WARM-TEMPERATE — FL, Gulf, SE Atlantic ───────────────────────────
  tripletail:    [25.0, 35.0],   // Gulf + FL east + occasional NC/VA in summer
  pompano:       [25.0, 36.5],   // FL through NC beaches
  gaggrouper:    [25.0, 34.5],   // Gulf + FL east + GA/SC
  cobia:         [25.0, 40.5],   // FL through Chesapeake/DelMarVa up to NJ (summer)
  spanishmack:   [27.0, 41.0],   // FL through NJ
  // Blackfin: a warm-water / subtropical tuna. Common FL, Gulf, and the SE
  // Atlantic; the OBX/Hatteras is the northern stronghold. Northern bound 35.7°N
  // reaches just past Oregon Inlet (~35.8°N) so the OBX bite isn't clipped, while
  // still keeping the predominant weight toward Hatteras (35.2°N). Combined with
  // breakPref:"edge" (so even within range it scores the Stream, not the inner
  // shelf), this keeps blackfin realistic.
  blackfin:      [24.0, 35.7],
  // ── MID-ATLANTIC + NEW ENGLAND ───────────────────────────────────────
  bluelinetile:  [33.0, 40.5],   // Mid-Atlantic deepwater specialist
  bonito:        [33.0, 44.5],   // Mid-Atlantic + New England
  falsealbacore: [25.0, 44.0],   // FL through New England — Cape Cod albie run to Carolinas/FL
  // Bluefin tuna: TWO disconnected populations.
  //  - Atlantic: NC (Morehead/Hatteras winter blitz) up to Maine
  //  - Gulf: spring spawning grounds — Mississippi/Desoto/East Breaks canyons
  // S. FL Atlantic in between has no bluefin (water too warm year-round).
  bluefin:       {atlantic: [32.5, 45.0], gulf: [26.0, 30.5]},
  striper:       [33.0, 45.0],   // NC north; some FL strays in winter
  tautog:        [37.5, 43.0],   // NJ to MA
  // ── NEW ENGLAND ONLY ─────────────────────────────────────────────────
  cod:           [40.0, 45.0],   // GOM + Georges Bank
  haddock:       [40.0, 45.0],   // GOM + Georges Bank
  pollock:       [40.0, 45.0],   // GOM + Georges Bank
  // ── PACIFIC-ONLY — never on the Atlantic or Gulf ─────────────────────
  // California yellowtail is a Pacific fish. Null bands on both Atlantic/Gulf
  // coasts exclude it everywhere East-Coast/Gulf; the Pacific gate below allows
  // it in California water. (Without this it would have no entry and default to
  // "allowed everywhere," lighting up the East Coast.)
  cayellowtail:  {atlantic: null, gulf: null},
  // Everything else (yellowfin, blue marlin, mahi, wahoo, sailfish, etc.)
  // has no entry — they range coast-wide.
};

// ════════════════════════════════════════════════════════════════════════════
// PACIFIC (SOUTHERN CALIFORNIA) SPECIES
//
// An explicit allow-list of species that actually occur in the US Pacific
// (SoCal) fishery, each with its Pacific latitude band. Kept separate from the
// Atlantic/Gulf ranges so that:
//   • Atlantic/Gulf-only species (redfish, striper, snapper, etc.) never light
//     up the bite map in Pacific water — anything NOT in this list is excluded.
//   • Focused on the core West-Coast targets for now (yellowtail + bluefin),
//     plus the obvious pelagics that share those grounds.
// A value of [minLat, maxLat] bounds the species; the check runs only for
// Pacific coordinates, so it can never affect the East Coast.
const PACIFIC_SPECIES = {
  bluefin:      [28.0, 42.0],   // Pacific bluefin — Baja/SoCal through central CA
  cayellowtail: [28.0, 36.5],   // California yellowtail — SoCal banks/kelp; strays to Monterey
  yellowfin:    [28.0, 35.5],   // warm-water/warm-year SoCal yellowfin
  bonito:       [28.0, 40.0],   // Pacific bonito — abundant off SoCal
  mahi:         [28.0, 34.5],   // dorado — warm months off SoCal/Baja
};

// ── Pacific habitat overrides (West-Coast tuning pass) ──────────────────────
// Some species (notably bluefin) behave very differently on the Pacific coast
// than on the Atlantic/Gulf, so scoreCell swaps in these prefs ONLY when the
// cell being scored is in Pacific waters (isPacificContext). The base
// PREDICT_SPECIES_PREFS — and therefore every East-Coast/Gulf score — is left
// completely untouched. Species not listed here fall back to their base prefs.
const PACIFIC_SPECIES_PREFS = {
  // SoCal bluefin is an OFFSHORE bank / shelf-edge / kelp-paddy fishery in
  // warmer summer water than the Atlantic giants — not the Cape-Hatteras
  // shallow fall-run pattern. So we:
  //   • drop the shallow 18-40 m beach band (that lit up the whole coastal
  //     strip and produced the solid-red nearshore blob),
  //   • warm the temperature window to the 63-70 °F sweet spot (working to
  //     74 °F, since they're caught well into the low-70s off SoCal), and
  //   • key hard on the temperature/color break (breakPref "edge"), which —
  //     because bluefin is an offshore, edge-seeking species — also unlocks
  //     the SSH / surface-current FRONT-FUSION path so the map lights up real
  //     fronts and offshore structure instead of every patch of warm water.
  bluefin: { tempIdeal:[63,70], tempWorking:[60,74], chlorPref:"edge", depthBands:[[50,200],[200,900]], breakPref:"edge" },
};

// Bahamas / Bahama-Bank water east of the Florida crossings. Several US
// estuarine & inshore species carry lat bands (or no band at all) that would
// otherwise leak east onto the shallow Bahama Bank and light up bite scores in
// water they never occupy. The Bahamas archipelago sits at lng ≳ -79.5 and
// lat ≲ 27.6; NO US coastal water falls in this box (the FL Atlantic shelf and
// its Gulf-Stream fishing grounds are all west of ~-79.8), so excluding it is
// a clean longitude/latitude cutoff that doesn't touch any US range — including
// the mid-Atlantic coast, which bends east only at higher latitudes.
const BAHAMAS_EXCLUDE_BOX = { latMin: 22.0, latMax: 27.6, lngMin: -79.6, lngMax: -72.0 };
// US-only estuarine / inshore species that do NOT occur in the Bahamas. (Bahamas
// DOES hold bonefish, permit, tarpon, mutton/lane/yellowtail snapper, grouper,
// hogfish, cero/king mackerel, and the pelagics — those are intentionally absent.)
const NOT_IN_BAHAMAS = new Set([
  "redfish", "snook", "speckledtrout", "flounder", "sheepshead", "croaker",
]);

// Returns true if the species can be found at this lat/lng. Handles both
// the simple flat-array format and the per-region object format. Species
// without any entry are allowed everywhere (safe default for coast-wide
// species like tuna, mahi, marlin).
function speciesAllowedAtLat(speciesId, lat, lng){
  // Hard-exclude US-coastal-only species from Bahamian water.
  if(lng != null && NOT_IN_BAHAMAS.has(speciesId)
     && lat >= BAHAMAS_EXCLUDE_BOX.latMin && lat <= BAHAMAS_EXCLUDE_BOX.latMax
     && lng >= BAHAMAS_EXCLUDE_BOX.lngMin && lng <= BAHAMAS_EXCLUDE_BOX.lngMax){
    return false;
  }
  // US Pacific (SoCal) water uses its own curated species list — handled here
  // and returned early so none of the Atlantic/Gulf range logic below applies.
  if(typeof isPacificContext === "function" && isPacificContext(lat, lng)){
    const pac = PACIFIC_SPECIES[speciesId];
    if(!pac) return false;                          // not a Pacific species → no bite here
    return lat >= pac[0] && lat <= pac[1];
  }
  const range = SPECIES_LAT_RANGE[speciesId];
  if(!range) return true;
  // A band is [minLat, maxLat] or, optionally, [minLat, maxLat, minLng, maxLng]
  // when a species needs a longitude constraint too (e.g. snook occur on FL's
  // Gulf coast but NOT the northern Gulf — same latitude as Louisiana, so lat
  // alone can't separate them; the lng bound does).
  const inBand = (band) => {
    if(!band) return false;
    if(lat < band[0] || lat > band[1]) return false;
    if(band.length >= 4 && lng != null){
      if(lng < band[2] || lng > band[3]) return false;
    }
    return true;
  };
  // Per-region format: {atlantic:[...], gulf:[...]}
  if(!Array.isArray(range)){
    if(lng == null) return true;  // need lng to pick a coast — allow (caller bug)
    const inGulf = (typeof isGulfContext === "function") && isGulfContext(lat, lng);
    return inBand(inGulf ? range.gulf : range.atlantic);
  }
  // Flat array format: [minLat, maxLat] (+ optional lng bounds)
  return inBand(range);
}

// Species valid for a brief run zone (inshore includes bay fish).
function speciesAllowedInBriefZone(speciesId, zone){
  const allowed = SPECIES_HABITAT[speciesId];
  if(!allowed) return true;
  if(zone === "inshore") return allowed.some(h => h === "inshore" || h === "bay");
  return allowed.includes(zone);
}

// Typical offshore bearing from a home port (degrees true).
function portOffshoreBearing(port){
  if(!port) return 90;
  if(port.lng > -98 && port.lat < 31) return 200;   // western Gulf
  if(port.lng > -125) return 270;                   // Pacific
  if(port.lng > -88 && port.lat < 30) return 225;   // Florida Gulf
  return 90;                                        // Atlantic — E offshore
}

function pointNmFromBearing(lat, lng, nm, bearingDeg){
  const R = 3440.065;
  const toRad = d => d * Math.PI / 180;
  const brg = toRad(bearingDeg);
  const lat1 = toRad(lat), lng1 = toRad(lng);
  const d = nm / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
  const lng2 = lng1 + Math.atan2(
    Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lng: ((lng2 * 180 / Math.PI + 540) % 360) - 180 };
}

function briefPinForZone(port, zone){
  const nm = BRIEF_ZONE_NM[zone] || 12;
  return pointNmFromBearing(port.lat, port.lng, nm, portOffshoreBearing(port));
}

function defaultBriefRunZone(speciesId){
  const hab = SPECIES_HABITAT[speciesId];
  if(!hab) return "offshore";
  if(hab.includes("offshore")) return "offshore";
  if(hab.includes("nearshore")) return "nearshore";
  return "inshore";
}

function briefZoneLabel(zone){
  return zone === "inshore" ? "Inshore" : zone === "nearshore" ? "Nearshore" : "Offshore";
}

function setBriefRunZone(zone){
  if(!["inshore", "nearshore", "offshore"].includes(zone)) return;
  briefRunZone = zone;
  const portObj = (activePort && PORTS[activePort]) ? PORTS[activePort] : null;
  if(portObj) pinLL = briefPinForZone(portObj, zone);
  briefSp = briefSp.filter(id => briefSpeciesForSpot().some(s => s.id === id));
  renderBrief();
}

// Species that realistically occur at the brief's spot (or departure port when
// no pin yet). Keeps the brief species picker from listing 50+ extraneous fish
// that don't apply to Oregon Inlet, Stuart, Venice LA, etc.
function briefSpeciesForSpot(){
  const portObj = (typeof activePort !== "undefined" && activePort && PORTS[activePort])
    ? PORTS[activePort] : null;
  const lat = pinLL ? pinLL.lat : (portObj ? portObj.lat : null);
  const lng = pinLL ? pinLL.lng : (portObj ? portObj.lng : null);
  if(lat == null || lng == null) return [];
  const wt = briefRunZone
    || ((typeof classifyWaterType === "function") ? classifyWaterType(lat, lng) : "offshore");
  const zoneWt = (wt === "bay") ? "inshore" : wt;
  return SPECIES.filter(s => {
    if(s.id === "all") return false;
    if(typeof speciesAllowedAtLat === "function" && !speciesAllowedAtLat(s.id, lat, lng)) return false;
    if(!speciesAllowedInBriefZone(s.id, zoneWt)) return false;
    return true;
  });
}

// Rank local species at the pin using the same bite-map engine as the heat grid,
// then pick the best targets for an "I just want to go fishing" Bluewater Choice
// brief. Favors in-season fish with strong scores and confidence.
// Rank local species using the same bite-map engine. Scans the top cells the
// captain is already looking at on the heat map (not just the zone pin) so a
// strong yellowfin score at The Point still surfaces in Bluewater Recommendation.
function briefPickScoreLocations(fallbackLat, fallbackLng){
  const pts = [];
  const seen = new Set();
  const add = (la, ln) => {
    if(la == null || ln == null) return;
    const k = `${la.toFixed(3)},${ln.toFixed(3)}`;
    if(seen.has(k)) return;
    seen.add(k);
    pts.push({ lat: la, lng: ln });
  };
  const cacheOk = _predictResultCache && _predictResultCache.key === predictResultCacheKey();
  if(cacheOk){
    const hs = Array.isArray(_predictResultCache.hotspots) ? _predictResultCache.hotspots : [];
    hs.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 30)
      .forEach(c => add(c.lat, c.lng));
    const badges = Array.isArray(_predictResultCache.badges) ? _predictResultCache.badges : [];
    badges.forEach(c => add(c.lat, c.lng));
  }
  if(Array.isArray(_predictGrid) && _predictGrid.length){
    _predictGrid.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20)
      .forEach(c => add(c.lat, c.lng));
  }
  const portObj = (activePort && PORTS[activePort]) ? PORTS[activePort] : null;
  if(portObj && briefRunZone){
    const zonePin = briefPinForZone(portObj, briefRunZone);
    add(zonePin.lat, zonePin.lng);
  }
  if(fallbackLat != null && fallbackLng != null) add(fallbackLat, fallbackLng);
  return pts;
}

// Coarse search grid from the home port so multi-species briefs can find
// divergent grounds (e.g. white marlin N of Oregon Inlet vs wahoo S) without
// requiring the captain to open each Bite Map first.
function briefPortSearchLocations(portObj, fallbackLat, fallbackLng){
  const pts = briefPickScoreLocations(fallbackLat, fallbackLng);
  const seen = new Set(pts.map(p => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`));
  const add = (la, ln) => {
    if(la == null || ln == null) return;
    const k = `${la.toFixed(3)},${ln.toFixed(3)}`;
    if(seen.has(k)) return;
    seen.add(k);
    pts.push({ lat: la, lng: ln });
  };
  if(!portObj || typeof pointNmFromBearing !== "function") return pts;
  const maxNm = (typeof maxRangeForPort === "function") ? maxRangeForPort(portObj) : 100;
  const zoneNm = briefRunZone ? (BRIEF_ZONE_NM[briefRunZone] || 12) : 20;
  const minNm = Math.max(3, Math.round(zoneNm * 0.35));
  const outer = Math.min(maxNm, Math.max(zoneNm + 30, Math.round(zoneNm * 2)));
  for(let nm = minNm; nm <= outer; nm += 8){
    for(let brg = 0; brg < 360; brg += 30){
      const pt = pointNmFromBearing(portObj.lat, portObj.lng, nm, brg);
      add(pt.lat, pt.lng);
    }
  }
  // Named structure (canyons/points) inside the fishing radius — high-value pins.
  if(typeof CANYONS !== "undefined" && Array.isArray(CANYONS) && typeof nmBetween === "function"){
    for(const c of CANYONS){
      if(c.lat == null || c.lng == null) continue;
      if(nmBetween(portObj.lat, portObj.lng, c.lat, c.lng) <= outer + 5) add(c.lat, c.lng);
    }
  }
  return pts;
}

function briefRunMetaFromPort(portObj, lat, lng){
  if(!portObj || lat == null || lng == null || typeof nmBetween !== "function"){
    return { runFromPortNm: null, runCompass: null, bearingDeg: null };
  }
  const nm = Math.round(nmBetween(portObj.lat, portObj.lng, lat, lng));
  let bearingDeg = null, runCompass = null;
  if(typeof bwiCompass16 === "function"){
    const toRad = d => d * Math.PI / 180;
    const y = Math.sin(toRad(lng - portObj.lng)) * Math.cos(toRad(lat));
    const x = Math.cos(toRad(portObj.lat)) * Math.sin(toRad(lat)) -
              Math.sin(toRad(portObj.lat)) * Math.cos(toRad(lat)) * Math.cos(toRad(lng - portObj.lng));
    bearingDeg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    runCompass = bwiCompass16(bearingDeg);
  }
  return { runFromPortNm: nm, runCompass, bearingDeg };
}

function briefEnrichSpeciesSpot(entry, portObj){
  if(!entry || entry.scoredAtLat == null) return entry;
  const meta = briefRunMetaFromPort(portObj, entry.scoredAtLat, entry.scoredAtLng);
  let depthFt = null;
  try {
    if(typeof realDepthAt === "function"){
      const m = realDepthAt(entry.scoredAtLat, entry.scoredAtLng);
      if(m != null) depthFt = Math.round(m * 3.281);
    }
  } catch(e){}
  const nearby = (typeof structureNear === "function")
    ? structureNear(entry.scoredAtLat, entry.scoredAtLng, 25, 2)
    : [];
  return Object.assign({}, entry, meta, {
    depthFt,
    nearbyStructure: nearby,
    spotLabel: (nearby[0] && nearby[0].name) ? nearby[0].name : null,
  });
}

function briefPickSpeciesAuto(lat, lng, allowed, limit = 3){
  if(typeof scoreCell !== "function" || !allowed || !allowed.length) return { picks: [], candidates: [] };
  const hour = (briefDayOffset >= 1)
    ? forecastHourForBriefDay(briefDayOffset)
    : (typeof FORECAST_HOUR_OFFSET === "number" ? FORECAST_HOUR_OFFSET : 0);
  return withForecastHour(hour, () => {
    const locations = (typeof briefPortSearchLocations === "function" && activePort && PORTS[activePort])
      ? briefPortSearchLocations(PORTS[activePort], lat, lng)
      : briefPickScoreLocations(lat, lng);
    if(!locations.length && lat != null && lng != null) locations.push({ lat, lng });
    const candidates = [];
    for(const sp of allowed){
      let best = null;
      for(const pt of locations){
        const r = scoreCell(pt.lat, pt.lng, sp.id);
        if(!r || r.outOfRange) continue;
        const score = Number.isFinite(r.score) ? r.score : 0;
        const conf = Number.isFinite(r.confidence) ? r.confidence : 0.5;
        const inSeason = r.inSeason !== false;
        const season = Number.isFinite(r.seasonStrength) ? r.seasonStrength : (inSeason ? 0.75 : 0.2);
        const seasonWt = inSeason ? (0.35 + 0.65 * season) : 0.12;
        const rank = score * (0.45 + 0.55 * conf) * seasonWt;
        const scorePct = Math.round(score * 100);
        const entry = {
          id: sp.id,
          name: sp.name,
          rank,
          scorePct,
          confidencePct: Math.round(conf * 100),
          inSeason,
          seasonStrength: season,
          topFactor: r.topFactor || null,
          lat: pt.lat,
          lng: pt.lng,
        };
        if(!best || entry.scorePct > best.scorePct || (entry.scorePct === best.scorePct && entry.rank > best.rank)){
          best = entry;
        }
      }
      if(best) candidates.push(best);
    }
    // Deterministic ordering: rank desc, then score desc, then species id asc as a
    // stable tie-break. Without the tie-break, near-equal ranks (common while the
    // ocean grids are still streaming in) could reorder between renders, which is
    // why "Bluewater Choice" appeared to pick different species on each click.
    candidates.sort((a, b) =>
      (b.rank - a.rank) || (b.scorePct - a.scorePct) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // Only recommend genuinely worthwhile targets: a FAIR-or-better bite score
    // (>=40/100). This stops junk picks like "Swordfish 6/100" when nothing is
    // really biting. If nothing clears the bar we return NO picks and the UI says
    // so honestly rather than surfacing a bad recommendation.
    const MIN_SCORE_PCT = 40;
    const picks = candidates.filter(c => c.scorePct >= MIN_SCORE_PCT).slice(0, limit);
    return { picks, candidates };
  });
}

// Maximum reasonable run distance from home port to fishing grounds.
// Offshore range caps — how far from port the Bite Map scores. These must
// reach the CANYONS, since canyon/floater fishing is the whole point offshore:
//  • Atlantic: Northeast canyons (Hudson, Baltimore, Wilmington, Norfolk) sit
//    ~70-100+ nm from port and boats run them routinely, so 90nm cut them off.
//    140nm reaches the canyon edge from the major NE/Mid-Atlantic ports.
//  • Gulf: the deepwater floaters, Midnight Lump-to-canyon runs out of Venice,
//    East Breaks from Galveston (~120nm), and Pulley Ridge from Naples (~140nm)
//    all need real reach. 160nm covers them.
//  • Pacific (SoCal): the productive grounds are much closer to port — the
//    Coronados/9-Mile/425 (~10-30nm), San Clemente/Catalina (~50-60nm), and the
//    Tanner/Cortes Banks (~100nm) are all inside 125nm. A tighter cap keeps the
//    bite map from recommending unreachable water 150-200 mi offshore.
// A distance penalty still gently fades the score toward the cap so nearer water
// is favored, but the canyons now stay in range instead of dropping off.
const PREDICT_HEAT_SCORE_MIN = 0.01;
const PREDICT_HOTSPOT_SCORE_MIN = 0.30;

// ── Port-tailored fishing radius (nm) ───────────────────────────────────────
// Charter/day-boat reach varies enormously by geography — Oregon Inlet boats
// rarely run 140 nm, while Venice LA floaters routinely do. This ONE function
// drives the bite-map range cap, ocean/altimetry data fetch bbox, and SSH break
// highlights so all three stay consistent for the active port.
function portFishingRangeNm(portObj){
  if(!portObj) return 120;
  const { lat, lng } = portObj;
  if(typeof isPacificContext === "function" && isPacificContext(lat, lng)) return 125;
  if(typeof isGulfContext === "function" && isGulfContext(lat, lng)){
    // Western Gulf (LA / TX) — rigs, floaters, canyon runs 100+ nm out
    if(lng <= -88.5) return 160;
    // Florida Gulf shelf — many day-boats; Middle Grounds is a long run but not
    // every port fishes that far routinely
    return 100;
  }
  // Atlantic — Northeast / Mid-Atlantic canyon fishery (Montauk → Delaware)
  if(lat >= 38.0) return 140;
  // Outer Banks & north NC (Oregon Inlet, Hatteras, Morehead) — charter fleet
  // fishes the Stream edge 15–40 nm out; pushing past ~85 nm is unrealistic for
  // most OBX day-boats even in tuna season.
  if(lat >= 33.5 && lat < 37.5 && lng > -77.5) return 85;
  // Southeast FL Atlantic (Stuart, Treasure Coast, JAX) — Gulf Stream hugs the
  // coast; sailfish/kingfish grounds are close.
  if(lat < 30.5 && lng > -82.0) return 70;
  // General SE Atlantic (SC / GA / south NC outside OBX band)
  if(lat < 33.5) return 105;
  return 120;
}

function maxRangeForPort(portObj){
  return portFishingRangeNm(portObj);
}

// Altimetry magenta break highlights use the same port radius so we don't flag
// a Gulf Stream wall 150 nm from Oregon Inlet when no OBX charter runs there.
function altimetryBreakRadiusNm(portObj){
  return portFishingRangeNm(portObj);
}

function altiBreakRadiusForActivePort(){
  const po = (typeof activePort !== "undefined" && activePort && PORTS[activePort])
    ? PORTS[activePort] : null;
  return po ? altimetryBreakRadiusNm(po) : 100;
}

function heatDisplayIntensity(score){
  // Visual-only contrast stretch: keeps ranking/click targets unchanged while
  // making low-but-real offshore prediction fields visible over dark basemaps.
  const s = Math.max(0, Math.min(1, Number(score) || 0));
  if(s <= 0) return 0;
  return Math.max(PREDICT_HEAT_SCORE_MIN, Math.pow(s, 0.60));
}

// Cache key for the scored bite-map grid. Includes a lightweight reports
// signature so a fresh SOCIAL feed invalidates stale hotspot rankings.
function predictResultCacheKey(){
  const reportSig = (typeof SOCIAL !== "undefined" && SOCIAL.length)
    ? `${SOCIAL.length}:${SOCIAL[0]?.hoursAgo ?? ""}:${SOCIAL[0]?.id ?? ""}`
    : "0";
  return `${activePort || ""}:${activeSpId || ""}:${FORECAST_HOUR_OFFSET || 0}:${reportSig}`;
}
function invalidatePredictCache(){ _predictResultCache = null; }

// Rank score for hotspot badge selection — favors in-season, high-confidence runs.
function hotspotRankScore(cell){
  const score = Number(cell.score) || 0;
  const conf = (Number.isFinite(cell.confidence) ? cell.confidence : 50) / 100;
  const inSeason = cell.inSeason !== false && !cell.outOfRange;
  const season = Number.isFinite(cell.seasonStrength) ? cell.seasonStrength : (inSeason ? 0.75 : 0.2);
  const seasonWt = inSeason ? (0.35 + 0.65 * season) : 0.12;
  return score * (0.45 + 0.55 * conf) * seasonWt;
}

// Pick the top N hotspot badges with geographic separation so the pins represent
// genuinely different areas. Shared by renderPrediction and topBriefHotspots so
// the banner run plan and map badges always agree.
function pickTopHotspotBadges(hotspots, limit){
  limit = limit || 3;
  if(!Array.isArray(hotspots) || !hotspots.length) return [];
  const chosen = [];
  const sepFor = (cell) => {
    const d = (typeof cell.distNm === "number") ? cell.distNm : 20;
    return Math.min(13, Math.max(5, d * 0.18));
  };
  const ranked = hotspots.slice().sort((a, b) => hotspotRankScore(b) - hotspotRankScore(a));
  for(const cell of ranked){
    if(chosen.length >= limit) break;
    const minSep = sepFor(cell);
    const farEnough = chosen.every(c => nmBetween(c.lat, c.lng, cell.lat, cell.lng) >= minSep);
    if(farEnough) chosen.push(cell);
  }
  return chosen;
}

// Great-circle distance in nautical miles between two lat/lng points.
function nmBetween(lat1, lng1, lat2, lng2){
  const R = 3440.065; // Earth radius in nautical miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ════════════════════════════════════════════════════════════════════════════
// HOME PORT HELPERS
//
// The "home port" anchors the initial map view. Canyons and other ports
// outside this radius are hidden by default to keep the chart focused and
// uncluttered. The user can still pan/zoom anywhere — this is the *default
// view*, not a hard restriction.
//
// Resolution order:
//   1. User's saved preference (USER_PREFS.defaultPort) if set in Settings
//   2. Whatever port is currently active (if any)
//   3. "Oregon Inlet, NC" as the universal fallback
// ════════════════════════════════════════════════════════════════════════════
const HOME_PORT_RADIUS_NM = 200;
const FALLBACK_HOME_PORT = "Oregon Inlet, NC";
// Initial zoom level when centering on the home port. At zoom 7 the scale
// bar reads roughly 50 nm; at 8 it's ~25 nm; at 6 it's ~100 nm. Picked to
// frame the whole 200nm-radius fishable area on a typical phone screen.
const HOME_PORT_ZOOM = 7;

function getHomePort(){
  // 1. Currently-active port — what the user is actually fishing this session
  if (typeof activePort !== "undefined" && activePort && PORTS[activePort]) {
    return activePort;
  }
  // 2. User-saved default from Settings (used on first open)
  if (typeof USER_PREFS !== "undefined" && USER_PREFS.defaultPort && PORTS[USER_PREFS.defaultPort]) {
    return USER_PREFS.defaultPort;
  }
  // 3. Universal fallback
  return FALLBACK_HOME_PORT;
}

// Returns true if the given lat/lng is within HOME_PORT_RADIUS_NM of the
// current home port. Used by drawCanyons / drawPortMarkers to filter
// what's visible on initial render.
function withinHomeRadius(lat, lng){
  const home = getHomePort();
  const p = PORTS[home];
  if (!p) return true;  // defensive — never hide things if home is unresolvable
  return nmBetween(p.lat, p.lng, lat, lng) <= HOME_PORT_RADIUS_NM;
}

// ── ASYNC, CHUNKED GRID COMPUTATION (perf) ───────────────────────────────────
// Scoring the full ~9,000-cell grid synchronously froze the UI for 1-3s on
// species select. This version computes the grid one band of latitude rows per
// animation frame, so the main thread stays responsive and the heat map fills
// in progressively. A generation token cancels a stale run if the user switches
// species/port before it finishes (prevents two runs racing onto the map).
let _predictGen = 0;
function computePredictionGridAsync(speciesId, onProgress, onDone){
  const myGen = ++_predictGen;
  if(speciesId === "all"){ onDone && onDone(null, myGen); return myGen; }

  const port = (typeof activePort !== "undefined" && activePort) ? PORTS[activePort] : null;
  const maxRange = maxRangeForPort(port);
  // Full-coast extent clamp. The Atlantic/Gulf box (default) is unchanged, so
  // East Coast behavior is identical. Pacific ports get their own West-Coast
  // box; without this the Atlantic-only longitude clamp collapsed the San Diego
  // bounding box (min > max), producing zero cells and a hung ocean fetch — the
  // "Generating heat map…" spinner that never finished.
  const _pac = !!port && typeof isPacificContext === "function" && isPacificContext(port.lat, port.lng);
  const LAT_MIN = _pac ? 29.0  : 24.0;
  const LAT_MAX = _pac ? 42.5  : 43.5;
  const LNG_MIN = _pac ? -126.0 : -97.5;
  const LNG_MAX = _pac ? -116.0 : -68.5;

  // ── Scope the fine grid to the active port's fishing range ──────────────────
  // Scoring the whole coast at a fine step would cover tens of thousands of
  // cells. When a port is active we restrict the grid to a bounding box around
  // the port that covers its max range, which shrinks the cell count enough to
  // afford a ~6 nm (0.1°) step. With no port we keep the full extent at 0.25°.
  let step, latMin, latMax, lngMin, lngMax, ROWS_PER_FRAME;
  let bboxLatMin = LAT_MIN, bboxLatMax = LAT_MAX, bboxLngMin = LNG_MIN, bboxLngMax = LNG_MAX;
  if(port){
    const degLat = (maxRange / 60) + 0.15;
    const degLng = (maxRange / (60 * Math.cos(port.lat * Math.PI / 180))) + 0.15;
    bboxLatMin = Math.max(LAT_MIN, port.lat - degLat);
    bboxLatMax = Math.min(LAT_MAX, port.lat + degLat);
    bboxLngMin = Math.max(LNG_MIN, port.lng - degLng);
    bboxLngMax = Math.min(LNG_MAX, port.lng + degLng);
    latMin = bboxLatMin; latMax = bboxLatMax; lngMin = bboxLngMin; lngMax = bboxLngMax;
    step = 0.1;          // ≈6 nm — fine field, but only over the port's bbox
    ROWS_PER_FRAME = 6;  // ~6 rows × ≈50 lng over water keeps each frame <16ms
  } else {
    latMin = LAT_MIN; latMax = LAT_MAX; lngMin = LNG_MIN; lngMax = LNG_MAX;
    step = 0.25;
    ROWS_PER_FRAME = 6;
  }

  const heatGrid = [];
  const hotspotGrid = [];
  let lat = latMin;
  const penaltyStart = maxRange / 3;

  // ── Local hotspot refinement (snap each top hotspot to its true peak) ───────
  // The fine grid still snaps coordinates to the step (0.1°). For the handful of
  // strongest hotspots we re-score a 5×5 micro-grid at 0.02° (~1.2 nm) around
  // each and move it to the highest-scoring point, so hotspot coordinates are
  // precise rather than grid-snapped — without paying that cost across the field.
  const REFINE_TOP_N = 40;     // strongest hotspots only (badges + likely clicks)
  const REFINE_STEP = 0.02;    // ≈1.2 nm micro-grid
  const REFINE_HALF = 2;       // 5×5 window
  const REFINE_PER_FRAME = 4;  // hotspots refined per frame (×24 scoreCell ≈ 96/frame)

  // Score one point with the SAME water/species/range/penalty rules as the grid,
  // so micro-grid scores are directly comparable to the cell being refined.
  function scoreWithPenalty(la, ln){
    if(!isPredictWater(la, ln)) return null;
    if(!speciesAllowedInWater(speciesId, classifyWaterType(la, ln))) return null;
    if(!speciesAllowedAtLat(speciesId, la, ln)) return null;
    if(port && !reachableFromPort(port, la, ln)) return null;  // stay on the port's coast
    let d = 0;
    if(port){
      d = nmBetween(port.lat, port.lng, la, ln);
      if(d > maxRange) return null;
    }
    const r = scoreCell(la, ln, speciesId);
    if(!r) return null;
    if(port && d > penaltyStart){
      const penalty = ((d - penaltyStart) / (maxRange - penaltyStart)) * 0.15;
      r.score = r.score * (1 - penalty);
    }
    return { result: r, distNm: Math.round(d) };
  }
  // Re-score a micro-grid around a hotspot and return a NEW cell at the local
  // peak (a fresh object, so the shared heatGrid copy is left untouched).
  function refinePeak(cell){
    let bestScore = cell.score, best = null;
    for(let di = -REFINE_HALF; di <= REFINE_HALF; di++){
      for(let dj = -REFINE_HALF; dj <= REFINE_HALF; dj++){
        if(di === 0 && dj === 0) continue;  // center is the cell we already have
        const la = cell.lat + di * REFINE_STEP;
        const ln = cell.lng + dj * REFINE_STEP;
        const s = scoreWithPenalty(la, ln);
        if(s && s.result.score > bestScore){ bestScore = s.result.score; best = { la, ln, s }; }
      }
    }
    if(!best) return cell;  // already the local peak — keep its coordinate
    return { lat: best.la, lng: best.ln, distNm: best.s.distNm, ...best.s.result };
  }

  let phase = "grid";
  let refineList = null, refineIdx = 0;

  function step_frame(){
    // Abort if a newer run started (species/port changed) — cancels BOTH phases.
    if(myGen !== _predictGen) return;

    if(phase === "grid"){
      let rows = 0;
      for(; lat <= latMax && rows < ROWS_PER_FRAME; lat += step, rows++){
        for(let lng = lngMin; lng <= lngMax; lng += step){
          if(!isPredictWater(lat, lng)) continue;
          const waterType = classifyWaterType(lat, lng);
          if(!speciesAllowedInWater(speciesId, waterType)) continue;
          if(!speciesAllowedAtLat(speciesId, lat, lng)) continue;
          // Keep the bite map on the port's coast — don't recommend Atlantic spots
          // for a Gulf port (or vice-versa) across the FL peninsula.
          if(port && !reachableFromPort(port, lat, lng)) continue;
          let distNm = 0;
          if(port){
            distNm = nmBetween(port.lat, port.lng, lat, lng);
            if(distNm > maxRange) continue;
          }
          const result = scoreCell(lat, lng, speciesId);
          if(!result) continue;
          if(port && distNm > penaltyStart){
            const penalty = ((distNm - penaltyStart) / (maxRange - penaltyStart)) * 0.15;
            result.score = result.score * (1 - penalty);
          }
          if(result.score < PREDICT_HEAT_SCORE_MIN) continue;
          const cell = {lat, lng, distNm: Math.round(distNm), ...result};
          heatGrid.push(cell);
          if(result.score >= PREDICT_HOTSPOT_SCORE_MIN) hotspotGrid.push(cell);
        }
      }
      if(lat <= latMax){
        // More rows remain — paint what we have so far, then continue next frame.
        onProgress && onProgress({
          heatGrid: heatGrid.slice().sort((a,b)=>b.score-a.score),
          hotspots: hotspotGrid.slice().sort((a,b)=>b.score-a.score),
          gridStep: step,
          gridOriginLat: latMin,
          gridOriginLng: lngMin,
        }, myGen);
        requestAnimationFrame(step_frame);
      } else {
        // Grid finished → begin the chunked hotspot refinement phase.
        refineList = hotspotGrid.slice().sort((a,b)=>hotspotRankScore(b)-hotspotRankScore(a));
        refineIdx = 0;
        phase = "refine";
        requestAnimationFrame(step_frame);
      }
      return;
    }

    // phase === "refine": snap the strongest hotspots to their true local peak.
    const limit = Math.min(refineList.length, REFINE_TOP_N);
    let n = 0;
    for(; refineIdx < limit && n < REFINE_PER_FRAME; refineIdx++, n++){
      refineList[refineIdx] = refinePeak(refineList[refineIdx]);
    }
    if(refineIdx < limit){
      requestAnimationFrame(step_frame);
    } else {
      onDone && onDone({
        heatGrid: heatGrid.sort((a,b)=>b.score-a.score),
        hotspots: refineList.sort((a,b)=>hotspotRankScore(b)-hotspotRankScore(a)),
        gridStep: step,
        gridOriginLat: latMin,
        gridOriginLng: lngMin,
      }, myGen);
    }
  }
  (async () => {
    if(myGen !== _predictGen) return;
    try {
      // Build the REAL ocean field over the SAME port-scoped bbox we score, so
      // SST/chlorophyll come from nearby pixels and a real temperature break can
      // be measured. Full extent only if no port is selected.
      if(port){
        // One combined request returns bathymetry grid + chlorophyll composite +
        // the batched ocean field (same data as ~90 separate calls).
        await buildPredictInputs(bboxLatMin, bboxLatMax, bboxLngMin, bboxLngMax);
      } else {
        await buildOceanField(LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX, { maxPoints: 60 });
      }
    }
    catch(e){ console.warn("buildOceanField", e); }
    if(myGen !== _predictGen) return;
    requestAnimationFrame(step_frame);
  })();
  return myGen;
}

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// BASEMAP SAMPLER
//
// Reads the underlying basemap tiles to determine water vs land at any pixel.
// The basemap is already pixel-perfect cartography — every inlet, bay, sound,
// barrier island, and lagoon is rendered correctly by professional cartographers.
// We just check the color of the pixel underneath where heat would render.
//
// This solves the long-standing land-bleed problem that hand-coded polygons
// could never fix. Indian River Lagoon → blue → snook heat renders. Cape Cod →
// green → no heat. Pamlico Sound → blue → striper heat renders. No more
// whack-a-mole with polygon edits.
//
// Cache strategy: snapshot the basemap once per zoomend/moveend, then sample
// from the cached snapshot for every heat repaint until the next view change.
// Tile loads are async, so we re-snapshot when tiles arrive too.
// ════════════════════════════════════════════════════════════════════════════
const BasemapSampler = {
  _canvas: null,
  _ctx: null,
  _imgData: null,        // Uint8ClampedArray of RGBA pixels (4 bytes per pixel)
  _w: 0, _h: 0,          // pixel dimensions of the cached snapshot
  _ready: false,         // true if at least one valid snapshot has been taken
  _failed: false,        // true if a CORS/security error blocked us (fall back to polygons)

  // Snapshot the visible basemap tiles into an offscreen canvas. Called by
  // the heat layer just before painting and on map move/zoom/tileload events.
  snapshot: function(map){
    if(this._failed) return false;  // sticky: once we fall back, stay fallen back this session
    try {
      const size = map.getSize();
      const w = size.x, h = size.y;
      if(w <= 0 || h <= 0) return false;

      if(!this._canvas){
        this._canvas = document.createElement('canvas');
        this._ctx = this._canvas.getContext('2d', {willReadFrequently:true});
      }
      if(this._canvas.width !== w || this._canvas.height !== h){
        this._canvas.width = w;
        this._canvas.height = h;
      }
      const ctx = this._ctx;
      ctx.clearRect(0, 0, w, h);
      // Paint the basemap-only background under the tiles so that any gaps
      // (tile not yet loaded) get classified as "unknown" rather than as land.
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Collect all loaded basemap tile <img> elements visible in the tilePane.
      // We only want the BASE layer tiles, not overlays like OpenSeaMap seamarks
      // or labels — those have their own keys and could be transparent over land.
      // The Esri satellite/ocean layers and OSM road tiles all live in tilePane.
      const tilePane = map.getPanes().tilePane;
      if(!tilePane) return false;
      const tileImgs = tilePane.querySelectorAll('img.leaflet-tile-loaded');
      if(tileImgs.length === 0) return false;

      // Map's origin (top-left of the visible area) in container pixels:
      // The tile <img> elements are positioned via CSS transform relative to
      // the tilePane. We need to figure out their absolute position within
      // the visible viewport so we can drawImage them into our canvas.
      const mapRect = map.getContainer().getBoundingClientRect();

      let drewAny = false;
      for(const img of tileImgs){
        if(!img.complete || img.naturalWidth === 0) continue;
        // Each tile is positioned absolutely within the tilePane via transform
        const tileRect = img.getBoundingClientRect();
        const x = tileRect.left - mapRect.left;
        const y = tileRect.top - mapRect.top;
        const tw = tileRect.width;
        const th = tileRect.height;
        try {
          ctx.drawImage(img, x, y, tw, th);
          drewAny = true;
        } catch(e) {
          // CORS taint — fall back permanently
          this._failed = true;
          this._ready = false;
          return false;
        }
      }
      if(!drewAny) return false;

      // Read pixels back. If the canvas was tainted, this throws SecurityError.
      try {
        this._imgData = ctx.getImageData(0, 0, w, h).data;
      } catch(e){
        this._failed = true;
        this._ready = false;
        return false;
      }
      this._w = w;
      this._h = h;
      this._ready = true;
      return true;
    } catch(e){
      this._failed = true;
      return false;
    }
  },

  // Test if a given container-pixel position is over water. Returns:
  //   true  → water (or unknown — see fallback note below)
  //   false → land
  // If the sampler isn't ready yet, returns null so the caller can fall back
  // to the polygon-based check.
  isWater: function(x, y){
    if(!this._ready || this._failed) return null;
    if(x < 0 || y < 0 || x >= this._w || y >= this._h) return null;
    const idx = ((y | 0) * this._w + (x | 0)) * 4;
    const r = this._imgData[idx];
    const g = this._imgData[idx + 1];
    const b = this._imgData[idx + 2];
    const a = this._imgData[idx + 3];
    if(a < 16) return null;  // transparent (tile gap) → unknown
    return this._classify(r, g, b);
  },

  // Color classifier — true if the pixel looks like cartographic water.
  // Tuned for:
  //   • Esri satellite imagery (real-world ocean blue, somewhat dark)
  //   • Esri Ocean Base (light cartographic blue)
  //   • OSM (very light cyan/blue water tiles ~#aad3df)
  //   • OpenSeaMap seamarks (mostly transparent — falls through to base layer)
  // Land is grass green, forest, brown, tan, or built-up gray-tan.
  _classify: function(r, g, b){
    // Strong saturated cartographic blue (OSM, Esri Ocean): light blue
    // where B is dominant by a clear margin.
    if(b > r + 12 && b > g - 5 && b > 130) return true;
    // Dark satellite ocean: muted dark blue/teal where B ≥ G > R and total
    // brightness is low (ocean photos are dark).
    const brightness = (r + g + b) / 3;
    if(brightness < 100 && b >= g - 5 && b > r + 5) return true;
    // Very dark near-black: deep ocean in satellite imagery
    if(r < 50 && g < 70 && b < 90 && b > r) return true;
    // Default: not water
    return false;
  },

  // Invalidate cache — called when map view changes
  invalidate: function(){
    this._ready = false;
  },

  // Did we permanently fall back to polygons? (e.g. CORS blocked)
  hasFallenBack: function(){
    return this._failed;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CUSTOM CANVAS HEAT LAYER
// Built from scratch using Leaflet's L.Layer API. No third-party plugins.
// Each cell is rasterized to a canvas as a radial gradient. Overlapping
// gradients accumulate using 'lighter' composite mode to produce smooth
// continuous heat blobs. Then a color ramp is applied per-pixel to convert
// accumulated intensity into the green→yellow→orange→red gradient.
// ════════════════════════════════════════════════════════════════════════════
const HeatCanvasLayer = L.Layer.extend({
  initialize: function(points, options){
    this._points = points || [];      // [{lat, lng, intensity, cellRef}]
    this._opts = Object.assign({
      radiusPx: 55,        // radius of each gaussian in pixels at current zoom
      minOpacity: 0.30,
      gradient: [
        // Richer, smoother gradient with 13 stops for fluid color transitions.
        // Mimics SatFish's painterly heat map look: deep teal/green base,
        // generous mid-range yellows/oranges, smooth ramp into reds.
        {at: 0.00, color: [ 35, 165, 160]},   // visible teal (very cool)
        {at: 0.08, color: [ 35, 190, 125]},   // sea green
        {at: 0.18, color: [ 95, 210,  60]},   // bright green
        {at: 0.28, color: [165, 230,  35]},   // lime
        {at: 0.38, color: [220, 235,  35]},   // chartreuse
        {at: 0.48, color: [255, 225,  45]},   // yellow
        {at: 0.56, color: [245, 195,  35]},   // golden yellow
        {at: 0.64, color: [245, 165,  30]},   // amber
        {at: 0.72, color: [240, 130,  30]},   // orange
        {at: 0.80, color: [235,  95,  30]},   // tangerine
        {at: 0.88, color: [220,  55,  35]},   // red
        {at: 0.94, color: [195,  30,  40]},   // crimson
        {at: 1.00, color: [160,  20,  45]},   // deep red (hot)
      ],
    }, options || {});
  },
  onAdd: function(map){
    this._map = map;
    if(!this._canvas){
      this._canvas = L.DomUtil.create('canvas', 'predict-heatmap-canvas');
      this._canvas.style.position = 'absolute';
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.zIndex = '450';
      // NOTE: NO CSS blur here. CSS blur was bleeding heat color across the
      // species/land mask boundaries (into Pamlico Sound, onto land). The
      // mask draws hard-edge transparent pixels; blur smears them. Smoothness
      // now comes from dense gradient color stops and gaussian falloff.
      this._canvas.style.willChange = 'transform';
    }
    map.getPanes().overlayPane.appendChild(this._canvas);
    // PERFORMANCE: the heat field is expensive to repaint (per-pixel field
    // render + basemap snapshot). Two changes keep zoom/pan smooth:
    //   1. During a zoom GESTURE we hide the stale canvas (zoomstart) and let
    //      Leaflet animate the basemap alone; we repaint once at zoomend. This
    //      removes the jank of Leaflet trying to scale/transform a full-screen
    //      canvas every animation frame.
    //   2. moveend/zoomend/resize redraws are coalesced into a single
    //      requestAnimationFrame so stacked events repaint at most once a frame.
    map.on('moveend zoomend viewreset resize', this._scheduleReset, this);
    map.on('zoomstart', this._onZoomStart, this);
    this._reset();
  },
  onRemove: function(map){
    if(this._rafId){ cancelAnimationFrame(this._rafId); this._rafId = null; }
    if(this._canvas && this._canvas.parentNode){
      this._canvas.parentNode.removeChild(this._canvas);
    }
    map.off('moveend zoomend viewreset resize', this._scheduleReset, this);
    map.off('zoomstart', this._onZoomStart, this);
  },
  // Hide the (now stale) heat canvas the instant a zoom gesture begins, so the
  // basemap can animate alone. zoomend → _scheduleReset repaints + reveals it.
  _onZoomStart: function(){
    if(this._canvas) this._canvas.style.visibility = 'hidden';
  },
  // Coalesce redraw requests into one per animation frame.
  _scheduleReset: function(){
    if(this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._reset();
      if(this._canvas) this._canvas.style.visibility = 'visible';
    });
  },
  _reset: function(){
    if(!this._map) return;
    const size = this._map.getSize();
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.width = size.x;
    this._canvas.height = size.y;
    this._redraw();
  },
  _redraw: function(){
    if(!this._canvas || !this._map) return;
    const ctx = this._canvas.getContext('2d');
    const w = this._canvas.width;
    const h = this._canvas.height;
    ctx.clearRect(0, 0, w, h);

    if(this._points.length === 0) return;

    // ════════════════════════════════════════════════════════════════════════
    // BILINEAR FIELD RENDERING (SatFish-style)
    //
    // Instead of painting overlapping gaussians, we treat the prediction
    // grid as a regular scalar field and bilinearly interpolate it at every
    // visible pixel. This produces:
    //   - Smooth continuous color (no blob shapes from overlapping circles)
    //   - Zoom-stable colors (same map spot = same interpolated value at
    //     any zoom level — no more "green at 50nm, red at 100nm")
    //   - Pixel-precise land/species masking (no gaussian bleed past coast)
    //   - Cheap per-pixel cost (just 4 grid lookups + linear blend)
    //
    // The grid is at 0.25° spacing geographically; cells that didn't make
    // the cutoff (score < 0.30, blocked by habitat, out of port range)
    // get implicit score 0. The interpolation will naturally fade to 0
    // along those boundaries.
    // ════════════════════════════════════════════════════════════════════════

    const map = this._map;
    // The interpolation grid MUST match BOTH the spacing AND the origin of the
    // computed data grid. The grid is adaptive: 0.1° (~6nm) over a port's bbox
    // (whose origin is an arbitrary latMin/lngMin, NOT a clean 0.1° multiple),
    // or 0.25° on the whole-coast fallback (origin LAT_MIN=24.0). Snapping to
    // the absolute round(x/step)*step lattice (as before) only worked for the
    // 0.25° case where the origin happened to align; for the port-scoped 0.1°
    // grid the points sit at origin+n·step (e.g. 35.0333, 35.1333…) and missed
    // every key — reading score 0 and shattering the field into blobs. We snap
    // RELATIVE to the real origin instead.
    const GRID_STEP = this._opts.gridStep || 0.25;
    const ORIGIN = this._opts.gridOrigin && this._opts.gridOrigin.lat != null
      ? this._opts.gridOrigin : { lat: 0, lng: 0 };
    const snap = (v, origin) => origin + Math.round((v - origin) / GRID_STEP) * GRID_STEP;
    const floorTo = (v, origin) => origin + Math.floor((v - origin) / GRID_STEP) * GRID_STEP;
    const keyOf = (lat, lng) => `${snap(lat, ORIGIN.lat).toFixed(4)},${snap(lng, ORIGIN.lng).toFixed(4)}`;

    // Build a sparse hash map of {lat, lng} → score for O(1) lookup
    const cellScores = new Map();
    for(const p of this._points){
      cellScores.set(keyOf(p.lat, p.lng), p.intensity);
    }
    const lookupScore = (lat, lng) => {
      const v = cellScores.get(keyOf(lat, lng));
      return v == null ? 0 : v;
    };

    const haveLandCheck = (typeof isFishableWater === "function");
    const sid = this._opts.speciesId;
    const speciesHabitat = (sid && typeof SPECIES_HABITAT !== "undefined") ? SPECIES_HABITAT[sid] : null;
    const haveSpeciesMask = !!(speciesHabitat && typeof classifyWaterType === "function");
    // Geographic range mask — does this species have any lat/region restrictions?
    const haveLatRange = !!(sid && typeof SPECIES_LAT_RANGE !== "undefined" &&
                            SPECIES_LAT_RANGE[sid] && typeof speciesAllowedAtLat === "function");

    // ── BASEMAP PIXEL SAMPLER ──
    // Take a snapshot of the basemap tiles right now. If it succeeds, we'll
    // use real cartographic data (the same map the user is looking at) to
    // classify water vs land. If it fails (CORS, no tiles loaded yet, etc.),
    // we fall back to the polygon-based isFishableWater() check.
    BasemapSampler.snapshot(map);
    const useBasemap = BasemapSampler._ready && !BasemapSampler.hasFallenBack();

    // Build the image data buffer directly
    const imgData = ctx.createImageData(w, h);
    const pixels = imgData.data;
    const grad = this._opts.gradient;
    const minOp = this._opts.minOpacity;

    // ── Per-pixel rendering with bilinear interpolation ──
    // For performance we sample the geographic position every PIX_STRIDE
    // pixels and fill the gap with the same interpolated value.
    // PERFORMANCE: raised from 2 to 4. Each computed block now covers a 4×4 px
    // area, cutting the expensive per-block work (basemap isWater sample +
    // classifyWaterType rectangle scan + species mask + bilinear) by ~4× —
    // from ~324k blocks to ~81k on a typical viewport. This was the dominant
    // cost of every zoom/pan redraw. The heat FIELD is interpolated from a
    // coarse 0.25° grid (~15nm cells), so a 4px sampling lattice is visually
    // indistinguishable — the gradient is far smoother than 4px either way.
    const PIX_STRIDE = 4;

    // ── PERFORMANCE: corner-anchored geo interpolation ──
    // map.containerPointToLatLng() is a non-trivial projection call. Calling it
    // once per 2×2 block was the dominant cost of a redraw (tens of thousands of
    // calls per frame on a large window). Web Mercator is exactly linear in X for
    // longitude, and latitude varies only with Y — so we can:
    //   • compute lng once per COLUMN (linear across x), and
    //   • compute lat once per ROW (project just the left edge of each row).
    // That's O(w/stride + h/stride) projection calls instead of O(w·h/stride²) —
    // typically a ~100× reduction — for a visually identical result (the field is
    // itself a smooth 0.25° interpolation, so sub-pixel projection error is moot).
    const _llLeft  = map.containerPointToLatLng([0, 0]);
    const _llRight = map.containerPointToLatLng([w, 0]);
    const _lngAtX = new Float64Array(w + PIX_STRIDE);
    for(let x = 0; x <= w; x += PIX_STRIDE){
      const fx = w === 0 ? 0 : x / w;
      _lngAtX[x] = _llLeft.lng + (_llRight.lng - _llLeft.lng) * fx;
    }
    // Latitude is non-linear in Y under Mercator, so project the left edge of
    // each sampled row (cheap: h/stride calls) rather than assuming linearity.
    const _latAtY = new Float64Array(h + PIX_STRIDE);
    for(let y = 0; y <= h; y += PIX_STRIDE){
      _latAtY[y] = map.containerPointToLatLng([0, y]).lat;
    }

    for(let y = 0; y < h; y += PIX_STRIDE){
      const _lat = _latAtY[y];
      for(let x = 0; x < w; x += PIX_STRIDE){
        const ll = { lat: _lat, lng: _lngAtX[x] };

        // ── REAL bathymetry land mask (authoritative when loaded) ──
        // CUDEM/ETOPO store land as depth 0 and water as depth > 0. When the bathy
        // grid is loaded for this area (it is during a prediction render), this
        // is a precise, basemap-independent land cut for coastlines, bays,
        // sounds and rivers everywhere from Maine to Southern California — so the heat never
        // paints over land even when the satellite basemap pixel is ambiguous
        // (turbid bay water, shadows, vegetation reading as "water").
        if(typeof realDepthAt === "function"){
          const _rd = realDepthAt(ll.lat, ll.lng);
          if(_rd != null && _rd <= 0){
            this._fillBlock(pixels, x, y, w, h, PIX_STRIDE, 0,0,0,0);
            continue;
          }
        }

        // ── Water/land mask — basemap pixel first, polygon fallback ──
        // Pixel sampling against the rendered basemap is pixel-perfect for
        // every coastline, bay, inlet, sound, lagoon, and barrier island —
        // no more whack-a-mole polygon fixes. If the sampler isn't usable
        // (CORS blocked, tiles still loading), fall through to the polygon
        // check so the app still works.
        let isWater = null;
        if(useBasemap){
          isWater = BasemapSampler.isWater(x, y);
        }
        if(isWater === false){
          // Definitive land from the basemap → transparent
          this._fillBlock(pixels, x, y, w, h, PIX_STRIDE, 0,0,0,0);
          continue;
        }
        if(isWater === null && haveLandCheck){
          // Sampler couldn't decide → fall back to polygon
          if(!isFishableWater(ll.lat, ll.lng)){
            this._fillBlock(pixels, x, y, w, h, PIX_STRIDE, 0,0,0,0);
            continue;
          }
        }
        if(haveSpeciesMask){
          const wt = classifyWaterType(ll.lat, ll.lng);
          if(!speciesHabitat.includes(wt)){
            this._fillBlock(pixels, x, y, w, h, PIX_STRIDE, 0,0,0,0);
            continue;
          }
        }
        // Geographic range check — pixels outside the species lat band are
        // transparent. Uses the central helper so per-region (Atlantic/Gulf)
        // species like bluefin tuna are filtered correctly.
        if(haveLatRange){
          if(!speciesAllowedAtLat(sid, ll.lat, ll.lng)){
            this._fillBlock(pixels, x, y, w, h, PIX_STRIDE, 0,0,0,0);
            continue;
          }
        }

        // ── Bilinear interpolation of the 4 surrounding grid cells ──
        // The pixel sits inside a [latLo, latHi] × [lngLo, lngHi] grid cell.
        // Corners are computed RELATIVE to the grid origin (see snap/floorTo
        // above) so they line up with the actual data points at origin+n·step.
        const latLo = floorTo(ll.lat, ORIGIN.lat);
        const latHi = latLo + GRID_STEP;
        const lngLo = floorTo(ll.lng, ORIGIN.lng);
        const lngHi = lngLo + GRID_STEP;
        const fLat = (ll.lat - latLo) / GRID_STEP;  // 0..1 weight toward latHi
        const fLng = (ll.lng - lngLo) / GRID_STEP;  // 0..1 weight toward lngHi

        const s00 = lookupScore(latLo, lngLo);  // SW corner
        const s01 = lookupScore(latLo, lngHi);  // SE
        const s10 = lookupScore(latHi, lngLo);  // NW
        const s11 = lookupScore(latHi, lngHi);  // NE

        // Bilinear:  v = s00*(1-fLat)*(1-fLng) + s01*(1-fLat)*fLng
        //              + s10*fLat*(1-fLng)     + s11*fLat*fLng
        const sLo = s00 + (s01 - s00) * fLng;  // interp along lng at low lat
        const sHi = s10 + (s11 - s10) * fLng;  // interp along lng at high lat
        const score = sLo + (sHi - sLo) * fLat;  // interp along lat

        // Feathered score floor: instead of a hard on/off at the cutoff (which
        // produces a stair-stepped outer boundary), fade the alpha across a
        // small band just above the floor so the heat edge dissolves smoothly
        // into the water. Below the band → fully transparent.
        const FEATHER = 0.06;  // score units over which the edge fades in
        if(score < PREDICT_HEAT_SCORE_MIN){
          this._fillBlock(pixels, x, y, w, h, PIX_STRIDE, 0,0,0,0);
          continue;
        }
        const edgeFade = Math.min(1, (score - PREDICT_HEAT_SCORE_MIN) / FEATHER);

        // ── Look up the gradient color for this score ──
        const t = Math.min(1, score);
        let c0, c1, frac = 0;
        for(let g = 0; g < grad.length - 1; g++){
          if(t >= grad[g].at && t <= grad[g + 1].at){
            c0 = grad[g].color;
            c1 = grad[g + 1].color;
            const span = grad[g + 1].at - grad[g].at;
            frac = span === 0 ? 0 : (t - grad[g].at) / span;
            break;
          }
        }
        if(!c0){ c0 = grad[grad.length - 1].color; c1 = c0; frac = 0; }
        const r = Math.round(c0[0] + (c1[0] - c0[0]) * frac);
        const gC = Math.round(c0[1] + (c1[1] - c0[1]) * frac);
        const b = Math.round(c0[2] + (c1[2] - c0[2]) * frac);
        const aOut = Math.round(255 * Math.max(minOp, t) * edgeFade);

        this._fillBlock(pixels, x, y, w, h, PIX_STRIDE, r, gC, b, aOut);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // ── EDGE-SMOOTHING PASS ───────────────────────────────────────────────
    // The field itself is bilinearly interpolated (smooth color), but the
    // MASKS (land, species habitat, lat-range) and the score-floor cutoff are
    // applied as hard per-block on/off decisions, so the OUTER boundary of the
    // heat comes out stair-stepped and pixelated (see the blocky edges along
    // the bay). We soften that by compositing the painted field back through a
    // light blur. Two safeguards keep it honest:
    //   1) We blur the ALREADY-MASKED result, so color can't reach across the
    //      species/land mask the way a pre-render CSS blur did.
    //   2) After blurring we CLIP the result back to the original painted alpha
    //      (destination-in), so the blur rounds the INTERIOR block edges but
    //      can't smear heat outward onto land/coast beyond where the field
    //      actually existed.
    if(typeof ctx.filter !== "undefined"){
      const snap = document.createElement("canvas");
      snap.width = w; snap.height = h;
      const sctx = snap.getContext("2d");
      sctx.drawImage(this._canvas, 0, 0);   // crisp masked field (keeps its alpha)

      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      const blurPx = Math.max(5, PIX_STRIDE * 1.6);
      ctx.filter = `blur(${blurPx}px)`;
      ctx.drawImage(snap, 0, 0);            // soft, de-blocked (bleeds a bit past edges)
      ctx.filter = "none";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(snap, 0, 0);            // re-stamp sharp cores so hot spots stay punchy
      ctx.globalAlpha = 1;
      // Clip everything back to where the field actually was — kills coastal bleed.
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(snap, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
  },
  // Helper: paint a PIX_STRIDE×PIX_STRIDE block of pixels with the same RGBA.
  // This is how the 2x performance saving from PIX_STRIDE is realized — each
  // expensive computation (containerPointToLatLng + bilinear lookup) covers
  // a 2x2 area instead of just one pixel.
  _fillBlock: function(pixels, x, y, w, h, stride, r, g, b, a){
    for(let dy = 0; dy < stride && (y + dy) < h; dy++){
      for(let dx = 0; dx < stride && (x + dx) < w; dx++){
        const i = ((y + dy) * w + (x + dx)) * 4;
        pixels[i]     = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = a;
      }
    }
  },
  setPoints: function(points){
    this._points = points || [];
    this._redraw();
  },
});

function heatCanvasLayer(points, options){
  return new HeatCanvasLayer(points, options);
}

// ════════════════════════════════════════════════════════════════════════════
// ANIMATED WIND LAYER — Windy-style flowing particle field.
// Shaded raster shows wind speed; white particles drift along real wind vectors.
// Pure canvas + requestAnimationFrame; no external libs.
// ════════════════════════════════════════════════════════════════════════════
const WindParticleLayer = L.Layer.extend({
  initialize: function(options){
    this._opts = Object.assign({
      particleCount: 900,   // scaled by viewport in _seed
      maxAgeFrames: 48,     // lifespan before respawn
      speedScale: 0.010,    // map-units (px) per m/s per frame factor
      lineWidth: 1.15,
      trailFade: 0.80,      // 0-1; higher = longer trails
      shadeCellPx: 14,
    }, options || {});
    this._particles = [];
    this._anim = null;
    this._dataReq = 0;
  },
  // Wind speed (kts) → streak color
  _speedColor: function(kts){
    const alpha = Math.max(0.42, Math.min(0.78, 0.42 + (kts / 45) * 0.32));
    return `rgba(255,255,255,${alpha.toFixed(3)})`;
  },
  onAdd: function(map){
    this._map = map;
    if(!this._shadeCanvas){
      this._shadeCanvas = L.DomUtil.create('canvas', 'wind-shade-canvas');
      this._shadeCanvas.style.position = 'absolute';
      this._shadeCanvas.style.pointerEvents = 'none';
      this._shadeCanvas.style.zIndex = '444';
    }
    if(!this._canvas){
      this._canvas = L.DomUtil.create('canvas', 'wind-particle-canvas');
      this._canvas.style.position = 'absolute';
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.zIndex = '445';  // just below the heat map (450)
    }
    map.getPanes().overlayPane.appendChild(this._shadeCanvas);
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend zoomend viewreset resize', this._reset, this);
    map.on('movestart zoomstart', this._pause, this);
    // Keep the shade pinned to geography DURING a pan drag (not just at the end),
    // so the wind field moves with the map like Windy instead of appearing glued
    // to the screen until release. Throttled to one repaint per animation frame;
    // skipped during zoom animation (zoomend → _reset handles that).
    map.on('move', this._onMove, this);
    this._reset();
  },
  onRemove: function(map){
    this._dataReq++;
    this._stop();
    if(this._moveRAF){ cancelAnimationFrame(this._moveRAF); this._moveRAF = null; }
    if(this._shadeCanvas && this._shadeCanvas.parentNode) this._shadeCanvas.parentNode.removeChild(this._shadeCanvas);
    if(this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    map.off('moveend zoomend viewreset resize', this._reset, this);
    map.off('movestart zoomstart', this._pause, this);
    map.off('move', this._onMove, this);
  },
  _onMove: function(){
    if(!this._map || !this._shadeCanvas) return;
    if(this._map._animatingZoom) return;          // zoom is handled at zoomend
    if(this._moveRAF) return;
    this._moveRAF = requestAnimationFrame(() => {
      this._moveRAF = null;
      if(!this._map) return;
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._shadeCanvas, topLeft);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._drawShade();                           // cheap bilinear repaint for the live view
    });
  },
  _pause: function(){ this._stop(); if(this._canvas){ this._canvas.getContext('2d').clearRect(0,0,this._canvas.width,this._canvas.height);} },
  _reset: function(){
    if(!this._map) return;
    const size = this._map.getSize();
    const topLeft = this._map.containerPointToLayerPoint([0,0]);
    L.DomUtil.setPosition(this._shadeCanvas, topLeft);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._shadeCanvas.width = size.x;
    this._shadeCanvas.height = size.y;
    this._canvas.width = size.x;
    this._canvas.height = size.y;
    this._seed();
    this._drawShade();
    this._requestData();
    this._start();
  },
  _requestData: function(){
    if(!layerVis.wind || typeof buildWindFieldForMap !== "function") return;
    const req = ++this._dataReq;
    buildWindFieldForMap().then(() => {
      if(req !== this._dataReq || !this._map) return;
      this._seed();
      this._drawShade();
      if(!this._anim) setTimeout(() => { if(this._map && layerVis.wind && !this._anim) this._start(); }, 280);
    }).catch(() => {
      if(req === this._dataReq){
        WIND_FIELD.status = "unavailable";
        WIND_FIELD.samples = [];
        updateOceanLegend();
        this._drawShade();
        if(!this._retryT){
          this._retryT = setTimeout(() => {
            this._retryT = null;
            if(layerVis.wind && this._map) this._requestData();
          }, 2500);
        }
      }
    });
  },
  refreshForecast: function(){
    this._dataReq++;
    this._stop();
    if(this._canvas) this._canvas.getContext('2d').clearRect(0,0,this._canvas.width,this._canvas.height);
    if(this._shadeCanvas) this._shadeCanvas.getContext('2d').clearRect(0,0,this._shadeCanvas.width,this._shadeCanvas.height);
    WIND_FIELD = { samples: [], builtAtMs: Date.now(), status: "loading", seq: WIND_FIELD.seq, boundsKey: "", forecastHour: WIND_FORECAST_HOUR };
    updateOceanLegend();
    this._requestData();
  },
  _drawShade: function(){
    if(!this._shadeCanvas) return;
    const ctx = this._shadeCanvas.getContext('2d');
    const w = this._shadeCanvas.width, h = this._shadeCanvas.height;
    ctx.clearRect(0,0,w,h);
    if(!WIND_GRID || !window.BW_WIND || !this._map) return;
    const cell = this._opts.shadeCellPx;
    const sw = Math.max(1, Math.ceil(w / cell));
    const sh = Math.max(1, Math.ceil(h / cell));
    const off = document.createElement("canvas");
    off.width = sw; off.height = sh;
    const octx = off.getContext("2d");
    for(let gy = 0; gy < sh; gy++){
      for(let gx = 0; gx < sw; gx++){
        const ll = this._map.containerPointToLatLng([(gx + 0.5) * cell, (gy + 0.5) * cell]);
        const wind = getWindField(ll.lat, ll.lng);
        if(!wind) continue;
        const fill = window.BW_WIND.colorForSpeed(wind.speedKts);
        if(fill === "rgba(0,0,0,0)") continue;
        octx.fillStyle = fill;
        octx.fillRect(gx, gy, 1, 1);
      }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.filter = "blur(6px)";
    ctx.drawImage(off, -cell, -cell, w + cell * 2, h + cell * 2);
    ctx.filter = "none";
  },
  _seed: function(){
    const w = this._canvas.width, h = this._canvas.height;
    const area = w*h;
    const n = Math.max(80, Math.min(420, Math.round(area/5200)));
    this._particles = [];
    for(let i=0;i<n;i++) this._particles.push(this._spawn());
  },
  _spawn: function(){
    return {
      x: Math.random()*this._canvas.width,
      y: Math.random()*this._canvas.height,
      age: Math.floor(Math.random()*this._opts.maxAgeFrames),
    };
  },
  _start: function(){
    if(this._anim) return;
    const step = ()=>{
      this._frame();
      this._anim = requestAnimationFrame(step);
    };
    this._anim = requestAnimationFrame(step);
  },
  _stop: function(){ if(this._anim){ cancelAnimationFrame(this._anim); this._anim=null; } },
  _frame: function(){
    const ctx = this._canvas.getContext('2d');
    const w = this._canvas.width, h = this._canvas.height;
    // Fade prior frame slightly (creates trails) instead of full clear
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${1-this._opts.trailFade})`;
    ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation = 'source-over';

    if(!WIND_GRID) return;
    const map = this._map;
    const zoom = map.getZoom();
    // Per-frame step is PROPORTIONAL to wind speed, so calm (blue/green) water
    // drifts slowly and only strong (orange/red/pink) wind moves fast. Kept
    // deliberately slow so direction is easy to read. A gentle zoom factor keeps
    // motion consistent across scales without runaway speed.
    const zoomScale = Math.pow(2, (zoom - 6) * 0.35);
    const CALM_KTS = 2;        // below this, treat as effectively calm (no streak)
    ctx.lineWidth = this._opts.lineWidth;
    ctx.lineCap = 'round';

    for(const p of this._particles){
      const ll = map.containerPointToLatLng([p.x, p.y]);
      const wind = getWindField(ll.lat, ll.lng);
      if(!wind){ Object.assign(p, this._spawn()); continue; }
      // Calm water: leave it nearly still (occasional drift), don't draw a streak.
      if(wind.speedKts < CALM_KTS){
        p.age++;
        if(p.age > this._opts.maxAgeFrames) Object.assign(p, this._spawn());
        continue;
      }
      // Step length grows with speed (px/frame), capped so gales stay readable.
      // ~3x slower than before: light wind ≈ 0.2-0.5 px/frame, a 35kt gale ≈ 1.6.
      const stepPx = Math.min(1.8, wind.speedKts * 0.045) * zoomScale;
      const mag = Math.hypot(wind.u, wind.v) || 1;
      const dx = (wind.u / mag) * stepPx;     // east = +x
      const dy = (-wind.v / mag) * stepPx;    // north = -y on screen
      const nx = p.x + dx, ny = p.y + dy;
      ctx.strokeStyle = this._speedColor(wind.speedKts);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      p.x = nx; p.y = ny; p.age++;
      // Respawn if too old or off-screen
      if(p.age > this._opts.maxAgeFrames || nx<0 || nx>w || ny<0 || ny>h){
        Object.assign(p, this._spawn());
        if(Math.random()<0.5){ p.x=Math.random()*w; p.y=Math.random()*h; }
        p.age = 0;
      }
    }
  },
});
function windParticleLayer(options){ return new WindParticleLayer(options); }

// ═════════════════════════════════════════════════════════════════════════════
// OCEAN CURRENTS (Pro) — NOAA RTOFS surface current field
// The premium offshore-intel services (Hilton's, ROFFS) built their business on
// current/altimetry charts; RTOFS provides the same surface-current model data
// free. This layer renders set & drift as animated streaks (Windy-style) so a
// captain can see the Gulf Stream wall, eddies, and current edges at a glance.
// Data comes from BW_OCEAN.fetchCurrentGrid (backend); NO synthetic fallback —
// if the backend has no data, the layer simply reports unavailable.
// ═════════════════════════════════════════════════════════════════════════════
const _CUR_MS_TO_KT = 1.94384;
let CURRENT_GRID = null;         // {step,minLat,minLng,nLat,nLng,u,v,fetchedAtMs}
let CURRENT_STATUS = "idle";     // idle | loading | ready | unavailable
let _curFetchSeq = 0;
let _curUnavailToastShown = false;

// Pure builder — used for BOTH the display layer (CURRENT_GRID) and the scorer
// (PREDICT_CUR_GRID) so they never clobber each other's bbox.
function buildCurGrid(data){
  if(!data || !data.u || !data.v || !data.nLat || !data.nLng) return null;
  return {
    // ESPC-D lat/lng spacings differ (~0.04° vs ~0.08°); older payloads only
    // carried the collapsed `step`, so fall back to it for both axes.
    stepLat: data.stepLat != null ? data.stepLat : data.step,
    stepLng: data.stepLng != null ? data.stepLng : data.step,
    step: data.step,
    minLat: data.minLat, minLng: data.minLng,
    nLat: data.nLat, nLng: data.nLng,
    u: data.u, v: data.v,
    fetchedAtMs: Date.now(),
    observedAtMs: data.observedAtMs || null,
  };
}
function setCurrentGridFromData(data){ CURRENT_GRID = buildCurGrid(data); }

// Bilinear-sample the current at a point. Returns {u,v (m/s), driftKts, setDeg}
// where setDeg is the direction the water flows TOWARD (mariner's "set"), or
// null outside the grid / over land. NOTE: land cells arrive as JSON null (NaN
// doesn't survive JSON), and the GLOBAL isFinite(null) is true (null→0), so we
// must use Number.isFinite here or land reads as a fake 0-knot current.
function getCurrentField(lat, lng){ return sampleCurrentGrid(CURRENT_GRID, lat, lng); }

// Bilinear-sample an arbitrary current grid (display or scoring copy). Body is
// the original getCurrentField logic, parameterized on the grid.
function sampleCurrentGrid(g, lat, lng){
  if(!g || !g.nLat) return null;
  const fi=(lat-g.minLat)/g.stepLat, fj=(lng-g.minLng)/g.stepLng;
  if(fi < -0.001 || fj < -0.001 || fi > g.nLat-1+0.001 || fj > g.nLng-1+0.001) return null;
  const i0=Math.max(0,Math.min(g.nLat-2,Math.floor(fi)));
  const j0=Math.max(0,Math.min(g.nLng-2,Math.floor(fj)));
  const di=Math.max(0,Math.min(1,fi-i0)), dj=Math.max(0,Math.min(1,fj-j0));
  const idx=(i,j)=>i*g.nLng+j;
  // RTOFS's own land mask is authoritative at ~4 km: if the NEAREST model cell
  // is land (null u/v), this point is on/next to land — draw nothing.
  const ni=Math.max(0,Math.min(g.nLat-1,Math.round(fi)));
  const nj=Math.max(0,Math.min(g.nLng-1,Math.round(fj)));
  if(!Number.isFinite(g.u[idx(ni,nj)]) || !Number.isFinite(g.v[idx(ni,nj)])) return null;
  let su=0,sv=0,sw=0;
  const corners=[[i0,j0,(1-di)*(1-dj)],[i0,j0+1,(1-di)*dj],[i0+1,j0,di*(1-dj)],[i0+1,j0+1,di*dj]];
  for(const c of corners){
    const ci=c[0], cj=c[1], wt=c[2];
    if(ci<0||cj<0||ci>=g.nLat||cj>=g.nLng) continue;
    const uu=g.u[idx(ci,cj)], vv=g.v[idx(ci,cj)];
    if(!Number.isFinite(uu)||!Number.isFinite(vv)) continue;
    su+=uu*wt; sv+=vv*wt; sw+=wt;
  }
  if(sw < 0.75) return null;   // need most of the cell — avoids coast bleed onto land
  const u=su/sw, v=sv/sw;
  const driftKts=Math.hypot(u,v)*_CUR_MS_TO_KT;
  const setDeg=(Math.atan2(u,v)*180/Math.PI+360)%360;   // direction of flow (toward)
  if(typeof isPredictWater === "function" && !isPredictWater(lat, lng)) return null;
  return { u, v, driftKts, setDeg };
}

// Max surface-current SHEAR (kt per 10 nm) within ~12 nm of a point — the flow
// edge/drift line (Gulf Stream wall, eddy rim) where bait and weed stack. Samples
// the scorer's PREDICT_CUR_GRID via the bilinear sampler (handles land + the
// anisotropic RTOFS grid). A robust proxy for the current-convergence line.
// null when there's no current data covering the point.
function currentShearAt(lat, lng){
  const g = PREDICT_CUR_GRID;
  if(!g) return null;
  const c0 = sampleCurrentGrid(g, lat, lng);
  if(!c0) return null;
  const rNm = 12;
  const dLat = rNm/60, dLng = rNm/(60*Math.cos(lat*Math.PI/180));
  const nbrs = [
    sampleCurrentGrid(g, lat+dLat, lng), sampleCurrentGrid(g, lat-dLat, lng),
    sampleCurrentGrid(g, lat, lng+dLng), sampleCurrentGrid(g, lat, lng-dLng),
  ];
  let maxGrad = 0;   // kt per nm
  for(const p of nbrs){
    if(!p) continue;
    const grad = Math.abs(p.driftKts - c0.driftKts) / rNm;
    if(grad > maxGrad) maxGrad = grad;
  }
  return maxGrad * 10;   // kt per 10 nm
}

// ── BOTTOM STRUCTURE (bathymetric slope / steepness) ────────────────────────
// Tournament pelagics don't just want the right DEPTH ZONE — they stack on
// bottom STRUCTURE: the shelf-edge lip, canyon walls, fingers, humps, and
// ledges where upwelling and current deflection concentrate bait. The depth
// factor alone can't see this: a flat abyssal plain at 1,000 m and a canyon
// wall at 250 m both sit "in the band" and score identically. This detector
// measures the local bottom GRADIENT (m of depth change per nm) from the same
// real bathymetry the scorer uses (PREDICT_BATHY_GRID via predictDepth), so a
// steep drop-off reads high and open flat bottom reads ~0.
//
// Returns 0..1 structure strength, or 0 when depth is unavailable/flat. Uses
// 8-way sampling (cardinals + diagonals) so canyon walls at any orientation are
// caught. null-safe: while bathy is still loading predictDepth returns a flat
// placeholder → gradient 0 → no false structure signal.
function bottomStructureStrengthAt(lat, lng){
  if(typeof predictDepth !== "function") return 0;
  const d0 = predictDepth(lat, lng);
  if(d0 == null || d0 <= 0) return 0;
  const rNm = 2.0;                                  // baseline for the gradient
  const dLat = rNm / 60;
  const dLng = rNm / (60 * Math.cos(lat * Math.PI / 180));
  const diagNm = rNm * Math.SQRT2;
  const nbrs = [
    [predictDepth(lat + dLat, lng),        rNm],
    [predictDepth(lat - dLat, lng),        rNm],
    [predictDepth(lat, lng + dLng),        rNm],
    [predictDepth(lat, lng - dLng),        rNm],
    [predictDepth(lat + dLat, lng + dLng), diagNm],
    [predictDepth(lat - dLat, lng - dLng), diagNm],
    [predictDepth(lat + dLat, lng - dLng), diagNm],
    [predictDepth(lat - dLat, lng + dLng), diagNm],
  ];
  let maxGrad = 0;   // m per nm
  for(const [dn, dist] of nbrs){
    if(dn == null || dn <= 0) continue;             // land / no data → skip
    const g = Math.abs(dn - d0) / dist;
    if(g > maxGrad) maxGrad = g;
  }
  // Ramp m/nm → 0..1. Flat sand/mud (<8 m/nm) → 0; pronounced ledge/hump
  // (~40 m/nm) → ~0.3; shelf break & canyon lips (~120 m/nm) → ~1.0; canyon
  // walls saturate at 1.0. Tuned to real US-Atlantic shelf-edge gradients.
  return Math.max(0, Math.min(1, (maxGrad - 8) / (120 - 8)));
}

function _curGridCoversView(){
  const g = CURRENT_GRID; if(!g || !MAP) return false;
  const b = MAP.getBounds();
  return b.getSouth() >= g.minLat - g.stepLat && b.getNorth() <= g.minLat + (g.nLat-1)*g.stepLat + g.stepLat
      && b.getWest()  >= g.minLng - g.stepLng && b.getEast()  <= g.minLng + (g.nLng-1)*g.stepLng + g.stepLng;
}

// Does the already-loaded bathymetry grid fully cover this box? Bathy (CUDEM
// depth=0) is the coast mask for the current streaks, and it's expensive to
// build (a fan-out of CUDEM tiles). If the bite map or a prior currents view
// already loaded a grid that covers here, reuse it instead of refetching.
function _bathyGridCoversView(latMin, latMax, lngMin, lngMax){
  const g = BATHY_GRID; if(!g) return false;
  const gLatMax = g.minLat + (g.nLat - 1) * g.step;
  const gLngMax = g.minLng + (g.nLng - 1) * g.step;
  return latMin >= g.minLat - g.step && latMax <= gLatMax + g.step
      && lngMin >= g.minLng - g.step && lngMax <= gLngMax + g.step;
}

async function buildCurrentFieldForMap(){
  if(!MAP) return;
  if(typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchCurrentGrid){
    CURRENT_STATUS = "unavailable";
    if(!_curUnavailToastShown && typeof showToast === "function"){
      _curUnavailToastShown = true;
      showToast("Ocean currents data is temporarily unavailable. Try again in a moment.", "info");
    }
    return;
  }
  if(CURRENT_GRID && _curGridCoversView() && (Date.now() - CURRENT_GRID.fetchedAtMs) < 30*60*1000) return;
  const seq = ++_curFetchSeq;
  CURRENT_STATUS = "loading";
  try {
    // Fetch a padded box around the view so panning doesn't refetch constantly.
    const b = MAP.getBounds();
    const padLat = (b.getNorth()-b.getSouth()) * 0.4, padLng = (b.getEast()-b.getWest()) * 0.4;
    const latMin = b.getSouth()-padLat, latMax = b.getNorth()+padLat;
    const lngMin = b.getWest()-padLng, lngMax = b.getEast()+padLng;
    // Load bathy (coast mask) in the BACKGROUND — do NOT block the current field
    // on it. Previously both were awaited together, so the slow CUDEM tile
    // fan-out (which can rival or exceed the RTOFS fetch) held up the currents
    // display even though the vectors come straight from RTOFS (which has its
    // own land mask). The streaks now paint the moment RTOFS returns; when bathy
    // arrives it refines the coast edge with a repaint. Skip the fetch entirely
    // if a grid already covers this view (e.g. the bite map just built one).
    if(typeof buildBathyGrid === "function" && !_bathyGridCoversView(latMin, latMax, lngMin, lngMax)){
      buildBathyGrid(latMin, latMax, lngMin, lngMax)
        .then(() => { if(seq === _curFetchSeq && currentsLayer && typeof currentsLayer._drawShade === "function") currentsLayer._drawShade(); })
        .catch(() => {});
    }
    const data = await BW_OCEAN.fetchCurrentGrid(latMin, latMax, lngMin, lngMax, oceanOverlayForecastHour());
    if(seq !== _curFetchSeq) return;
    setCurrentGridFromData(data);
    CURRENT_STATUS = CURRENT_GRID ? "ready" : "unavailable";
    if(currentsLayer && typeof currentsLayer._drawShade === "function"){
      currentsLayer._seed();
      currentsLayer._drawShade();
    }
    if(typeof updateOceanLegend === "function") updateOceanLegend();
  } catch(e){
    if(seq !== _curFetchSeq) return;
    CURRENT_GRID = null;
    CURRENT_STATUS = "unavailable";
  }
}

// Translucent water WASH color by drift speed — a soft, low-alpha tint painted
// under the flow highlights so the current reads as a body of moving water
// (Windy/ROFFS style) rather than sharp jet-contrail streaks. Currents live in a
// 0–4 kt world (Stream core ~2–4 kt; most shelf water under 1). Null = too slow
// to tint (leaves the basemap untouched).
function _currentShadeColor(kts){
  if(kts >= 3.0) return "rgba(251,191,36,0.30)";    // amber — Stream core
  if(kts >= 2.0) return "rgba(94,234,212,0.26)";    // bright aqua — strong
  if(kts >= 1.0) return "rgba(45,212,191,0.20)";    // teal — solid current
  if(kts >= 0.5) return "rgba(56,189,248,0.15)";    // soft blue — moving
  if(kts >= 0.2) return "rgba(125,211,252,0.10)";   // faint drift
  return null;                                      // effectively still
}
// Flow-highlight color for the animated ripples riding on top of the wash. Kept
// soft and semi-transparent (not pure white) so overlapping strokes build a
// flowing sheen instead of hard lines. Alpha grows a little with speed.
function _currentFlowColor(kts){
  const a = Math.max(0.16, Math.min(0.5, 0.16 + kts * 0.11));
  if(kts >= 3.0) return `rgba(255,244,214,${a.toFixed(3)})`;  // warm sheen — core
  if(kts >= 1.5) return `rgba(224,252,255,${a.toFixed(3)})`;  // cool white-cyan
  return `rgba(203,241,245,${a.toFixed(3)})`;                 // pale aqua
}

// Compact "valid time" stamp for the RTOFS current field. RTOFS is a model, so
// the grid carries the model's valid (observed/nowcast) time in observedAtMs.
// Rendered in the boat's local zone as "Jul 13, 2 PM".
function currentsTimeLabel(){
  const ms = CURRENT_GRID && CURRENT_GRID.observedAtMs;
  if(!ms || !isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", hour12: true,
    });
  } catch(e){ return ""; }
}
function currentStatusLabel(){
  if(CURRENT_STATUS === "loading") return "Loading RTOFS…";
  if(CURRENT_STATUS === "ready"){
    const t = currentsTimeLabel();
    return t ? `NOAA RTOFS · ${t}` : "NOAA RTOFS · surface drift";
  }
  if(CURRENT_STATUS === "unavailable") return "Currents unavailable";
  return "";
}

// Land/water gate for the currents layer — mirrors the heat-map mask: basemap
// pixel says land → out; CUDEM/ETOPO depth 0 → out; then isPredictWater.
function isCurrentDisplayWater(x, y, map, ll){
  if(!map) return false;
  if(!ll) ll = map.containerPointToLatLng([x, y]);
  if(typeof isInlandFreshwater === "function" && isInlandFreshwater(ll.lat, ll.lng)) return false;
  if(typeof realDepthAt === "function"){
    const d = realDepthAt(ll.lat, ll.lng);
    if(d != null && d <= 0) return false;
  }
  if(typeof BasemapSampler !== "undefined" && BasemapSampler._ready){
    const w = BasemapSampler.isWater(x, y);
    if(w === false) return false;
  }
  if(typeof isPredictWater === "function") return isPredictWater(ll.lat, ll.lng);
  return typeof isFishableWater === "function" ? isFishableWater(ll.lat, ll.lng) : false;
}

function isCurrentSegmentWater(x0, y0, x1, y1, map){
  if(!isCurrentDisplayWater(x0, y0, map)) return false;
  if(!isCurrentDisplayWater(x1, y1, map)) return false;
  const mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5;
  return isCurrentDisplayWater(mx, my, map);
}

// ── "Flowing water" current renderer ────────────────────────────────────────
// Two stacked canvases:
//   • SHADE  — a soft, water-masked translucent wash tinted by drift speed. It's
//     recomputed only on move/zoom/data (not every frame), so it's cheap, and it
//     gives the "body of moving water" look the sharp streaks lacked.
//   • FLOW   — soft, semi-transparent highlights that drift along the current so
//     the water looks alive. Fewer, softer, and water-masked at BOTH endpoints so
//     nothing paints across the coast onto land.
const CurrentParticleLayer = L.Layer.extend({
  initialize: function(){
    this._particles = [];
    this._anim = null;
    this._dataReq = 0;
    this._moveRAF = null;
    this._shadeCellPx = 18;
  },
  // Pixel + lat/lng land mask — same rules as the bite heat map (bathy depth 0,
  // basemap land pixel, isPredictWater). Never short-circuit on basemap water alone.
  _overWater: function(x, y, ll){
    return isCurrentDisplayWater(x, y, this._map, ll);
  },
  onAdd: function(map){
    this._map = map;
    if(!this._shadeCanvas){
      this._shadeCanvas = L.DomUtil.create('canvas', 'current-shade-canvas');
      this._shadeCanvas.style.position = 'absolute';
      this._shadeCanvas.style.pointerEvents = 'none';
      this._shadeCanvas.style.zIndex = '442';
    }
    if(!this._canvas){
      this._canvas = L.DomUtil.create('canvas', 'current-flow-canvas');
      this._canvas.style.position = 'absolute';
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.zIndex = '443';   // just under the wind streaks (445)
    }
    map.getPanes().overlayPane.appendChild(this._shadeCanvas);
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend zoomend viewreset resize', this._reset, this);
    map.on('movestart zoomstart', this._pause, this);
    map.on('move', this._onMove, this);
    this._reset();
  },
  onRemove: function(map){
    this._dataReq++;
    this._stop();
    if(this._moveRAF){ cancelAnimationFrame(this._moveRAF); this._moveRAF = null; }
    if(this._shadeCanvas && this._shadeCanvas.parentNode) this._shadeCanvas.parentNode.removeChild(this._shadeCanvas);
    if(this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    map.off('moveend zoomend viewreset resize', this._reset, this);
    map.off('movestart zoomstart', this._pause, this);
    map.off('move', this._onMove, this);
  },
  _onMove: function(){
    if(!this._map || !this._shadeCanvas) return;
    if(this._map._animatingZoom) return;
    if(this._moveRAF) return;
    this._moveRAF = requestAnimationFrame(() => {
      this._moveRAF = null;
      if(!this._map) return;
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._shadeCanvas, topLeft);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._drawShade();   // keep the wash pinned to geography during the drag
    });
  },
  _pause: function(){
    this._stop();
    if(this._canvas) this._canvas.getContext('2d').clearRect(0,0,this._canvas.width,this._canvas.height);
  },
  _reset: function(){
    if(!this._map) return;
    const size = this._map.getSize();
    const topLeft = this._map.containerPointToLayerPoint([0,0]);
    L.DomUtil.setPosition(this._shadeCanvas, topLeft);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._shadeCanvas.width = size.x;  this._shadeCanvas.height = size.y;
    this._canvas.width = size.x;       this._canvas.height = size.y;
    this._seed();
    this._drawShade();
    const req = ++this._dataReq;
    buildCurrentFieldForMap().then(() => {
      if(req !== this._dataReq || !this._map) return;
      this._seed();
      this._drawShade();
      if(!this._anim) this._start();
    }).catch(()=>{});
    this._start();
  },
  // Translucent, water-masked wash tinted by drift. Coarse grid + blur = cheap;
  // painted only on move/zoom/data, never per animation frame.
  _drawShade: function(){
    if(!this._shadeCanvas || !this._map) return;
    const ctx = this._shadeCanvas.getContext('2d');
    const w = this._shadeCanvas.width, h = this._shadeCanvas.height;
    ctx.clearRect(0,0,w,h);
    if(!CURRENT_GRID) return;
    const cell = this._shadeCellPx;
    const sw = Math.max(1, Math.ceil(w / cell));
    const sh = Math.max(1, Math.ceil(h / cell));
    const off = document.createElement("canvas");
    off.width = sw; off.height = sh;
    const octx = off.getContext("2d");
    for(let gy = 0; gy < sh; gy++){
      for(let gx = 0; gx < sw; gx++){
        const px = (gx + 0.5) * cell, py = (gy + 0.5) * cell;
        if(!this._overWater(px, py)) continue;   // hard land mask — no bleed
        const ll = this._map.containerPointToLatLng([px, py]);
        const cur = getCurrentField(ll.lat, ll.lng);
        if(!cur) continue;
        const fill = _currentShadeColor(cur.driftKts);
        if(!fill) continue;
        octx.fillStyle = fill;
        octx.fillRect(gx, gy, 1, 1);
      }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.filter = "blur(7px)";
    ctx.drawImage(off, -cell, -cell, w + cell * 2, h + cell * 2);
    ctx.filter = "none";
  },
  _seed: function(){
    if(!this._map) return;
    const size = this._map.getSize();
    // Fewer than the old streak field — soft translucent flow doesn't need many.
    const count = Math.round(Math.min(650, Math.max(220, (size.x*size.y)/2600)));
    this._particles = [];
    for(let i=0;i<count;i++) this._particles.push(this._spawn(size));
  },
  _spawn: function(size){
    for(let n = 0; n < 18; n++){
      const x = Math.random() * size.x, y = Math.random() * size.y;
      if(this._overWater(x, y)) return { x, y, age: Math.floor(Math.random() * 60) };
    }
    return { x: Math.random() * size.x, y: Math.random() * size.y, age: 0 };
  },
  _start: function(){
    if(this._anim) return;
    const step = () => { this._frame(); this._anim = requestAnimationFrame(step); };
    this._anim = requestAnimationFrame(step);
  },
  _stop: function(){ if(this._anim){ cancelAnimationFrame(this._anim); this._anim = null; } },
  _frame: function(){
    if(!this._map || !this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    const w = this._canvas.width, h = this._canvas.height;
    // Gentle trail fade — soft overlapping strokes read as flowing water, and the
    // longer fade (vs. a hard clear) gives ripples a smooth tail without contrails.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const size = this._map.getSize();
    const CALM_KT = 0.15;
    const MAX_AGE = 90;
    for(const p of this._particles){
      p.age++;
      if(p.age > MAX_AGE || p.x < -20 || p.y < -20 || p.x > size.x+20 || p.y > size.y+20){
        Object.assign(p, this._spawn(size)); p.age = 0; continue;
      }
      if(!this._overWater(p.x, p.y)){
        Object.assign(p, this._spawn(size)); p.age = 0; continue;
      }
      const ll = this._map.containerPointToLatLng([p.x, p.y]);
      const cur = getCurrentField(ll.lat, ll.lng);
      if(!cur){ Object.assign(p, this._spawn(size)); p.age = 0; continue; }
      if(cur.driftKts < CALM_KT){ continue; }
      // 0.5–1.0 px/frame — color quantifies speed; motion shows direction only.
      const stepPx = Math.min(1.0, Math.max(0.5, 0.5 + cur.driftKts * 0.12));
      const mag = Math.hypot(cur.u, cur.v) || 1;
      const ux = cur.u / mag, uy = -cur.v / mag;   // unit flow vector (screen space)
      const nx = p.x + ux * stepPx;
      const ny = p.y + uy * stepPx;
      if(!isCurrentSegmentWater(p.x, p.y, nx, ny, this._map)){
        Object.assign(p, this._spawn(size)); p.age = 0; continue;
      }
      ctx.strokeStyle = _currentFlowColor(cur.driftKts);
      ctx.lineWidth = cur.driftKts >= 2.5 ? 2.3 : (cur.driftKts >= 1 ? 1.9 : 1.4);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
      // Bright leading head so the direction of flow (set) is unmistakable — the
      // comet head points the way the water is going.
      if(cur.driftKts >= 0.4){
        ctx.fillStyle = _currentFlowColor(Math.min(4, cur.driftKts + 1.2));
        ctx.beginPath();
        ctx.arc(nx, ny, cur.driftKts >= 2 ? 1.6 : 1.2, 0, 6.283);
        ctx.fill();
      }
      p.x = nx; p.y = ny;
    }
  },
});
function currentParticleLayer(){ return new CurrentParticleLayer(); }

let currentsLayer = null;
function drawCurrents(){
  if(layerVis.currents){
    if(!currentsLayer) currentsLayer = currentParticleLayer();
    if(MAP && !MAP.hasLayer(currentsLayer)) currentsLayer.addTo(MAP);
  } else {
    if(currentsLayer && MAP && MAP.hasLayer(currentsLayer)) MAP.removeLayer(currentsLayer);
  }
  if(typeof updateOceanLegend === "function") updateOceanLegend();
}

// ═════════════════════════════════════════════════════════════════════════════
// SST FORECAST OVERLAY — RTOFS/HYCOM model SST at +12/+24 h (not satellite MUR).
// When FORECAST_HOUR_OFFSET > 0 the GIBS tile layer is hidden and this canvas
// layer draws the same model field the bite score reads.
// ═════════════════════════════════════════════════════════════════════════════
let SST_FORECAST_GRID = null;
let sstForecastLayer = null;
let _sstFcFetchSeq = 0;

function _sstForecastRGBA(tempF){
  if(!isFinite(tempF)) return null;
  // Fishing-focused ramp: spend most of the color budget in the warm band
  // where 1–2°F fronts matter (summer Mid-Atlantic / Gulf Stream edge). The old
  // 40–84°F GIBS-style ramp compressed 78–84°F into nearly identical oranges.
  const t = Math.max(50, Math.min(88, tempF));
  const stops = [
    [50,  8,  36,  96],   // deep blue — cool
    [60, 14,  90, 170],   // blue
    [68, 40, 170, 200],   // cyan
    [72, 90, 200, 120],   // green
    [74, 160, 210, 70],   // yellow-green
    [76, 220, 210, 50],   // yellow
    [78, 235, 170, 40],   // gold
    [80, 235, 120, 35],   // orange
    [82, 220,  70, 30],   // red-orange
    [84, 190,  40, 35],   // red
    [88, 140,  20, 50],   // deep red — hottest
  ];
  let i = 0;
  while(i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1];
  const f = (t - a[0]) / Math.max(0.001, b[0] - a[0]);
  return [
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    Math.round(a[3] + (b[3] - a[3]) * f),
    215,
  ];
}

function applySstForecastGrid(data){
  SST_FORECAST_GRID = null;
  if(!data || !data.rows || !data.rows.length) return;
  const step = data.stepDeg || 0.0833;
  let mnLa = Infinity, mxLa = -Infinity, mnLn = Infinity, mxLn = -Infinity, freshest = 0;
  for(const r of data.rows){
    if(r[0] < mnLa) mnLa = r[0]; if(r[0] > mxLa) mxLa = r[0];
    if(r[1] < mnLn) mnLn = r[1]; if(r[1] > mxLn) mxLn = r[1];
    if(r[3] && r[3] > freshest) freshest = r[3];
  }
  const nLat = Math.max(1, Math.round((mxLa - mnLa) / step) + 1);
  const nLng = Math.max(1, Math.round((mxLn - mnLn) / step) + 1);
  const val = new Float32Array(nLat * nLng).fill(NaN);
  for(const r of data.rows){
    if(r[2] == null) continue;
    const i = Math.round((r[0] - mnLa) / step), j = Math.round((r[1] - mnLn) / step);
    if(i >= 0 && i < nLat && j >= 0 && j < nLng) val[i * nLng + j] = r[2];
  }
  SST_FORECAST_GRID = {
    step, minLat: mnLa, minLng: mnLn, nLat, nLng, val,
    bounds: { s: mnLa, n: mxLa, w: mnLn, e: mxLn },
    observedAtMs: freshest || null,
    forecastHour: data.forecastHour || FORECAST_HOUR_OFFSET,
    source: data.source || "RTOFS",
  };
}

function _sstFcBuildSmallCanvas(g){
  const c = document.createElement("canvas");
  c.width = g.nLng; c.height = g.nLat;
  const cx = c.getContext("2d");
  const img = cx.createImageData(g.nLng, g.nLat);
  for(let i = 0; i < g.nLat; i++){
    for(let j = 0; j < g.nLng; j++){
      const v = g.val[i * g.nLng + j];
      const y = g.nLat - 1 - i;
      const o = (y * g.nLng + j) * 4;
      const rgba = _sstForecastRGBA(v);
      if(!rgba){ img.data[o + 3] = 0; continue; }
      img.data[o] = rgba[0]; img.data[o + 1] = rgba[1]; img.data[o + 2] = rgba[2]; img.data[o + 3] = rgba[3];
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

const SstForecastLayer = L.Layer.extend({
  onAdd: function(map){
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-sst-forecast-layer");
    this._canvas.style.pointerEvents = "none";
    const pane = map.getPane("ocean-overlays") || map.getPanes().overlayPane;
    pane.appendChild(this._canvas);
    map.on("moveend zoomend resize", this._reset, this);
    this._reset();
    this._requestData();
  },
  onRemove: function(map){
    map.off("moveend zoomend resize", this._reset, this);
    if(this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
  },
  _reset: function(){
    if(!this._map || !this._canvas) return;
    const size = this._map.getSize();
    const tl = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, tl);
    this._canvas.width = size.x; this._canvas.height = size.y;
    this._draw();
    if(!SST_FORECAST_GRID) this._requestData();
  },
  _requestData: function(){
    if(!layerVis.sst || !MAP || typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchSstGrid) return;
    const hours = (typeof oceanOverlayForecastHour === "function") ? oceanOverlayForecastHour() : 0;
    const seq = ++_sstFcFetchSeq;
    let b;
    try { b = MAP.getBounds(); } catch(e){ return; }
    const pad = 0.35;
    const bx = {
      s: b.getSouth() - (b.getNorth() - b.getSouth()) * pad,
      n: b.getNorth() + (b.getNorth() - b.getSouth()) * pad,
      w: b.getWest() - (b.getEast() - b.getWest()) * pad,
      e: b.getEast() + (b.getEast() - b.getWest()) * pad,
    };
    BW_OCEAN.fetchSstGrid(bx.s, bx.n, bx.w, bx.e, hours).then(data => {
      if(seq !== _sstFcFetchSeq || !layerVis.sst) return;
      if((typeof oceanOverlayForecastHour === "function" ? oceanOverlayForecastHour() : 0) !== hours) return;
      applySstForecastGrid(data);
      // High-contrast canvas is ready — drop the GIBS fallback tiles.
      if(typeof sstLayer !== "undefined" && sstLayer && MAP.hasLayer(sstLayer)) MAP.removeLayer(sstLayer);
      updateSatDateDisplay();
      if(typeof updateOceanLegend === "function") updateOceanLegend();
      this._draw();
    });
  },
  _draw: function(){
    if(!this._canvas || !this._map) return;
    const ctx = this._canvas.getContext("2d");
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const g = SST_FORECAST_GRID;
    if(!g) return;
    if(this._smallFor !== g){ this._small = _sstFcBuildSmallCanvas(g); this._smallFor = g; }
    const north = g.bounds.n + g.step * 0.5, south = g.bounds.s - g.step * 0.5;
    const west = g.bounds.w - g.step * 0.5, east = g.bounds.e + g.step * 0.5;
    const pTL = this._map.latLngToContainerPoint([north, west]);
    const pBR = this._map.latLngToContainerPoint([south, east]);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    if("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = oceanOpacity.sst || 0.7;
    ctx.drawImage(this._small, pTL.x, pTL.y, pBR.x - pTL.x, pBR.y - pTL.y);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = prev;
  },
  refresh: function(){ this._requestData(); },
});

function syncSstOverlayMode(){
  if(!MAP) return;
  // Prefer our fishing-focused canvas palette for BOTH observed MUR (hours=0)
  // and RTOFS forecast. GIBS tiles stay as a brief fallback while the grid loads
  // — their global colormap washes out summer fronts (78–84°F all look red).
  if(layerVis.sst){
    if(!sstForecastLayer) sstForecastLayer = new SstForecastLayer();
    if(!MAP.hasLayer(sstForecastLayer)) sstForecastLayer.addTo(MAP);
    else sstForecastLayer.refresh();
    if(!SST_FORECAST_GRID && sstLayer && !MAP.hasLayer(sstLayer)){
      sstLayer.setOpacity(oceanOpacity.sst);
      sstLayer.addTo(MAP);
    }
  } else {
    if(sstForecastLayer && MAP.hasLayer(sstForecastLayer)) MAP.removeLayer(sstForecastLayer);
    SST_FORECAST_GRID = null;
    if(sstLayer && MAP.hasLayer(sstLayer)) MAP.removeLayer(sstLayer);
  }
  updateSatDateDisplay();
  updateSatDateControlVisibility();
}

function refreshOceanForecastLayers(){
  // Altimetry is observed-only and intentionally not refreshed here.
  syncSstOverlayMode();
  if(layerVis.currents){
    CURRENT_GRID = null;
    if(typeof buildCurrentFieldForMap === "function") buildCurrentFieldForMap();
  }
  updateSatDateControlVisibility();
  if(typeof updateOceanLegend === "function") updateOceanLegend();
}

// ═════════════════════════════════════════════════════════════════════════════
// CHLOROPHYLL MAP OVERLAY — gap-filled VIIRS DINEOF grid with a fishing-focused
// log-scale palette. GIBS global colormaps wash the 0.05–0.5 mg/m³ "color edge"
// (where pelagics stack) into near-identical blues; we spend the ramp there.
// Separate from CHLOR_GRID (bite-score composite) so map pan doesn't clobber it.
// ═════════════════════════════════════════════════════════════════════════════
let CHLOR_MAP_GRID = null;
let chlorMapLayer = null;
let _chlorMapFetchSeq = 0;

function _chlorMapRGBA(chl){
  if(!isFinite(chl) || chl <= 0) return null;
  // Log-scale stops (mg/m³). Dense steps in the blue→green edge band.
  const stops = [
    [0.01,  12,  28,  90],   // sterile blue water
    [0.04,  18,  70, 160],   // deep blue
    [0.08,  20, 130, 190],   // blue-cyan — clean edge starts
    [0.12,  25, 175, 175],   // cyan — classic color break
    [0.18,  40, 200, 120],   // teal-green — productive edge
    [0.28,  90, 210,  70],   // green
    [0.45, 160, 210,  45],   // yellow-green
    [0.80, 220, 195,  40],   // gold
    [1.50, 230, 140,  35],   // orange — coastal green
    [3.00, 200,  70,  30],   // red-brown bloom
    [8.00, 140,  35,  45],   // dense inshore
  ];
  const v = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], chl));
  const logV = Math.log10(v);
  let i = 0;
  while(i < stops.length - 2 && logV > Math.log10(stops[i + 1][0])) i++;
  const a = stops[i], b = stops[i + 1];
  const f = (logV - Math.log10(a[0])) / Math.max(1e-6, Math.log10(b[0]) - Math.log10(a[0]));
  // Slightly stronger alpha in the edge band so breaks read over the basemap.
  const edge = v >= 0.06 && v <= 0.5;
  const alpha = edge ? 225 : 200;
  return [
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    Math.round(a[3] + (b[3] - a[3]) * f),
    alpha,
  ];
}

function applyChlorMapGrid(data){
  CHLOR_MAP_GRID = null;
  if(!data || !data.rows || !data.rows.length) return;
  const step = data.stepDeg || 0.08;
  let mnLa = Infinity, mxLa = -Infinity, mnLn = Infinity, mxLn = -Infinity, freshest = 0;
  for(const r of data.rows){
    if(r[0] < mnLa) mnLa = r[0]; if(r[0] > mxLa) mxLa = r[0];
    if(r[1] < mnLn) mnLn = r[1]; if(r[1] > mxLn) mxLn = r[1];
    if(r[3] && r[3] > freshest) freshest = r[3];
  }
  if(!isFinite(mnLa) || !isFinite(mxLa)) return;
  const nLat = Math.max(1, Math.round((mxLa - mnLa) / step) + 1);
  const nLng = Math.max(1, Math.round((mxLn - mnLn) / step) + 1);
  // Cap canvas size so a huge pan-box doesn't freeze the main thread.
  if(nLat * nLng > 180000) return;
  const val = new Float32Array(nLat * nLng).fill(NaN);
  for(const r of data.rows){
    if(r[2] == null || !(r[2] > 0)) continue;
    const i = Math.round((r[0] - mnLa) / step), j = Math.round((r[1] - mnLn) / step);
    if(i >= 0 && i < nLat && j >= 0 && j < nLng) val[i * nLng + j] = r[2];
  }
  CHLOR_MAP_GRID = {
    step, minLat: mnLa, minLng: mnLn, nLat, nLng, val,
    bounds: { s: mnLa, n: mxLa, w: mnLn, e: mxLn },
    observedAtMs: freshest || null,
    source: data.source || "VIIRS-DINEOF",
  };
}

function _chlorMapBuildSmallCanvas(g){
  const c = document.createElement("canvas");
  c.width = g.nLng; c.height = g.nLat;
  const cx = c.getContext("2d");
  const img = cx.createImageData(g.nLng, g.nLat);
  for(let i = 0; i < g.nLat; i++){
    for(let j = 0; j < g.nLng; j++){
      const v = g.val[i * g.nLng + j];
      const y = g.nLat - 1 - i;
      const o = (y * g.nLng + j) * 4;
      const rgba = _chlorMapRGBA(v);
      if(!rgba){ img.data[o + 3] = 0; continue; }
      img.data[o] = rgba[0]; img.data[o + 1] = rgba[1]; img.data[o + 2] = rgba[2]; img.data[o + 3] = rgba[3];
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

const ChlorMapLayer = L.Layer.extend({
  onAdd: function(map){
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-chlor-map-layer");
    this._canvas.style.pointerEvents = "none";
    const pane = map.getPane("ocean-overlays") || map.getPanes().overlayPane;
    pane.appendChild(this._canvas);
    map.on("moveend zoomend resize", this._reset, this);
    this._reset();
    this._requestData();
  },
  onRemove: function(map){
    map.off("moveend zoomend resize", this._reset, this);
    if(this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
  },
  _reset: function(){
    if(!this._map || !this._canvas) return;
    const size = this._map.getSize();
    const tl = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, tl);
    this._canvas.width = size.x; this._canvas.height = size.y;
    this._draw();
    // Refresh when the view leaves the cached grid (with a small pad).
    const g = CHLOR_MAP_GRID;
    if(!g){ this._requestData(); return; }
    let b;
    try { b = this._map.getBounds(); } catch(e){ return; }
    const pad = g.step * 2;
    if(b.getSouth() < g.bounds.s - pad || b.getNorth() > g.bounds.n + pad ||
       b.getWest() < g.bounds.w - pad || b.getEast() > g.bounds.e + pad){
      this._requestData();
    }
  },
  _requestData: function(){
    if(!layerVis.chlor || !MAP || typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchChlorGrid) return;
    // Historical satellite-day steps stay on GIBS tiles (grid is freshest-only).
    if((typeof satDayOffset !== "undefined") && satDayOffset > 0) return;
    const seq = ++_chlorMapFetchSeq;
    let b;
    try { b = MAP.getBounds(); } catch(e){ return; }
    const pad = 0.35;
    const bx = {
      s: b.getSouth() - (b.getNorth() - b.getSouth()) * pad,
      n: b.getNorth() + (b.getNorth() - b.getSouth()) * pad,
      w: b.getWest() - (b.getEast() - b.getWest()) * pad,
      e: b.getEast() + (b.getEast() - b.getWest()) * pad,
    };
    BW_OCEAN.fetchChlorGrid(bx.s, bx.n, bx.w, bx.e).then(data => {
      if(seq !== _chlorMapFetchSeq || !layerVis.chlor) return;
      if((typeof satDayOffset !== "undefined") && satDayOffset > 0) return;
      applyChlorMapGrid(data);
      if(typeof chlorLayer !== "undefined" && chlorLayer && MAP.hasLayer(chlorLayer)) MAP.removeLayer(chlorLayer);
      updateSatDateDisplay();
      if(typeof updateOceanLegend === "function") updateOceanLegend();
      this._draw();
    });
  },
  _draw: function(){
    if(!this._canvas || !this._map) return;
    const ctx = this._canvas.getContext("2d");
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const g = CHLOR_MAP_GRID;
    if(!g) return;
    if(this._smallFor !== g){ this._small = _chlorMapBuildSmallCanvas(g); this._smallFor = g; }
    const north = g.bounds.n + g.step * 0.5, south = g.bounds.s - g.step * 0.5;
    const west = g.bounds.w - g.step * 0.5, east = g.bounds.e + g.step * 0.5;
    const pTL = this._map.latLngToContainerPoint([north, west]);
    const pBR = this._map.latLngToContainerPoint([south, east]);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    if("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = oceanOpacity.chlor || 0.55;
    ctx.drawImage(this._small, pTL.x, pTL.y, pBR.x - pTL.x, pBR.y - pTL.y);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = prev;
  },
  refresh: function(){ this._requestData(); },
});

function syncChlorOverlayMode(){
  if(!MAP) return;
  // Freshest pass → fishing-focused canvas. Older sat-day steps → GIBS tiles.
  const useCanvas = !!(layerVis.chlor && (typeof satDayOffset === "undefined" || satDayOffset <= 0));
  if(useCanvas){
    if(!chlorMapLayer) chlorMapLayer = new ChlorMapLayer();
    if(!MAP.hasLayer(chlorMapLayer)) chlorMapLayer.addTo(MAP);
    else chlorMapLayer.refresh();
    if(!CHLOR_MAP_GRID && chlorLayer && !MAP.hasLayer(chlorLayer)){
      chlorLayer.setOpacity(oceanOpacity.chlor);
      chlorLayer.addTo(MAP);
    }
  } else {
    if(chlorMapLayer && MAP.hasLayer(chlorMapLayer)) MAP.removeLayer(chlorMapLayer);
    CHLOR_MAP_GRID = null;
    if(layerVis.chlor && chlorLayer && !MAP.hasLayer(chlorLayer)){
      chlorLayer.setOpacity(oceanOpacity.chlor);
      chlorLayer.addTo(MAP);
    }
    if(!layerVis.chlor && chlorLayer && MAP.hasLayer(chlorLayer)) MAP.removeLayer(chlorLayer);
  }
  updateSatDateDisplay();
  updateSatDateControlVisibility();
}

// ═════════════════════════════════════════════════════════════════════════════
// SSH ALTIMETRY — NOAA CoastWatch RADS NRT (nesdisSSH1day)
// Sea-level anomaly (SLA) from merged-altimeter daily composites. Positive SLA
// = elevated sea surface = anticyclonic warm-core eddy / Gulf Stream meander.
// Negative = cyclonic cold-core eddy. Same data Hilton's & ROFFS sell; NOAA
// provides it free at 0.25° resolution with ~1–3 day latency.
// ═════════════════════════════════════════════════════════════════════════════
let ALTIMETRY_GRID = null;  // { stepDeg, minLat, minLng, nLat, nLng, sla, ugos, vgos, observedAtMs }
let ALTIMETRY_GHOST_GRID = null; // deprecated — port-break ghost uses ALTIMETRY_BREAKS_GHOST_GRID
let ALTIMETRY_BREAKS_GRID = null;      // port-centered grid for stable magenta breaks
let ALTIMETRY_BREAKS_GHOST_GRID = null;
let ALTI_PORT_BREAKS = null;           // { port, offset, brk, ghostBrk } — fixed for port+day
let ALTIMETRY_STATUS = "idle";
let _altiFetchSeq = 0;
let _altiPortBreaksSeq = 0;
let altimetryLayer = null;
// Altimetry is daily observed data — step backward only. 0 = latest pass.
let altiDayOffset = 0;
const ALTI_MAX_DAYS_BACK = 6;
const _altiDayCache = new Map(); // `${bboxKey}:${offset}` → { grid, atMs }
// Scoring copies of the SSH + current grids, populated by buildPredictInputs for
// the bite-map bbox. Kept SEPARATE from the display-layer grids (ALTIMETRY_GRID /
// CURRENT_GRID) so a bite-map compute never repaints a toggled overlay's bbox.
let PREDICT_ALTI_GRID = null;
let PREDICT_CUR_GRID = null;

// Pure builder: turn a {stepDeg, rows:[[lat,lng,sla,ugos,vgos]], observedAtMs}
// payload into a gridded object, or null. Used for BOTH the display layer
// (ALTIMETRY_GRID) and the scorer (PREDICT_ALTI_GRID) so they never clobber
// each other's bbox.
function buildAltiGrid(data){
  if(!data || !Array.isArray(data.rows) || !data.rows.length) return null;
  const step = data.stepDeg || 0.25;
  let mnLa=Infinity,mxLa=-Infinity,mnLn=Infinity,mxLn=-Infinity;
  for(const r of data.rows){ if(r[0]<mnLa)mnLa=r[0]; if(r[0]>mxLa)mxLa=r[0]; if(r[1]<mnLn)mnLn=r[1]; if(r[1]>mxLn)mxLn=r[1]; }
  const nLat=Math.max(1,Math.round((mxLa-mnLa)/step)+1);
  const nLng=Math.max(1,Math.round((mxLn-mnLn)/step)+1);
  const sla=new Float32Array(nLat*nLng).fill(NaN);
  const ugos=new Float32Array(nLat*nLng).fill(0);
  const vgos=new Float32Array(nLat*nLng).fill(0);
  for(const r of data.rows){
    const i=Math.round((r[0]-mnLa)/step), j=Math.round((r[1]-mnLn)/step);
    if(i>=0&&i<nLat&&j>=0&&j<nLng){
      const idx=i*nLng+j;
      if(isFinite(r[2])) sla[idx]=r[2];
      if(isFinite(r[3])) ugos[idx]=r[3];
      if(isFinite(r[4])) vgos[idx]=r[4];
    }
  }
  return { step, minLat:mnLa, minLng:mnLn, nLat, nLng, sla, ugos, vgos,
    bounds:{s:mnLa,n:mxLa,w:mnLn,e:mxLn}, observedAtMs: data.observedAtMs||null };
}
function applyAltimetryGrid(data){ ALTIMETRY_GRID = buildAltiGrid(data); }

// Max SSH-anomaly gradient (m per 10 nm) within ~18 nm of a point — the strength
// of the geostrophic front here. Reads a grid built by buildAltiGrid (defaults
// to the scorer's PREDICT_ALTI_GRID). Mirrors thermalBreakGrid. null = no cover.
//
// The raw altimetry product is ~0.25° (~15 nm). Estimating the front by finite-
// differencing SLA between nodes that far apart SMEARS a Gulf Stream wall that's
// narrower than one cell across the whole 15 nm, understating a sharp front. To
// sharpen without inventing resolution we ALSO read the geostrophic current
// (ugos/vgos) the provider ships in the same grid: by geostrophy the surface
// jet speed is proportional to the SSH gradient AT that node (v = (g/f)·∂η/∂x),
// a node-local, un-smeared measure of the wall. We convert the peak jet speed to
// an SLA-equivalent gradient and return the STRONGER of the two estimators, so a
// real, sharp front scores like the wall it is instead of being averaged away.
function sshBreakAt(lat, lng, grid){
  const g = grid || PREDICT_ALTI_GRID;
  if(!g || !g.nLat || !g.sla) return null;
  const radNm = 18;
  const dLat = radNm/60, dLng = radNm/(60*Math.cos(lat*Math.PI/180));
  const iC = Math.round((lat-g.minLat)/g.step), jC = Math.round((lng-g.minLng)/g.step);
  const di = Math.max(1, Math.round(dLat/g.step)), dj = Math.max(1, Math.round(dLng/g.step));
  // Coriolis parameter f at this latitude (1/s) for the geostrophic conversion
  // ∂η/∂x = v·f/g. M_PER_10NM converts the per-metre gradient to m per 10 nm.
  const fCor = 2 * 7.2921e-5 * Math.sin(Math.abs(lat) * Math.PI / 180);
  const G = 9.81, M_PER_10NM = 18520, geoFactor = fCor > 0 ? (fCor / G) * M_PER_10NM : 0;
  const near=[];
  let maxGeoGrad = 0;   // SLA-equivalent gradient (m/10nm) inferred from the jet
  for(let i=iC-di;i<=iC+di;i++){
    for(let j=jC-dj;j<=jC+dj;j++){
      if(i<0||j<0||i>=g.nLat||j>=g.nLng) continue;
      const idx=i*g.nLng+j;
      const v=g.sla[idx];
      if(!Number.isFinite(v)) continue;
      near.push({la:g.minLat+i*g.step, ln:g.minLng+j*g.step, v});
      if(geoFactor > 0){
        const spd = Math.hypot(g.ugos[idx]||0, g.vgos[idx]||0);   // m/s
        if(spd > 0){ const geoGrad = spd * geoFactor; if(geoGrad > maxGeoGrad) maxGeoGrad = geoGrad; }
      }
    }
  }
  if(near.length < 2 && maxGeoGrad <= 0) return null;
  let maxGrad=0;
  for(let a=0;a<near.length;a++){
    for(let b=a+1;b<near.length;b++){
      const dNm=nmBetween(near[a].la,near[a].ln,near[b].la,near[b].ln);
      if(dNm<1) continue;
      const grad=Math.abs(near[a].v-near[b].v)/dNm;
      if(grad>maxGrad) maxGrad=grad;
    }
  }
  // Both estimators are in m per 10 nm; feed sshEdgeStrength the stronger one.
  return Math.max(maxGrad * 10, maxGeoGrad);
}

function getAltimetryField(lat, lng){
  const g=ALTIMETRY_GRID; if(!g||!g.nLat) return null;
  const fi=(lat-g.minLat)/g.step, fj=(lng-g.minLng)/g.step;
  if(fi<-0.001||fj<-0.001||fi>g.nLat-1+0.001||fj>g.nLng-1+0.001) return null;
  const i0=Math.max(0,Math.min(g.nLat-2,Math.floor(fi)));
  const j0=Math.max(0,Math.min(g.nLng-2,Math.floor(fj)));
  const di=Math.max(0,Math.min(1,fi-i0)), dj=Math.max(0,Math.min(1,fj-j0));
  const idx=(i,j)=>i*g.nLng+j;
  let ss=0,su=0,sv=0,sw=0;
  const corners=[[i0,j0,(1-di)*(1-dj)],[i0,j0+1,(1-di)*dj],[i0+1,j0,di*(1-dj)],[i0+1,j0+1,di*dj]];
  for(const c of corners){
    const ci=c[0],cj=c[1],wt=c[2];
    if(ci<0||cj<0||ci>=g.nLat||cj>=g.nLng) continue;
    const sv0=g.sla[idx(ci,cj)];
    if(!isFinite(sv0)) continue;
    ss+=sv0*wt; su+=g.ugos[idx(ci,cj)]*wt; sv+=g.vgos[idx(ci,cj)]*wt; sw+=wt;
  }
  if(sw<=0) return null;
  const slaM=ss/sw, u=su/sw, v=sv/sw;
  const geoSpeedKts=Math.hypot(u,v)*1.943844;
  const geoSetDeg=(Math.atan2(u,v)*180/Math.PI+360)%360;
  return { slaM, ugos:u, vgos:v, geoSpeedKts, geoSetDeg };
}

// Color for SSH anomaly: blue (cold/cyclonic eddy) → transparent (neutral) → red (warm/anticyclonic)
// Fishing-focused: most of the ramp sits in ±0.05–0.30 m where Gulf Stream edges
// and eddy walls live — the old ×4 gain washed those into the same pale tint.
function _altimetryColor(slaM){
  const rgba = _altimetryRGBA(slaM);
  if(!rgba) return null;
  return `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${(rgba[3]/255).toFixed(2)})`;
}
// Same color ramp as _altimetryColor but returns [r,g,b,a0-255] for ImageData,
// or null for near-flat / no-data cells (drawn transparent). Used by the
// smooth-fill offscreen canvas so SSH renders as a continuous gradient instead
// of blocky cells.
function _altimetryRGBA(slaM){
  if(!isFinite(slaM)) return null;
  const mag = Math.abs(slaM);
  // Hide only true flat water; show weak edges that still mark a break.
  if(mag < 0.015) return null;
  // Full chroma by ~±0.15 m so Stream/eddy walls saturate sooner (was 0.18 / 0.33).
  const t = Math.min(1, mag / 0.15);
  // Keep fill a notch under full so white edge contours stay readable on top.
  const alpha = Math.round((0.22 + 0.58 * Math.pow(t, 0.7)) * 255);
  if(slaM > 0){
    // Warm / anticyclonic — gold → orange → red → deep red
    const stops = [
      [0.00, 210, 160,  60],
      [0.35, 235, 110,  40],
      [0.65, 220,  55,  30],
      [1.00, 160,  20,  40],
    ];
    return _altiLerpStop(stops, t).concat([alpha]);
  }
  // Cold / cyclonic — cyan → blue → deep navy
  const stops = [
    [0.00,  80, 180, 210],
    [0.35,  40, 130, 220],
    [0.65,  25,  80, 190],
    [1.00,  15,  40, 140],
  ];
  return _altiLerpStop(stops, t).concat([alpha]);
}
function _altiLerpStop(stops, t){
  let i = 0;
  while(i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1];
  const f = (t - a[0]) / Math.max(0.001, b[0] - a[0]);
  return [
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    Math.round(a[3] + (b[3] - a[3]) * f),
  ];
}
// Build a grid-resolution offscreen canvas (one pixel per SSH cell, north at
// top). Drawn scaled-up with image smoothing → free bilinear interpolation, the
// classic technique for smooth heat fields. Also records min/max SSH so the
// contour pass only walks iso-levels that actually occur in view.
function _altiBuildSmallCanvas(g){
  const c=document.createElement("canvas");
  c.width=g.nLng; c.height=g.nLat;
  const cx=c.getContext("2d");
  const img=cx.createImageData(g.nLng, g.nLat);
  let mn=Infinity, mx=-Infinity;
  for(let i=0;i<g.nLat;i++){
    for(let j=0;j<g.nLng;j++){
      const sla=g.sla[i*g.nLng+j];
      const y=g.nLat-1-i;               // flip: grid row 0 = south → image bottom
      const o=(y*g.nLng+j)*4;
      if(!isFinite(sla)){ img.data[o+3]=0; continue; }
      if(sla<mn) mn=sla; if(sla>mx) mx=sla;
      const rgba=_altimetryRGBA(sla);
      if(!rgba){ img.data[o+3]=0; continue; }
      img.data[o]=rgba[0]; img.data[o+1]=rgba[1]; img.data[o+2]=rgba[2]; img.data[o+3]=rgba[3];
    }
  }
  cx.putImageData(img,0,0);
  return { canvas:c, min:isFinite(mn)?mn:0, max:isFinite(mx)?mx:0 };
}
// Marching-squares crossings for one cell at iso-level L. Corners:
//   A=SW(latA,lngA)  B=SE(latA,lngA+step)  C=NE(latA+step,lngA+step)  D=NW(latA+step,lngA)
// Returns 0, 2, or 4 latLng points (4 = saddle → two segments).
function _altiIsoSegs(A,B,C,D,L,latA,lngA,step){
  const pts=[];
  if((A>=L)!==(B>=L)){ const t=(L-A)/(B-A); pts.push([latA, lngA+t*step]); }              // bottom
  if((B>=L)!==(C>=L)){ const t=(L-B)/(C-B); pts.push([latA+t*step, lngA+step]); }          // right
  if((C>=L)!==(D>=L)){ const t=(L-C)/(D-C); pts.push([latA+step, lngA+step-t*step]); }     // top
  if((D>=L)!==(A>=L)){ const t=(L-D)/(A-D); pts.push([latA+step-t*step, lngA]); }          // left
  return pts;
}
// Node-wise SSH gradient magnitude (m per 10 nm) + up to 3 spatially-distinct
// "break" peaks (the steepest fronts). Grid-only, so it's cached alongside the
// smooth canvas. A break must clear ~0.045 m/10nm (a real edge, not noise) and
// sit ≥ ~1.1° from a stronger one so we surface separate fronts, not one blob.
// Magenta highlights are limited to the port's tailored fishing radius (see
// portFishingRangeNm) so captains only see breaks they can actually run to.
// Magenta contour trace stays local to each peak — not the full SSH isoline.
const ALTI_BREAK_TRACE_NM = 32;
// Realistic 1-day eddy motion — arrows only drawn inside this band so we never
// connect unrelated breaks that jumped tens of nm (the old 90nm cap caused that).
const ALTI_MAX_DRIFT_NM_PER_DAY = 28;
const ALTI_MIN_DRIFT_NM = 2;
function _altiComputeBreaks(g, portLat, portLng, maxNm){
  const n=g.nLat, m=g.nLng, gm=new Float32Array(n*m);
  const latOf=(i)=>g.minLat+i*g.step;
  for(let i=1;i<n-1;i++){
    const stepLatNm=g.step*60, stepLngNm=g.step*60*Math.cos(latOf(i)*Math.PI/180)||1e-6;
    for(let j=1;j<m-1;j++){
      const up=g.sla[(i+1)*m+j], dn=g.sla[(i-1)*m+j], rt=g.sla[i*m+j+1], lf=g.sla[i*m+j-1];
      if(!isFinite(up)||!isFinite(dn)||!isFinite(rt)||!isFinite(lf)) continue;
      const dLat=(up-dn)/(2*stepLatNm)*10;   // m per 10 nm
      const dLng=(rt-lf)/(2*stepLngNm)*10;
      gm[i*m+j]=Math.hypot(dLat,dLng);
    }
  }
  if(!Number.isFinite(portLat)||!Number.isFinite(portLng)||!(maxNm>0)) return { gm, peaks: [] };
  const cand=[];
  for(let i=1;i<n-1;i++) for(let j=1;j<m-1;j++){
    const v=gm[i*m+j];
    if(v<0.045) continue;
    const lat=latOf(i), lng=g.minLng+j*g.step;
    if(nmBetween(portLat,portLng,lat,lng)>maxNm) continue;
    cand.push({i,j,v});
  }
  cand.sort((a,b)=>b.v-a.v);
  const peaks=[], minSep=1.1;
  for(const c of cand){
    const lat=latOf(c.i), lng=g.minLng+c.j*g.step;
    let ok=true;
    for(const p of peaks){ if(Math.abs(p.lat-lat)<minSep && Math.abs(p.lng-lng)<minSep){ ok=false; break; } }
    if(ok){ peaks.push({i:c.i,j:c.j,lat,lng,level:g.sla[c.i*m+c.j],gmag:c.v}); if(peaks.length>=3) break; }
  }
  return { gm, peaks };
}
function altiBBoxKey(bx){ return `${bx.s.toFixed(2)},${bx.n.toFixed(2)},${bx.w.toFixed(2)},${bx.e.toFixed(2)}`; }
function altiForecastHourForDisplay(){
  // Altimetry OVERLAY is observed-only. A single RTOFS SSH slice referenced to
  // the local box mean is NOT comparable to the observed product's long-term
  // mean-sea-surface reference — it painted ~half the field as false cold eddies.
  // SSH/eddy structure also changes little over 12–24 h, so the latest observed
  // pass is effectively the near-term outlook. (The bite-map scorer still fuses
  // RTOFS SSH GRADIENTS for fronts; only this display layer is observed-only.)
  return 0;
}

// True when any layer that reads the shared ocean-model forecast time is visible.
// Altimetry is intentionally excluded — its overlay is observed-only (see above).
function oceanForecastLayersActive(){
  return !!(layerVis && (layerVis.sst || layerVis.currents || layerVis.predict));
}

function altiCacheKey(bx, offset, hours){ return `${altiBBoxKey(bx)}:${offset|0}:${normalizeForecastHour(hours||0)}`; }
async function fetchAltiGridCached(bx, offset, hoursAhead){
  const fh = normalizeForecastHour(hoursAhead || 0);
  const off = fh > 0 ? 0 : Math.max(0, Math.min(ALTI_MAX_DAYS_BACK, offset|0));
  const k = altiCacheKey(bx, off, fh);
  const hit = _altiDayCache.get(k);
  if(hit && Date.now()-hit.atMs < 6*60*60*1000) return hit.grid;
  if(typeof BW_OCEAN==="undefined"||!BW_OCEAN.fetchAltimetryGrid) return null;
  const data = await BW_OCEAN.fetchAltimetryGrid(bx.s, bx.n, bx.w, bx.e, off, fh);
  const grid = buildAltiGrid(data);
  if(grid) _altiDayCache.set(k, { grid, atMs: Date.now() });
  return grid;
}
// Draw magenta break contours + peak dots. Clipped to port radius AND a local
// neighborhood around each peak so we never paint a 100+ nm Gulf Stream wall.
function _altiSegInBreakRange(pts, pk, portLat, portLng, portMaxNm){
  if(!pts || pts.length < 2) return false;
  const ok = (lat, lng) => {
    if(nmBetween(pk.lat, pk.lng, lat, lng) > ALTI_BREAK_TRACE_NM) return false;
    if(Number.isFinite(portLat) && nmBetween(portLat, portLng, lat, lng) > portMaxNm) return false;
    return true;
  };
  return ok(pts[0][0], pts[0][1]) && ok(pts[1][0], pts[1][1]);
}
function _altiDrawMagentaBreaks(ctx, map, g, brk, opt, portLat, portLng, portMaxNm){
  if(!brk || !brk.peaks.length || !g) return;
  const strokeStyle = opt.strokeStyle || "rgba(244,63,180,1)";
  const lineWidth = opt.lineWidth || 4.5;
  const shadowBlur = opt.shadowBlur != null ? opt.shadowBlur : 12;
  const shadowColor = opt.shadowColor || "rgba(244,63,180,0.95)";
  const underStroke = opt.underStroke !== false; // white/dark halo so breaks read on red+blue fill
  const underColor = opt.underColor || "rgba(10,18,36,0.85)";
  const underWidth = opt.underWidth || (lineWidth + 2.4);
  const dotR = opt.dotR || 4.2;
  const dotFill = opt.dotFill || "rgba(244,63,180,1)";
  const gmA = brk.gm;
  const clipPort = Number.isFinite(portLat) && Number.isFinite(portLng) && portMaxNm > 0;
  const strokePeakPath = (pk) => {
    const L = pk.level, gth = 0.5 * pk.gmag;
    const traceLat = ALTI_BREAK_TRACE_NM / 60;
    const traceLng = ALTI_BREAK_TRACE_NM / (60 * Math.cos(pk.lat * Math.PI / 180) || 1e-6);
    ctx.beginPath();
    for(let i=0;i<g.nLat-1;i++){
      const latA = g.minLat + i * g.step;
      if(Math.abs(latA - pk.lat) > traceLat + g.step) continue;
      for(let j=0;j<g.nLng-1;j++){
        const lngA = g.minLng + j * g.step;
        if(Math.abs(lngA - pk.lng) > traceLng + g.step) continue;
        const A=g.sla[i*g.nLng+j], B=g.sla[i*g.nLng+(j+1)],
              C=g.sla[(i+1)*g.nLng+(j+1)], D=g.sla[(i+1)*g.nLng+j];
        if(!isFinite(A)||!isFinite(B)||!isFinite(C)||!isFinite(D)) continue;
        if(L<Math.min(A,B,C,D)||L>Math.max(A,B,C,D)) continue;
        const cg = Math.max(gmA[i*g.nLng+j], gmA[i*g.nLng+(j+1)], gmA[(i+1)*g.nLng+(j+1)], gmA[(i+1)*g.nLng+j]);
        if(cg < gth) continue;
        const pts = _altiIsoSegs(A,B,C,D,L,latA,lngA,g.step);
        if(pts.length >= 2 && _altiSegInBreakRange(pts, pk, portLat, portLng, portMaxNm)){
          let a = map.latLngToContainerPoint(pts[0]), b = map.latLngToContainerPoint(pts[1]);
          ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
          if(pts.length === 4){
            const pts2 = [pts[2], pts[3]];
            if(_altiSegInBreakRange(pts2, pk, portLat, portLng, portMaxNm)){
              a = map.latLngToContainerPoint(pts[2]); b = map.latLngToContainerPoint(pts[3]);
              ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
            }
          }
        }
      }
    }
  };
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for(const pk of brk.peaks){
    if(clipPort && nmBetween(portLat, portLng, pk.lat, pk.lng) > portMaxNm) continue;
    if(underStroke){
      ctx.shadowBlur = 0;
      ctx.strokeStyle = underColor;
      ctx.lineWidth = underWidth;
      strokePeakPath(pk);
      ctx.stroke();
    }
    ctx.shadowColor = shadowColor; ctx.shadowBlur = shadowBlur;
    ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth;
    strokePeakPath(pk);
    ctx.stroke();
    const pc = map.latLngToContainerPoint([pk.lat, pk.lng]);
    if(underStroke){
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(pc.x, pc.y, dotR + 1.4, 0, Math.PI*2);
      ctx.fillStyle = underColor; ctx.fill();
    }
    ctx.shadowColor = shadowColor; ctx.shadowBlur = shadowBlur;
    ctx.beginPath(); ctx.arc(pc.x, pc.y, dotR, 0, Math.PI*2);
    ctx.fillStyle = dotFill; ctx.fill();
  }
  ctx.restore();
}
// Pair prior-day ↔ current peaks only when both are mutual nearest neighbors,
// within realistic 1-day drift, and the same warm/cold character. Prevents bogus
// 45–60nm arrows from cross-matching unrelated breaks.
function _altiPeaksCompatible(from, to){
  if(!from || !to) return false;
  if(Math.abs(from.level) > 0.03 && Math.abs(to.level) > 0.03){
    if((from.level > 0) !== (to.level > 0)) return false;
  }
  return true;
}
function _altiMatchPeakDrifts(oldPeaks, newPeaks, maxNm){
  if(!oldPeaks?.length || !newPeaks?.length) return [];
  const cands = [];
  for(let ni=0; ni<newPeaks.length; ni++){
    for(let oi=0; oi<oldPeaks.length; oi++){
      if(!_altiPeaksCompatible(oldPeaks[oi], newPeaks[ni])) continue;
      const d = nmBetween(newPeaks[ni].lat, newPeaks[ni].lng, oldPeaks[oi].lat, oldPeaks[oi].lng);
      if(d > maxNm || d < ALTI_MIN_DRIFT_NM) continue;
      cands.push({ ni, oi, d, rankDiff: Math.abs(ni - oi) });
    }
  }
  cands.sort((a,b) => a.d - b.d || a.rankDiff - b.rankDiff);
  const usedNew = new Set(), usedOld = new Set(), pairs = [];
  for(const c of cands){
    if(usedNew.has(c.ni) || usedOld.has(c.oi)) continue;
    const neu = newPeaks[c.ni], old = oldPeaks[c.oi];
    let bestOldForNew = -1, bestD1 = Infinity;
    for(let oi=0; oi<oldPeaks.length; oi++){
      if(!_altiPeaksCompatible(oldPeaks[oi], neu)) continue;
      const d = nmBetween(neu.lat, neu.lng, oldPeaks[oi].lat, oldPeaks[oi].lng);
      if(d < bestD1){ bestD1 = d; bestOldForNew = oi; }
    }
    let bestNewForOld = -1, bestD2 = Infinity;
    for(let ni=0; ni<newPeaks.length; ni++){
      if(!_altiPeaksCompatible(old, newPeaks[ni])) continue;
      const d = nmBetween(old.lat, old.lng, newPeaks[ni].lat, newPeaks[ni].lng);
      if(d < bestD2){ bestD2 = d; bestNewForOld = ni; }
    }
    if(bestOldForNew !== c.oi || bestNewForOld !== c.ni) continue;
    usedNew.add(c.ni); usedOld.add(c.oi);
    pairs.push({ from: old, to: neu, distNm: c.d });
  }
  return pairs;
}
// Amber dashed arrows from prior-day break to today's break, labeled in nm.
function _altiDrawDriftArrows(ctx, map, pairs){
  if(!pairs || !pairs.length) return;
  ctx.save();
  ctx.lineCap = "round";
  for(const { from, to, distNm } of pairs){
    const p0 = map.latLngToContainerPoint([from.lat, from.lng]);
    const p1 = map.latLngToContainerPoint([to.lat, to.lng]);
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if(len < 10) continue;
    const ax = dx / len, ay = dy / len;
    ctx.strokeStyle = "rgba(251,191,36,0.92)";
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.setLineDash([]);
    const hl = 9, hw = 5;
    const bx = p1.x - ax * hl, by = p1.y - ay * hl;
    const nx = -ay, ny = ax;
    ctx.fillStyle = "rgba(251,191,36,0.95)";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(bx + nx * hw, by + ny * hw);
    ctx.lineTo(bx - nx * hw, by - ny * hw);
    ctx.closePath(); ctx.fill();
    const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
    ctx.font = "700 11px 'Segoe UI',Arial,sans-serif";
    ctx.fillStyle = "rgba(255,244,214,0.96)";
    ctx.strokeStyle = "rgba(10,22,40,0.75)";
    ctx.lineWidth = 3;
    const label = `${Math.round(distNm)} nm`;
    ctx.strokeText(label, mx + 7, my - 5);
    ctx.fillText(label, mx + 7, my - 5);
  }
  ctx.restore();
}

// Build the altimetry request box: modest padding for smooth panning, but the
// total span is capped because ERDDAP's blended-altimetry griddap store returns
// 502s / read-timeouts on large-area reads. When the view is wider than the cap
// we request a box centered on the view (altimetry covers the middle of screen).
const ALTI_MAX_LAT_SPAN = 8;   // degrees
const ALTI_MAX_LNG_SPAN = 14;  // degrees
function altimetryRequestBox(map){
  const b=map.getBounds().pad(0.2);
  let s=b.getSouth(), n=b.getNorth(), w=b.getWest(), e=b.getEast();
  const latC=(s+n)/2, lngC=(w+e)/2;
  if(n-s>ALTI_MAX_LAT_SPAN){ s=latC-ALTI_MAX_LAT_SPAN/2; n=latC+ALTI_MAX_LAT_SPAN/2; }
  if(e-w>ALTI_MAX_LNG_SPAN){ w=lngC-ALTI_MAX_LNG_SPAN/2; e=lngC+ALTI_MAX_LNG_SPAN/2; }
  return {s,n,w,e};
}
// Fixed bbox centered on the home port for magenta-break scoring. Independent
// of map pan/zoom so the top-3 breaks stay anchored to the port.
function altimetryPortBox(port){
  const r = altimetryBreakRadiusNm(port);
  let degLat = r / 60 + 0.05;
  let degLng = r / (60 * Math.cos(port.lat * Math.PI / 180) || 1e-6) + 0.05;
  degLat = Math.min(degLat, ALTI_MAX_LAT_SPAN / 2);
  degLng = Math.min(degLng, ALTI_MAX_LNG_SPAN / 2);
  return { s: port.lat - degLat, n: port.lat + degLat, w: port.lng - degLng, e: port.lng + degLng };
}
const AltimetryLayer = L.Layer.extend({
  onAdd: function(map){
    this._map=map;
    this._canvas=L.DomUtil.create("canvas","leaflet-zoom-animated");
    this._canvas.style.cssText="position:absolute;top:0;left:0;pointer-events:none;z-index:399";
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on("moveend zoomend",this._reset,this);
    map.on("move",this._onMove,this);
    this._reset();
    this._requestDisplayData();
    this._requestPortBreaks(true);
  },
  onRemove: function(map){
    map.off("moveend zoomend",this._reset,this);
    map.off("move",this._onMove,this);
    if(this._canvas&&this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas=null; this._map=null;
  },
  _onMove: function(){
    if(!this._canvas||!this._map) return;
    const tl=this._map.containerPointToLayerPoint([0,0]);
    L.DomUtil.setPosition(this._canvas,tl);
    this._draw();
  },
  _reset: function(){
    if(!this._map) return;
    const size=this._map.getSize();
    const tl=this._map.containerPointToLayerPoint([0,0]);
    L.DomUtil.setPosition(this._canvas,tl);
    this._canvas.width=size.x; this._canvas.height=size.y;
    this._draw();
    const g=ALTIMETRY_GRID;
    const bx=altimetryRequestBox(this._map);
    const tol=g?g.step:0.25;
    const boxKey=altiBBoxKey(bx);
    if(this._displayBox!==boxKey || this._displayOffset!==altiDayOffset || this._displayForecastHour!==altiForecastHourForDisplay() ||
       !g||bx.s<g.bounds.s-tol||bx.n>g.bounds.n+tol||
       bx.w<g.bounds.w-tol||bx.e>g.bounds.e+tol){
      this._requestDisplayData();
    }
  },
  _requestDisplayData: function(){
    if(!layerVis.altimetry||typeof BW_OCEAN==="undefined"||!BW_OCEAN.fetchAltimetryGrid||!MAP) return;
    const seq=++_altiFetchSeq;
    const bx=altimetryRequestBox(MAP);
    const boxKey=altiBBoxKey(bx);
    ALTIMETRY_STATUS="loading";
    if(typeof updateOceanLegend==="function") updateOceanLegend();
    const fh = altiForecastHourForDisplay();
    fetchAltiGridCached(bx, altiDayOffset, fh).then(grid=>{
      if(seq!==_altiFetchSeq||!layerVis.altimetry) return;
      ALTIMETRY_GRID=grid;
      this._displayBox=boxKey;
      this._displayOffset=altiDayOffset;
      this._displayForecastHour=fh;
      ALTIMETRY_STATUS=grid?"ready":"unavailable";
      if(typeof updateAltiDateDisplay==="function") updateAltiDateDisplay();
      if(typeof updateOceanLegend==="function") updateOceanLegend();
      this._draw();
    }).catch(()=>{
      ALTIMETRY_STATUS="unavailable";
      if(typeof updateOceanLegend==="function") updateOceanLegend();
    });
  },
  // Port-centered top-3 breaks — only refresh when port or altimetry day changes.
  _requestPortBreaks: function(force){
    if(!layerVis.altimetry||typeof BW_OCEAN==="undefined"||!BW_OCEAN.fetchAltimetryGrid) return Promise.resolve();
    const portName=(typeof activePort!=="undefined"&&activePort)?activePort:"";
    const fh = altiForecastHourForDisplay();
    const key=portName+":"+altiDayOffset+":"+fh;
    if(!force && this._portBreaksKey===key && ALTI_PORT_BREAKS) return Promise.resolve();
    const po=portName&&PORTS[portName]?PORTS[portName]:null;
    if(!po){
      ALTI_PORT_BREAKS=null; ALTIMETRY_BREAKS_GRID=null; ALTIMETRY_BREAKS_GHOST_GRID=null;
      this._portBreaksKey=""; this._draw(); return Promise.resolve();
    }
    const seq=++_altiPortBreaksSeq;
    const bx=altimetryPortBox(po);
    const ghostOff=altiDayOffset+1;
    const useGhost = fh <= 0 && altiDayOffset < ALTI_MAX_DAYS_BACK;
    return Promise.all([
      fetchAltiGridCached(bx, altiDayOffset, fh),
      useGhost ? fetchAltiGridCached(bx, ghostOff, 0) : Promise.resolve(null),
    ]).then(([grid, ghost])=>{
      if(seq!==_altiPortBreaksSeq||!layerVis.altimetry) return;
      ALTIMETRY_BREAKS_GRID=grid;
      ALTIMETRY_BREAKS_GHOST_GRID=ghost;
      const brk=grid?_altiComputeBreaks(grid, po.lat, po.lng, altimetryBreakRadiusNm(po)):null;
      const ghostBrk=ghost?_altiComputeBreaks(ghost, po.lat, po.lng, altimetryBreakRadiusNm(po)):null;
      ALTI_PORT_BREAKS={ port:portName, offset:altiDayOffset, brk, ghostBrk };
      this._portBreaksKey=key;
      this._draw();
    });
  },
  _requestData: function(){
    this._requestDisplayData();
    this._requestPortBreaks(true);
  },
  _draw: function(){
    if(!this._canvas||!this._map) return;
    const ctx=this._canvas.getContext("2d");
    const w=this._canvas.width, h=this._canvas.height;
    ctx.clearRect(0,0,w,h);
    if(!ALTIMETRY_GRID) return;
    const g=ALTIMETRY_GRID;

    // ── 1) SMOOTH FILL ──────────────────────────────────────────────────────
    // Rebuild the grid-resolution offscreen canvas only when the grid changes,
    // then blit it scaled to the view with smoothing on → continuous gradient.
    if(this._smallFor!==g){ this._small=_altiBuildSmallCanvas(g); this._smallFor=g; }
    const north=g.bounds.n+g.step*0.5, south=g.bounds.s-g.step*0.5;
    const west=g.bounds.w-g.step*0.5,  east=g.bounds.e+g.step*0.5;
    const pTL=this._map.latLngToContainerPoint([north, west]);
    const pBR=this._map.latLngToContainerPoint([south, east]);
    const prevSmooth=ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled=true;
    if("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality="high";
    ctx.drawImage(this._small.canvas, pTL.x, pTL.y, pBR.x-pTL.x, pBR.y-pTL.y);
    ctx.imageSmoothingEnabled=prevSmooth;

    // ── 2) CONTOUR ISOLINES ─────────────────────────────────────────────────
    // SSH contours every 0.05 m. Where lines pack tightly = the break. Brightness
    // and width scale with local cell range so steep fronts jump out and flat
    // water stays quiet.
    const step=g.step, lo=Math.floor(this._small.min/0.05)*0.05, hi=Math.ceil(this._small.max/0.05)*0.05;
    const toPt=(p)=>this._map.latLngToContainerPoint(p);
    ctx.lineCap="round"; ctx.lineJoin="round";
    for(let L=lo; L<=hi+1e-9; L+=0.05){
      const major=Math.abs(Math.round(L/0.05)%2)===0; // every 0.10 m is a major
      // Two passes: faint base for context, then reinforced where the cell
      // spans a real gradient (front definition).
      for(const pass of ["base", "edge"]){
        ctx.beginPath();
        let any=false;
        for(let i=0;i<g.nLat-1;i++){
          const latA=g.minLat+i*step;
          for(let j=0;j<g.nLng-1;j++){
            const A=g.sla[i*g.nLng+j], B=g.sla[i*g.nLng+(j+1)],
                  C=g.sla[(i+1)*g.nLng+(j+1)], D=g.sla[(i+1)*g.nLng+j];
            if(!isFinite(A)||!isFinite(B)||!isFinite(C)||!isFinite(D)) continue;
            if(L<Math.min(A,B,C,D)||L>Math.max(A,B,C,D)) continue;
            const cellRange = Math.max(A,B,C,D) - Math.min(A,B,C,D);
            const isEdge = cellRange >= 0.035; // ~real front across one cell
            if(pass === "base" && isEdge) continue;
            if(pass === "edge" && !isEdge) continue;
            const pts=_altiIsoSegs(A,B,C,D,L,latA,g.minLng+j*step,step);
            if(pts.length>=2){
              let a=toPt(pts[0]), b=toPt(pts[1]);
              ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
              if(pts.length===4){ a=toPt(pts[2]); b=toPt(pts[3]); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); }
              any=true;
            }
          }
        }
        if(!any) continue;
        if(pass === "base"){
          ctx.shadowBlur=0;
          ctx.strokeStyle=major?"rgba(255,255,255,0.32)":"rgba(255,255,255,0.14)";
          ctx.lineWidth=major?1.05:0.7;
          ctx.stroke();
        } else {
          // Dark understroke + bright white so packed isolines read as a wall
          // against both warm (red) and cold (blue) SSH fill.
          ctx.shadowBlur=0;
          ctx.strokeStyle="rgba(8,16,32,0.72)";
          ctx.lineWidth=major?3.1:2.2;
          ctx.stroke();
          ctx.strokeStyle=major?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.78)";
          ctx.lineWidth=major?2.35:1.55;
          ctx.stroke();
        }
      }
    }

    // ── 3) GEOSTROPHIC FLOW ARROWS (subtle, so contours read) ────────────────
    const _MS_KT=1.943844;
    for(let i=0;i<g.nLat;i++){
      for(let j=0;j<g.nLng;j++){
        const ug=g.ugos[i*g.nLng+j], vg=g.vgos[i*g.nLng+j];
        const spd=Math.hypot(ug,vg)*_MS_KT;
        if(spd<0.3) continue;
        const lat=g.minLat+i*g.step, lng=g.minLng+j*g.step;
        const pc=this._map.latLngToContainerPoint([lat,lng]);
        if(pc.x<-20||pc.x>w+20||pc.y<-20||pc.y>h+20) continue;
        const ang=Math.atan2(ug,-vg); // +x=east, -y=north on canvas
        const len=Math.min(14, 6+spd*2.5);
        const ax=Math.cos(ang), ay=Math.sin(ang);
        const tx=pc.x+ax*len, ty=pc.y+ay*len;
        ctx.strokeStyle="rgba(255,255,255,0.55)";
        ctx.lineWidth=1.1; ctx.lineCap="round";
        ctx.beginPath(); ctx.moveTo(pc.x,pc.y); ctx.lineTo(tx,ty); ctx.stroke();
        const hl=5, hw=2.5;
        const bx=tx-ax*hl, by=ty-ay*hl;
        const nx=-ay, ny=ax;
        ctx.fillStyle="rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.moveTo(tx,ty);
        ctx.lineTo(bx+nx*hw,by+ny*hw);
        ctx.lineTo(bx-nx*hw,by-ny*hw);
        ctx.closePath(); ctx.fill();
      }
    }

    // ── 4) PRIOR-DAY GHOST + DRIFT + MAGENTA (port-anchored) ───────────────
    const portName=(typeof activePort!=="undefined"&&activePort)?activePort:"";
    const po=portName&&PORTS[portName]?PORTS[portName]:null;
    const pb=ALTI_PORT_BREAKS;
    const bg=ALTIMETRY_BREAKS_GRID;
    const gg=ALTIMETRY_BREAKS_GHOST_GRID;
    if(po && pb && pb.port===portName && pb.offset===altiDayOffset && bg && pb.brk){
      const brk=pb.brk;
      let drifts=[];
      if(gg && pb.ghostBrk && altiDayOffset<ALTI_MAX_DAYS_BACK && brk.peaks.length && pb.ghostBrk.peaks.length){
        drifts=_altiMatchPeakDrifts(pb.ghostBrk.peaks, brk.peaks, ALTI_MAX_DRIFT_NM_PER_DAY);
        if(drifts.length){
          const matchedGhost={ gm:pb.ghostBrk.gm, peaks:drifts.map(d=>d.from) };
          _altiDrawMagentaBreaks(ctx, this._map, gg, matchedGhost, {
            strokeStyle:"rgba(236,72,153,0.30)", lineWidth:2, shadowBlur:0,
            underStroke:false, dotR:2.6, dotFill:"rgba(236,72,153,0.38)",
          }, po.lat, po.lng, altimetryBreakRadiusNm(po));
        }
      }
      if(drifts.length) _altiDrawDriftArrows(ctx, this._map, drifts);
      _altiDrawMagentaBreaks(ctx, this._map, bg, brk, {}, po.lat, po.lng, altimetryBreakRadiusNm(po));
    }
  },
});

async function buildAltimetryForMap(){
  if(!MAP||!BW_OCEAN||!BW_OCEAN.fetchAltimetryGrid) return;
  if(altimetryLayer){
    await altimetryLayer._requestPortBreaks(true);
    altimetryLayer._requestDisplayData();
  }
}

function drawAltimetry(){
  if(layerVis.altimetry){
    if(!altimetryLayer) altimetryLayer=new AltimetryLayer();
    if(MAP&&!MAP.hasLayer(altimetryLayer)) altimetryLayer.addTo(MAP);
    if(typeof updateAltiDateControlVisibility === "function") updateAltiDateControlVisibility();
  } else {
    if(altimetryLayer&&MAP&&MAP.hasLayer(altimetryLayer)) MAP.removeLayer(altimetryLayer);
    if(typeof updateAltiDateControlVisibility === "function") updateAltiDateControlVisibility();
  }
  if(typeof updateOceanLegend==="function") updateOceanLegend();
}

// ── PREDICTION INTERACTION (marker-free) ─────────────────────────────────────
// Resolve a map LatLng to the nearest scored grid cell within a small pixel
// radius, so clicks/hovers behave like the old per-cell markers without the
// thousands of SVG nodes. Grid is 0.25° so we only scan cells near the cursor.
function nearestPredictCell(latlng){
  if(!_predictGrid || _predictGrid.length === 0) return null;
  // Quick spatial filter: only consider cells within ~0.2° (≈ within one grid
  // step) of the cursor, then pick the closest by true pixel distance.
  const LAT_TOL = 0.2, LNG_TOL = 0.2;
  let best = null, bestPx = Infinity;
  const cursorPt = MAP.latLngToContainerPoint(latlng);
  for(const cell of _predictGrid){
    if(Math.abs(cell.lat - latlng.lat) > LAT_TOL) continue;
    if(Math.abs(cell.lng - latlng.lng) > LNG_TOL) continue;
    const p = MAP.latLngToContainerPoint([cell.lat, cell.lng]);
    const dx = p.x - cursorPt.x, dy = p.y - cursorPt.y;
    const d = dx*dx + dy*dy;
    if(d < bestPx){ bestPx = d; best = cell; }
  }
  // Accept only if within ~18px (matches the old circleMarker radius of 14 + slack)
  return (best && bestPx <= 18*18) ? best : null;
}

function bindPredictInteractionHandlers(){
  if(!_predictTooltip){
    _predictTooltip = L.tooltip({sticky:true, direction:"top",
                                 className:"predict-tooltip", opacity:1});
  }
  // Suppress hover hit-testing during an active zoom so the gesture stays smooth.
  MAP.on('zoomstart', () => { _predictZooming = true; });
  MAP.on('zoomend',   () => { _predictZooming = false; });
  // Hover → nearest-cell tooltip. Throttled to ~1 per frame so fast mouse moves
  // (and trackpad gestures) can't flood the hit-test, and skipped entirely while
  // zooming. The hit-test itself is cheap (degree-filter then a few projections).
  let _mmScheduled = false, _lastLL = null;
  MAP.on('mousemove', (e) => {
    if(typeof rulerActive !== "undefined" && rulerActive){
      MAP.closeTooltip(_predictTooltip);
      return;
    }
    if(!layerVis.predict || !_predictGrid || _predictZooming){ return; }
    _lastLL = e.latlng;
    if(_mmScheduled) return;
    _mmScheduled = true;
    requestAnimationFrame(() => {
      _mmScheduled = false;
      if(!layerVis.predict || !_predictGrid || _predictZooming) return;
      const cell = nearestPredictCell(_lastLL);
      if(!cell){ MAP.closeTooltip(_predictTooltip); return; }
      const sp = _predictSpecies;
      const top = cell.factors[0];
      const color = biteVerdict(Math.round(cell.score * 100)).color;
      _predictTooltip
        .setLatLng([cell.lat, cell.lng])
        .setContent(
          `<div style="font-family:'Segoe UI',Arial,sans-serif;min-width:200px">
            <div style="font-weight:bold;color:${color};font-size:15px;margin-bottom:5px">
              ${sp.name} · ${Math.round(cell.score*100)}%
            </div>
            <div style="font-size:12.5px;color:#cfe5ff;line-height:1.6">
              ${cell.lat.toFixed(2)}°N ${Math.abs(cell.lng).toFixed(2)}°W<br>
              SST ${cell.sst != null ? cell.sst.toFixed(1) : "—"}°F · ${Math.round(cell.depth * 3.28084)} ft<br>
              <b>Top factor:</b> ${top.name}<br>
              <b>Confidence:</b> ${cell.confidence}%
            </div>
          </div>`)
        .addTo(MAP);
    });
  });
  // Click → open the explainer for the nearest cell. Suppressed while the
  // drop-waypoint tool is armed so a tap marks a spot instead of opening the
  // hotspot explainer.
  MAP.on('click', (e) => {
    if(typeof rulerActive !== "undefined" && rulerActive){ return; }
    if(typeof wpDropMode !== "undefined" && wpDropMode){ return; }
    if(!layerVis.predict || !_predictGrid){ return; }
    const cell = nearestPredictCell(e.latlng);
    if(cell) showPredictionExplainer(cell, _predictSpecies);
  });
}

// ── Live wind readout ────────────────────────────────────────────────────────
// While the animated wind layer is on, follow the cursor with a compact pill
// showing wind speed, GUSTS, and compass direction at that point — the same
// point-readout the big weather apps (Windy/PredictWind) lead with. Gust data is
// already in WIND_GRID; this just surfaces it where a captain reads it.
let _windReadoutBound = false;
let _windReadoutEl = null;
function bindWindReadout(){
  if(_windReadoutBound || !MAP) return;
  _windReadoutBound = true;
  const hide = () => { if(_windReadoutEl) _windReadoutEl.style.display = "none"; };
  let _wmScheduled = false, _wmEv = null;
  MAP.on('mousemove', (e) => {
    if(!layerVis.wind || !WIND_GRID){ hide(); return; }
    _wmEv = e;
    if(_wmScheduled) return;
    _wmScheduled = true;
    requestAnimationFrame(() => {
      _wmScheduled = false;
      if(!layerVis.wind || !WIND_GRID || !_wmEv){ hide(); return; }
      const wind = getWindField(_wmEv.latlng.lat, _wmEv.latlng.lng);
      if(!wind || wind.speedKts == null){ hide(); return; }
      if(!_windReadoutEl){
        _windReadoutEl = document.createElement("div");
        _windReadoutEl.id = "wind-readout";
        _windReadoutEl.style.cssText = "position:absolute;z-index:520;pointer-events:none;background:rgba(8,20,38,.92);border:1px solid rgba(125,211,252,.4);border-radius:9px;padding:5px 9px;box-shadow:0 3px 12px rgba(0,0,0,.5);font:600 12px 'Segoe UI',Arial,sans-serif;color:#e8f4ff;white-space:nowrap;transform:translate(-50%,calc(-100% - 14px))";
        MAP.getContainer().appendChild(_windReadoutEl);
      }
      const from = (typeof bwiCompass16==="function") ? bwiCompass16(wind.dirDeg) : Math.round(wind.dirDeg)+"°";
      const spd = Math.round(wind.speedKts);
      const gust = wind.gustKts != null ? Math.round(wind.gustKts) : null;
      const gustBadge = (gust != null && gust > spd)
        ? `<span style="color:#fca5a5"> · G${gust}</span>` : "";
      const arrow = `<span style="display:inline-block;transform:rotate(${wind.dirDeg}deg);color:#7dd3fc;font-size:13px;line-height:1">↓</span>`;
      _windReadoutEl.innerHTML = `${arrow} <b>${from}</b> ${spd}<span style="opacity:.65;font-weight:400">kt</span>${gustBadge}`;
      const pt = _wmEv.containerPoint;
      _windReadoutEl.style.left = pt.x + "px";
      _windReadoutEl.style.top = pt.y + "px";
      _windReadoutEl.style.display = "block";
    });
  });
  MAP.getContainer().addEventListener("mouseleave", hide);
  MAP.on('movestart zoomstart', hide);
}
function hideWindReadout(){ if(_windReadoutEl) _windReadoutEl.style.display = "none"; }

// When the user explicitly turns the heat map OFF, auto-enable (ensurePredictLayerOn)
// must not silently turn it back on. This is the "uncheck = hard stop" contract.
let _predictUserOff = false;

// On-map loading indicator shown while the heat map computes (it fetches real
// bathymetry + ocean data, which can take a few seconds).
let _predictLoadingEl = null;
function showPredictLoading(){
  if(!MAP) return;
  if(!_predictLoadingEl){
    _predictLoadingEl = document.createElement("div");
    _predictLoadingEl.id = "predict-loading";
    _predictLoadingEl.style.cssText = "position:absolute;top:64px;left:50%;transform:translateX(-50%);z-index:600;background:rgba(10,22,40,.92);border:1px solid rgba(125,211,252,.35);color:#e8f4ff;font:600 12px 'Segoe UI',Arial,sans-serif;padding:8px 14px;border-radius:20px;box-shadow:0 4px 14px rgba(0,0,0,.5);display:flex;align-items:center;gap:8px;pointer-events:none";
    _predictLoadingEl.innerHTML = '<span style="width:14px;height:14px;border:2px solid rgba(125,211,252,.3);border-top-color:#7dd3fc;border-radius:50%;display:inline-block;animation:bwspin .8s linear infinite"></span><span>Loading bathymetry &amp; ocean data…</span><style>@keyframes bwspin{to{transform:rotate(360deg)}}</style>';
    MAP.getContainer().appendChild(_predictLoadingEl);
  }
  _predictLoadingEl.style.display = "flex";
}
function hidePredictLoading(){ if(_predictLoadingEl) _predictLoadingEl.style.display = "none"; }

// ── DRAW PREDICTION LAYER ────────────────────────────────────────────────────
// Renders a TRUE canvas-based heat map. No third-party plugins, no circles.
// Each cell is a radial gaussian; overlapping gaussians blend smoothly via
// 'lighter' composite mode + a per-pixel color ramp.
function drawPrediction(){
  predictLayers.forEach(l => MAP.removeLayer(l));
  predictLayers = [];
  // Bump the generation token so any in-flight async compute is abandoned and
  // won't paint stale results after we've torn down (prevents flicker/races).
  _predictGen++;
  if(!layerVis.predict){ hidePredictLoading(); invalidatePredictCache(); if(_heatLayer){ MAP.removeLayer(_heatLayer); _heatLayer=null; } _predictGrid = null; if(_predictTooltip) MAP.closeTooltip(_predictTooltip); updateForecastSliderVisibility(); return; }
  // No species selected → silently render nothing (empty-state overlay handles UX)
  if(!activeSpId || activeSpId === "all"){ hidePredictLoading(); invalidatePredictCache(); if(_heatLayer){ MAP.removeLayer(_heatLayer); _heatLayer=null; } _predictGrid = null; if(_predictTooltip) MAP.closeTooltip(_predictTooltip); updateForecastSliderVisibility(); return; }

  const species = SPECIES.find(s => s.id === activeSpId);
  _predictSpecies = species;
  if(!_predictHandlersBound){
    bindPredictInteractionHandlers();
    _predictHandlersBound = true;
  }
  // Slider becomes visible: prediction is rendering
  updateForecastSliderVisibility();

  // Reuse the cached grid when port/species/forecast/reports haven't changed.
  // Zoom and pan only repaint the heat mask — they must never re-rank hotspots.
  const cacheKey = predictResultCacheKey();
  if(_predictResultCache && _predictResultCache.key === cacheKey){
    hidePredictLoading();
    renderPrediction(
      _predictResultCache.hotspots, species, true,
      _predictResultCache.heatGrid, _predictResultCache.gridStep,
      { lat: _predictResultCache.gridOriginLat, lng: _predictResultCache.gridOriginLng },
      _predictResultCache.badges,
    );
    return;
  }

  showPredictLoading();
  const _runGen = _predictGen;

  // Compute the grid asynchronously, painting progressively as latitude bands
  // finish so the UI never freezes. onProgress repaints the partial field;
  // onDone does the final paint + top-3 badges. The generation token inside
  // computePredictionGridAsync cancels this run if the user switches species.
  // Compute the grid asynchronously in latitude bands so the UI never freezes,
  // then render ONCE when complete. (An earlier version repainted on every
  // progress frame, but each repaint tears down + rebuilds the heat canvas —
  // basemap snapshot + full per-pixel field render — so a dozen progress frames
  // meant a dozen full redraws and made zoom/select feel slower, not faster.
  // Chunked compute alone keeps the thread responsive; one render at the end is
  // far cheaper. The generation token cancels this run if species/port changes.)
  computePredictionGridAsync(
    activeSpId,
    null,   // no progressive repaint
    (full, gen) => {
      hidePredictLoading();
      // HARD STOP: ignore any result from a run the user has since cancelled
      // (heat map unchecked) or superseded (species/port changed).
      if(gen !== _predictGen || !layerVis.predict){ return; }
      const heatGrid = Array.isArray(full) ? full : (full && full.heatGrid) || [];
      const hotspots = Array.isArray(full) ? full : (full && full.hotspots) || [];
      const gridStep = (full && full.gridStep) || 0.25;
      const gridOrigin = full ? { lat: full.gridOriginLat, lng: full.gridOriginLng } : null;
      if(!heatGrid.length){ _predictGrid = null; updateForecastSliderVisibility(); return; }
      const badges = pickTopHotspotBadges(hotspots, 3);
      _predictResultCache = {
        key: predictResultCacheKey(),
        heatGrid, hotspots, badges,
        gridStep, gridOriginLat: gridOrigin && gridOrigin.lat, gridOriginLng: gridOrigin && gridOrigin.lng,
      };
      predictionData = hotspots;
      renderPrediction(hotspots, species, true, heatGrid, gridStep, gridOrigin, badges);
      // Do not re-score an open explainer here — async grid completion was
      // shifting the displayed bite score when the tab refocused or ocean
      // layers refreshed. setForecastHour() handles intentional time changes.
    }
  );
}

// Render the heat field for a grid + the top-3 badges. Reuses a single heat
// layer instance across calls (via setPoints) so re-rendering doesn't churn
// Leaflet panes. `final` controls whether the badges are drawn.
let _heatLayer = null;
function renderPrediction(grid, species, final, heatGridOverride, gridStep, gridOrigin, badgesOverride){
  const hotspots = grid || [];
  const heatGrid = heatGridOverride || hotspots;
  const step = gridStep || 0.25;
  const origin = gridOrigin || null;
  if(!heatGrid || heatGrid.length === 0) return;
  // Remove only the badge markers (not the heat layer — we reuse it).
  predictLayers.forEach(l => { if(l !== _heatLayer) MAP.removeLayer(l); });
  predictLayers = [];

  // Stash only actionable hotspots for marker-free hit testing.
  _predictGrid = hotspots;
  _predictSpecies = species;

  // ── Canvas heat layer (continuous gradient) — created once, then updated ──
  const heatPoints = heatGrid.map(cell => ({ lat: cell.lat, lng: cell.lng, intensity: heatDisplayIntensity(cell.score) }));
  if(_heatLayer && MAP.hasLayer(_heatLayer)){
    _heatLayer._opts.speciesId = activeSpId;  // mask follows the active species
    _heatLayer._opts.gridStep = step;          // keep interpolation grid matched to data grid
    _heatLayer._opts.gridOrigin = origin;
    _heatLayer.setPoints(heatPoints);          // cheap data swap + one redraw
  } else {
    _heatLayer = heatCanvasLayer(heatPoints, {radiusPx: 55, minOpacity: 0.68, speciesId: activeSpId, gridStep: step, gridOrigin: origin});
    _heatLayer.addTo(MAP);
  }
  predictLayers.push(_heatLayer);

  if(!final) return;

  // ── Top 3 hotspot badges (final paint only) ──
  // Use the precomputed badge list when provided (cached grid) so zoom/pan
  // never re-ranks the pins. Otherwise pick once from the scored hotspots.
  const chosen = Array.isArray(badgesOverride) ? badgesOverride : pickTopHotspotBadges(hotspots, 3);
  chosen.forEach((cell, i) => {
    const badge = L.marker([cell.lat, cell.lng], {
      icon: L.divIcon({
        className: "predict-badge",
        html: `<div style="
          background:linear-gradient(135deg,#dc2626,#991b1b);color:white;
          width:30px;height:30px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:14px;font-weight:bold;
          border:2.5px solid white;box-shadow:0 4px 14px rgba(220,38,38,.7);
          font-family:'Segoe UI',Arial,sans-serif;
        ">${i+1}</div>`,
        iconSize:[30,30], iconAnchor:[15,15],
      }),
      zIndexOffset: 500,
    });
    badge.on('click', () => {
      if(typeof rulerActive !== "undefined" && rulerActive) return;
      showPredictionExplainer(cell, species);
    });
    badge.addTo(MAP);
    predictLayers.push(badge);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PREDICTION EXPLAINER POPUP
// Now the SOLE detail panel for the app. Opens when the user taps a heat
// cell or top-3 badge. Shows score + factor breakdown, plus three action
// buttons at the bottom that swap the popup contents to weather, AI brief,
// or fishing reports for that location (with a back button to return).
// ════════════════════════════════════════════════════════════════════════════
let _explainerState = null;  // {cell, species} of currently shown hotspot
const EXPLAINER_STATE_KEY = "bwi_explainer_state_v1";

function persistExplainerState(subPanel){
  if(typeof sessionStorage === "undefined" || !_explainerState) return;
  try {
    sessionStorage.setItem(EXPLAINER_STATE_KEY, JSON.stringify({
      lat: _explainerState.cell.lat,
      lng: _explainerState.cell.lng,
      speciesId: _explainerState.species.id,
      subPanel: subPanel || null,
      briefRunZone: briefRunZone || null,
    }));
  } catch(e){}
}

function clearExplainerState(){
  try { sessionStorage.removeItem(EXPLAINER_STATE_KEY); } catch(e){}
}

function restoreExplainerState(){
  if(typeof sessionStorage === "undefined" || !MAP) return;
  try {
    const raw = sessionStorage.getItem(EXPLAINER_STATE_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    const sp = (typeof SPECIES !== "undefined") ? SPECIES.find(x => x.id === s.speciesId) : null;
    if(!sp) return;
    let cell = { lat: s.lat, lng: s.lng };
    if(typeof scoreCell === "function"){
      const scored = scoreCell(s.lat, s.lng, sp.id);
      if(scored) cell = Object.assign({}, cell, scored, { lat: s.lat, lng: s.lng });
    }
    if(s.briefRunZone) briefRunZone = s.briefRunZone;
    showPredictionExplainer(cell, sp);
    if(s.subPanel === "brief" && typeof openSubPanel === "function") openSubPanel("brief");
    else if(s.subPanel === "wx" && typeof openSubPanel === "function") openSubPanel("wx");
    else if(s.subPanel === "reports" && typeof openSubPanel === "function") openSubPanel("reports");
  } catch(e){ clearExplainerState(); }
}

function showPredictionExplainer(cell, species){
  if(typeof rulerActive !== "undefined" && rulerActive) return;
  // Close existing
  closeExplainer();

  // Default to a single-spot brief; the banner run-plan opener re-arms this
  // AFTER calling here (a normal map tap must never inherit a stale run plan).
  _briefRunPlanSpots = null;

  _explainerState = {cell, species};

  const backdrop = document.createElement("div");
  backdrop.id = "predict-explainer-backdrop";
  document.body.appendChild(backdrop);
  document.body.classList.add("explainer-open");

  const div = document.createElement("div");
  div.id = "predict-explainer";
  const panelTop = (typeof viewportPanelTopPx === "function") ? viewportPanelTopPx(8) : 128;
  const panelBottom = 14;
  div.style.top = `${panelTop}px`;
  div.style.bottom = `${panelBottom}px`;
  div.style.maxHeight = `calc(100dvh - ${panelTop + panelBottom}px)`;
  document.body.appendChild(div);

  // Stop scroll events from bubbling to the map underneath
  const stopProp = e => e.stopPropagation();
  div.addEventListener("wheel",       stopProp, {passive: true});
  div.addEventListener("touchstart",  stopProp, {passive: true});
  div.addEventListener("touchmove",   stopProp, {passive: true});
  div.addEventListener("mousedown",   stopProp);
  div.addEventListener("dblclick",    stopProp);
  if(typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
  }

  renderExplainerMain();
  persistExplainerState();
  updateBriefFab();
}

function renderExplainerMain(){
  const div = document.getElementById("predict-explainer");
  if(!div || !_explainerState) return;
  const {cell, species} = _explainerState;
  const savedBriefCount = BW_PAID ? briefHistoryLoad().length : 0;

  const factorBars = cell.factors.map(f => {
    // Bar reflects this factor's OWN strength here (0–100%), so a "peak" season
    // or "MAJOR" solunar reads as a full bar. (It's not the weighted share of the
    // total — factors are already ordered by that, biggest driver first.)
    const q = (typeof f.quality === "number") ? f.quality : (f.score / 0.30);
    const w = Math.min(100, Math.max(0, Math.round(q * 100)));
    const wtPct = f.weight > 0 ? Math.round(f.weight * 100) : 0;
    return `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;margin-bottom:3px">
          <span style="color:#cfe5ff;font-weight:600;white-space:nowrap;flex-shrink:0">${f.name}<span style="color:#6b8bab;font-size:10px;font-weight:600;margin-left:5px">${wtPct}%</span></span>
          <span style="color:#9ec5e8;font-weight:600;text-align:right;white-space:nowrap">${f.raw}</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${w}%;background:linear-gradient(90deg,#65a30d,#f59e0b,#dc2626)"></div>
        </div>
      </div>
    `;
  }).join("");

  const verdict = biteVerdict(Math.round(cell.score * 100));
  let verdictText = verdict.text;
  let gateBanner = "";
  if(cell.outOfRange){
    gateBanner = `<div style="margin-bottom:10px;padding:8px 11px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);border-radius:8px;font-size:12px;color:#fecaca;line-height:1.5"><b>Outside known range</b> — this species isn't part of a fishery here. High confidence the bite is poor.</div>`;
    verdictText = "Don't burn fuel here — this species isn't established in these waters.";
  } else if(cell.seasonStrength != null && cell.seasonStrength < 0.2){
    gateBanner = `<div style="margin-bottom:10px;padding:8px 11px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);border-radius:8px;font-size:12px;color:#fecaca;line-height:1.5"><b>Off-season</b> — the fish simply aren't around this month.</div>`;
    verdictText = "Off-season here — even good-looking water won't hold this species right now.";
  } else if(cell.inSeason === false || (cell.seasonStrength != null && cell.seasonStrength < 0.33)){
    gateBanner = `<div style="margin-bottom:10px;padding:8px 11px;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.30);border-radius:8px;font-size:12px;color:#fde68a;line-height:1.5"><b>Marginal season</b> — fish are mostly elsewhere on the coast this month.</div>`;
    verdictText = "Marginal season — better runs are likely up or down the coast.";
  }

  const scorePct = Math.round(cell.score * 100);
  const rawPct = cell.rawScore != null ? Math.round(cell.rawScore * 100) : null;
  const scoreFootnote = (rawPct != null && Math.abs(rawPct - scorePct) >= 4)
    ? `raw ${rawPct}% · stretched for map contrast`
    : "ranking unchanged · scores stretched for contrast";

  // Forecast time selector pills — picking a horizon recomputes the bite for that
  // moment (weather/tide/solunar/pressure shift; ocean fields hold at latest obs).
  const forecastPills = FORECAST_OPTIONS.map(opt => {
    const active = opt.hours === FORECAST_HOUR_OFFSET;
    return `<button onclick="setForecastHour(${opt.hours})" style="
      flex:1;
      background:${active ? "rgba(125,211,252,.22)" : "rgba(255,255,255,.04)"};
      border:1px solid ${active ? "rgba(125,211,252,.55)" : "rgba(255,255,255,.10)"};
      color:${active ? "#7dd3fc" : "#9ec5e8"};
      padding:5px 4px;border-radius:6px;
      font-size:10px;font-weight:${active ? "700" : "500"};
      cursor:pointer;font-family:inherit;
      transition:background .15s,border-color .15s;
    ">${opt.short}</button>`;
  }).join("");

  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(107,191,234,.15)">
      <div style="font-size:24px">${verdict.emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:bold;color:${verdict.color}">${verdict.label}</div>
        <div style="font-size:12px;color:#9ec5e8">Conditions for ${species.name}</div>
      </div>
      <button onclick="closeExplainer()" aria-label="Close" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#f0f6ff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:22px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0">×</button>
    </div>

    <div style="margin-bottom:10px;padding:8px 10px;background:rgba(41,121,181,.07);border:1px solid rgba(41,121,181,.20);border-radius:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px">
        <div style="font-size:9px;color:#6bbfea;letter-spacing:.1em;font-weight:700;text-transform:uppercase">Forecast Time</div>
        <div style="font-size:10px;color:#cfe5ff;font-weight:600">${forecastTimeDisplay()}</div>
      </div>
      <div style="display:flex;gap:4px">${forecastPills}</div>
      ${FORECAST_HOUR_OFFSET > 0 ? `<div style="margin-top:6px;font-size:10px;color:#9ec5e8;line-height:1.45">${forecastOceanFieldsDisclaimer()}</div>` : ""}
    </div>

    ${gateBanner}

    <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:10px">
      <div style="flex-shrink:0">
        <div style="font-size:32px;font-weight:bold;color:${verdict.color};line-height:1">${scorePct}<span style="font-size:14px;font-weight:normal">%</span></div>
        <div style="font-size:9px;color:#9ec5e8;letter-spacing:.08em;text-transform:uppercase;margin-top:3px;font-weight:700">Bite Score</div>
        <div style="font-size:9.5px;color:#7a9ec0;margin-top:2px;font-style:italic">${scoreFootnote}</div>
      </div>
      <div style="flex-shrink:0;padding-left:14px;border-left:1px solid rgba(107,191,234,.15)">
        <div style="font-size:22px;font-weight:bold;color:#cfe5ff;line-height:1">${cell.confidence}<span style="font-size:12px;font-weight:normal">%</span></div>
        <div style="font-size:9px;color:#9ec5e8;letter-spacing:.08em;text-transform:uppercase;margin-top:3px;font-weight:700">Confidence</div>
        <div style="font-size:9.5px;color:#7a9ec0;margin-top:2px;font-style:italic">how sure</div>
      </div>
      <div style="flex:1;font-size:11.5px;color:#9ec5e8;line-height:1.5;text-align:right;padding-top:2px">
        ${cell.lat.toFixed(3)}°N ${Math.abs(cell.lng).toFixed(3)}°W
        ${cell.distNm != null ? `<br><span style="color:#7dd3fc">⛵ ${cell.distNm}nm from ${activePort ? activePort.split(",")[0] : "port"}</span>` : ""}
      </div>
    </div>

    ${(cell.freshnessAnnotations && cell.freshnessAnnotations.length) ? `<div style="margin:-2px 0 11px;padding:8px 11px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px">
      <div style="font-size:9px;color:#6bbfea;letter-spacing:.09em;font-weight:700;text-transform:uppercase;margin-bottom:5px">What's affecting confidence</div>
      ${(() => {
        // Two factors (Water temp + Thermal break) both derive from SST, so the
        // freshness model emits one annotation each. Collapse to one line per
        // variable so SST isn't listed twice.
        const seen = new Set();
        return cell.freshnessAnnotations.filter(a => {
          const v = (a && a.variable) ? a.variable : (a && a.message ? a.message : a);
          if(seen.has(v)) return false;
          seen.add(v); return true;
        }).map(a => `<div style="font-size:11px;color:#9ec5e8;line-height:1.45;margin-bottom:3px">• ${a.message || a}</div>`).join('');
      })()}
    </div>` : ''}

    <div style="font-size:12.5px;color:#cfe5ff;background:rgba(220,38,38,.06);border-left:2px solid ${verdict.color};padding:8px 11px;margin-bottom:11px;line-height:1.5;border-radius:4px">${verdictText}</div>

    <div style="font-size:11px;color:#6bbfea;letter-spacing:.1em;font-weight:700;text-transform:uppercase;margin-bottom:8px">Contributing Factors</div>
    ${factorBars}

    <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(107,191,234,.12)">
      <div style="font-size:11px;color:#6bbfea;letter-spacing:.1em;font-weight:700;text-transform:uppercase;margin-bottom:8px">Get more detail</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button onclick="showForecast(${cell.lat}, ${cell.lng}, 'Weather Forecast')" class="ex-action-btn" style="background:rgba(41,121,181,.15);border:1px solid rgba(41,121,181,.4);color:#7dd3fc">
          <span style="font-size:16px">🌊</span>
          <span style="flex:1;text-align:left">Weather Forecast</span>
          <span style="color:#7dd3fc;opacity:.6">→</span>
        </button>
        <button onclick="openSubPanel('brief')" class="ex-action-btn" style="background:rgba(14,165,165,.14);border:1px solid rgba(45,212,191,.45);color:#5eead4">
          <span style="font-size:16px">✦</span>
          <span style="flex:1;text-align:left">AI Captain's Brief</span>
          <span style="color:#5eead4;opacity:.6">→</span>
        </button>
        ${savedBriefCount ? `<button onclick="openRecentBriefsModal()" class="ex-action-btn" style="background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.35);color:#7dd3fc">
          <span style="font-size:16px">📋</span>
          <span style="flex:1;text-align:left">Recall recent brief${savedBriefCount > 1 ? "s" : ""} (${savedBriefCount})</span>
          <span style="color:#7dd3fc;opacity:.6">→</span>
        </button>` : ""}
        <button onclick="openSubPanel('reports')" class="ex-action-btn" style="background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);color:#34d399">
          <span style="font-size:16px">📋</span>
          <span style="flex:1;text-align:left">Reports near here</span>
          <span style="color:#34d399;opacity:.6">→</span>
        </button>
      </div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.07);font-size:9px;color:#6b8bab;line-height:1.5;text-align:center">
        Environmental data: sea-surface temperature &amp; chlorophyll courtesy NASA GIBS (GHRSST MUR, VIIRS); marine &amp; weather data from NOAA/NDBC; ocean currents from NOAA RTOFS. Predictions are estimates for planning only.
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════════════
// SET FORECAST HOUR
// User picked a new forecast horizon — regenerate predictions and update
// every panel that's showing time-dependent data.
// ════════════════════════════════════════════════════════════════════════════
function setForecastHour(hours){
  if(typeof hours !== "number") return;
  const target = normalizeForecastHour(hours);
  if(FORECAST_HOUR_OFFSET === target) return;
  FORECAST_HOUR_OFFSET = target;
  if(typeof BW_OCEAN !== "undefined" && typeof BW_OCEAN.clearPredictInputsCache === "function"){
    BW_OCEAN.clearPredictInputsCache();
  }
  const slider = document.getElementById("forecast-slider-input");
  if(slider && String(slider.value) !== String(target)) slider.value = target;
  updateForecastSliderDisplay();
  if(typeof updateBiteBanner === "function") updateBiteBanner();
  if(typeof refreshOceanForecastLayers === "function") refreshOceanForecastLayers();
  if(typeof drawPrediction === "function" && activeSpId && activePort){
    drawPrediction();
    flashForecastSlider();
  }
  // If the explainer is open, re-score the current cell at the new time
  // and re-render with the updated values.
  if(_explainerState && _explainerState.cell && _explainerState.species){
    const c = _explainerState.cell;
    const sp = _explainerState.species;
    if(typeof scoreCell === "function"){
      const fresh = scoreCell(c.lat, c.lng, sp.id);
      if(fresh){
        // Keep the original lat/lng + distance, update the score/factors/conditions
        _explainerState.cell = Object.assign({}, c, fresh, {
          lat: c.lat, lng: c.lng, distNm: c.distNm
        });
      }
    }
    renderExplainerMain();
  }
}

// Briefly highlight the slider's time display so the user gets visual
// confirmation that the heat map updated — even if the visible change on
// the map itself is subtle. Pulses for ~700ms then returns to normal.
function flashForecastSlider(){
  const label = document.getElementById("forecast-slider-display");
  if(!label) return;
  label.style.transition = "color .15s, text-shadow .15s";
  label.style.color = "#fbbf24";
  label.style.textShadow = "0 0 8px rgba(251,191,36,.7)";
  clearTimeout(flashForecastSlider._t);
  flashForecastSlider._t = setTimeout(() => {
    label.style.color = "";
    label.style.textShadow = "";
  }, 700);
}

// ════════════════════════════════════════════════════════════════════════════
// FORECAST SLIDER UX
//
// The slider lives at the bottom of the map and lets the user scrub through
// time without opening the explainer. Performance note: regenerating the
// prediction grid covers thousands of cells, so we DON'T regen on every drag
// tick. Two-phase handling:
//   - oninput  (fires on every tick)    → cheap: just update the displayed time
//   - onchange (fires on release/snap)  → expensive: regen predictions
// ════════════════════════════════════════════════════════════════════════════
function onForecastSliderInput(v){
  // Preview label only — do NOT change FORECAST_HOUR_OFFSET until release.
  // Mutating the offset during drag was re-scoring against stale ocean inputs.
  const hours = normalizeForecastHour(parseInt(v, 10) || 0);
  const label = document.getElementById("forecast-slider-display");
  if(label){
    label.textContent = hours === 0 ? "Now" : `+${hours}h · ${forecastTimeDisplay(hours)}`;
  }
}

function onForecastSliderChange(v){
  setForecastHour(normalizeForecastHour(parseInt(v, 10) || 0));
}

function updateForecastSliderDisplay(){
  const label = document.getElementById("forecast-slider-display");
  if(label){
    label.textContent = FORECAST_HOUR_OFFSET === 0
      ? "Now"
      : `+${FORECAST_HOUR_OFFSET}h · ${forecastTimeDisplay()}`;
  }
  const exactMarks = [0, 12, 24];
  const slider = document.getElementById("forecast-slider");
  if(slider){
    slider.querySelectorAll(".fc-mark").forEach((btn, idx) => {
      const active = exactMarks[idx] === FORECAST_HOUR_OFFSET;
      btn.classList.toggle("active", active);
    });
  }
}

function updateForecastSliderVisibility(){
  const el = document.getElementById("forecast-slider");
  if(!el) return;
  // Bite-score forecast (+12/+24 h) shifts tide/solunar/pressure/wind in the
  // score. SST/chlorophyll map overlays stay on the latest observation until
  // OCEAN_OVERLAY_FORECAST_ENABLED is true. Show when bite map or ocean layers on.
  const shouldShow = oceanForecastLayersActive();
  el.style.display = shouldShow ? "block" : "none";
  if(shouldShow) updateForecastSliderDisplay();
  restackBottomControls();
}

function closeExplainer(){
  const el = document.getElementById("predict-explainer");
  if(el) el.remove();
  const bd = document.getElementById("predict-explainer-backdrop");
  if(bd) bd.remove();
  document.body.classList.remove("explainer-open");
  _explainerState = null;
  clearExplainerState();
  if(wxAutoRefreshTimer){ clearInterval(wxAutoRefreshTimer); wxAutoRefreshTimer = null; }
  updateBriefFab();
}

// Open a sub-panel inside the explainer (replaces main content with weather,
// AI brief, or reports for the hotspot location)
function openSubPanel(kind){
  const div = document.getElementById("predict-explainer");
  if(!div || !_explainerState) return;
  const {cell, species} = _explainerState;

  const titles = {
    wx:      {label:"Weather",            emoji:"🌊", color:"#7dd3fc"},
    brief:   {label:"AI Captain's Brief", emoji:"✦", color:"#5eead4"},
    reports: {label:"Reports nearby",     emoji:"📋", color:"#34d399"},
  };
  const t = titles[kind];

  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(107,191,234,.15)">
      <button onclick="renderExplainerMain()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#cfe5ff;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600">← Back</button>
      <div style="flex:1;font-size:13px;font-weight:bold;color:${t.color}">${t.emoji} ${t.label}</div>
      <button onclick="closeExplainer()" aria-label="Close" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#f0f6ff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:22px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center">×</button>
    </div>
    <div id="explainer-subpanel-content" data-kind="${kind}" style="font-size:11px;color:#cfe5ff">
      <div style="padding:20px 10px;text-align:center;color:#9ec5e8;font-size:11px">
        <div style="font-size:22px;margin-bottom:6px;animation:spin 1.4s linear infinite;display:inline-block">⏳</div>
        <div>Loading ${t.label.toLowerCase()}…</div>
      </div>
    </div>
    <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
  `;

  // Dispatch to the appropriate renderer (these all write into #explainer-subpanel-content via pbody())
  if(kind === "wx")       renderWX(cell.lat, cell.lng);
  else if(kind === "brief") {
    pinLL = {lat: cell.lat, lng: cell.lng};
    if(typeof classifyWaterType === "function"){
      const wt = classifyWaterType(cell.lat, cell.lng);
      briefRunZone = (wt === "bay") ? "inshore" : wt;
    }
    renderBrief();
  }
  else if(kind === "reports"){
    pinLL = {lat: cell.lat, lng: cell.lng};
    renderReports();
  }
  persistExplainerState(kind);
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER CONTROLS
// ════════════════════════════════════════════════════════════════════════════
function toggleLayer(key){
  // Premium gate: heat map, SST, chlorophyll, wind and radar require a trial or
  // subscription. Turning one ON while not premium opens the upgrade modal.
  if(BW_PREMIUM_LAYERS.includes(key) && !layerVis[key] && !BW_PREMIUM){
    const c=document.getElementById("chk-"+key); if(c)c.checked=false;
    if(typeof openPricing === "function") openPricing();
    return;
  }
  layerVis[key]=!layerVis[key];
  const chk=document.getElementById("chk-"+key);
  if(chk)chk.checked=layerVis[key];
  if(key==="spots")drawCanyons();  // unified structure layer (canyons+wrecks+reefs+lumps)
  else if(key==="predict"){ _predictUserOff = !layerVis.predict; drawPrediction(); updateOceanLegend();
    if(!layerVis.predict && FORECAST_HOUR_OFFSET > 0 && !layerVis.sst && !layerVis.currents) setForecastHour(0);
    else updateForecastSliderVisibility();
  }
  else if(key==="ports")drawPortMarkers();
  else if(key==="loran")drawLoranLines();
  else if(key==="catches")drawCatchPins();
  else if(key==="closures")drawClosures();
  else if(key==="platforms")drawPlatforms();
  else if(key==="wind")drawWind();
  else if(key==="currents"){
    drawCurrents();
    updateForecastSliderVisibility();
    if(!layerVis.currents && FORECAST_HOUR_OFFSET > 0 && !layerVis.sst && !layerVis.predict) setForecastHour(0);
    else if(layerVis.currents && FORECAST_HOUR_OFFSET > 0 && typeof refreshOceanForecastLayers === "function") refreshOceanForecastLayers();
  }
  else if(key==="altimetry"){
    // Observed-only overlay — does not participate in the ocean-model forecast slider.
    drawAltimetry();
  }
  else if(key==="sst"){
    if(layerVis.sst){
      if(typeof syncSstOverlayMode === "function") syncSstOverlayMode();
      else { sstLayer.setOpacity(oceanOpacity.sst); sstLayer.addTo(MAP); }
    } else {
      if(MAP.hasLayer(sstLayer)) MAP.removeLayer(sstLayer);
      if(sstForecastLayer && MAP.hasLayer(sstForecastLayer)) MAP.removeLayer(sstForecastLayer);
    }
    updateOceanLegend();
    updateSatDateControlVisibility();
    updateOpacityControl();
    updateForecastSliderVisibility();
    if(!layerVis.sst && FORECAST_HOUR_OFFSET > 0 && !layerVis.currents && !layerVis.predict) setForecastHour(0);
    else if(layerVis.sst && FORECAST_HOUR_OFFSET > 0 && typeof refreshOceanForecastLayers === "function") refreshOceanForecastLayers();
  }
  else if(key==="chlor"){
    if(layerVis.chlor){
      if(typeof syncChlorOverlayMode === "function") syncChlorOverlayMode();
      else { chlorLayer.setOpacity(oceanOpacity.chlor); chlorLayer.addTo(MAP); }
    } else {
      if(MAP.hasLayer(chlorLayer)) MAP.removeLayer(chlorLayer);
      if(chlorMapLayer && MAP.hasLayer(chlorMapLayer)) MAP.removeLayer(chlorMapLayer);
      CHLOR_MAP_GRID = null;
    }
    updateOceanLegend();
    updateSatDateControlVisibility();
    updateOpacityControl();
  }
  else if(key==="radar"){
    if(layerVis.radar){
      radarLayer.addTo(MAP);
    } else {
      if(MAP.hasLayer(radarLayer)) MAP.removeLayer(radarLayer);
      stopRadarLoop();           // tidy up any running animation + its frames
    }
    updateOceanLegend();
    updateRadarLoopControlVisibility();
  }
  else if(key==="waypoints"){
    drawWaypoints();
    updateWaypointControlVisibility();
  }
  else if(key==="ramps"){
    drawRamps();
    if(layerVis.ramps && !activePort){
      showToast("Select a home port first to see boat ramps within range.", "info");
    }
  }
}

// Rebuild the SST + chlorophyll tile layers for the current satDayOffset.
// Called when the user steps the satellite date slider. We recreate the
// L.tileLayer (URL embeds the date) and hot-swap it for any currently-visible
// layer so the imagery updates in place. Forward dates are impossible (observed
// data), so satDayOffset only ever increases the days-back.
function rebuildSatelliteLayers(){
  if(oceanOverlayForecastHour() > 0 && layerVis.sst){
    if(typeof syncSstOverlayMode === "function") syncSstOverlayMode();
    updateSatDateDisplay();
    return;
  }
  // High-contrast canvas overlays ignore historical sat-day steps (freshest grid
  // only). When the user steps back in time, drop canvas and crossfade GIBS.
  if(layerVis.sst && satDayOffset <= 0 && typeof syncSstOverlayMode === "function"){
    syncSstOverlayMode();
  } else if(layerVis.sst){
    if(sstForecastLayer && MAP.hasLayer(sstForecastLayer)) MAP.removeLayer(sstForecastLayer);
    crossfadeLayer("sst");
  }
  if(layerVis.chlor && typeof syncChlorOverlayMode === "function"){
    syncChlorOverlayMode();
    if(satDayOffset > 0) crossfadeLayer("chlor");
  } else if(layerVis.chlor){
    crossfadeLayer("chlor");
  }
  updateSatDateDisplay();
  updateOpacityControl();
  // Belt-and-suspenders: once the swap settles, make sure the live layers carry
  // the user's chosen opacity (covers any path that adds a layer without going
  // through the crossfade fade-in).
  setTimeout(applyOceanOpacity, 1300);
}

let _fadeTokens = { sst:0, chlor:0 };
function crossfadeLayer(which){
  const isSst = which === "sst";
  const oldLayer = isSst ? sstLayer : chlorLayer;
  const targetOpacity = isSst ? oceanOpacity.sst : oceanOpacity.chlor;
  const next = isSst ? window.buildSstLayer(satDayOffset) : window.buildChlorLayer(satDayOffset);
  const token = ++_fadeTokens[which];
  next.setOpacity(0);
  next.addTo(MAP);

  const finish = () => {
    if(token !== _fadeTokens[which]){ // a newer fade started — discard this one
      if(MAP.hasLayer(next)) MAP.removeLayer(next);
      return;
    }
    next.setOpacity(targetOpacity);
    if(oldLayer && MAP.hasLayer(oldLayer)) MAP.removeLayer(oldLayer);
    if(isSst) sstLayer = next; else chlorLayer = next;
  };
  // Fade in when tiles are ready; guard with a timeout in case some tiles error.
  let done = false;
  const go = () => { if(done) return; done = true; finish(); };
  next.once("load", go);
  setTimeout(go, 1200); // fallback: don't hang if a few tiles 404
}

// Days-back from UTC today for the imagery currently shown, using the resolved
// freshest base lag of whichever overlay is visible (SST preferred when both on).
function satCurrentDaysBack(){
  let base = SAT_FRESH_BACK.sst;
  if(typeof layerVis !== "undefined"){
    if(layerVis.sst)        base = SAT_FRESH_BACK.sst;
    else if(layerVis.chlor) base = SAT_FRESH_BACK.chlor;
  }
  return base + satDayOffset;
}
function satDateLabel(){
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - satCurrentDaysBack());
  return d.toLocaleDateString(undefined, {month:"short", day:"numeric"});
}
function updateSatDateDisplay(){
  const el = document.getElementById("sat-date-display");
  if(el){
    if(oceanOverlayForecastHour() > 0 && layerVis.sst){
      el.textContent = `Model +${oceanOverlayForecastHour()}h · ${forecastTimeDisplay()}`;
    } else {
      const back = satCurrentDaysBack();
      const age = back <= 0 ? "today" : back === 1 ? "1 day ago" : back + " days ago";
      el.textContent = `Observed ${satDateLabel()} · ${age}`;
    }
  }
  const inp = document.getElementById("sat-date-input");
  // Slider is left→right = OLDER→NEWER (intuitive: rightward = forward in time).
  // The input value is "days back", so the thumb position is the inverse.
  if(inp){
    const pos = SAT_MAX_DAYS_BACK - satDayOffset;
    if(+inp.value !== pos) inp.value = pos;
  }
  const older = document.getElementById("sat-day-older");
  const newer = document.getElementById("sat-day-newer");
  if(older) older.disabled = satDayOffset >= SAT_MAX_DAYS_BACK;
  if(newer) newer.disabled = satDayOffset <= 0;
}
function stepSatDayOlder(){ stopSatPlayback(); setSatDayOffset(satDayOffset + 1); }
function stepSatDayNewer(){ stopSatPlayback(); setSatDayOffset(satDayOffset - 1); }
// Slider handler: input position is left(old)→right(newest), so days-back is inverted.
function onSatSliderInput(sliderPos){
  setSatDayOffset(SAT_MAX_DAYS_BACK - (sliderPos|0));
}
function setSatDayOffset(days){
  if(oceanOverlayForecastHour() > 0 && layerVis.sst) return;
  const v = Math.max(0, Math.min(SAT_MAX_DAYS_BACK, days|0));
  if(v === satDayOffset){ updateSatDateDisplay(); return; }
  satDayOffset = v;
  rebuildSatelliteLayers();
}
// Show the satellite date control only when SST or chlorophyll is visible.
function updateSatDateControlVisibility(){
  const box = document.getElementById("sat-date-control");
  if(!box) return;
  const show = !!(layerVis.sst || layerVis.chlor);
  box.style.display = show ? "block" : "none";
  if(show){
    // Label the pill for whichever ocean overlay is active — SST and chlorophyll
    // share one control but each layer should read as its own (not "SST & chlorophyll").
    const titleEl = document.getElementById("sat-date-title");
    const hintEl = document.getElementById("sat-date-hint");
    const chlorOnly = layerVis.chlor && !layerVis.sst;
    const label = chlorOnly ? "Chlorophyll" : "SST";
    if(titleEl) titleEl.textContent = label;
    if(hintEl) hintEl.textContent = (oceanOverlayForecastHour() > 0 && layerVis.sst)
      ? "RTOFS model"
      : "Observed imagery only";
    const row = box.querySelector(".map-time-pill-row");
    const footer = box.querySelector(".map-time-pill-footer");
    const forecastLocked = oceanOverlayForecastHour() > 0 && layerVis.sst;
    if(row) row.style.opacity = forecastLocked ? "0.45" : "";
    if(row) row.style.pointerEvents = forecastLocked ? "none" : "";
    if(footer) footer.style.opacity = forecastLocked ? "0.45" : "";
    // Confirm/refresh the freshest published date when an overlay is turned on,
    // and show its real observed date/age right away.
    if(typeof ensureFreshestSatDates === "function") ensureFreshestSatDates();
    updateSatDateDisplay();
  }
  restackBottomControls();
}

// ── ALTIMETRY DATE CONTROL ───────────────────────────────────────────────────
// Daily SSH is observed backward-only. Step day-by-day (slider or ◀▶) to read
// eddy drift. No autoplay — captains inspect each pass at their own pace.
function altiDateLabel(){
  if(ALTIMETRY_GRID && ALTIMETRY_GRID.observedAtMs){
    return new Date(ALTIMETRY_GRID.observedAtMs).toLocaleDateString(undefined, { month:"short", day:"numeric" });
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - altiDayOffset);
  return d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
}
function updateAltiDateDisplay(){
  const el = document.getElementById("alti-date-display");
  if(el){
    // Altimetry overlay is observed-only (no model forecast); always show the
    // observed pass date/age regardless of the ocean-model forecast slider.
    if(ALTIMETRY_GRID && ALTIMETRY_GRID.observedAtMs){
      const obs = new Date(ALTIMETRY_GRID.observedAtMs);
      const ageDays = Math.max(0, Math.round((Date.now() - ALTIMETRY_GRID.observedAtMs) / 86400000));
      const ageTxt = ageDays <= 0 ? "today" : ageDays === 1 ? "1 day old" : `${ageDays} days old`;
      const passTxt = altiDayOffset <= 0 ? "latest NOAA pass" : altiDayOffset === 1 ? "1 day earlier" : `${altiDayOffset} days earlier`;
      el.textContent = `${obs.toLocaleDateString(undefined, { month:"short", day:"numeric" })} · ${ageTxt} · ${passTxt}`;
    } else {
      const age = altiDayOffset <= 0 ? "latest pass" : altiDayOffset === 1 ? "1 day earlier" : `${altiDayOffset} days earlier`;
      el.textContent = `${altiDateLabel()} · ${age}`;
    }
  }
  const inp = document.getElementById("alti-date-input");
  if(inp){
    const pos = ALTI_MAX_DAYS_BACK - altiDayOffset;
    if(+inp.value !== pos) inp.value = pos;
  }
  const older = document.getElementById("alti-day-older");
  const newer = document.getElementById("alti-day-newer");
  // Observed-only: the date control is never locked by the forecast slider.
  if(older) older.disabled = altiDayOffset >= ALTI_MAX_DAYS_BACK;
  if(newer) newer.disabled = altiDayOffset <= 0;
  const altiBox = document.getElementById("alti-date-control");
  if(altiBox){
    const row = altiBox.querySelector(".map-time-pill-row");
    const footer = altiBox.querySelector(".map-time-pill-footer");
    if(row) row.style.opacity = "";
    if(row) row.style.pointerEvents = "";
    if(footer) footer.style.opacity = "";
  }
}
function onAltiSliderInput(sliderPos){
  setAltiDayOffset(ALTI_MAX_DAYS_BACK - (sliderPos|0));
}
function setAltiDayOffset(days){
  const v = Math.max(0, Math.min(ALTI_MAX_DAYS_BACK, days|0));
  if(v === altiDayOffset){ updateAltiDateDisplay(); return; }
  altiDayOffset = v;
  updateAltiDateDisplay();
  if(altimetryLayer){
    altimetryLayer._requestPortBreaks(true);
    altimetryLayer._requestDisplayData();
  }
}
function stepAltiDayOlder(){ setAltiDayOffset(altiDayOffset + 1); }
function stepAltiDayNewer(){ setAltiDayOffset(altiDayOffset - 1); }
function updateAltiDateControlVisibility(){
  const box = document.getElementById("alti-date-control");
  if(!box) return;
  const show = !!layerVis.altimetry;
  box.style.display = show ? "block" : "none";
  if(show) updateAltiDateDisplay();
  restackBottomControls();
}

// ── BOTTOM CONTROL STACKING ──────────────────────────────────────────────────
// Several control bars share the bottom-center of the map (forecast slider,
// satellite-date control, radar loop, waypoint radius). Any combination can be
// visible at once, so instead of hardcoded `bottom` values that overlap (e.g.
// SST + Waypoints both at 80px), we measure whichever bars are currently shown
// and stack them upward from a common baseline with a fixed gap between each.
// Order is bottom→top: waypoint, satellite-date, radar, forecast — most-used
// nearest the thumb-friendly bottom edge. Called by every visibility updater.
// The distance scale bar is then lifted to sit just above the top of the stack
// so it never overlaps the bars or the Leaflet attribution line.
const BOTTOM_STACK_ORDER = ["sat-date-control", "alti-date-control", "radar-loop-control", "wind-forecast-slider"];
const BOTTOM_STACK_GAP  = 8;    // px gap between stacked bars
// Phase 2 mobile: when collapsed, the bottom control bars fold behind a single
// "Controls ▴" chip so an active overlay owns the screen. Only meaningful on
// phones and reset automatically whenever the stack is empty.
let _bwControlsCollapsed = false;

// Toggle the body.bw-layer-mode flag (phone + at least one ocean overlay on),
// which drives the chrome-dimming CSS (hide scale bar, fade port/canyon labels).
function updateMobileLayerMode(){
  const phone = (typeof isPhoneView === "function") ? isPhoneView() : (window.innerWidth <= 680);
  const overlay = !!(layerVis.sst || layerVis.chlor || layerVis.wind ||
                     layerVis.currents || layerVis.altimetry || layerVis.radar);
  document.body.classList.toggle("bw-layer-mode", phone && overlay);
}

function toggleMobileControls(){
  _bwControlsCollapsed = !_bwControlsCollapsed;
  restackBottomControls();
}

function restackBottomControls(){
  // On phones the Leaflet attribution/credit line sits along the very bottom,
  // so start the stack higher to clear it; on desktop a smaller inset is fine.
  const phone = (typeof isPhoneView === "function") ? isPhoneView() : (window.innerWidth <= 680);
  const base = phone ? 34 : 60;
  const toggle = document.getElementById("mobile-controls-toggle");

  // Bars currently shown = inline display set and not "none".
  const shown = BOTTOM_STACK_ORDER
    .map(id => document.getElementById(id))
    .filter(el => el && el.style.display && el.style.display !== "none");

  // The collapse affordance only applies on phones with a stack to collapse.
  const canCollapse = phone && shown.length > 0;
  if(!canCollapse) _bwControlsCollapsed = false;
  const collapsed = canCollapse && _bwControlsCollapsed;

  let offset = base;
  let topOfStack = base;   // running top edge of the highest visible bar

  // The toggle chip anchors the base of the stack on phones; bars ride above it.
  if(toggle){
    if(canCollapse){
      toggle.style.display = "block";
      toggle.style.bottom = base + "px";
      toggle.textContent = collapsed ? "Controls ▴" : "Controls ▾";
      const th = toggle.offsetHeight || 30;
      offset = base + th + BOTTOM_STACK_GAP;
      topOfStack = offset;
    } else {
      toggle.style.display = "none";
    }
  }

  for(const el of shown){
    if(collapsed){ el.classList.add("bw-collapsed-hide"); continue; }
    el.classList.remove("bw-collapsed-hide");
    el.style.bottom = offset + "px";
    // Measure rendered height so the next bar clears this one regardless of
    // its content height (radar bar is shorter than the slider bars, etc.).
    const h = el.offsetHeight || 56;
    offset += h + BOTTOM_STACK_GAP;
    topOfStack = offset;
  }

  // Belt-and-suspenders: if the stack would eat more than ~55% of the map on a
  // short screen, start collapsed so the chart stays usable.
  if(phone && !collapsed){
    const mapH = (document.getElementById("map") || {}).clientHeight || window.innerHeight;
    if(topOfStack > mapH * 0.55 && shown.length >= 3){
      _bwControlsCollapsed = true;
      return restackBottomControls();
    }
  }

  // Lift the scale bar to ride just above the tallest point of the stack (or to
  // a sensible resting spot if nothing is showing). In layer-mode the CSS hides
  // it entirely; this keeps the fallback position sane otherwise.
  const scale = document.getElementById("map-scale-bar");
  if(scale){
    const scaleBottom = (canCollapse || shown.length > 0) ? (topOfStack + 6) : 30;
    scale.style.bottom = scaleBottom + "px";
  }
  const legend = document.getElementById("ocean-legend");
  if(legend && legend.style.display !== "none" && typeof oceanLegendMaxHeightPx === "function"){
    legend.style.maxHeight = oceanLegendMaxHeightPx() + "px";
  }
  updateMobileLayerMode();
}

// ── OCEAN OPACITY SLIDER ─────────────────────────────────────────────────────
// One vertical slider, anchored in the right-side icon column, that dims the
// currently-active ocean overlay. The "active" layer is SST when it's on, else
// chlorophyll — so the single control always targets what the user is looking
// at. Dimming lets you read SST and then fade it to reveal structure/waypoints
// underneath without turning the layer off entirely.
function activeOceanLayerKey(){
  if(layerVis.sst)   return "sst";
  if(layerVis.chlor) return "chlor";
  return null;
}
// Apply the stored opacity to whichever ocean layers are live (called after a
// crossfade or date change so the new tile layer inherits the chosen opacity).
function applyOceanOpacity(){
  if(layerVis.sst){
    if(sstForecastLayer && MAP && MAP.hasLayer(sstForecastLayer) && typeof sstForecastLayer._draw === "function"){
      sstForecastLayer._draw();
    } else if(sstLayer) sstLayer.setOpacity(oceanOpacity.sst);
  }
  if(layerVis.chlor){
    if(chlorMapLayer && MAP && MAP.hasLayer(chlorMapLayer) && typeof chlorMapLayer._draw === "function"){
      chlorMapLayer._draw();
    } else if(chlorLayer) chlorLayer.setOpacity(oceanOpacity.chlor);
  }
}
// Slider handler. value is 0–100 (percent). Targets the active layer.
function onOceanOpacityInput(pct){
  const key = activeOceanLayerKey();
  if(!key) return;
  const v = Math.max(0, Math.min(1, (pct|0) / 100));
  oceanOpacity[key] = v;
  if(key === "sst"){
    if(sstForecastLayer && MAP && MAP.hasLayer(sstForecastLayer) && typeof sstForecastLayer._draw === "function") sstForecastLayer._draw();
    else if(sstLayer) sstLayer.setOpacity(v);
  }
  if(key === "chlor"){
    if(chlorMapLayer && MAP && MAP.hasLayer(chlorMapLayer) && typeof chlorMapLayer._draw === "function") chlorMapLayer._draw();
    else if(chlorLayer) chlorLayer.setOpacity(v);
  }
  try { localStorage.setItem("bwi_ocean_opacity", JSON.stringify(oceanOpacity)); } catch(e){}
  updateOpacityControl(true); // refresh readout/label without rebuilding position
}
// Show the slider only when an ocean layer is on; sync its thumb + labels to the
// active layer's current opacity. `valueOnly` skips the show/hide work for the
// fast path during dragging.
function updateOpacityControl(valueOnly){
  const box = document.getElementById("ocean-opacity-control");
  if(!box) return;
  const key = activeOceanLayerKey();
  if(!valueOnly){
    box.style.display = key ? "flex" : "none";
  }
  if(!key) return;
  const pct = Math.round(oceanOpacity[key] * 100);
  const input = document.getElementById("ocean-opacity-input");
  const readout = document.getElementById("ocean-opacity-readout");
  const label = document.getElementById("ocean-opacity-label");
  if(input && +input.value !== pct) input.value = pct;
  if(readout) readout.textContent = pct + "%";
  if(label) label.textContent = key === "sst" ? "SST" : "Chlor";
}

// ── TIME-LAPSE PLAYBACK ──────────────────────────────────────────────────────
// Starts ~2 weeks back and steps forward one day at a time toward the latest
// imagery, so the user can watch SST/chlor evolve and read the trend ("where is
// the warm water heading?"). Forward playback (old→new) matches intuition.
let _satPlayTimer = null;
function isSatPlaying(){ return _satPlayTimer !== null; }
function startSatPlayback(){
  stopSatPlayback();
  // Begin at the oldest end (max days back) and march toward Latest (0).
  setSatDayOffset(SAT_MAX_DAYS_BACK);
  _satPlayTimer = setInterval(() => {
    if(satDayOffset <= 0){            // reached the latest frame → loop back to start
      setSatDayOffset(SAT_MAX_DAYS_BACK);
    } else {
      setSatDayOffset(satDayOffset - 1); // step one day FORWARD in time
    }
  }, 900); // ~0.9s/day; the crossfade smooths the transition between frames
  updateSatPlayButton(); // set AFTER the timer exists so isSatPlaying() is true → shows "⏸ Pause"
}
function stopSatPlayback(){
  if(_satPlayTimer){ clearInterval(_satPlayTimer); _satPlayTimer = null; }
  updateSatPlayButton();
}
function toggleSatPlayback(){ isSatPlaying() ? stopSatPlayback() : startSatPlayback(); }
function updateSatPlayButton(){
  const btn = document.getElementById("sat-play-btn");
  if(btn) btn.textContent = isSatPlaying() ? "⏸ Pause" : "▶ Play 2-week trend";
}

// ════════════════════════════════════════════════════════════════════════════
// RADAR TIME-LOOP — animate the past few hours of NOAA radar to show storm motion
//
// nowCOAST's GeoServer radar WMS is time-enabled (ISO-8601 TIME param) and keeps
// roughly the PAST 4 HOURS of frames (NOAA's window, not ours to extend — so we
// label the control by the real span rather than promising 6h the data lacks).
// We build one WMS layer per frame at a fixed TIME, preload them all at opacity 0,
// then show one at a time on a timer — same flicker-free swap idea as the
// satellite player, but on a minutes timescale.
// ════════════════════════════════════════════════════════════════════════════
const RADAR_SPAN_MIN = 240;   // 4 hours of history (NOAA's available window)
const RADAR_STEP_MIN = 20;    // a frame every 20 min → 13 frames; smooth but not heavy
let _radarFrames = [];        // [{layer, label}] oldest → newest
let _radarFrameIdx = 0;
let _radarTimer = null;
let _radarBuilt = false;

function radarFrameTimes(){
  // Build ISO timestamps from oldest → newest, snapped to the step grid.
  const now = Date.now();
  const stepMs = RADAR_STEP_MIN * 60000;
  const snapped = Math.floor(now / stepMs) * stepMs; // align to step boundary
  const out = [];
  for(let m = RADAR_SPAN_MIN; m >= 0; m -= RADAR_STEP_MIN){
    out.push(new Date(snapped - m * 60000));
  }
  return out;
}
function buildRadarFrames(){
  clearRadarFrames();
  const times = radarFrameTimes();
  _radarFrames = times.map(d => {
    const iso = d.toISOString().split(".")[0] + "Z"; // 1ms precision not needed
    const layer = L.tileLayer.wms(
      "https://nowcoast.noaa.gov/geoserver/observations/weather_radar/ows",
      { layers:"weather_radar:conus_base_reflectivity_mosaic",
        format:"image/png", transparent:true, version:"1.3.0",
        maxZoom:18, minZoom:0, opacity:0, pane:"ocean-overlays",
        time: iso,
        attribution:'© NOAA/NWS nowCOAST · MRMS base reflectivity' });
    // Local HH:MM label for the scrubber/readout.
    const label = d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
    return { layer, label, iso };
  });
  _radarBuilt = true;
}
function clearRadarFrames(){
  _radarFrames.forEach(f => { if(MAP && MAP.hasLayer(f.layer)) MAP.removeLayer(f.layer); });
  _radarFrames = [];
  _radarBuilt = false;
}
function showRadarFrame(i){
  if(!_radarFrames.length) return;
  _radarFrameIdx = (i + _radarFrames.length) % _radarFrames.length;
  _radarFrames.forEach((f, idx) => {
    if(!MAP.hasLayer(f.layer)) f.layer.addTo(MAP);
    f.layer.setOpacity(idx === _radarFrameIdx ? 0.6 : 0);
  });
  syncRadarSlider();
  updateRadarLoopReadout();
}
function ensureRadarFramesBuilt(){
  if(!_radarBuilt || !_radarFrames.length){
    buildRadarFrames();
    _radarFrameIdx = _radarFrames.length - 1;
    if(layerVis.radar && MAP && MAP.hasLayer(radarLayer)) radarLayer.setOpacity(0);
  }
}
function syncRadarSlider(){
  const inp = document.getElementById("radar-frame-input");
  const maxIdx = Math.max(0, (_radarFrames.length || 13) - 1);
  if(inp){
    if(+inp.max !== maxIdx) inp.max = maxIdx;
    if(+inp.value !== _radarFrameIdx) inp.value = _radarFrameIdx;
  }
  const older = document.getElementById("radar-frame-older");
  const newer = document.getElementById("radar-frame-newer");
  if(older) older.disabled = !_radarFrames.length || _radarFrameIdx <= 0;
  if(newer) newer.disabled = !_radarFrames.length || _radarFrameIdx >= _radarFrames.length - 1;
}
function stepRadarFrame(delta){
  if(!layerVis.radar) return;
  if(isRadarLooping()) pauseRadarLoop();
  ensureRadarFramesBuilt();
  const next = Math.max(0, Math.min(_radarFrames.length - 1, _radarFrameIdx + (delta|0)));
  showRadarFrame(next);
}
function onRadarSliderInput(val){
  if(!layerVis.radar) return;
  if(isRadarLooping()) pauseRadarLoop();
  ensureRadarFramesBuilt();
  showRadarFrame(val|0);
}
function isRadarLooping(){ return _radarTimer !== null; }
function startRadarLoop(){
  if(!layerVis.radar) return;
  // Guard against a leaked timer: if a loop interval is already running, clear
  // it before creating a new one. Without this, calling startRadarLoop() while
  // already looping would orphan the previous interval (it keeps firing, can no
  // longer be cleared, and the frames animate at double speed). The toggle
  // entry point is currently safe, but this makes the function safe to call
  // directly too. Mirrors stopSatPlayback() in startSatPlayback().
  if(_radarTimer){ clearInterval(_radarTimer); _radarTimer = null; }
  // Build frames only if we don't already have them (e.g. first play, or after a
  // full teardown). Resuming from pause keeps the frames we already loaded so the
  // loop picks up where it left off instead of starting over.
  if(!_radarBuilt || !_radarFrames.length){
    buildRadarFrames();
    _radarFrameIdx = 0;
  }
  // Hide the single "latest" layer while the loop drives its own frames.
  if(MAP.hasLayer(radarLayer)) radarLayer.setOpacity(0);
  showRadarFrame(_radarFrameIdx);
  _radarTimer = setInterval(() => {
    let next = _radarFrameIdx + 1;
    if(next >= _radarFrames.length){
      // Pause briefly on the newest frame, then loop to the start.
      next = 0;
    }
    showRadarFrame(next);
  }, 700); // ~0.7s/frame
  updateRadarLoopButton();
  updateRadarLoopReadout();
}
// Pause WITHOUT tearing down: stop the timer but leave the current frame on the
// map so the displayed moment freezes. Pressing play again resumes from here.
function pauseRadarLoop(){
  if(_radarTimer){ clearInterval(_radarTimer); _radarTimer = null; }
  updateRadarLoopButton();
  updateRadarLoopReadout();
}
// Full teardown: stop the loop, remove all frames, and restore the live single
// frame. Used when the radar layer itself is switched off — NOT for pause.
function stopRadarLoop(){
  if(_radarTimer){ clearInterval(_radarTimer); _radarTimer = null; }
  clearRadarFrames();
  _radarFrameIdx = 0;
  const inp = document.getElementById("radar-frame-input");
  if(inp) inp.value = inp.max || 12;
  syncRadarSlider();
  // Restore the live single-frame radar layer if radar is still on.
  if(layerVis.radar && radarLayer){
    if(!MAP.hasLayer(radarLayer)) radarLayer.addTo(MAP);
    radarLayer.setOpacity(0.55);
  }
  updateRadarLoopButton();
  updateRadarLoopReadout();
}
function toggleRadarLoop(){ isRadarLooping() ? pauseRadarLoop() : startRadarLoop(); }
function updateRadarLoopButton(){
  const btn = document.getElementById("radar-loop-btn");
  if(btn) btn.textContent = isRadarLooping() ? "⏸ Pause loop" : "▶ Play storm loop";
}
function updateRadarLoopReadout(){
  const el = document.getElementById("radar-loop-time");
  if(!el) return;
  // Show the current frame's time whenever frames are loaded — whether the loop
  // is running OR paused on a frame. Only fall back to "Live" once frames are gone.
  if(_radarFrames.length && _radarFrames[_radarFrameIdx]){
    const f = _radarFrames[_radarFrameIdx];
    const isNewest = _radarFrameIdx === _radarFrames.length - 1;
    const base = isNewest ? `${f.label} (now)` : f.label;
    el.textContent = isRadarLooping() ? base : `${base} ⏸`;
  } else {
    el.textContent = "Live";
  }
}
function updateRadarLoopControlVisibility(){
  const box = document.getElementById("radar-loop-control");
  if(!box) return;
  box.style.display = layerVis.radar ? "block" : "none";
  if(!layerVis.radar) stopRadarLoop();
  restackBottomControls();
}

// ════════════════════════════════════════════════════════════════════════════
// LORAN-C TD LINES — Multi-Chain Mid-Atlantic / Southeast US Coverage
//
// Supports two LORAN-C chains:
//
//   9960 (Northeast US Chain) — Y-rate, Carolina Beach NC secondary
//     Best in waters NORTH of Cape Fear (NC, VA, MD, DE). Captains call out
//     positions like "on the 41550" (Norfolk Canyon area, Y-rate 41550).
//     Matches BLACK diagonal lines on NOAA Grease Charts AC006, AC007.
//
//   7980 (Southeast US Chain) — Y-rate, Jupiter FL secondary
//     Best in SC, GA, FL east coast waters. Lines spread out properly
//     here where 9960 hyperbolas degenerate near Carolina Beach station.
//     Matches BLACK diagonal lines on NOAA Grease Chart AC002.
//
// The drawLoranLines function automatically draws each chain only in its
// usable region, so users see one continuous LORAN grid across the
// Carolinas without overlapping line confusion.
//
// ── CALIBRATION ──
//   9960-Y: anchored at Norfolk Canyon = 41550 (the "550 line")
//   7980-Y: uses published Jupiter Y emission delay of 45102.04 µs
// ════════════════════════════════════════════════════════════════════════════

const LORAN_CHAINS = {
  // Northeast US Chain - 9960
  ne9960Y: {
    label: "9960-Y",
    master:    {lat: 42.7142, lng: -76.8253},   // Seneca NY
    secondary: {lat: 34.0626, lng: -77.9128},   // Carolina Beach NC
    offset: 42237.7,
    // Region where this chain produces useful (non-degenerate) lines:
    // north of Cape Fear, where Carolina Beach Y secondary spread is good.
    useBounds: {south: 34.5, north: 38.6, west: -77.0, east: -74.0},
    // 50-µs increments. TD values 40000-42600 across this region.
    tdMin: 40000, tdMax: 42600, step: 50,
  },
  // Southeast US Chain - 7980 (Z-rate, Carolina Beach NC secondary)
  // NOTE: Carolina Beach is dual-rated — it's the Y secondary for chain 9960
  // AND the Z secondary for chain 7980 (same physical tower, different
  // coding delay). The 7980-Z hyperbolas run perpendicular to the 9960-Y
  // hyperbolas through this same point — giving captains a useful coordinate
  // pair to triangulate in SC/GA waters.
  se7980Z: {
    label: "7980-Z",
    master:    {lat: 30.9941, lng: -85.1691},   // Malone FL
    secondary: {lat: 34.0626, lng: -77.9128},   // Carolina Beach NC
    // Offset is an empirical estimate that puts values in the captain-
    // vocabulary range for SC waters (~49000-51000 µs). Without an
    // authoritative chart anchor we can't pin this more precisely; values
    // may differ from printed charts by ~100-1000 µs.
    offset: 50735,
    // Region where this chain produces useful (non-degenerate) lines:
    // south of Cape Fear in SC/GA waters.
    useBounds: {south: 32.0, north: 34.5, west: -79.7, east: -77.3},
    // 50-µs increments. TD values 46000-51000 across SC/GA waters.
    tdMin: 46000, tdMax: 51000, step: 50,
  },
};

const LORAN_C_SPEED_M_PER_US = 299.691162;

function loranDistMeters(la1, lo1, la2, lo2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(la2 - la1);
  const dLng = toRad(lo2 - lo1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(la1)) * Math.cos(toRad(la2)) *
            Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function loranTD(lat, lng, chain){
  const dM = loranDistMeters(lat, lng, chain.master.lat, chain.master.lng);
  const dS = loranDistMeters(lat, lng, chain.secondary.lat, chain.secondary.lng);
  const geom = (dS - dM) / LORAN_C_SPEED_M_PER_US;
  return geom + chain.offset;
}

// Marching-squares contour tracer for a specific chain
function traceLoranLine(tdValue, bounds, step, chain){
  const lines = [];
  const {south, north, west, east} = bounds;
  const cols = Math.ceil((east - west) / step);
  const rows = Math.ceil((north - south) / step);
  const grid = new Float32Array((rows + 1) * (cols + 1));
  for(let r = 0; r <= rows; r++){
    const lat = south + r * step;
    for(let c = 0; c <= cols; c++){
      const lng = west + c * step;
      grid[r * (cols + 1) + c] = loranTD(lat, lng, chain);
    }
  }
  const interp = (t1, t2, lat1, lng1, lat2, lng2) => {
    const frac = (tdValue - t1) / (t2 - t1);
    return [lat1 + (lat2 - lat1) * frac, lng1 + (lng2 - lng1) * frac];
  };
  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      const lat0 = south + r * step, lng0 = west + c * step;
      const lat1 = south + (r + 1) * step, lng1 = west + (c + 1) * step;
      // Skip cells very close to THIS chain's secondary station (hyperbolas
      // degenerate near a station so lines there are noise).
      const cellLat = (lat0 + lat1) / 2;
      const cellLng = (lng0 + lng1) / 2;
      const dLatStation = cellLat - chain.secondary.lat;
      const dLngStation = cellLng - chain.secondary.lng;
      if(Math.sqrt(dLatStation*dLatStation + dLngStation*dLngStation) < 0.45) continue;
      const t00 = grid[r * (cols + 1) + c];
      const t01 = grid[r * (cols + 1) + c + 1];
      const t10 = grid[(r + 1) * (cols + 1) + c];
      const t11 = grid[(r + 1) * (cols + 1) + c + 1];
      const edges = [];
      if((t00 < tdValue) !== (t01 < tdValue))
        edges.push(interp(t00, t01, lat0, lng0, lat0, lng1));
      if((t01 < tdValue) !== (t11 < tdValue))
        edges.push(interp(t01, t11, lat0, lng1, lat1, lng1));
      if((t10 < tdValue) !== (t11 < tdValue))
        edges.push(interp(t10, t11, lat1, lng0, lat1, lng1));
      if((t00 < tdValue) !== (t10 < tdValue))
        edges.push(interp(t00, t10, lat0, lng0, lat1, lng0));
      if(edges.length === 2) lines.push(edges);
    }
  }

  // ── PERFORMANCE: chain segments into connected polylines ──
  // Marching squares produced one segment per cell crossing. Each segment
  // shares an endpoint with the neighboring segment along the same hyperbola
  // contour. By stitching them together into long polylines we go from
  // ~25,000 SVG elements per redraw to ~300, eliminating render jank that
  // was killing touch-momentum during fast scroll-up gestures.
  if(lines.length < 2) return lines;
  const EPS = step * 0.05;  // tolerance for endpoint matching (~0.002°)
  const ptKey = (lat, lng) => `${Math.round(lat / EPS)},${Math.round(lng / EPS)}`;
  // Build adjacency: each endpoint key → list of (segIdx, end) where end ∈ {0,1}
  const endpoints = new Map();
  lines.forEach((seg, i) => {
    const k0 = ptKey(seg[0][0], seg[0][1]);
    const k1 = ptKey(seg[1][0], seg[1][1]);
    if(!endpoints.has(k0)) endpoints.set(k0, []);
    if(!endpoints.has(k1)) endpoints.set(k1, []);
    endpoints.get(k0).push([i, 0]);
    endpoints.get(k1).push([i, 1]);
  });
  // Walk chains: for each unused segment, extend forward and backward
  const used = new Array(lines.length).fill(false);
  const polylines = [];
  for(let i = 0; i < lines.length; i++){
    if(used[i]) continue;
    used[i] = true;
    const chain_ = [lines[i][0], lines[i][1]];
    // Extend forward (from segment end)
    while(true){
      const last = chain_[chain_.length - 1];
      const k = ptKey(last[0], last[1]);
      const candidates = endpoints.get(k) || [];
      let next = null;
      for(const [idx, end] of candidates){
        if(used[idx]) continue;
        next = [idx, end];
        break;
      }
      if(!next) break;
      used[next[0]] = true;
      const otherEnd = lines[next[0]][1 - next[1]];
      chain_.push(otherEnd);
    }
    // Extend backward (from segment start)
    while(true){
      const first = chain_[0];
      const k = ptKey(first[0], first[1]);
      const candidates = endpoints.get(k) || [];
      let prev = null;
      for(const [idx, end] of candidates){
        if(used[idx]) continue;
        prev = [idx, end];
        break;
      }
      if(!prev) break;
      used[prev[0]] = true;
      const otherEnd = lines[prev[0]][1 - prev[1]];
      chain_.unshift(otherEnd);
    }
    polylines.push(chain_);
  }

  // ── COASTLINE CLIP ──
  // The marching-squares grid spans the full useBounds rectangle, which
  // reaches well inland. LORAN-C TD lines only make sense over open water, so
  // we trim the deep-inland portion of every polyline. Where a line crosses
  // into land we split it so we never bridge across a peninsula.
  //
  // IMPORTANT: we keep the line's REAL grid points and never synthesize a
  // point on the coastline. (A forced shore endpoint produced long
  // near-horizontal artifacts, because LORAN hyperbolas can run nearly
  // parallel to the shore.) To guarantee there is never a visible gap of open
  // water between the shore and where a line starts, we push the cut line a
  // fixed buffer INLAND: any point within COAST_BUFFER degrees west of the
  // coastline still counts as "keep". This makes lines slightly overshoot
  // onto land near the coast, which is the desired tradeoff — overshooting a
  // little beats leaving a gap over the water.
  const COAST_BUFFER = 0.12;  // ~6 nm of allowed inland overshoot
  const keepPt = p => p[1] >= (barrierCoastLng(p[0]) - COAST_BUFFER);

  const clipped = [];
  for(const poly of polylines){
    let current = [];
    const flush = () => {
      if(current.length >= 2) clipped.push(current);
      current = [];
    };
    for(let i = 0; i < poly.length; i++){
      const pt = poly[i];
      if(keepPt(pt)){
        current.push(pt);
      } else {
        flush();
      }
    }
    flush();
  }
  return clipped;
}

let loranLayer = null;

function drawLoranLines(){
  if(loranLayer){
    MAP.removeLayer(loranLayer);
    loranLayer = null;
  }
  if(!layerVis.loran) return;

  // Step size for the marching-squares grid: ~2.4 nm. Same for both chains.
  const step = 0.04;

  const featureGroup = L.featureGroup();
  // Major lines (every 100µs) — slightly thicker and more opaque
  // Dark green chosen to stand out cleanly against blue ocean water and
  // distinguish from the predict-heat green (which is brighter/teal).
  const majorStyle = {color: "#f97316", weight: 2.5, opacity: 0.95, dashArray: "6 4", interactive: false};
  // Half-lines (50µs increments) — thinner and dimmer for visual hierarchy
  const halfStyle  = {color: "#f97316", weight: 1.6, opacity: 0.65, dashArray: "3 5", interactive: false};
  // Badge style for labels. CRITICAL: pointer-events:none lets touches pass
  // through to the map underneath — without this, the label divs intercept
  // touch-start events and block map panning when a finger lands on a label.
  const badgeStyle = "background:rgba(60,28,6,.95);color:#fdba74;padding:3px 9px;border-radius:5px;font-size:13px;font-weight:700;font-family:monospace;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.6);border:1px solid rgba(253,186,116,.6);pointer-events:none";

  // Iterate over every chain defined in LORAN_CHAINS. Each chain only draws
  // within its useBounds rectangle. Where chains' useBounds overlap (a small
  // band near Cape Fear NC), users see both — which matches the printed
  // Grease Charts that overprint both 9960 and 7980 lines in that area.
  Object.values(LORAN_CHAINS).forEach(chain => {
    const tdValues = [];
    for(let td = chain.tdMin; td <= chain.tdMax; td += chain.step){
      tdValues.push(td);
    }

    tdValues.forEach(td => {
      // traceLoranLine now returns an array of polylines (each one is an
      // array of [lat,lng] points along the same connected hyperbola arc).
      const polylines = traceLoranLine(td, chain.useBounds, step, chain);
      const style = (td % 100 === 0) ? majorStyle : halfStyle;
      polylines.forEach(poly => {
        // Convert to Leaflet's expected format and add as ONE polyline (not
        // one polyline per segment — that was the perf killer).
        L.polyline(poly, style).addTo(featureGroup);
      });
      // Label only MAJOR lines (every 100µs). Half-lines (50µs) still render
      // as polylines for visual interpolation but don't get badges.
      if(polylines.length > 0 && td % 100 === 0){
        // Find the EASTERNMOST point across ALL polylines for this TD value.
        // Highest longitude = furthest east = furthest out into the open
        // ocean (away from the coastline). This keeps labels out over water
        // so users don't have to scroll west to read them.
        let labelPt = null;
        let maxLng = -Infinity;
        for(const poly of polylines){
          for(const pt of poly){
            if(pt[1] > maxLng){
              maxLng = pt[1];
              labelPt = pt;
            }
          }
        }
        if(labelPt){
          L.marker(labelPt, {
            icon: L.divIcon({
              className: "loran-label",
              html: `<div style="${badgeStyle}">${td}</div>`,
              iconSize: [60, 20],
              iconAnchor: [30, 10],
            }),
            interactive: false,
            keyboard: false,
          }).addTo(featureGroup);
        }
      }
    });
  });

  loranLayer = featureGroup;
  loranLayer.addTo(MAP);
}

function toggleLayersPanel(){
  layersPanelOpen=!layersPanelOpen;
  const modal = document.getElementById("layers-modal");
  modal.classList.toggle("open", layersPanelOpen);
  // When opening, auto-expand Advanced if any advanced layer is active, so the
  // user can see/disable what they turned on. Otherwise keep it collapsed.
  if(layersPanelOpen){
    if(typeof refreshDiagSummary === "function") refreshDiagSummary();
  }
}

// Expand/collapse the "Advanced overlays" group (Closures, LORAN-C).
// Collapsed by default so the panel opens clean.
function toggleBaseMapPanel(){
  const modal = document.getElementById("basemap-modal");
  modal.classList.toggle("open");
}

function toggleSettingsPanel(){
  const modal = document.getElementById("settings-modal");
  const opening = !modal.classList.contains("open");
  modal.classList.toggle("open");
  if(opening) refreshSettingsModal();
}

// ════════════════════════════════════════════════════════════════════════════
// LOG CATCH MODAL HANDLERS
// Open/close, location capture, photo preview, conditions auto-fill, save.
// Form state lives in the DOM during the modal session — no separate JS state.
// ════════════════════════════════════════════════════════════════════════════

// Working location for the catch being entered. Populated by the
// "Use map center" or "Use my GPS" buttons.
let _catchPendingLat = null;
let _catchPendingLng = null;
let _catchPendingPhoto = null;  // base64 data URI after downscale

function openLogCatch(){
  // Populate species dropdown from SPECIES (excluding the "all" pseudo-entry)
  const sel = document.getElementById("catch-species");
  if(sel && sel.options.length <= 1){
    sel.innerHTML = "";
    const real = SPECIES.filter(s => s.id !== "all");
    // Optional: pre-select the user's active target species if there is one
    real.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    if(activeSpId && activeSpId !== "all") sel.value = activeSpId;
  }
  // Default datetime to now (local time, sliced to YYYY-MM-DDTHH:MM)
  const dt = document.getElementById("catch-datetime");
  if(dt){
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    dt.value = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  }
  // Clear other fields
  ["catch-length","catch-weight","catch-notes"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = "";
  });
  const photoIn = document.getElementById("catch-photo");
  if(photoIn) photoIn.value = "";
  const photoPrev = document.getElementById("catch-photo-preview");
  if(photoPrev) photoPrev.innerHTML = "";
  const shareCb = document.getElementById("catch-share");
  if(shareCb) shareCb.checked = false;
  _catchPendingLat = null;
  _catchPendingLng = null;
  _catchPendingPhoto = null;
  // Default location to map center so the form is usable immediately
  if(MAP){
    const c = MAP.getCenter();
    _catchPendingLat = c.lat;
    _catchPendingLng = c.lng;
    catchUpdateLocationDisplay();
  }
  document.getElementById("catch-modal").style.display = "flex";
}

function closeLogCatch(){
  document.getElementById("catch-modal").style.display = "none";
}

function catchLocFromMapCenter(){
  if(!MAP) return;
  const c = MAP.getCenter();
  _catchPendingLat = c.lat;
  _catchPendingLng = c.lng;
  catchUpdateLocationDisplay();
}

function catchLocFromDevice(){
  if(!navigator.geolocation){
    showToast("Your browser doesn't support GPS location.", "warning");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      _catchPendingLat = pos.coords.latitude;
      _catchPendingLng = pos.coords.longitude;
      catchUpdateLocationDisplay();
    },
    err => {
      // GPS access needs HTTPS in modern browsers — this commonly fails in
      // the artifact sandbox preview. Give a clear message instead of a
      // mystery silent failure.
      const msg = location.protocol === "https:" || location.hostname === "localhost"
        ? "Couldn't get your location. Make sure GPS is enabled and you've granted permission."
        : "GPS requires HTTPS. Try the 'Use map center' button instead.";
      showToast(msg, "error");
    },
    {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000}
  );
}

// Refresh the location display + auto-filled conditions preview when
// the pending lat/lng changes.
function catchUpdateLocationDisplay(){
  const el = document.getElementById("catch-location-display");
  if(!el) return;
  if(_catchPendingLat == null || _catchPendingLng == null){
    el.textContent = "Tap a location below to set it";
    document.getElementById("catch-conditions-preview").style.display = "none";
    return;
  }
  const lat = _catchPendingLat, lng = _catchPendingLng;
  const nearest = (typeof nearestPortTo === "function") ? nearestPortTo(lat, lng) : null;
  el.innerHTML = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°` +
    (nearest ? ` <span style="color:#9ca3af">· near ${nearest.split(",")[0]}</span>` : "");
  // Auto-fill conditions preview
  const cond = catchAutoFillConditions(lat, lng);
  const parts = [];
  if(cond.sst != null)         parts.push(`SST <b>${cond.sst}°F</b>`);
  if(cond.moon)                parts.push(`Moon <b>${cond.moon}</b>`);
  if(cond.tide)                parts.push(`Tide <b>${cond.tide}</b>`);
  if(cond.pressureTrend)       parts.push(`Pressure <b>${cond.pressureTrend}</b>`);
  if(cond.windDir != null)     parts.push(`Wind <b>${cond.windDir}°</b>`);
  const previewEl = document.getElementById("catch-conditions-preview");
  const textEl = document.getElementById("catch-conditions-text");
  if(parts.length){
    textEl.innerHTML = parts.join(" · ");
    previewEl.style.display = "block";
  } else {
    previewEl.style.display = "none";
  }
}

// Handle photo file selection — downscale and show a thumbnail preview.
async function catchPhotoPreview(file){
  const prev = document.getElementById("catch-photo-preview");
  if(!file){
    _catchPendingPhoto = null;
    if(prev) prev.innerHTML = "";
    return;
  }
  _catchPendingPhoto = await catchPhotoFromFile(file);
  if(prev && _catchPendingPhoto){
    prev.innerHTML = `<img src="${_catchPendingPhoto}" alt="Catch preview" style="
      max-width:100%;max-height:160px;border-radius:8px;
      border:1px solid rgba(107,191,234,.2);object-fit:cover;display:block;
    "/>`;
  }
}

// Save the form. Validates required fields, calls catchAdd, refreshes the
// map pins, and closes the modal.
function saveCatchFromForm(){
  const species = document.getElementById("catch-species").value;
  if(!species){ showToast("Please select a species.", "warning"); return; }
  if(_catchPendingLat == null || _catchPendingLng == null){
    showToast("Please set a location for the catch (use map center or GPS).", "warning");
    return;
  }
  const dtVal = document.getElementById("catch-datetime").value;
  const timestamp = dtVal ? new Date(dtVal).toISOString() : new Date().toISOString();
  const lenVal = parseFloat(document.getElementById("catch-length").value);
  const wtVal = parseFloat(document.getElementById("catch-weight").value);
  const notes = document.getElementById("catch-notes").value.trim();
  const shared = document.getElementById("catch-share").checked;
  catchAdd({
    species,
    lat: _catchPendingLat,
    lng: _catchPendingLng,
    timestamp,
    length: isNaN(lenVal) ? null : lenVal,
    weight: isNaN(wtVal) ? null : wtVal,
    notes,
    photo: _catchPendingPhoto,
    shared,
  });
  // Refresh map pins and reports feed (the latter only matters if shared)
  if(typeof drawCatchPins === "function") drawCatchPins();
  if(shared && typeof renderReports === "function") renderReports();
  closeLogCatch();
}

// ════════════════════════════════════════════════════════════════════════════
// USER PREFERENCES — session-scoped in-memory store.
//
// In a production build, this object would persist to localStorage. In
// this artifact preview, browser storage APIs are disabled so settings
// only survive within a single session. The API surface (prefSet, prefGet,
// prefResetAll) is identical so swapping in localStorage later is a
// one-line change.
// ════════════════════════════════════════════════════════════════════════════
const USER_PREFS = {
  defaultPort:       null,    // e.g. "Oregon Inlet, NC"
  defaultSpecies:    null,    // species id, e.g. "yellowfin"
  defaultBaseMap:    "satellite",
  autozoomPort:      true,
  persistLoran:      false,
  // Account state — null when logged out. When signed in, becomes
  //   {name: "Display Name", email: "user@example.com", id: "..."}.
  // The auth backend isn't wired up yet (waiting on deploy); for now this
  // is UI scaffolding only. signIn() / signOut() below stub the flow.
  account:           null,
};

function prefGet(key){
  return USER_PREFS[key];
}
function prefSet(key, val){
  // Guard: LORAN-C is a Pro layer. Never let its "keep on by default" pref be
  // set true without entitlement, regardless of how the call originates.
  if(key === "persistLoran" && val && (typeof BW_PREMIUM === "undefined" || !BW_PREMIUM)){
    val = false;
    if(typeof openPricing === "function") openPricing();
  }
  USER_PREFS[key] = val;
  prefSave();
  // Apply side effects of the change immediately where it makes sense
  if(key === "defaultBaseMap"){
    // Don't switch the current map — the user is just setting the default
    // for next session. (If they want to switch now, they use the map icon.)
  }
}
// Persist preferences. localStorage is the durable store on this device; when
// the account backend is wired, prefs also sync to the user's profile so they
// follow the user across devices. We never persist the `account` object here.
const PREFS_KEY = "bwi.prefs";
function prefSave(){
  const out = {
    defaultPort:    USER_PREFS.defaultPort,
    defaultSpecies: USER_PREFS.defaultSpecies,
    defaultBaseMap: USER_PREFS.defaultBaseMap,
    autozoomPort:   USER_PREFS.autozoomPort,
    persistLoran:   USER_PREFS.persistLoran,
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(out));
  } catch(e){ /* storage unavailable — prefs stay in-memory for this session */ }
  // When signed in, also persist to the ACCOUNT so ALL settings (not just the
  // home port) follow the user across every device. We write two things:
  //   • home_port  — the dedicated column the login flow already reads, kept in
  //                  sync so older logic and any SQL that reads it still works.
  //   • prefs_json — a JSON blob of the FULL settings object, so every
  //                  preference (species, basemap, autozoom, LORAN, port) syncs.
  // NOTE: this requires a text column `prefs_json` on the Supabase `profiles`
  // table. If that column doesn't exist yet, Supabase will reject the unknown
  // field and the account write is a no-op (device localStorage still works) —
  // add the column to enable full cross-device sync.
  try {
    if(typeof BW_AUTH !== "undefined" && BW_AUTH.isSignedIn && BW_AUTH.isSignedIn() && BW_AUTH.saveProfile){
      BW_AUTH.saveProfile({
        home_port:  USER_PREFS.defaultPort || null,
        prefs_json: JSON.stringify(out),
      }).catch(()=>{});
    }
  } catch(e){}
}
// Load saved preferences at startup. Account values (when signed in) take
// precedence and are applied later by the auth hydrate; this restores the
// on-device defaults so the app opens correctly even before sign-in resolves.
function prefLoad(){
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if(!raw) return;
    const saved = JSON.parse(raw);
    if(saved && typeof saved === "object"){
      if("defaultPort" in saved)    USER_PREFS.defaultPort    = saved.defaultPort;
      if("defaultSpecies" in saved) USER_PREFS.defaultSpecies = saved.defaultSpecies;
      if("defaultBaseMap" in saved) USER_PREFS.defaultBaseMap = saved.defaultBaseMap || "satellite";
      if("autozoomPort" in saved)   USER_PREFS.autozoomPort   = !!saved.autozoomPort;
      if("persistLoran" in saved)   USER_PREFS.persistLoran   = !!saved.persistLoran;
    }
  } catch(e){ /* corrupt/unavailable — fall back to defaults */ }
}

// ── Map view persistence ────────────────────────────────────────────────────
// Remember the last map center + zoom so returning to the page keeps the user
// where they left off, instead of snapping back to the default home-port zoom.
const MAP_VIEW_KEY = "bwi.mapview";
// In-memory snapshot of the last user-driven view. This is the source of truth
// for restoring on a fresh page LOAD (a reload reopens where you left off).
// localStorage is the cross-reload backup; the in-memory snapshot is the
// authoritative value within a session. We no longer re-apply this on tab
// focus — the map keeps its own position across a tab switch, so there's
// nothing to restore mid-session (and doing so caused a recenter flicker).
let _lastUserView = null;

function saveMapView(){
  try {
    if(typeof MAP === "undefined" || !MAP) return;
    const c = MAP.getCenter();
    const view = { lat: c.lat, lng: c.lng, zoom: MAP.getZoom(), at: Date.now() };
    _lastUserView = view;
    localStorage.setItem(MAP_VIEW_KEY, JSON.stringify(view));
  } catch(e){}
}
function loadMapView(){
  // Prefer the in-memory snapshot (authoritative within a session); fall back
  // to localStorage on a fresh load.
  if(_lastUserView) return _lastUserView;
  try {
    const raw = localStorage.getItem(MAP_VIEW_KEY);
    if(!raw) return null;
    const v = JSON.parse(raw);
    if(v && typeof v.lat === "number" && typeof v.lng === "number" && typeof v.zoom === "number"){
      return v;
    }
  } catch(e){}
  return null;
}
function startMapViewPersistence(){
  if(typeof MAP === "undefined" || !MAP) return;
  // Save whenever the user finishes panning or zooming, so a full page RELOAD
  // can reopen where they left off. (This is the only thing the saved view is
  // still used for — see below.)
  MAP.on("moveend zoomend", saveMapView);
  window.addEventListener("pagehide", saveMapView);

  // We deliberately DO NOT re-center / re-pin the map when the tab regains
  // focus. Leaflet already preserves the map's center and zoom across a tab
  // switch or window blur on its own, so the map simply stays where the user
  // left it. The previous focus/visibility "restore" pass was both unnecessary
  // and actively harmful: calling setView() (and invalidateSize) on return made
  // the map flash to the home port for a frame and then snap back to the real
  // location — the jarring recenter the user asked to remove. Removing those
  // handlers eliminates the flicker; the map no longer auto-recenters on return.
  //
  // The one thing we still need to handle is a genuine container RESIZE (window
  // resize, phone rotation, browser-chrome show/hide), which can leave Leaflet's
  // tiles mismatched to the new size. For that we call invalidateSize() ONLY —
  // never setView — so the map refills the container in place without moving the
  // center or zoom.
  let _resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      try { MAP.invalidateSize({animate:false}); } catch(e){}
    }, 150);
  });
}
// ════════════════════════════════════════════════════════════════════════════
// HELP & CONTACT
// Build a mailto: link with the right subject + a small device-info footer
// to make troubleshooting easier. No PII collected — just user agent and
// the page URL the user was on when they hit the button.
// ════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
//
// Lightweight, non-blocking, themed notifications that replace native alert()
// dialogs (which are jarring, block the JS thread, and look out of place on a
// dark map UI). Call showToast(message, type) where type ∈ info|success|error|
// warning. Toasts stack at the bottom-center, auto-dismiss, and are dismissable
// by tap. Mobile-safe: positioned above the bottom browser chrome and width-
// capped so they never overflow a phone screen.
// ════════════════════════════════════════════════════════════════════════════
function showToast(message, type){
  if(!message) return;
  type = type || "info";
  let host = document.getElementById("toast-host");
  if(!host){
    host = document.createElement("div");
    host.id = "toast-host";
    host.setAttribute("aria-live", "polite");
    host.style.cssText =
      "position:fixed;left:50%;transform:translateX(-50%);" +
      "bottom:calc(28px + env(safe-area-inset-bottom,0px));" +
      "z-index:100000;display:flex;flex-direction:column;align-items:center;" +
      "gap:8px;width:min(420px,calc(100vw - 32px));pointer-events:none;";
    document.body.appendChild(host);
  }
  const palette = {
    info:    { bg:"rgba(23,37,60,.97)",  bd:"#2979b5", fg:"#dce8f6", icon:"ℹ️" },
    success: { bg:"rgba(8,40,28,.97)",   bd:"#16a34a", fg:"#bbf7d0", icon:"✓"  },
    error:   { bg:"rgba(48,16,16,.97)",  bd:"#dc2626", fg:"#fecaca", icon:"⚠️" },
    warning: { bg:"rgba(48,38,8,.97)",   bd:"#d97706", fg:"#fde68a", icon:"⚠️" },
  };
  const p = palette[type] || palette.info;
  const el = document.createElement("div");
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.style.cssText =
    "pointer-events:auto;cursor:pointer;max-width:100%;box-sizing:border-box;" +
    `background:${p.bg};border:1px solid ${p.bd};color:${p.fg};` +
    "border-radius:12px;padding:12px 15px;font-size:14px;line-height:1.4;" +
    "font-family:'Segoe UI',Arial,sans-serif;font-weight:600;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.45);display:flex;align-items:flex-start;gap:10px;" +
    "opacity:0;transform:translateY(10px);transition:opacity .2s ease,transform .2s ease;" +
    "-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);";
  el.innerHTML =
    `<span style="flex-shrink:0;font-size:15px;line-height:1.3">${p.icon}</span>` +
    `<span style="flex:1;min-width:0">${String(message).replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>`;
  host.appendChild(el);
  // Animate in on next frame.
  requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
  // Auto-dismiss: longer for longer messages, capped.
  const ms = Math.min(7000, Math.max(3000, String(message).length * 55));
  const dismiss = () => {
    if(el._gone) return; el._gone = true;
    el.style.opacity = "0"; el.style.transform = "translateY(10px)";
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 220);
  };
  const timer = setTimeout(dismiss, ms);
  el.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
}

// ════════════════════════════════════════════════════════════════════════════
// HELP & CONTACT (continued)
// ════════════════════════════════════════════════════════════════════════════
const CONTACT_EMAIL = "info@bluewaterintel.com";

function openFeedbackEmail(kind){
  const isBug = kind === "bug";
  const subject = isBug ? "Bluewater Intel — Bug Report" : "Bluewater Intel — Feedback";
  const intro = isBug
    ? "Describe the bug (what you did, what happened, what you expected):\n\n\n\n"
    : "Your feedback or feature request:\n\n\n\n";
  // Minimal diagnostic footer. No location, no email, no MMSI/AIS data —
  // just enough to know what browser & app build the user is on.
  const ua = (navigator && navigator.userAgent) ? navigator.userAgent.slice(0, 200) : "(unknown)";
  const url = (location && location.href) ? location.href.split("?")[0] : "(unknown)";
  const footer =
    "\n---\n" +
    "(Optional — please leave this in to help us troubleshoot)\n" +
    "App: Bluewater Intel\n" +
    "URL: " + url + "\n" +
    "Device: " + ua + "\n";
  const body = encodeURIComponent(intro + footer);
  const mailto = "mailto:" + CONTACT_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + body;
  // Open in a new tab/window so the user doesn't lose their place if the
  // email handler is web-based (Gmail, Outlook web, etc.)
  window.open(mailto, "_blank");
}

// Menu entry → opens the user's email client with a prefilled message to
// info@bluewaterintel.com. No intermediate UI — just opens the composer.
function openHelpContact(){
  openFeedbackEmail("feedback");
}

function prefResetAll(){
  if(!confirm("Reset all preferences to defaults?")) return;
  USER_PREFS.defaultPort = null;
  USER_PREFS.defaultSpecies = null;
  USER_PREFS.defaultBaseMap = "satellite";
  USER_PREFS.autozoomPort = true;
  USER_PREFS.persistLoran = false;
  prefSave();
  refreshSettingsModal();
}

// Populates the settings modal dropdowns and checkboxes from the current
// USER_PREFS values. Called each time the modal opens so it stays in sync.
function refreshSettingsModal(){
  // ── Port dropdown ──
  const portSel = document.getElementById("pref-port");
  if(portSel && portSel.options.length <= 1 && typeof PORTS !== "undefined"){
    const names = Object.keys(PORTS).sort();
    for(const n of names){
      const o = document.createElement("option");
      o.value = n; o.textContent = n;
      portSel.appendChild(o);
    }
  }
  if(portSel) portSel.value = USER_PREFS.defaultPort || "";

  // ── Species dropdown ──
  const spSel = document.getElementById("pref-species");
  if(spSel && spSel.options.length <= 1 && typeof SPECIES !== "undefined"){
    const sorted = SPECIES.slice().sort((a, b) => a.name.localeCompare(b.name));
    for(const s of sorted){
      const o = document.createElement("option");
      o.value = s.id; o.textContent = s.name;
      spSel.appendChild(o);
    }
  }
  if(spSel) spSel.value = USER_PREFS.defaultSpecies || "";

  // ── Base map default ──
  const bmSel = document.getElementById("pref-basemap");
  if(bmSel) bmSel.value = USER_PREFS.defaultBaseMap;

  // ── Checkboxes ──
  const cb = id => document.getElementById(id);
  if(cb("pref-autozoom-port"))    cb("pref-autozoom-port").checked    = !!USER_PREFS.autozoomPort;
  if(cb("pref-keep-loran-on"))    cb("pref-keep-loran-on").checked    = !!USER_PREFS.persistLoran;
  // LORAN-C is a Pro layer, so the "keep it on by default" setting must not be
  // usable by free users — otherwise they could set a default that auto-enables
  // a Pro-only layer. Disable + dim the row and badge it PRO when unentitled.
  const loranRow = document.getElementById("pref-loran-row");
  const loranChk = cb("pref-keep-loran-on");
  if(loranRow && loranChk){
    if(!BW_PREMIUM){
      loranChk.checked = false;      // never show it as defaulted-on for free
      loranChk.disabled = true;
      loranRow.style.opacity = "0.5";
      loranRow.style.pointerEvents = "none";
      if(!loranRow.querySelector(".pro-badge")){
        const b = document.createElement("span");
        b.className = "pro-badge"; b.textContent = "★ PRO";
        loranRow.appendChild(b);
      }
    } else {
      loranChk.disabled = false;
      loranRow.style.opacity = "";
      loranRow.style.pointerEvents = "";
      const b = loranRow.querySelector(".pro-badge"); if(b) b.remove();
    }
  }
  if(typeof refreshBriefRecallUi === "function") refreshBriefRecallUi();
}

// (offline cache is now permanently visible in the layers modal — no
// dropdown toggle needed)

// ════════════════════════════════════════════════════════════════════════════
// CATCH LOG
//
// User catch journal. Each entry captures what was caught, where, when, and
// what the conditions were — most users never log conditions because looking
// them up is tedious. We auto-fill from the same real ocean data the
// prediction engine uses, so the data is consistent across the app.
//
// Storage: catches persist to the signed-in account (Supabase via BW_AUTH),
// with localStorage as the offline/local fallback.
//
// Entry shape:
//   {
//     id:        unique string (timestamp-based)
//     timestamp: ISO date string (when fish was caught)
//     species:   species id from SPECIES list
//     lat, lng:  catch location
//     port:      nearest known port (for stats / reports)
//     length:    inches (optional)
//     weight:    pounds (optional)
//     notes:     free text (technique, lure, depth, etc.)
//     photo:     base64 data URI (optional, downscaled)
//     conditions:{sst, moonPhase, tide, pressure, windDir} — auto-filled
//     shared:    boolean — if true, this catch ALSO appears in SOCIAL reports
//   }
// ════════════════════════════════════════════════════════════════════════════
const USER_CATCHES = [];

// Generate a unique id for a new catch
function catchNewId(){
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// Find the nearest port to a lat/lng for use in stats and labels
function nearestPortTo(lat, lng){
  let best = null;
  let bestDist = Infinity;
  for(const [name, p] of Object.entries(PORTS)){
    const d = (typeof nmBetween === "function")
      ? nmBetween(lat, lng, p.lat, p.lng)
      : Math.sqrt((p.lat-lat)**2 + (p.lng-lng)**2) * 60;
    if(d < bestDist){ bestDist = d; best = name; }
  }
  return best;
}

// Auto-fill conditions for a given location and time. Uses ONLY real data already
// loaded on the client — never synthetic. SST resolves cell's own real sample →
// nearest real sample → regional real median → null; tide/wind/pressure come from
// the nearest real ocean-field sample; moon phase is an exact astronomical value.
// Any value without real data is omitted (the catch record shows "—" for it).
function catchAutoFillConditions(lat, lng /*, timestamp */){
  const conditions = {};
  try {
    // SST: real grid → nearest real sample → regional real median → null.
    let sstObj = (typeof sstGridAt === "function") ? sstGridAt(lat, lng) : null;
    if((!sstObj || sstObj.value == null) && typeof nearestFieldSample === "function") sstObj = nearestFieldSample(lat, lng, "sst");
    if(!sstObj || sstObj.value == null){
      if(typeof SST_GRID !== "undefined" && SST_GRID && SST_GRID.median != null) sstObj = { value: SST_GRID.median };
      else if(typeof OCEAN_FIELD !== "undefined" && OCEAN_FIELD && OCEAN_FIELD.medianSst != null) sstObj = { value: OCEAN_FIELD.medianSst };
    }
    if(sstObj && sstObj.value != null) conditions.sst = Math.round(sstObj.value * 10) / 10;

    if(typeof moonPhase === "function"){
      const p = moonPhase();
      // Translate 0-1 phase to a human label
      if(p < 0.06 || p > 0.94)      conditions.moon = "New";
      else if(p < 0.19)             conditions.moon = "Waxing Crescent";
      else if(p < 0.31)             conditions.moon = "First Quarter";
      else if(p < 0.44)             conditions.moon = "Waxing Gibbous";
      else if(p < 0.56)             conditions.moon = "Full";
      else if(p < 0.69)             conditions.moon = "Waning Gibbous";
      else if(p < 0.81)             conditions.moon = "Last Quarter";
      else                          conditions.moon = "Waning Crescent";
    }
    // Tide / wind / pressure: nearest REAL ocean-field sample only (no synthetic).
    if(typeof nearestFieldSample === "function"){
      const tideF = nearestFieldSample(lat, lng, "tide");
      if(tideF && tideF.state) conditions.tide = tideF.state;
      const windF = nearestFieldSample(lat, lng, "wind");
      if(windF && windF.dir != null) conditions.windDir = Math.round(windF.dir);
      const presF = nearestFieldSample(lat, lng, "pressure");
      if(presF && presF.value != null) conditions.pressureTrend = presF.value > 1 ? "rising" : presF.value < -1 ? "falling" : "steady";
    }
  } catch(e){ /* swallow — conditions are best-effort, real-only */ }
  return conditions;
}

// Add a new catch. Returns the new entry's id.
function catchAdd(data){
  const entry = {
    id: catchNewId(),
    timestamp: data.timestamp || new Date().toISOString(),
    species: data.species,
    lat: data.lat,
    lng: data.lng,
    port: data.port || nearestPortTo(data.lat, data.lng),
    length: data.length || null,
    weight: data.weight || null,
    notes: data.notes || "",
    photo: data.photo || null,
    conditions: data.conditions || catchAutoFillConditions(data.lat, data.lng, data.timestamp),
    shared: !!data.shared,
  };
  USER_CATCHES.unshift(entry);  // newest first
  // If user opted to share, push to SOCIAL reports feed
  if(entry.shared) catchShareAsReport(entry);
  catchPersist();
  if(window.BW_AUTH) window.BW_AUTH.saveCatch(entry).catch(e => console.error("catch sync", e));
  return entry.id;
}

// Persist all catches to localStorage so the log survives a reload/restart.
// Wrapped in try/catch: in some sandboxed preview environments storage is
// blocked, and the app should keep working in-memory rather than throwing.
function catchPersist(){
  try { localStorage.setItem("bwi.catches", JSON.stringify(USER_CATCHES)); } catch(e){}
}

// Load any previously-saved catches on startup.
function catchLoad(){
  try {
    const raw = localStorage.getItem("bwi.catches");
    if(!raw) return;
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)){
      USER_CATCHES.length = 0;
      arr.forEach(c => USER_CATCHES.push(c));
    }
  } catch(e){ /* corrupt or unavailable — start empty */ }
}

// catchUpdate — part of the CRUD API surface alongside add/delete/get.
// Not currently called from any UI (no "Edit catch" page yet) but exposed
// for the future edit flow and for programmatic use.
function catchUpdate(id, patch){
  const idx = USER_CATCHES.findIndex(c => c.id === id);
  if(idx < 0) return false;
  // Preserve id and timestamp; allow everything else to be replaced
  USER_CATCHES[idx] = Object.assign({}, USER_CATCHES[idx], patch, {id: USER_CATCHES[idx].id});
  catchPersist();
  if(window.BW_AUTH) window.BW_AUTH.saveCatch(USER_CATCHES[idx]).catch(e => console.error("catch sync", e));
  return true;
}

function catchDelete(id){
  const idx = USER_CATCHES.findIndex(c => c.id === id);
  if(idx < 0) return false;
  USER_CATCHES.splice(idx, 1);
  catchPersist();
  if(window.BW_AUTH) window.BW_AUTH.deleteCatch(id).catch(e => console.error("catch delete sync", e));
  return true;
}

function catchGet(id){
  return USER_CATCHES.find(c => c.id === id) || null;
}

function catchList({species, port, sortBy} = {}){
  let list = USER_CATCHES.slice();
  if(species && species !== "all") list = list.filter(c => c.species === species);
  if(port && port !== "all")       list = list.filter(c => c.port === port);
  if(sortBy === "weight")          list.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  else if(sortBy === "species")    list.sort((a, b) => (a.species || "").localeCompare(b.species || ""));
  else                             list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return list;
}

// Compute simple stats across all catches (used by the catches page).
function catchStats(){
  if(USER_CATCHES.length === 0){
    return {total: 0, bySpecies: {}, biggest: null, latest: null};
  }
  const bySpecies = {};
  let biggest = null;
  for(const c of USER_CATCHES){
    bySpecies[c.species] = (bySpecies[c.species] || 0) + 1;
    if(c.weight && (!biggest || c.weight > biggest.weight)) biggest = c;
  }
  return {
    total: USER_CATCHES.length,
    bySpecies,
    biggest,
    latest: USER_CATCHES[0],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CATCH ANALYTICS — mines logged catches for condition patterns.
// Honest about sample size: needs a minimum number of catches before claiming
// a pattern, and surfaces the count behind each insight. Patterns are tallied
// from the same condition fields auto-filled at log time (moon, tide,
// pressure, wind, SST, time of day, season).
// ════════════════════════════════════════════════════════════════════════════
function catchAnalytics(speciesFilter){
  let catches = USER_CATCHES.slice();
  if(speciesFilter && speciesFilter !== "all"){
    catches = catches.filter(c => c.species === speciesFilter);
  }
  const n = catches.length;
  const MIN = 5;  // below this, we don't claim patterns
  if(n < MIN){
    return { enough:false, n, need:MIN };
  }

  // Tally helper — counts occurrences of a categorical value
  const tally = (fn) => {
    const m = {};
    for(const c of catches){
      const v = fn(c);
      if(v == null || v === "") continue;
      m[v] = (m[v] || 0) + 1;
    }
    return m;
  };
  // Returns the top entry of a tally as {value, count, pct}
  const topOf = (m) => {
    let best = null, total = 0;
    for(const k in m){ total += m[k]; if(!best || m[k] > best[1]) best = [k, m[k]]; }
    if(!best) return null;
    return { value: best[0], count: best[1], pct: Math.round(best[1]/total*100) };
  };

  const hourBucket = (c) => {
    const h = new Date(c.timestamp).getHours();
    if(h < 5)  return "Night (12–5am)";
    if(h < 9)  return "Early AM (5–9am)";
    if(h < 12) return "Late AM (9am–12pm)";
    if(h < 16) return "Afternoon (12–4pm)";
    if(h < 20) return "Evening (4–8pm)";
    return "Night (8pm–12am)";
  };
  const monthSeason = (c) => {
    const m = new Date(c.timestamp).getMonth();
    if(m <= 1 || m === 11) return "Winter";
    if(m <= 4) return "Spring";
    if(m <= 7) return "Summer";
    return "Fall";
  };
  const sstBand = (c) => {
    const s = c.conditions && c.conditions.sst;
    if(s == null) return null;
    const lo = Math.floor(s/5)*5;
    return `${lo}–${lo+5}°F`;
  };
  const windOctant = (c) => {
    const d = c.conditions && c.conditions.windDir;
    if(d == null) return null;
    const dirs = ["N","NE","E","SE","S","SW","W","NW"];
    return dirs[Math.round(d/45) % 8] + " wind";
  };

  // Build candidate insights with their supporting tallies
  const insights = [];
  const push = (label, top, icon) => {
    if(top && top.count >= 2 && top.pct >= 34){
      insights.push({ label, value: top.value, count: top.count, pct: top.pct, icon });
    }
  };
  push("Best moon phase",   topOf(tally(c => c.conditions && c.conditions.moon)),         "🌙");
  push("Best tide",         topOf(tally(c => c.conditions && c.conditions.tide)),         "🌊");
  push("Best pressure",     topOf(tally(c => c.conditions && c.conditions.pressureTrend)),"📊");
  push("Best wind",         topOf(tally(windOctant)),                                     "💨");
  push("Best water temp",   topOf(tally(sstBand)),                                        "🌡️");
  push("Best time of day",  topOf(tally(hourBucket)),                                     "🕐");
  push("Best season",       topOf(tally(monthSeason)),                                    "📅");

  // Productive species + port summaries
  const bySpecies = tally(c => c.species);
  const topSp = topOf(bySpecies);
  const byPort = tally(c => (c.port || "").split(",")[0]);
  const topPort = topOf(byPort);

  // Sort insights by strength (pct desc, then count desc)
  insights.sort((a,b) => b.pct - a.pct || b.count - a.count);

  return {
    enough: true,
    n,
    insights,
    topSpecies: topSp ? {
      value: (SPECIES.find(s=>s.id===topSp.value)||{name:topSp.value}).name,
      count: topSp.count
    } : null,
    topPort,
  };
}

// Share a logged catch to the community forum as a REAL first-party report.
// De-identified by the backend (public view shows only a hashed handle + rounded
// coords). The author keeps the report id on the catch so it can be un-shared.
async function catchShareAsReport(entry){
  try {
    if(!(window.BW_AUTH && window.BW_AUTH.postReport)) return;
    const region = (typeof regionFor === "function") ? regionFor(entry.lat, entry.lng) : null;
    if(!region) return;  // can't place it on the coast → don't post a region-less report
    const sp = (typeof SPECIES !== "undefined") ? SPECIES.find(s => s.id === entry.species) : null;
    const spName = sp ? sp.name : entry.species;
    const sizeText = entry.weight ? ` ${entry.weight} lb` : entry.length ? ` ${entry.length}"` : "";
    const noteText = entry.notes ? ` ${entry.notes.slice(0, 160)}` : "";
    const body = `Caught${sizeText} ${spName}.${noteText}`.trim();
    const res = await window.BW_AUTH.postReport({
      region, species: entry.species || null,
      lat: (entry.lat == null ? null : entry.lat),
      lng: (entry.lng == null ? null : entry.lng),
      body,
    });
    if(res && res.id){
      entry._reportId = res.id;
      const c = (typeof USER_CATCHES !== "undefined") ? USER_CATCHES.find(x => x.id === entry.id) : null;
      if(c){ c._reportId = res.id; if(typeof catchPersist === "function") catchPersist();
        if(window.BW_AUTH && window.BW_AUTH.saveCatch) window.BW_AUTH.saveCatch(c).catch(()=>{}); }
    }
    if(typeof loadReports === "function") loadReports();
  } catch(e){ console.warn("share catch as report", e); }
}

// Reverse the share — delete the community report this catch created.
async function catchUnshare(catchId){
  try {
    const c = (typeof USER_CATCHES !== "undefined") ? USER_CATCHES.find(x => x.id === catchId) : null;
    if(c && c._reportId && window.BW_AUTH && window.BW_AUTH.deleteReport){
      await window.BW_AUTH.deleteReport(c._reportId);
      c._reportId = null;
      if(typeof catchPersist === "function") catchPersist();
      if(typeof loadReports === "function") loadReports();
    }
  } catch(e){ console.warn("unshare catch", e); }
}

// Downscale a photo file to a reasonable size for in-memory storage.
// Returns a Promise resolving to a base64 data URI (max ~800px on long edge).
function catchPhotoFromFile(file){
  return new Promise((resolve, reject) => {
    if(!file || !file.type.startsWith("image/")) { resolve(null); return; }
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if(w > MAX || h > MAX){
          const s = Math.min(MAX / w, MAX / h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch(err){ resolve(null); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ──────────────────────────────────────────────────────────────────────────
// SCALE BAR — auto-scales nm/km based on current zoom & latitude.
// Picks a round distance that fits within ~100px on screen.
// ──────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────
// OCEAN OVERLAY LEGEND
// Shows color-scale legends for SST and/or chlorophyll when those layers
// are toggled on. Hidden when both are off. Built dynamically based on
// which layers are currently active.
// ──────────────────────────────────────────────────────────────────────────
let oceanLegendExpanded = false;
let _oceanLegendDetailHtml = "";

function toggleMapTimePill(btn){
  const pill = btn && btn.closest ? btn.closest(".map-time-pill") : null;
  if(!pill) return;
  const opening = !pill.classList.contains("map-time-pill--open");
  // One expanded pill at a time on phones — keeps the bottom stack short.
  if(opening && typeof isPhoneView === "function" && isPhoneView()){
    document.querySelectorAll(".map-time-pill--open").forEach(p => {
      if(p !== pill){
        p.classList.remove("map-time-pill--open");
        const b = p.querySelector(".map-time-pill-expand");
        if(b) b.textContent = "▾";
      }
    });
  }
  pill.classList.toggle("map-time-pill--open");
  btn.textContent = pill.classList.contains("map-time-pill--open") ? "▴" : "▾";
  if(typeof restackBottomControls === "function") restackBottomControls();
}

function openOceanLegendSheet(){
  const sheet = document.getElementById("ocean-legend-sheet");
  const body = document.getElementById("ocean-legend-sheet-body");
  if(!sheet || !body) return;
  body.innerHTML = _oceanLegendDetailHtml ||
    '<div style="color:#9ec5e8;font-size:13px">No extra details for the active layers.</div>';
  sheet.classList.add("open");
  oceanLegendExpanded = true;
  setMapInteractionLocked(true);
}
function closeOceanLegendSheet(){
  const sheet = document.getElementById("ocean-legend-sheet");
  if(sheet) sheet.classList.remove("open");
  oceanLegendExpanded = false;
  setMapInteractionLocked(false);
}
// Freeze Leaflet pan/zoom while a modal sheet covers the map (legend detail, etc.).
function setMapInteractionLocked(locked){
  document.body.classList.toggle("ocean-legend-sheet-open", !!locked);
  if(locked) document.body.style.overflow = "hidden";
  else document.body.style.overflow = "";
  if(typeof MAP === "undefined" || !MAP) return;
  const toggles = ["dragging","touchZoom","doubleClickZoom","boxZoom","keyboard"];
  for(const key of toggles){
    if(MAP[key]){
      try { locked ? MAP[key].disable() : MAP[key].enable(); } catch(e){}
    }
  }
}
function syncOceanLegendSheet(){
  const sheet = document.getElementById("ocean-legend-sheet");
  const body = document.getElementById("ocean-legend-sheet-body");
  if(!sheet || !body || !sheet.classList.contains("open")) return;
  body.innerHTML = _oceanLegendDetailHtml ||
    '<div style="color:#9ec5e8;font-size:13px">No extra details for the active layers.</div>';
}

function toggleOceanLegendDetail(){
  if(typeof isPhoneView === "function" && isPhoneView()){
    const sheet = document.getElementById("ocean-legend-sheet");
    if(sheet && sheet.classList.contains("open")) closeOceanLegendSheet();
    else openOceanLegendSheet();
    return;
  }
  oceanLegendExpanded = !oceanLegendExpanded;
  updateOceanLegend();
}
function oceanLegendMaxHeightPx(){
  const mapH = (MAP && MAP.getSize) ? MAP.getSize().y : (window.innerHeight || 600);
  const topInset = layerVis.predict ? 70 : 10;
  const phone = isPhoneView();
  let bottomReserve = phone ? 28 : 12;
  const stackIds = ["sat-date-control", "alti-date-control", "radar-loop-control", "wind-forecast-slider"];
  for(const id of stackIds){
    const el = document.getElementById(id);
    if(el && el.style.display && el.style.display !== "none"){
      bottomReserve += (el.offsetHeight || 56) + 8;
    }
  }
  if(phone) bottomReserve += 20;
  return Math.max(100, mapH - topInset - bottomReserve);
}
function updateOceanLegend(){
  if(typeof updateMobileLayerMode === "function") updateMobileLayerMode();
  const el = document.getElementById("ocean-legend");
  const content = document.getElementById("ocean-legend-content");
  if(!el || !content) return;
  if(!layerVis.sst && !layerVis.chlor && !layerVis.wind && !layerVis.radar && !layerVis.currents && !layerVis.altimetry){
    el.style.display = "none";
    if(typeof closeOceanLegendSheet === "function") closeOceanLegendSheet();
    updateBiteBanner();
    return;
  }
  const parts = [];
  const gap = () => parts.length ? 'margin-top:6px' : '';
  const phone = (typeof isPhoneView === "function") && isPhoneView();
  _oceanLegendDetailHtml = "";
  // Verbose bullet explanations are collapsed by default so the panel doesn't
  // run down the middle of the map. On phones, detail opens in a bottom sheet.
  let _hasDetail = false;
  const detail = (html) => {
    _hasDetail = true;
    if(phone){
      _oceanLegendDetailHtml += html;
      return "";
    }
    return `<div class="legend-detail" style="display:${oceanLegendExpanded?'block':'none'}">${html}</div>`;
  };
  // NOTE: the bite-score legend is rendered as a slim banner across the top of
  // the map (see updateBiteBanner), not in this side panel — it was taking up
  // too much room here. This panel now only covers the gradient overlays.
  if(layerVis.sst){
    const sstTitle = oceanOverlayForecastHour() > 0
      ? `SST FORECAST (+${oceanOverlayForecastHour()}h)`
      : "SST (°F)";
    parts.push(`
      <div style="${gap()}">
        <div style="font-size:14px;font-weight:700;color:#fbbf24;letter-spacing:.08em;margin-bottom:3px">${sstTitle}</div>
        <div style="height:11px;border-radius:3px;background:linear-gradient(90deg,#082460 0%,#0e5aaa 18%,#28aac8 32%,#5ac878 44%,#dcd232 56%,#ebb028 68%,#eb7823 80%,#be281f 92%,#8c1432 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)"></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#cfe5ff;margin-top:3px;font-weight:600">
          <span>50°</span><span>60°</span><span>68°</span><span>74°</span><span>78°</span><span>82°</span><span>86°+</span>
        </div>
        ${oceanOverlayForecastHour() > 0 ? `<div style="font-size:12px;color:#9ec5e8;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">RTOFS model · ~9 km</div>` : ""}
      </div>`);
  }
  if(layerVis.chlor){
    parts.push(`
      <div style="${gap()}">
        <div style="font-size:14px;font-weight:700;color:#34d399;letter-spacing:.08em;margin-bottom:3px">CHLOROPHYLL</div>
        <div style="height:11px;border-radius:3px;background:linear-gradient(90deg,#0c1c5a 0%,#1246a0 14%,#1482be 28%,#19afaf 40%,#28c878 52%,#a0d22d 64%,#dcc328 76%,#e68c23 88%,#c8461e 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)"></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#cfe5ff;margin-top:3px;font-weight:600">
          <span>0.01</span><span>0.08</span><span>0.18</span><span>0.45</span><span>1.5</span><span>3+</span>
        </div>
        <div style="font-size:12px;color:#9ec5e8;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">mg/m³ · color edge ~0.08–0.3</div>
      </div>`);
  }
  if(layerVis.wind){
    parts.push(`
      <div style="${gap()}">
        <div style="font-size:14px;font-weight:700;color:#7dd3fc;letter-spacing:.08em;margin-bottom:3px">WIND (kt)</div>
        <div style="height:11px;border-radius:3px;background:${(window.BW_WIND && window.BW_WIND.legendGradient) ? window.BW_WIND.legendGradient(40) : 'linear-gradient(90deg,#2870d2,#82e178,#ebe650,#e46e19,#be1a26,#f05ab4)'};box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)"></div>
        <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:12px;color:#cfe5ff;font-weight:600;gap:2px">
          ${[0,5,10,15,20,25,30,35,"40+"].map(v=>`<span style="flex:1;text-align:center;min-width:0;white-space:nowrap">${v}</span>`).join("")}
        </div>
        <div style="font-size:12px;color:#9ec5e8;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${windStatusLabel()}</div>
        ${detail(`<div style="font-size:12px;color:#7aa8c8;margin-top:4px;line-height:1.4"><b style="color:#bfe3f5">GFS/HRRR blend</b> · HRRR 3 km nearshore &lt;48 h · <b style="color:#bfe3f5">tap the map</b> for speed + gusts</div>`)}
      </div>`);
  }
  if(layerVis.currents){
    parts.push(`
      <div style="${gap()}">
        <div style="font-size:14px;font-weight:700;color:#2dd4bf;letter-spacing:.08em;margin-bottom:3px">CURRENT DRIFT (kt)</div>
        <div style="height:11px;border-radius:3px;background:linear-gradient(90deg,#93c5e0 0%,#38bdf8 18%,#2dd4bf 40%,#5eead4 62%,#fbbf24 88%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)"></div>
        <div style="position:relative;height:11px;margin-top:3px;font-size:12px;color:#cfe5ff;font-weight:600">
          ${[0,0.5,1,2,3,4].map((v,i,arr)=>{const pct=v/4*100;const tx=i===0?'0':(i===arr.length-1?'-100%':'-50%');return `<span style="position:absolute;left:${pct}%;transform:translateX(${tx})">${v===4?'4+':v}</span>`;}).join('')}
        </div>
        <div style="font-size:12px;color:#9ec5e8;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${currentStatusLabel()}</div>
        ${detail(`
        <div style="margin-top:6px;display:grid;grid-template-columns:14px 1fr;gap:5px 8px;align-items:start;font-size:13px;color:#cfe5ff;line-height:1.45">
          <span style="justify-self:center;color:#94a3b8;font-size:13px;line-height:1">●</span><span><b style="color:#e2eaf2">Gray/faint</b> — barely moving (&lt;0.5 kt). Negligible drift.</span>
          <span style="justify-self:center;color:#2dd4bf;font-size:13px;line-height:1">●</span><span><b style="color:#99f6e4">Teal</b> — solid current (0.5–2 kt). Note the direction; adjust your drift.</span>
          <span style="justify-self:center;color:#67e8f9;font-size:13px;line-height:1">●</span><span><b style="color:#a5f3fc">Cyan</b> — strong current (2–3 kt). Edges concentrate bait &amp; fish.</span>
          <span style="justify-self:center;color:#fbbf24;font-size:13px;line-height:1">●</span><span><b style="color:#fde68a">Amber</b> — Gulf Stream core (3+ kt). Fish the western edge, not the core.</span>
        </div>
        <div style="font-size:13px;color:#7aa8c8;margin-top:7px;line-height:1.45"><b style="color:#2dd4bf">Tip:</b> streaks show where the water is going (set). The edges between fast and slow water hold the most fish — same as a rip line.</div>`)}
      </div>`);
  }
  if(layerVis.altimetry){
    const loading = ALTIMETRY_STATUS === "loading" || (!ALTIMETRY_GRID && ALTIMETRY_STATUS !== "unavailable");
    const altiDate = (typeof altiDateLabel === "function")
      ? altiDateLabel()
      : (ALTIMETRY_GRID&&ALTIMETRY_GRID.observedAtMs
        ? new Date(ALTIMETRY_GRID.observedAtMs).toLocaleDateString("en-US",{month:"short",day:"numeric"})
        : "—");
    const statusRow = loading
      ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#f0abfc;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em"><span class="alti-spinner"></span>Loading convergence data…</div>`
      : (ALTIMETRY_STATUS==="unavailable"
        ? `<div style="font-size:12px;color:#f8a5a5;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Convergence data unavailable</div>`
        : `<div style="font-size:12px;color:#9ec5e8;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">NOAA SSH · ${altiDate}</div>`);
    const altiPort = (typeof activePort!=="undefined"&&activePort&&PORTS[activePort]) ? activePort.split(",")[0] : null;
    const altiRangeNm = altiBreakRadiusForActivePort();
    const altiRangeNote = altiPort
      ? `within <b style="color:#e8f4ff">${altiRangeNm} nm</b> of <b style="color:#e8f4ff">${altiPort}</b>`
      : `within <b style="color:#e8f4ff">${altiRangeNm} nm</b> of your home port <span style="color:#fbbf24">(select a port)</span>`;
    parts.push(`
      <div style="${gap()}">
        <div style="font-size:14px;font-weight:700;color:#e879f9;letter-spacing:.08em;margin-bottom:3px">FRONT CONVERGENCE (SSH)</div>
        <div style="height:11px;border-radius:3px;background:linear-gradient(90deg,#0f288c 0%,#2870dc 22%,#50b4d2 38%,rgba(70,70,90,0.35) 50%,#eb9e28 62%,#dc4620 78%,#a01428 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)"></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#cfe5ff;margin-top:3px;font-weight:600">
          <span>−0.2 m</span><span>Flat</span><span>+0.2 m</span>
        </div>
        ${statusRow}
        ${detail(`
        <div style="font-size:13px;color:#7aa8c8;margin-top:6px;line-height:1.45"><b style="color:#f472b6">Magenta lines mark the 1–3 strongest breaks</b> ${altiRangeNote}. Use the <b style="color:#fbcfe8">${MAP_CONVERGENCE_DATE_LABEL}</b> bar to step day-by-day. Amber arrow = how far a tracked break moved. The bite breakdown labels this signal <b style="color:#fbcfe8">Front convergence</b>.</div>
        <div style="margin-top:7px;display:grid;grid-template-columns:14px 1fr;gap:5px 8px;align-items:start;font-size:13px;color:#cfe5ff;line-height:1.45">
          <span style="justify-self:center;color:#f472b6;font-size:15px;line-height:1">▬</span><span><b style="color:#f9a8d4">Magenta — strongest break(s)</b>. Sharpest SSH edges ${altiRangeNote} (up to 3). Only breaks inside your ${altiRangeNm}-nm fishing range are highlighted.</span>
          <span style="justify-self:center;color:#fbbf24;font-size:13px;line-height:1">↗</span><span><b style="color:#fde68a">Amber arrow</b> — 1-day drift for a <b>tracked</b> break (2–${ALTI_MAX_DRIFT_NM_PER_DAY} nm). No arrow = different feature or moved too far to link.</span>
          <span style="justify-self:center;color:#f87171;font-size:13px;line-height:1">●</span><span><b style="color:#f8b4b4">Red — warm bulge</b> (Gulf Stream, warm-core eddy). Bait &amp; pelagics stack on the edges — not the center.</span>
          <span style="justify-self:center;color:#60a5fa;font-size:13px;line-height:1">●</span><span><b style="color:#bcd6f8">Blue — cool depression</b> (cold-core eddy, upwelling). Nutrient-rich; good for bait and surface feeding.</span>
          <span style="justify-self:center;color:#e8e8ef;font-size:13px;line-height:1">〜</span><span><b style="color:#eef0f6">White contours — equal SSH.</b> Tightly-packed lines = a steep gradient = a temperature/current break.</span>
          <span style="justify-self:center;color:#e8e8ef;font-size:13px;line-height:1">→</span><span><b style="color:#eef0f6">Arrows — geostrophic flow</b> (from the SSH slope, not a direct measurement). Shows eddy rotation; longer = stronger.</span>
        </div>
        <div style="font-size:13px;color:#7aa8c8;margin-top:7px;line-height:1.45">Use the <b style="color:#2dd4bf">Ocean Currents layer</b> for actual drift direction; these arrows show eddy circulation pattern only.</div>`)}
      </div>`);
  }
  if(layerVis.radar){
    parts.push(`
      <div style="${gap()}">
        <div style="font-size:14px;font-weight:700;color:#a855f7;letter-spacing:.08em;margin-bottom:3px">RADAR (dBZ)</div>
        <div style="height:11px;border-radius:3px;background:linear-gradient(90deg,#04e9e7 0%,#019ff4 15%,#0300f4 28%,#02fd02 42%,#01c501 52%,#fdf802 64%,#e5bc00 72%,#fd9500 80%,#fd0000 90%,#d40000 95%,#bc0000 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)"></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#cfe5ff;margin-top:3px;font-weight:600">
          <span>light</span><span>moderate</span><span>heavy</span><span>intense</span>
        </div>
      </div>`);
  }
  // Single toggle controlling every collapsed detail block, so the panel stays
  // compact (scale + status only) until the user asks for the full key.
  if(_hasDetail){
    const toggleLabel = phone
      ? "How to read ▾"
      : (oceanLegendExpanded ? "Hide details ▴" : "How to read ▾");
    parts.push(`
      <button type="button" class="ocean-legend-toggle" onclick="toggleOceanLegendDetail()" style="
        width:100%;margin-top:8px;padding:8px 10px;border-radius:6px;cursor:pointer;pointer-events:auto;
        background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
        color:#bfe3f5;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.06em;
        text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:5px">
        ${toggleLabel}
      </button>`);
  }
  content.innerHTML = parts.join("");
  el.style.display = "block";
  // If the bite-score banner is also showing at the top, push this panel down so
  // they don't overlap; otherwise sit at the normal top inset.
  el.style.top = (layerVis.predict ? (typeof biteBannerHeightPx === "function" ? biteBannerHeightPx() + 10 : 70) : 10) + "px";
  if(phone){
    el.style.maxHeight = "none";
    el.style.overflowY = "visible";
    syncOceanLegendSheet();
  } else {
    // Cap height so the panel scrolls instead of covering bottom map controls.
    el.style.maxHeight = oceanLegendMaxHeightPx() + "px";
    el.style.overflowY = "auto";
  }
  updateBiteBanner();
}

// Show/hide the slim bite-score gradient banner across the top of the map. It
// appears whenever the prediction (bite score) layer is on. The colors and word
// order are fixed in the markup and match the hot=good heat overlay.
function toggleBiteBannerForecast(){
  const b = document.getElementById("bite-banner");
  if(!b) return;
  b.classList.toggle("bite-fc-open");
  const btn = document.getElementById("bite-fc-toggle");
  if(btn) btn.setAttribute("aria-expanded", b.classList.contains("bite-fc-open") ? "true" : "false");
}

function biteBannerHeightPx(){
  if(typeof layerVis === "undefined" || !layerVis.predict) return 0;
  const b = document.getElementById("bite-banner");
  if(b && b.style.display !== "none"){
    const h = b.offsetHeight;
    if(h > 0) return h + 6;
  }
  return (typeof isPhoneView === "function" && isPhoneView()) ? 44 : 56;
}

function updateBiteBanner(){
  const b = document.getElementById("bite-banner");
  if(!b) return;
  b.style.display = layerVis.predict ? "block" : "none";
  if(!layerVis.predict) b.classList.remove("bite-fc-open");
  const fcToggleLbl = document.getElementById("bite-fc-toggle-label");
  if(fcToggleLbl){
    fcToggleLbl.textContent = FORECAST_HOUR_OFFSET === 0
      ? "Now"
      : (typeof biteForecastTimeLabel === "function" ? biteForecastTimeLabel() : `+${FORECAST_HOUR_OFFSET}h`);
  }
  const fc = document.getElementById("bite-banner-forecast");
  if(fc){
    if(layerVis.predict){
      const pills = FORECAST_OPTIONS.map(opt => {
        const active = opt.hours === FORECAST_HOUR_OFFSET;
        return `<button type="button" class="fc-mark${active ? " active" : ""}" onclick="setForecastHour(${opt.hours})">${opt.short}</button>`;
      }).join("");
      const windHint = windBiteTimeMismatchHtml();
      fc.innerHTML = `
        <div class="bite-fc-head" style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1)">
          <span style="font-size:9px;color:#6bbfea;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Forecast</span>
          <span style="font-size:10px;color:#cfe5ff;font-weight:600">${forecastTimeDisplay()}</span>
        </div>
        <div class="bite-fc-pills" style="display:flex;gap:4px;margin-top:4px">${pills}</div>
        ${FORECAST_HOUR_OFFSET > 0 ? `<div class="bite-fc-disclaimer" style="margin-top:4px;font-size:9px;color:#9ec5e8;line-height:1.35">${forecastOceanFieldsDisclaimer()}</div>` : ""}
        ${windHint ? `<div class="bite-fc-wind-hint">${windHint}</div>` : ""}
      `;
    } else {
      fc.innerHTML = "";
    }
  }
  updateWindBiteSyncHints();
  const expl = document.getElementById("predict-explainer");
  if(expl && typeof viewportPanelTopPx === "function"){
    const top = viewportPanelTopPx(8);
    const bottom = 14;
    expl.style.top = top + "px";
    expl.style.maxHeight = `calc(100dvh - ${top + bottom}px)`;
  }
}

function updateScaleBar(){
  const el = document.getElementById("map-scale-bar");
  if(!el || !MAP) return;
  // meters per pixel at the current map center latitude/zoom
  const center = MAP.getCenter();
  const point1 = MAP.project(center, MAP.getZoom());
  const point2 = L.point(point1.x + 100, point1.y);
  const latLng2 = MAP.unproject(point2, MAP.getZoom());
  const metersPer100px = center.distanceTo(latLng2);
  // Convert to nautical miles per 100px (1 nm = 1852 m)
  const nmPer100px = metersPer100px / 1852;
  // Pick a "nice" round nm value (1-2-5 series) that fits within 100px
  const niceValues = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let chosenNm = niceValues[0];
  for(const v of niceValues){
    if(v <= nmPer100px) chosenNm = v;
    else break;
  }
  // Compute actual pixel width for this distance
  const pixelWidth = (chosenNm / nmPer100px) * 100;
  // Format label
  const fmtNm = chosenNm < 1 ? chosenNm.toFixed(1) : (chosenNm % 1 === 0 ? chosenNm.toFixed(0) : chosenNm.toFixed(1));
  // Update DOM
  const fill = document.getElementById("scale-bar-fill");
  const lblNm = document.getElementById("scale-bar-label-nm");
  if(fill) fill.style.width = pixelWidth + "px";
  if(lblNm) lblNm.textContent = `${fmtNm} nm`;
  // Track width matches the measuring line
  const track = document.getElementById("scale-bar-track");
  if(track) track.style.minWidth = pixelWidth + "px";
}

// ════════════════════════════════════════════════════════════════════════════
// RULER / DISTANCE TOOL
//
// Tap the ruler icon → enters measurement mode (icon turns red).
// Subsequent clicks on the map drop waypoints connected by a polyline.
// Readout pill shows running total in nautical miles.
// Click the ruler icon again, or tap Clear, to exit measurement mode.
//
// Distance is calculated using the haversine formula (great-circle distance
// on a sphere of radius 3440 nm — the Earth's average radius in nm).
// ════════════════════════════════════════════════════════════════════════════
let rulerActive = false;
let rulerPoints = [];         // array of {lat, lng}
let rulerLayer = null;        // Leaflet feature group holding polyline + markers
let rulerClickHandler = null; // bound click handler so we can remove it
let _rulerPopupBlocker = null;// popupopen handler active only while measuring
let _rulerLastPt = null;      // {lat,lng,t} — for one-tap-one-point dedup

// Great-circle distance between two lat/lng points in nautical miles.
// Object-based signature (takes {lat, lng} points). Distinct from the
// existing 4-arg `nmBetween(lat1, lng1, lat2, lng2)` used elsewhere — both
// coexist; this one is just more convenient for the ruler's point arrays.
function nmBetweenPts(p1, p2){
  const R_NM = 3440.065;  // Earth radius in nautical miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const a = Math.sin(dLat/2)**2 +
            Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_NM * c;
}

function toggleRuler(){
  if(rulerActive){
    rulerDeactivate();
  } else {
    rulerActivate();
  }
}

// When the ruler is armed, map marker clicks add measurement points instead of
// opening forecast popups, bite explainers, or other layer UI.
function rulerHandleMarkerClick(e, lat, lng){
  if(!rulerActive) return false;
  if(e && typeof L !== "undefined" && L.DomEvent){
    L.DomEvent.stop(e);
  }
  if(typeof MAP !== "undefined" && MAP && MAP.closePopup) MAP.closePopup();
  if(document.getElementById("predict-explainer") && typeof closeExplainer === "function") closeExplainer();
  rulerAddPoint({lat, lng});
  return true;
}

function bindRulerMarkerClick(layer, lat, lng){
  if(!layer || !layer.on) return;
  layer.on("click", (e) => {
    if(rulerHandleMarkerClick(e, lat, lng)) return;
  });
}

function rulerActivate(){
  // Only one map-click tool at a time — disarm the drop-waypoint tool if on.
  if(typeof wpDropMode !== "undefined" && wpDropMode && typeof wpDropDeactivate === "function") wpDropDeactivate();
  rulerActive = true;
  if(typeof MAP !== "undefined" && MAP && MAP.closePopup) MAP.closePopup();
  if(document.getElementById("predict-explainer") && typeof closeExplainer === "function") closeExplainer();
  document.getElementById("ruler-toggle").classList.add("active");
  document.getElementById("ruler-readout").classList.add("active");
  document.getElementById("ruler-total").textContent = "Tap map to measure";
  // Change map cursor so users know they can click to add points
  if(MAP && MAP.getContainer){
    MAP.getContainer().style.cursor = "crosshair";
    MAP.getContainer().classList.add("ruler-mode");
  }
  if(MAP && typeof _predictTooltip !== "undefined" && _predictTooltip){
    MAP.closeTooltip(_predictTooltip);
  }
  // Attach click handler
  if(MAP){
    rulerClickHandler = e => rulerAddPoint(e.latlng);
    MAP.on("click", rulerClickHandler);
    // Taps on spot markers (waypoints, canyons, ports) normally open a popup,
    // which auto-pans the map and hides the point that was just dropped — so on
    // phones it looked like the tap "did nothing." While measuring, swallow the
    // popup and snap a measurement point to the marker's exact coordinates,
    // which also makes spot-to-spot distances precise. Dedup in rulerAddPoint
    // keeps a single tap from counting twice when the marker's own click
    // handler already added the point.
    _rulerPopupBlocker = (ev) => {
      const ll = (ev.popup && ev.popup.getLatLng) ? ev.popup.getLatLng() : null;
      MAP.closePopup();
      if(ll) rulerAddPoint(ll);
    };
    MAP.on("popupopen", _rulerPopupBlocker);
  }
}

function rulerDeactivate(){
  rulerActive = false;
  document.getElementById("ruler-toggle").classList.remove("active");
  document.getElementById("ruler-readout").classList.remove("active");
  if(MAP && MAP.getContainer){
    MAP.getContainer().style.cursor = "";
    MAP.getContainer().classList.remove("ruler-mode");
  }
  if(MAP && rulerClickHandler){
    MAP.off("click", rulerClickHandler);
    rulerClickHandler = null;
  }
  if(MAP && _rulerPopupBlocker){
    MAP.off("popupopen", _rulerPopupBlocker);
    _rulerPopupBlocker = null;
  }
  _rulerLastPt = null;
  rulerClear();
}

function rulerClear(){
  rulerPoints = [];
  if(rulerLayer && MAP){
    MAP.removeLayer(rulerLayer);
    rulerLayer = null;
  }
  document.getElementById("ruler-total").textContent = rulerActive ? "Tap map to measure" : "0.0 nm";
}

function rulerAddPoint(latlng){
  if(!rulerActive || !MAP) return;
  const lat = latlng.lat, lng = latlng.lng;
  // One tap = one point. A tap on a popup marker can arrive twice (the marker's
  // own click handler AND the popup-suppression handler) with identical coords;
  // drop the duplicate if it lands within a short window.
  const now = Date.now();
  if(_rulerLastPt &&
     Math.abs(_rulerLastPt.lat - lat) < 1e-7 &&
     Math.abs(_rulerLastPt.lng - lng) < 1e-7 &&
     (now - _rulerLastPt.t) < 900){
    return;
  }
  _rulerLastPt = {lat, lng, t: now};
  rulerPoints.push({lat, lng});
  rulerRedraw();
}

function rulerRedraw(){
  if(!MAP) return;
  // Remove old layer and rebuild
  if(rulerLayer){
    MAP.removeLayer(rulerLayer);
    rulerLayer = null;
  }
  if(rulerPoints.length === 0) return;

  const fg = L.featureGroup();

  // Polyline connecting all points
  if(rulerPoints.length >= 2){
    const latlngs = rulerPoints.map(p => [p.lat, p.lng]);
    L.polyline(latlngs, {
      color: "#dc2626",
      weight: 3,
      opacity: 0.95,
      dashArray: "8 6",
      interactive: false,
    }).addTo(fg);
  }

  // Compute cumulative distance and place a label at each segment midpoint
  let totalNm = 0;
  for(let i = 0; i < rulerPoints.length; i++){
    const p = rulerPoints[i];

    // Numbered waypoint marker
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: "ruler-wpt",
        html: `<div style="
          width:22px;height:22px;border-radius:50%;
          background:#dc2626;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;
          border:2px solid #fff;
          box-shadow:0 1px 4px rgba(0,0,0,.5);
        ">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(fg);

    // Segment distance label
    if(i > 0){
      const prev = rulerPoints[i - 1];
      const segNm = nmBetweenPts(prev, p);
      totalNm += segNm;
      const midLat = (prev.lat + p.lat) / 2;
      const midLng = (prev.lng + p.lng) / 2;
      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "ruler-seg-label",
          html: `<div style="
            background:rgba(10,22,40,.92);
            color:#f0e8d0;
            padding:2px 8px;border-radius:10px;
            font-size:11px;font-weight:700;
            border:1px solid rgba(220,38,38,.6);
            white-space:nowrap;
            box-shadow:0 1px 3px rgba(0,0,0,.5);
            font-family:'Segoe UI',Arial,sans-serif;
          ">${segNm.toFixed(2)} nm</div>`,
          iconSize: [60, 20],
          iconAnchor: [30, 10],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(fg);
    }
  }

  rulerLayer = fg;
  rulerLayer.addTo(MAP);

  // Update readout
  const lbl = document.getElementById("ruler-total");
  if(rulerPoints.length < 2){
    lbl.textContent = "Tap another point";
  } else {
    lbl.textContent = `Total: ${totalNm.toFixed(2)} nm`;
  }
}

function switchBase(val){
  // Remove all base layers
  [satelliteLayer,satelliteLabelsLayer,osmLayer,esriOceanLayer].forEach(l=>{
    if(l && MAP.hasLayer(l)) MAP.removeLayer(l);
  });
  // Add the selected one
  if(val==="satellite"){
    satelliteLayer.addTo(MAP);
    satelliteLabelsLayer.addTo(MAP);
  } else if(val==="ocean") {
    esriOceanLayer.addTo(MAP);
  } else {
    osmLayer.addTo(MAP);
  }
  // Auto-close the basemap modal after a selection so the user sees the
  // new map immediately. Short delay lets the radio animation finish.
  const m = document.getElementById("basemap-modal");
  if(m && m.classList.contains("open")){
    setTimeout(() => m.classList.remove("open"), 180);
  }
}

function updateLegend(){
  // No-op: the species legend pill was removed because the active species
  // is already shown in the TARGET SPECIES card in the header banner.
  // Kept as an empty function so existing callers don't need surgery.
}

// ════════════════════════════════════════════════════════════════════════════
// MAP CLICK — DROP PIN
// ════════════════════════════════════════════════════════════════════════════
function onMapClick(e){
  if(typeof rulerActive !== "undefined" && rulerActive) return;
  // Per UX spec: nothing should happen when tapping open water on the map.
  // All useful detail is delivered via the hotspot popup, which is opened by
  // tapping a heat cell or top-3 badge (those have their own click handlers).
  // Tapping a port or canyon marker is also already handled by those layers.
  // So a tap on EMPTY water should be a no-op — no pin, no panel, no errors.
  //
  // We still capture the location into pinLL because some legacy code paths
  // (Brief generator, Reports filter) read from it. But we do nothing else.
  const {lat, lng} = e.latlng;
  pinLL = {lat, lng};

  // DROP-WAYPOINT MODE: when the drop tool is armed, a tap on the map opens a
  // coordinate popup with a "Save to My Waypoints" action. We disarm on the
  // NEXT tick (not synchronously) so the other click handlers registered on the
  // map — notably the heat-map explainer — stay suppressed for THIS click.
  if(typeof wpDropMode !== "undefined" && wpDropMode){
    wpShowDropPopup(lat, lng);
    setTimeout(wpDropDeactivate, 0);
  }
}

// ── DROP-A-WAYPOINT TOOL ─────────────────────────────────────────────────────
// A deliberate "mark this spot" mode: arm it from the map toolbar, then tap the
// chart (e.g. on a specific edge of the SST/chlorophyll imagery) to see the
// exact latitude/longitude and optionally save it to My Waypoints. Kept as an
// explicit mode so a normal tap on the map stays a no-op and never fights the
// heat-map hotspot explainer.
let wpDropMode = false;
function toggleWpDrop(){
  if(wpDropMode) wpDropDeactivate();
  else wpDropActivate();
}
function wpDropActivate(){
  // Don't run two map-click tools at once — turn the ruler off if it's on.
  if(typeof rulerActive !== "undefined" && rulerActive && typeof rulerDeactivate === "function") rulerDeactivate();
  wpDropMode = true;
  const btn = document.getElementById("wpdrop-toggle"); if(btn) btn.classList.add("active");
  const hint = document.getElementById("wpdrop-hint"); if(hint) hint.classList.add("active");
  if(typeof MAP !== "undefined" && MAP && MAP.getContainer) MAP.getContainer().style.cursor = "crosshair";
}
function wpDropDeactivate(){
  wpDropMode = false;
  const btn = document.getElementById("wpdrop-toggle"); if(btn) btn.classList.remove("active");
  const hint = document.getElementById("wpdrop-hint"); if(hint) hint.classList.remove("active");
  if(typeof MAP !== "undefined" && MAP && MAP.getContainer) MAP.getContainer().style.cursor = "";
}

// Format a lat/lng pair for display in both decimal degrees and the
// degrees-decimal-minutes chartplotters use (e.g. 32°43.380'N  117°10.440'W).
function bwiFormatLatLng(lat, lng){
  const dec = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? "E" : "W"}`;
  const dm = (v, pos, neg) => {
    const hemi = v >= 0 ? pos : neg;
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = (a - d) * 60;
    return `${d}°${m.toFixed(3)}'${hemi}`;
  };
  const dms = `${dm(lat, "N", "S")}  ${dm(lng, "E", "W")}`;
  return { dec, dms };
}

// Coordinate popup opened by the drop tool. Shows the tapped position and lets
// the user save it (opens the waypoint editor prefilled) or pull a forecast.
function wpShowDropPopup(lat, lng){
  if(typeof MAP === "undefined" || !MAP) return;
  const { dec, dms } = bwiFormatLatLng(lat, lng);
  let depthLine = "";
  try {
    if(typeof realDepthAt === "function"){
      const m = realDepthAt(lat, lng);
      if(m != null && m > 0) depthLine = `<div style="font-size:12px;color:#9ec5e8;margin-top:2px">Depth ~${Math.round(m * 3.281)} ft</div>`;
    }
  } catch(e){}
  const html =
    `<div style="text-align:center;font-family:'Segoe UI',Arial,sans-serif;min-width:190px">
      <div style="font-weight:700;color:#f0f6ff;font-size:13px;margin-bottom:4px;padding:0 16px">Dropped Waypoint</div>
      <div style="font-size:13px;color:#e8f4ff;font-weight:600">${dms}</div>
      <div style="font-size:11px;color:#9ec5e8;margin-top:2px">${dec}</div>
      ${depthLine}
      <button onclick="wpCreateAt(${lat},${lng})" style="
        width:100%;background:#0ea5a5;color:#fff;border:none;border-radius:8px;
        padding:9px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
        display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        Save to My Waypoints
      </button>
      <button onclick="showForecast(${lat},${lng},'Dropped waypoint')" style="
        width:100%;background:#2979b5;color:#fff;border:none;border-radius:8px;
        padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;
        margin-top:6px">6-Day Forecast</button>
    </div>`;
  L.popup({ offset:[0,-4], className:"wp-fc-popup", maxWidth:280, closeButton:true })
    .setLatLng([lat, lng])
    .setContent(html)
    .openOn(MAP);
}

// Open the waypoint editor prefilled with a tapped/dropped location so the user
// can name it and save it into My Waypoints (persists locally + syncs to their
// account via BW_AUTH, exactly like a manually-added waypoint).
function wpCreateAt(lat, lng){
  if(typeof MAP !== "undefined" && MAP) MAP.closePopup();
  if(!WP_state.userPoints.length) WP_state.userPoints = wpLoadUser();
  let depth = "";
  try {
    if(typeof realDepthAt === "function"){
      const m = realDepthAt(lat, lng);
      if(m != null && m > 0) depth = Math.round(m * 3.281) + "ft";
    }
  } catch(e){}
  let region = "";
  try {
    if(typeof activePort !== "undefined" && activePort && typeof PORTS !== "undefined" && PORTS[activePort]){
      region = PORTS[activePort].short || activePort;
    }
  } catch(e){}
  WP_state.editing = {
    id: "u-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    name: "",
    type: "private",
    sourceType: "reef",
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    depth,
    region,
    desc: "",
  };
  wpShowEditor(true);
}

// ════════════════════════════════════════════════════════════════════════════
// PANEL
// ════════════════════════════════════════════════════════════════════════════
// pbody writes rendered HTML into whichever container is currently the "active
// detail view" — the hotspot popup's sub-panel. The sub-panel uses a dark
// background, so wrap content in a CSS adapter that recolors the cream-themed
// panel components (.wx-card, .zcard, info-box, etc.) for dark backgrounds.
// Weather conditions (water temp, wind, waves, pressure) are sourced ONLY from
// real data via BW_OCEAN.fetchOcean (NDBC buoys + forecast model + ERDDAP).
// The old synthetic calcWx() generator was removed; callers now read real values
// and render "—" / "No data" when a value is unavailable — never synthetic.

// ════════════════════════════════════════════════════════════════════════════
// CANYONS
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// FISHING STRUCTURE — unified layer (canyons + wrecks + reefs + lumps + shoals)
// Controlled by the single "Fishing Spots" toggle (layerVis.spots). Canyons
// are no longer a separate toggle — they're part of this structure set.
// Shows the 15 closest structures to the active/home port, within radius.
// ════════════════════════════════════════════════════════════════════════════

// Per-type icon SVG (drawn inside a rounded badge). Color comes from entry.
function structureIconSvg(type){
  switch(type){
    case "wreck": // tilted boat hull + mast — sunken/listing vessel
      return `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(-18 12 12)"><path d="M4 13 h13 l-2.5 4.5 a3 3 0 0 1 -2.6 1.5 h-3.5 a3 3 0 0 1 -2.6 -1.5 Z" fill="#fff" stroke="none"></path><line x1="10.5" y1="13" x2="10.5" y2="4"></line><path d="M10.5 5 l5 2.2 l-5 2.2 Z" fill="#fff" stroke="none"></path></g></svg>`;
    case "rock": // faceted boulder — angular stone with facet lines
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M5 17 L7 9 L13 6 L19 10 L18 16 L11 19 Z" fill="rgba(255,255,255,.25)"></path><path d="M7 9 L13 12 L19 10"></path><path d="M13 12 L11 19"></path></svg>`;
    case "reef": // coral mounds — bumpy reef silhouette (solid, reads at small size)
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M3 19 L3 14 a3 3 0 0 1 6 0 a3.5 3.5 0 0 1 7 -0.5 a2.6 2.6 0 0 1 5 0.5 L21 19 Z"></path><circle cx="6" cy="11.5" r="1.4"></circle><circle cx="12.5" cy="9.5" r="1.5"></circle><circle cx="18.5" cy="12" r="1.3"></circle></svg>`;
    case "lump": // mound — bottom rise/seamount
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18 Q12 4 21 18"></path><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
    case "shoal": // wavy lines — shallow shoal
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M3 9 Q7 5 11 9 T19 9"></path><path d="M3 15 Q7 11 11 15 T19 15"></path></svg>`;
    case "ledge": // step/ledge profile
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 10 6 10 13 18 13 18 19"></polyline></svg>`;
    case "structure": // generic structure — bracketed frame / artificial structure
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="1.5"></rect><line x1="9.5" y1="5" x2="9.5" y2="19"></line><line x1="14.5" y1="5" x2="14.5" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    case "hole": // depression — concentric ring into a hole
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="8" ry="5"></ellipse><ellipse cx="12" cy="12" rx="3.5" ry="2"></ellipse></svg>`;
    case "hump": // mound rise (like lump) — bottom hump
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18 Q12 5 21 18"></path><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
    case "tower": // tower / light structure
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21 L10 7 h4 L15 21"></path><line x1="7" y1="21" x2="17" y2="21"></line><path d="M10 7 L12 3 L14 7"></path><line x1="9.3" y1="13" x2="14.7" y2="13"></line></svg>`;
    case "platform": // oil/gas platform — deck on legs
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="9" x2="21" y2="9"></line><line x1="7" y1="9" x2="7" y2="20"></line><line x1="17" y1="9" x2="17" y2="20"></line><line x1="12" y1="9" x2="12" y2="4"></line><path d="M9.5 6 L12 4 L14.5 6"></path></svg>`;
    case "canyon":
    default: // nested chevrons — descending canyon walls / depth contours
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 5 12 12 19 5"></polyline><polyline points="5 12 12 19 19 12"></polyline></svg>`;
  }
}

// Animated wind layer instance (created on first enable)
let windLayer = null;
function drawWind(){
  if(layerVis.wind){
    if(!windLayer) windLayer = windParticleLayer();
    if(MAP && !MAP.hasLayer(windLayer)) windLayer.addTo(MAP);
  } else {
    if(windLayer && MAP && MAP.hasLayer(windLayer)) MAP.removeLayer(windLayer);
    if(typeof hideWindReadout === "function") hideWindReadout();
  }
  updateWindForecastSliderVisibility();
  updateOceanLegend();   // show/hide the wind-speed scale in the top legend
}

function drawCanyons(){
  canyonLayers.forEach(l=>MAP.removeLayer(l));canyonLayers=[];
  if(!layerVis.spots)return;  // unified under the Fishing Spots toggle

  // Only show structures once the user has a REAL port context — either an
  // active port selected this session, or a saved default home port. We do
  // NOT use the universal fallback here, so a fresh startup with no selection
  // shows a clean map until the user picks a port.
  let refName = null;
  if(typeof activePort !== "undefined" && activePort && PORTS[activePort]){
    refName = activePort;
  } else if(typeof USER_PREFS !== "undefined" && USER_PREFS.defaultPort && PORTS[USER_PREFS.defaultPort]){
    refName = USER_PREFS.defaultPort;
  }
  if(!refName) return;  // no real port context yet — keep the map clean
  const refPort = PORTS[refName];

  // Candidate structures: point features (exclude closure polygons) within
  // the fishable radius of the reference port — single distance pass.
  const structures = [];
  for(const c of CANYONS){
    if(c.polygon || c.type === "closure") continue;
    const d = nmBetween(refPort.lat, refPort.lng, c.lat, c.lng);
    if(d <= HOME_PORT_RADIUS_NM) structures.push({c, d});
  }
  structures.sort((a, b) => a.d - b.d);
  const nearest = structures.slice(0, 15).map(x => x.c);

  nearest.forEach(c=>{
    const type = c.type || "canyon";
    const typeLabel = {canyon:"Canyon", wreck:"Wreck", reef:"Reef / Live Bottom",
                       lump:"Lump / Seamount", shoal:"Shoal", ledge:"Ledge / Drop",
                       rock:"Rock Pile"}[type] || "Structure";
    // Rocks render in gray so they read instantly as rock; others use their
    // data color (canyons blue, reefs green, lumps teal, etc.).
    const badgeColor = type === "rock" ? "#8a8f98" : c.color;
    const spList=c.fish && c.fish[0]!=="all"
      ?`<div style="font-size:12px;opacity:.85;margin-top:6px"><b>Key species:</b> ${c.fish.map(id=>SPECIES.find(s=>s.id===id)?.name||id).join(", ")}</div>`:"";
    const cSafeName = (c.name || "Spot").replace(/'/g, "\\'");
    // ONE combined bubble: name + type + description + key species + the
    // 6-Day Forecast button, all in a single interactive popup. Previously the
    // description was a hover tooltip and the forecast button was a SEPARATE
    // popup, so on tap both opened and overlapped (see mobile). Now there's just
    // one popup, and the forecast button lives inside it under the description.
    const fcBtn =
      `<button onclick="showForecast(${c.lat},${c.lng},'${cSafeName}')" style="
        margin-top:11px;width:100%;background:#2979b5;color:#fff;border:none;border-radius:9px;
        padding:11px 12px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Segoe UI',Arial,sans-serif;
        display:flex;align-items:center;justify-content:center;gap:7px">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-2A4.5 4.5 0 0 0 6.5 19Z"/><path d="M8 13l-1.5 3M12 13l-1.5 3M16 13l-1.5 3"/></svg>
        6-Day Forecast
      </button>`;
    const combined =
      `<div style="max-width:300px;font-family:Arial,sans-serif">
        <div style="font-weight:bold;font-size:16px;color:${badgeColor};margin-bottom:2px">${c.name}</div>
        <div style="font-size:11px;color:#9ab;letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px">${typeLabel}</div>
        <div style="font-size:13.5px;line-height:1.55;margin:0;padding:0">${c.desc}</div>${spList}${fcBtn}
      </div>`;
    const mk=L.marker([c.lat,c.lng],{
      icon:L.divIcon({
        className:"",
        html:`<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="
            width:26px;height:26px;
            background:${badgeColor};
            cursor:pointer;
            border:2px solid rgba(255,255,255,.92);
            border-radius:8px;
            box-shadow:0 2px 6px rgba(0,0,0,.6);
            display:flex;align-items:center;justify-content:center;
          ">${structureIconSvg(type)}</div>
          <div style="
            background:rgba(8,18,35,.88);
            color:#e8f0ff;
            font-size:14.5px;font-weight:bold;
            font-family:Arial,sans-serif;
            padding:3px 8px;
            line-height:1.3;
            border-radius:4px;
            border:1px solid ${badgeColor}99;
            white-space:nowrap;
            box-shadow:0 1px 4px rgba(0,0,0,.6);
            margin-top:1px;
            pointer-events:none;
          ">${c.name}</div>
        </div>`,
        iconAnchor:[13,-2],
      }),
      zIndexOffset:100,
    }).bindPopup(combined, {offset:[0,-46], className:"wp-fc-popup", maxWidth:320}).addTo(MAP);
    bindRulerMarkerClick(mk, c.lat, c.lng);
    canyonLayers.push(mk);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// CATCH PIN MARKERS
// User's logged catches appear as small fish-icon pins colored by species.
// Tap to see the catch details. Toggleable via the Layers panel.
// ════════════════════════════════════════════════════════════════════════════
function drawCatchPins(){
  catchLayers.forEach(l => MAP.removeLayer(l));
  catchLayers = [];
  if(!layerVis.catches) return;
  if(!USER_CATCHES || USER_CATCHES.length === 0) return;
  USER_CATCHES.forEach(c => {
    const sp = SPECIES.find(s => s.id === c.species);
    const color = sp ? sp.color : "#22c55e";
    const date = new Date(c.timestamp);
    const dateStr = date.toLocaleDateString(undefined, {month:"short", day:"numeric"});
    const sizeText = c.weight ? `${c.weight}lb` : c.length ? `${c.length}"` : "";
    const mk = L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:0;pointer-events:none">
          <div style="
            width:18px;height:18px;
            background:${color};
            border:2.5px solid #fff;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            box-shadow:0 2px 6px rgba(0,0,0,.6);
            display:flex;align-items:center;justify-content:center;
          ">
            <div style="transform:rotate(45deg);font-size:9px;line-height:1">🐟</div>
          </div>
        </div>`,
        iconAnchor: [9, 18],
      }),
      zIndexOffset: 250,
    }).bindTooltip(
      `<div style="max-width:240px;font-family:Arial,sans-serif">
        <div style="font-weight:bold;font-size:14px;color:${color};margin-bottom:3px">${sp ? sp.name : c.species}${sizeText ? " · " + sizeText : ""}</div>
        <div style="font-size:11px;color:#aaa;margin-bottom:5px">${dateStr}${c.port ? " · " + c.port.split(",")[0] : ""}</div>
        ${c.notes ? `<div style="font-size:12px;line-height:1.45;color:#dde8f5">${c.notes.length > 100 ? c.notes.slice(0, 100) + "…" : c.notes}</div>` : ""}
      </div>`,
      {sticky:false, direction:"top", opacity:.97, className:"spot-tt"}
    ).addTo(MAP);
    bindRulerMarkerClick(mk, c.lat, c.lng);
    catchLayers.push(mk);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PORT MARKERS
// ════════════════════════════════════════════════════════════════════════════
function drawPortMarkers(){
  portMarkers.forEach(m=>MAP.removeLayer(m));portMarkers=[];
  if(!layerVis.ports)return;
  // Only highlight a port as "home" if the user has actually selected one.
  // We deliberately don't fall back to getHomePort() here, because that would
  // make Oregon Inlet (our internal dev fallback) appear as if the user had
  // chosen it.
  const home = activePort || null;
  // Don't plot ANY ports until the user has chosen a home port — either the
  // active session port or a saved default from Settings. Plotting the cluster
  // around the dev fallback (Va Beach) on first open is confusing: it looks
  // like those are the only ports, when really none has been selected yet. The
  // Home Port dropdown remains the way to pick one; once chosen, that port and
  // others within HOME_PORT_RADIUS_NM appear.
  const hasChosenPort = !!(home || (typeof USER_PREFS !== "undefined" && USER_PREFS.defaultPort && PORTS[USER_PREFS.defaultPort]));
  if (!hasChosenPort) return;
  Object.entries(PORTS).forEach(([name,p])=>{
    const isH = name === home;
    // Home port is always shown when set (it's the anchor). Other ports
    // only if within the home radius so the chart isn't cluttered with
    // ports across the entire coast.
    if (!isH && !withinHomeRadius(p.lat, p.lng)) return;
    const sz  = isH ? 28 : 20;
    // Anchor badge — gold with black anchor for ALL ports (matches legend).
    // Home port is distinguished by larger size + a bright white ring, not
    // by color, so the harbor symbol stays consistent everywhere.
    const mk = L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          width:${sz}px;height:${sz}px;
          background:linear-gradient(135deg,#f5c842,#e0a020);
          border:${isH ? "2.5px solid #fff" : "1.5px solid rgba(255,255,255,.75)"};
          border-radius:${isH ? "9px" : "7px"};
          box-shadow:${isH ? "0 0 0 2px rgba(245,200,66,.5),0 2px 8px rgba(0,0,0,.6)" : "0 2px 5px rgba(0,0,0,.6)"};
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="${isH ? 16 : 12}" height="${isH ? 16 : 12}" viewBox="0 0 24 24" fill="none" stroke="#3a2600" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="2.2"></circle>
            <line x1="12" y1="7.2" x2="12" y2="21"></line>
            <line x1="7" y1="11" x2="17" y2="11"></line>
            <path d="M5 14a7 7 0 0 0 14 0"></path>
          </svg>
        </div>`,
        iconSize: [sz, sz],
        iconAnchor: [sz/2, sz/2],
      }),
      zIndexOffset: isH ? 400 : 100,
    }).addTo(MAP);

    // Small permanent label only for the HOME port — compact pill
    if (isH) {
      const label = L.tooltip({
        permanent: true,
        direction: "right",
        offset: [9, 0],
        className: "port-label-home",
        opacity: 1,
      })
      .setContent(`<span style="font-weight:600">${p.short}</span>`)
      .setLatLng([p.lat, p.lng]);
      label.addTo(MAP);
      portMarkers.push(label);
    }

    // Combined popup (matches other waypoints): port name + coordinates + a
    // 6-day weather forecast button. Ports previously only had a hover tooltip
    // and no way to pull a forecast, unlike every other marker type.
    const _pLat = p.lat.toFixed(3), _pLng = p.lng.toFixed(3);
    const _pSafeName = (p.short || name || "Port").replace(/'/g, "\\'");
    mk.bindPopup(
      `<div style="text-align:center;font-family:'Segoe UI',Arial,sans-serif;min-width:180px">
        <div style="font-weight:700;color:#f0f6ff;margin-bottom:2px;font-size:15px;padding:0 18px">${p.short || name}</div>
        <div style="font-size:11px;color:#f5c842;margin-bottom:2px;letter-spacing:.04em">${isH ? "HOME PORT" : "PORT"}</div>
        <div style="font-size:10.5px;color:#8fb4d8;margin-bottom:9px">${_pLat}°, ${_pLng}°</div>
        <button onclick="showForecast(${p.lat},${p.lng},'${_pSafeName}')" style="
          width:100%;background:#2979b5;color:#fff;border:none;border-radius:9px;
          padding:11px 12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;
          display:flex;align-items:center;justify-content:center;gap:7px">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-2A4.5 4.5 0 0 0 6.5 19Z"/><path d="M8 13l-1.5 3M12 13l-1.5 3M16 13l-1.5 3"/></svg>
          6-Day Forecast
        </button>
      </div>`,
      {offset:[0,-16], className:"wp-fc-popup", maxWidth:320}
    );

    // Hover/tap tooltip with full name (non-permanent, doesn't clutter)
    mk.bindTooltip(p.short, {
      direction: "right",
      offset: [9, 0],
      className: "port-label-hover",
      opacity: 1,
    });

    bindRulerMarkerClick(mk, p.lat, p.lng);
    portMarkers.push(mk);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// FISHING WAYPOINTS — master dataset (~12.6k points) binned by distance from the
// selected home port. Data is in bw-waypoints.js (built from
// data/Master_Waypoint_Combined_1.csv) as window.BW_WAYPOINTS. We compute distance
// at runtime (12k haversines is trivial)
// rather than pre-binning per port, which keeps the data file minimal.
//
//   • User picks a radius band (20/40/60/100/120/140 nm) → only waypoints within
//     that distance of the active port are drawn.
//   • Type column drives a distinct map icon per type (wreck/reef/rock/…).
//   • GPX export produces a file (port-origin) loadable in any chartplotter.
// ════════════════════════════════════════════════════════════════════════════
let wpLayerGroup = null;                 // single layer group holding waypoint markers (cheaper than N individual adds)
let _wpInRangeCache = null;              // cached in-range list so we don't recompute haversine on every pan
let _wpRedrawBound = false;              // ensure map move/zoom handlers attach once
let _wpMoveTimer = null;
let wpRadiusNm = 40;                     // selected radius band (default 40nm)
let wpTypeFilter = null;                 // null = all types, else Set of type codes
const WP_RADII = [20, 40, 60, 100, 120, 140];

// Per-type visual style: glyph + color. Codes match waypoints.js ("wk" etc).
const WP_TYPE_STYLE = {
  wk: {label:"Wreck",     type:"wreck",     color:"#ef4444"},
  rf: {label:"Reef",      type:"reef",      color:"#22c55e"},
  st: {label:"Structure", type:"structure", color:"#a855f7"},
  ld: {label:"Ledge",     type:"ledge",     color:"#f59e0b"},
  rk: {label:"Rock",      type:"rock",      color:"#8a8f98"},
  hl: {label:"Hole",      type:"hole",      color:"#2dd4bf"},
  hp: {label:"Hump",      type:"hump",      color:"#eab308"},
  cy: {label:"Canyon",    type:"canyon",    color:"#6366f1"},
  tw: {label:"Tower",     type:"tower",     color:"#fb7185"},
  pf: {label:"Platform",  type:"platform",  color:"#f97316"},
  rg: {label:"Rig",       type:"rig",       color:"#14b8a6"},
};

// ── Entitlement / freemium gating ────────────────────────────────────────────
// Charted fishing waypoints: Pro subscribers (trial or paid), lifetime, and
// owners get the full set for their port radius via pack_waypoints_within RPC.
// Free users see none (only their personal waypoints).
const BW_OWNER_EMAILS = ["rnovakwvu@gmail.com", "natalienovakm@gmail.com"];
// BW_PREMIUM = app features (heat map, ocean/wind layers, forecast, etc.) —
//   granted to a 7-day trial, active subscription, or owner.
// BW_PAID    = the AI Captain's Brief — active subscription / owner
//   only (the trial does NOT include the brief).
let BW_PREMIUM = false;
let BW_PAID = false;
let BW_ADMIN = false;
// Premium-gated map layers (everything outside the free baseline).
const BW_PREMIUM_LAYERS = ["predict", "sst", "chlor", "wind", "currents", "altimetry", "radar", "ramps", "loran", "waypoints", "platforms"];

async function refreshEntitlement(){
  let premium = false, paid = false, admin = false;
  try {
    const u = (window.BW_AUTH && window.BW_AUTH.getUser) ? window.BW_AUTH.getUser() : null;
    const email = (u && u.email) ? u.email.toLowerCase() : "";
    if(email && BW_OWNER_EMAILS.includes(email)){
      premium = true; paid = true; admin = true;                     // owner fast-path
    } else if(u && window.BW_AUTH && window.BW_AUTH._sb){
      const { data: p } = await window.BW_AUTH._sb
        .from("profiles").select("is_owner, subscription_status, current_period_end").maybeSingle();
      if(p){
        const st = p.subscription_status;
        const cpe = p.current_period_end ? new Date(p.current_period_end).getTime() : 0;
        if(p.is_owner){ premium = true; paid = true; admin = true; }              // owner: full access
        else if(st === "active"){ premium = true; paid = true; }
        else if(st === "trialing"){ premium = true; paid = false; }   // trial: app yes, brief no
        else if(cpe > Date.now() && st !== "canceled"){ premium = true; paid = true; } // grace period
      }
      if(!admin && email && BW_OWNER_EMAILS.includes(email)) admin = true;
    }
  } catch(e){ premium = false; paid = false; admin = false; }
  BW_PREMIUM = premium; BW_PAID = paid; BW_ADMIN = admin;
  applyAdminNavVisibility();
  applyEntitlementGating();
  if(typeof drawWaypoints === "function" && layerVis.waypoints) drawWaypoints();
  if(typeof renderNavPlan === "function") renderNavPlan();
}
window.refreshEntitlement = refreshEntitlement;

// Gate helpers — call at premium feature entry points. Returns true if allowed,
// otherwise opens the upgrade/trial modal and returns false.
function requirePremium(){ if(BW_PREMIUM) return true; if(typeof openPricing === "function") openPricing(); return false; }
function requirePaid(){ if(BW_PAID) return true; if(typeof openPricing === "function") openPricing(); return false; }

// If access lapses (or never existed), make sure premium map layers aren't left
// on. Free baseline (maps, ports, catches, personal/owned waypoints) stays.
function applyEntitlementGating(){
  applyProMenuBadges();  // always refresh Pro badges (both free and premium)
  if(BW_PREMIUM) return;
  // LORAN is a Pro layer — make sure a free user can't carry a "keep it on by
  // default" preference (e.g. set while subscribed, or from a synced blob) that
  // would auto-enable it. Force the pref off for the unentitled.
  if(typeof USER_PREFS !== "undefined" && USER_PREFS.persistLoran){
    USER_PREFS.persistLoran = false;
    try { if(typeof prefSave === "function") prefSave(); } catch(e){}
  }
  let changed = false;
  for(const k of BW_PREMIUM_LAYERS){
    if(layerVis[k]){
      layerVis[k] = false;
      const c = document.getElementById("chk-" + k); if(c) c.checked = false;
      changed = true;
      try {
        if(k === "predict"){ _predictUserOff = true; if(typeof drawPrediction === "function") drawPrediction(); }
        else if(k === "wind" && typeof drawWind === "function") drawWind();
        else if(k === "currents" && typeof drawCurrents === "function") drawCurrents();
        else if(k === "altimetry" && typeof drawAltimetry === "function") drawAltimetry();
        else if(k === "sst" && typeof MAP !== "undefined" && typeof sstLayer !== "undefined" && sstLayer && MAP.hasLayer(sstLayer)) MAP.removeLayer(sstLayer);
        else if(k === "chlor" && typeof MAP !== "undefined"){
          if(typeof chlorLayer !== "undefined" && chlorLayer && MAP.hasLayer(chlorLayer)) MAP.removeLayer(chlorLayer);
          if(typeof chlorMapLayer !== "undefined" && chlorMapLayer && MAP.hasLayer(chlorMapLayer)) MAP.removeLayer(chlorMapLayer);
        }
        else if(k === "radar"){
          if(typeof MAP !== "undefined" && typeof radarLayer !== "undefined" && radarLayer && MAP.hasLayer(radarLayer)) MAP.removeLayer(radarLayer);
          if(typeof stopRadarLoop === "function") stopRadarLoop();
        }
        else if(k === "platforms" && typeof drawPlatforms === "function") drawPlatforms();
        else if(k === "loran" && typeof drawLoranLines === "function") drawLoranLines();
        else if(k === "ramps" && typeof drawRamps === "function") drawRamps();
        else if(k === "waypoints" && typeof drawWaypoints === "function") drawWaypoints();
      } catch(e){}
    }
  }
  if(changed){
    if(typeof updateOceanLegend === "function") updateOceanLegend();
    if(typeof updateSatDateControlVisibility === "function") updateSatDateControlVisibility();
    if(typeof updateOpacityControl === "function") updateOpacityControl();
    if(typeof updateRadarLoopControlVisibility === "function") updateRadarLoopControlVisibility();
    if(typeof updateAltiDateControlVisibility === "function") updateAltiDateControlVisibility();
  }
}

function applyAdminNavVisibility(){
  const wrap = document.getElementById("nav-admin-wrap");
  if(wrap) wrap.style.display = BW_ADMIN ? "block" : "none";
}

// ════════════════════════════════════════════════════════════════════════════
// OWNER ADMIN — profiles & subscription management (server-gated edge function)
// ════════════════════════════════════════════════════════════════════════════
const _adminState = { q: "", users: [], selectedId: null, offset: 0, limit: 40, stats: null, loading: false };

async function adminApi(body){
  const cfg = window.BW_SUPABASE_CONFIG || window.BW_DATA_CONFIG || {};
  const base = ((cfg.supabaseUrl || cfg.url || "https://mealpzwbjamkjdrsszqe.supabase.co").replace(/\/$/,"")) + "/functions/v1";
  const s = window.BW_AUTH && window.BW_AUTH._sb;
  if(!s) throw new Error("Not ready");
  const { data:{ session } } = await s.auth.getSession();
  if(!session) throw new Error("Sign in required.");
  const res = await fetch(`${base}/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: cfg.supabaseAnonKey || "",
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(j.error || "Admin request failed");
  return j;
}

function adminStatusPill(st, isOwner){
  if(isOwner) return `<span class="admin-pill owner">OWNER</span>`;
  const s = (st || "none").toLowerCase();
  if(s === "active" || s === "lifetime") return `<span class="admin-pill active">${s.toUpperCase()}</span>`;
  if(s === "trialing") return `<span class="admin-pill trial">TRIAL</span>`;
  return `<span class="admin-pill free">${s === "none" ? "FREE" : s.toUpperCase()}</span>`;
}

function adminFmtDate(iso){
  if(!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function adminShowMsg(text, ok){
  const el = document.getElementById("admin-msg");
  if(!el) return;
  if(!text){ el.style.display = "none"; el.textContent = ""; el.className = "admin-msg"; return; }
  el.textContent = text;
  el.className = "admin-msg " + (ok ? "ok" : "err");
  el.style.display = "block";
}

function adminSelectedUser(){
  return _adminState.users.find(u => u.id === _adminState.selectedId) || null;
}

function adminRenderDetail(){
  const el = document.getElementById("admin-detail");
  if(!el) return;
  const u = adminSelectedUser();
  if(!u){
    el.innerHTML = `<div class="admin-empty">Select a user to view and edit their profile.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="admin-form">
      <div style="font-size:13px;font-weight:700;color:#f0f6ff;margin-bottom:4px;word-break:break-all">${escapeHtml(u.email || u.id)}</div>
      <div style="font-size:11px;color:#9ec5e8;margin-bottom:12px;line-height:1.45">
        Joined ${adminFmtDate(u.created_at)} · Last sign-in ${adminFmtDate(u.last_sign_in_at)}<br>
        Briefs today: <b style="color:#7dd3fc">${u.is_owner ? `${u.briefs_today} (unlimited)` : `${u.briefs_today}/2`}</b> · Stripe: ${u.stripe_customer_id ? escapeHtml(u.stripe_customer_id) : "—"}
      </div>
      <div class="admin-actions" style="margin-top:0;margin-bottom:12px">
        <button type="button" class="admin-btn ok" onclick="adminPreset('grant_pro')">Grant Pro (1yr)</button>
        <button type="button" class="admin-btn" onclick="adminPreset('grant_trial')">Grant Trial (7d)</button>
        <button type="button" class="admin-btn" onclick="adminPreset('grant_owner')">Make Owner</button>
        <button type="button" class="admin-btn danger" onclick="adminPreset('revoke')">Revoke Access</button>
      </div>
      <div class="admin-field"><label>Display name</label><input id="admin-f-name" value="${escapeHtml(u.display_name || "")}"></div>
      <div class="admin-field"><label>Home port</label><input id="admin-f-port" value="${escapeHtml(u.home_port || "")}"></div>
      <div class="admin-field"><label>Subscription status</label>
        <select id="admin-f-status">
          ${["none","trialing","active","canceled","lifetime","past_due"].map(s =>
            `<option value="${s}" ${u.subscription_status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="admin-field"><label>Billing interval</label>
        <select id="admin-f-interval">
          <option value="" ${!u.subscription_interval?"selected":""}>—</option>
          <option value="month" ${u.subscription_interval==="month"?"selected":""}>month</option>
          <option value="year" ${u.subscription_interval==="year"?"selected":""}>year</option>
        </select>
      </div>
      <div class="admin-field"><label>Current period end</label><input id="admin-f-cpe" type="datetime-local" value="${u.current_period_end ? new Date(u.current_period_end).toISOString().slice(0,16) : ""}"></div>
      <div class="admin-field"><label>Trial end</label><input id="admin-f-trial" type="datetime-local" value="${u.trial_end ? new Date(u.trial_end).toISOString().slice(0,16) : ""}"></div>
      <div class="admin-field"><label>Stripe customer ID</label><input id="admin-f-stripe" value="${escapeHtml(u.stripe_customer_id || "")}"></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#cfe5ff;margin:8px 0 12px">
        <input type="checkbox" id="admin-f-owner" ${u.is_owner ? "checked" : ""} style="width:16px;height:16px"> Owner account (full access, unlimited briefs)
      </label>
      <div class="admin-actions">
        <button type="button" class="admin-btn ok" onclick="adminSaveUser()">Save changes</button>
      </div>
    </div>`;
}

function adminRenderList(){
  const el = document.getElementById("admin-user-list");
  if(!el) return;
  if(_adminState.loading){
    el.innerHTML = `<div class="admin-empty">Loading users…</div>`;
    return;
  }
  if(!_adminState.users.length){
    el.innerHTML = `<div class="admin-empty">No users found.</div>`;
    return;
  }
  el.innerHTML = _adminState.users.map(u => `
    <div class="admin-user-row ${_adminState.selectedId===u.id?"sel":""}" onclick="adminSelectUser('${u.id}')">
      <div style="flex:1;min-width:0">
        <div class="admin-user-email">${escapeHtml(u.email || u.id)}</div>
        <div class="admin-user-meta">
          ${adminStatusPill(u.subscription_status, u.is_owner)}
          ${u.subscription_interval ? `<span>${u.subscription_interval}</span> · ` : ""}
          ${u.display_name ? escapeHtml(u.display_name) + " · " : ""}
          ${u.is_owner ? `briefs ${u.briefs_today} (unlimited) · ` : `briefs ${u.briefs_today}/2 · `}
        </div>
      </div>
    </div>`).join("");
}

function adminRenderStats(){
  const el = document.getElementById("admin-stats");
  const s = _adminState.stats;
  if(!el || !s) return;
  el.innerHTML = `
    <div class="admin-stat"><div class="admin-stat-val">${s.total_auth_users ?? "—"}</div><div class="admin-stat-lbl">Auth users</div></div>
    <div class="admin-stat"><div class="admin-stat-val">${s.active ?? 0}</div><div class="admin-stat-lbl">Active Pro</div></div>
    <div class="admin-stat"><div class="admin-stat-val">${s.trialing ?? 0}</div><div class="admin-stat-lbl">Trialing</div></div>
    <div class="admin-stat"><div class="admin-stat-val">${s.free ?? 0}</div><div class="admin-stat-lbl">Free</div></div>
    <div class="admin-stat"><div class="admin-stat-val">${s.owners ?? 0}</div><div class="admin-stat-lbl">Owners</div></div>`;
}

async function adminLoadUsers(resetOffset){
  if(resetOffset) _adminState.offset = 0;
  _adminState.loading = true;
  adminRenderList();
  try {
    const data = await adminApi({ action: "list", q: _adminState.q, limit: _adminState.limit, offset: _adminState.offset });
    _adminState.users = data.users || [];
    if(!_adminState.selectedId && _adminState.users.length) _adminState.selectedId = _adminState.users[0].id;
    else if(_adminState.selectedId && !_adminState.users.some(u => u.id === _adminState.selectedId)){
      _adminState.selectedId = _adminState.users[0] ? _adminState.users[0].id : null;
    }
  } catch(e){
    adminShowMsg(e.message || "Could not load users", false);
    _adminState.users = [];
  } finally {
    _adminState.loading = false;
    adminRenderList();
    adminRenderDetail();
  }
}

async function adminLoadStats(){
  try {
    const data = await adminApi({ action: "stats" });
    _adminState.stats = data.stats || null;
    adminRenderStats();
  } catch(e){ /* non-fatal */ }
}

function adminSelectUser(id){
  _adminState.selectedId = id;
  adminRenderList();
  adminRenderDetail();
}

function adminOnSearchInput(v){
  _adminState.q = (v || "").trim();
}

let _adminSearchTimer = null;
function adminOnSearch(v){
  adminOnSearchInput(v);
  clearTimeout(_adminSearchTimer);
  _adminSearchTimer = setTimeout(() => adminLoadUsers(true), 350);
}

function adminReadPatch(){
  const u = adminSelectedUser();
  if(!u) return null;
  const cpe = document.getElementById("admin-f-cpe");
  const trial = document.getElementById("admin-f-trial");
  return {
    display_name: (document.getElementById("admin-f-name") || {}).value || null,
    home_port: (document.getElementById("admin-f-port") || {}).value || null,
    subscription_status: (document.getElementById("admin-f-status") || {}).value || "none",
    subscription_interval: (document.getElementById("admin-f-interval") || {}).value || null,
    current_period_end: cpe && cpe.value ? new Date(cpe.value).toISOString() : null,
    trial_end: trial && trial.value ? new Date(trial.value).toISOString() : null,
    stripe_customer_id: (document.getElementById("admin-f-stripe") || {}).value || null,
    is_owner: !!(document.getElementById("admin-f-owner") || {}).checked,
  };
}

async function adminSaveUser(){
  const u = adminSelectedUser();
  if(!u) return;
  try {
    const patch = adminReadPatch();
    const data = await adminApi({ action: "update", userId: u.id, patch });
    if(data.user){
      const idx = _adminState.users.findIndex(x => x.id === u.id);
      if(idx >= 0) _adminState.users[idx] = data.user;
      adminRenderList();
      adminRenderDetail();
    }
    adminShowMsg("Saved.", true);
    adminLoadStats();
  } catch(e){ adminShowMsg(e.message || "Save failed", false); }
}

async function adminPreset(preset){
  const u = adminSelectedUser();
  if(!u) return;
  const labels = { grant_pro: "Grant Pro for 1 year", grant_trial: "Grant 7-day trial", grant_owner: "Make owner", revoke: "Revoke all access" };
  if(!confirm(`${labels[preset] || preset} for ${u.email || u.id}?`)) return;
  try {
    const data = await adminApi({ action: "preset", userId: u.id, preset });
    if(data.user){
      const idx = _adminState.users.findIndex(x => x.id === u.id);
      if(idx >= 0) _adminState.users[idx] = data.user;
      adminRenderList();
      adminRenderDetail();
    }
    adminShowMsg("Updated.", true);
    adminLoadStats();
  } catch(e){ adminShowMsg(e.message || "Update failed", false); }
}

function openAdmin(){
  if(!BW_ADMIN){ adminShowMsg("Admin access required.", false); return; }
  const ov = document.getElementById("admin-overlay");
  if(!ov) return;
  ov.style.display = "block";
  document.body.style.overflow = "hidden";
  adminShowMsg("", true);
  adminLoadStats();
  adminLoadUsers(true);
  adminLoadHealth();
}

function closeAdmin(){
  const ov = document.getElementById("admin-overlay");
  if(ov) ov.style.display = "none";
  document.body.style.overflow = "";
}

// ── System Health (dataset drift monitor) ──────────────────────────────────
// Reads the public snapshot from the dataset-health edge function; the "Run
// check now" button POSTs an owner-authed run so you can force a fresh probe.
function healthFnBase(){
  const cfg = window.BW_SUPABASE_CONFIG || window.BW_DATA_CONFIG || {};
  return ((cfg.supabaseUrl || cfg.url || "https://mealpzwbjamkjdrsszqe.supabase.co").replace(/\/$/,"")) + "/functions/v1";
}
function healthDot(status){
  const c = status === "red" ? "#ef4444" : status === "amber" ? "#f59e0b" : status === "green" ? "#22c55e" : "#94a3b8";
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 6px ${c}88;flex-shrink:0"></span>`;
}
function healthOverallPill(status){
  const map = { red:["#ef4444","Feed down"], amber:["#f59e0b","Degraded"], green:["#22c55e","All feeds healthy"], unknown:["#94a3b8","Not checked yet"] };
  const [c,label] = map[status] || map.unknown;
  return `<span class="admin-pill" style="background:${c}22;color:${c};border-color:${c}55">${label}</span>`;
}
function healthAge(h){
  if(h == null) return "—";
  if(h < 1) return Math.round(h*60) + "m";
  if(h < 48) return Math.round(h) + "h";
  return Math.round(h/24) + "d";
}
function adminRenderHealth(data){
  const overallEl = document.getElementById("admin-health-overall");
  if(overallEl) overallEl.innerHTML = data ? healthOverallPill(data.overall) : "";
  const updEl = document.getElementById("admin-health-updated");
  if(updEl) updEl.textContent = data && data.checked_at ? ("Last checked " + adminFmtDate(data.checked_at)) : "";
  const el = document.getElementById("admin-health-list");
  if(!el) return;
  const rows = (data && data.datasets) || [];
  if(!rows.length){ el.innerHTML = `<div class="admin-empty">No health data yet. Tap “Run check now”.</div>`; return; }
  el.innerHTML = rows.map(d => `
    <div class="admin-user-row" style="cursor:default;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="admin-user-email" style="display:flex;align-items:center;gap:8px">
          ${healthDot(d.status)} ${escapeHtml(d.label || d.id)}
          ${d.category === "supporting" ? `<span style="font-size:9.5px;color:#6b8cae;border:1px solid rgba(107,140,174,.4);border-radius:5px;padding:0 4px">SUPPORTING</span>` : ""}
        </div>
        <div class="admin-user-meta" style="margin-top:3px">
          ${escapeHtml(d.message || "")}
          ${d.age_hours != null ? ` · newest ${healthAge(d.age_hours)} old` : ""}
          ${d.latency_ms != null ? ` · ${d.latency_ms}ms` : ""}
          ${d.sample_value != null ? ` · sample ${d.sample_value}` : ""}
        </div>
      </div>
    </div>`).join("");
}
async function adminLoadHealth(){
  const el = document.getElementById("admin-health-list");
  if(el) el.innerHTML = `<div class="admin-empty">Loading data-feed health…</div>`;
  try {
    const res = await fetch(`${healthFnBase()}/dataset-health`, { method: "GET" });
    const j = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(j.error || "Could not load health");
    adminRenderHealth(j);
  } catch(e){
    if(el) el.innerHTML = `<div class="admin-empty">Health unavailable: ${escapeHtml(e.message || "error")}</div>`;
  }
}
async function adminRunHealthCheck(){
  const btn = document.getElementById("admin-health-run");
  if(btn){ btn.disabled = true; btn.textContent = "Checking…"; }
  try {
    const cfg = window.BW_SUPABASE_CONFIG || window.BW_DATA_CONFIG || {};
    const s = window.BW_AUTH && window.BW_AUTH._sb;
    if(!s) throw new Error("Not ready");
    const { data:{ session } } = await s.auth.getSession();
    if(!session) throw new Error("Sign in required.");
    const res = await fetch(`${healthFnBase()}/dataset-health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey || "" },
      body: JSON.stringify({ action: "run" }),
    });
    const j = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(j.error || "Health check failed");
    adminRenderHealth(j);
    adminShowMsg(j.alert && j.alert.emailed ? "Health check done — alert emailed." : "Health check complete.", true);
  } catch(e){
    adminShowMsg(e.message || "Health check failed", false);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = "Run check now"; }
  }
}

// Show/hide the PRO badge and locked styling on Pro menu rows based on
// entitlement. Free users see a yellow "PRO" tag on Fishing Reports and
// Waypoints; Pro users see them normally. Paid-only rows (brief recall) use
// BW_PAID so trial users stay locked out of the AI brief features.
function applyNavRowLock(row, entitled){
  let badge = row.querySelector(".pro-badge");
  if(!entitled){
    row.classList.add("pro-locked");
    if(!badge){
      badge = document.createElement("span");
      badge.className = "pro-badge";
      badge.textContent = "★ PRO";
      const chev = row.querySelector(".nav-chevron");
      if(chev) row.insertBefore(badge, chev); else row.appendChild(badge);
    }
  } else {
    row.classList.remove("pro-locked");
    if(badge) badge.remove();
  }
}
function applyProMenuBadges(){
  document.querySelectorAll('.nav-row[data-pro="1"]').forEach(row => {
    applyNavRowLock(row, BW_PREMIUM);
  });
  document.querySelectorAll('.nav-row[data-paid="1"]').forEach(row => {
    applyNavRowLock(row, BW_PAID);
  });
  const settingsBriefBtn = document.getElementById("settings-recent-briefs-btn");
  if(settingsBriefBtn){
    let badge = settingsBriefBtn.querySelector(".pro-badge");
    if(!BW_PAID){
      settingsBriefBtn.classList.add("pro-locked");
      settingsBriefBtn.style.opacity = ".45";
      if(!badge){
        badge = document.createElement("span");
        badge.className = "pro-badge";
        badge.textContent = "★ PRO";
        badge.style.float = "right";
        settingsBriefBtn.appendChild(badge);
      }
    } else {
      settingsBriefBtn.classList.remove("pro-locked");
      settingsBriefBtn.style.opacity = "";
      if(badge) badge.remove();
    }
  }
  // Premium MAP LAYER rows (Bite Map, SST, chlorophyll, radar, wind): tag each
  // label with a PRO badge for free users so it's clear they're subscription
  // features. The toggle handler already opens the upgrade modal on tap.
  try {
    for(const key of BW_PREMIUM_LAYERS){
      const chk = document.getElementById("chk-" + key);
      const label = chk ? chk.closest(".layer-row") : null;
      if(!label) continue;
      let lbadge = label.querySelector(".pro-badge");
      if(!BW_PREMIUM){
        if(!lbadge){
          lbadge = document.createElement("span");
          lbadge.className = "pro-badge";
          lbadge.textContent = "★ PRO";
          label.appendChild(lbadge);
        }
        label.classList.add("pro-locked");
      } else {
        if(lbadge) lbadge.remove();
        label.classList.remove("pro-locked");
      }
    }
  } catch(e){}
}

// Great-circle distance in nautical miles.
// Returns waypoints within wpRadiusNm of the active port, honoring the type filter.
// Each item: {name, lat, lng, t, nm}. Sorted nearest-first.
function waypointsInRange(){
  // Charted waypoints are no longer embedded in the page — they come from the
  // server-enforced gated RPC and are cached by drawWaypoints(). Return that
  // cache (already filtered by type/radius and sorted nearest-first).
  return Array.isArray(_wpInRangeCache) ? _wpInRangeCache : [];
}

// Icons depend only on the waypoint type, and there are just a handful of
// types — so build each one once and reuse the same L.divIcon across every
// marker. Previously this allocated a fresh divIcon (string interpolation +
// an SVG build) for all ~1200 markers on every pan/zoom redraw; caching makes
// the redraw loop allocation-free for icons. Leaflet is happy to share one
// icon instance across many markers.
const _wpIconCache = {};
function wpIcon(t){
  if(_wpIconCache[t]) return _wpIconCache[t];
  const s = WP_TYPE_STYLE[t] || {type:"structure", color:"#cbd5e1"};
  // Rounded-square badge with a white SVG icon — identical visual language to the
  // Major Fishing Areas markers (structureIconSvg), for consistency across the app.
  const icon = L.divIcon({
    className: "wp-marker",
    html: `<div style="
      width:24px;height:24px;
      background:${s.color};
      border:2px solid rgba(255,255,255,.92);
      border-radius:7px;
      box-shadow:0 2px 5px rgba(0,0,0,.55);
      display:flex;align-items:center;justify-content:center;
      pointer-events:none;
    ">${structureIconSvg(s.type)}</div>`,
    iconSize: [24,24], iconAnchor: [12,12],
  });
  _wpIconCache[t] = icon;
  return icon;
}

const WP_MAX_DRAW = 1200;        // hard cap on markers in the DOM at once
const WP_VIEW_BUFFER = 0.35;     // pad viewport bounds by 35% so panning feels seamless

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
  updateWaypointPanel(-1, -1); // -1 => "loading…"
  // Charted waypoints: server-enforced RPC. Pro subscribers get the full set;
  // free users get none (positions never shipped to non-entitled clients).
  const types = wpTypeFilter ? [...wpTypeFilter] : null;
  let rows = [], status = "live", fullCount = 0;
  try {
    const sbc = window.BW_AUTH && window.BW_AUTH._sb;
    if(!sbc) throw new Error("auth not ready");
    const { data, error } = await sbc.rpc("pack_waypoints_within", {
      p_port: activePort, p_lat: p.lat, p_lng: p.lng, p_radius_nm: wpRadiusNm, p_types: types,
    });
    if(error) throw error;
    // The RPC returns the full set for entitled users, or nothing for free
    // accounts (positions are never shipped to non-entitled clients).
    rows = (data || []).map(r => ({ name: r.name, lat: r.lat, lng: r.lng, t: r.type_code, nm: r.nm }));
    fullCount = rows.length;
  } catch(e){
    // Offline fallback: use a saved trip snapshot's waypoints for this port.
    const cachedWp = (typeof tripWaypointsFor === "function") ? tripWaypointsFor(activePort) : null;
    if(cachedWp && cachedWp.length){
      rows = cachedWp.map(w => ({ name:w.name, lat:w.lat, lng:w.lng, t:w.t, nm:w.nm }));
      fullCount = rows.length; status = "cached";
    } else {
      rows = []; status = "unavailable";
    }
  }
  // A newer draw started while we were awaiting — discard this stale result.
  if(seq !== _wpDrawSeq) return;
  _wpInRangeCache = rows;
  renderWaypointMarkers(true);
  updateWaypointPanel(
    fullCount,
    Math.min(rows.length, WP_MAX_DRAW),
    status
  );
  updateWaypointControlVisibility();
  bindWaypointRedraw();
}

let _wpRenderedBounds = null;    // the padded bounds we last built markers for

// Lightweight redraw: re-cull the already-computed in-range list to the current
// viewport and (re)build only the visible markers. Cheap enough for pan/zoom end.
function renderWaypointMarkers(force){
  if(!wpLayerGroup){ wpLayerGroup = L.layerGroup().addTo(MAP); }
  if(!_wpInRangeCache || !layerVis.waypoints || !activePort){
    wpLayerGroup.clearLayers();
    _wpRenderedBounds = null;
    return;
  }

  // Viewport culling — only build markers for waypoints currently on screen
  // (plus a buffer), instead of holding all in-range markers in the DOM. At a
  // normal zoom this cuts live DOM nodes from ~1200 to ~100-300, the main fix
  // for zoom/pan lag.
  let viewBounds = null;
  try { viewBounds = MAP.getBounds(); } catch(e){ viewBounds = null; }

  // Blink fix: if we're not forced (e.g. a pan settling) and the current view is
  // still INSIDE the padded area we already drew markers for, there's nothing new
  // to show — leave the existing markers untouched instead of clearing+rebuilding.
  if(!force && _wpRenderedBounds && viewBounds && _wpRenderedBounds.contains(viewBounds)){
    return;
  }

  const bounds = viewBounds ? viewBounds.pad(WP_VIEW_BUFFER) : null;
  wpLayerGroup.clearLayers();
  _wpRenderedBounds = bounds;

  let drawn = 0;
  for(const w of _wpInRangeCache){
    if(drawn >= WP_MAX_DRAW) break;
    if(bounds && !bounds.contains([w.lat, w.lng])) continue;
    const s = WP_TYPE_STYLE[w.t] || {label:"Spot"};
    const latStr = Math.abs(w.lat).toFixed(5) + (w.lat>=0 ? "° N" : "° S");
    const lngStr = Math.abs(w.lng).toFixed(5) + (w.lng>=0 ? "° E" : "° W");
    const wpSafeName = (w.name || "Spot").replace(/'/g, "\\'");
    // ONE combined bubble: name + label/distance + coordinates + the forecast
    // button, in a single interactive popup (previously a hover tooltip plus a
    // separate forecast popup that overlapped on tap).
    const m = L.marker([w.lat, w.lng], {icon: wpIcon(w.t)});
    m.bindPopup(
      `<div style="text-align:center;font-family:'Segoe UI',Arial,sans-serif;min-width:180px">
        <div style="font-weight:700;color:#f0f6ff;margin-bottom:2px;font-size:15px;padding:0 18px">${w.name}</div>
        <div style="font-size:12px;color:#cfe5ff;margin-bottom:2px">${s.label} · ${w.nm.toFixed(1)} nm</div>
        <div style="font-size:10.5px;color:#8fb4d8;margin-bottom:9px">${latStr}, ${lngStr}</div>
        <button onclick="showForecast(${w.lat},${w.lng},'${wpSafeName}')" style="
          width:100%;background:#2979b5;color:#fff;border:none;border-radius:9px;
          padding:11px 12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;
          display:flex;align-items:center;justify-content:center;gap:7px">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-2A4.5 4.5 0 0 0 6.5 19Z"/><path d="M8 13l-1.5 3M12 13l-1.5 3M16 13l-1.5 3"/></svg>
          6-Day Forecast
        </button>
      </div>`,
      {offset:[0,-46], className:"wp-fc-popup"}
    );
    bindRulerMarkerClick(m, w.lat, w.lng);
    wpLayerGroup.addLayer(m);
    drawn++;
  }
}

// Attach map handlers once: hide markers during the zoom gesture (so Leaflet
// isn't repositioning hundreds of DOM nodes per frame) and re-cull to the new
// viewport when movement settles. Mirrors the heat-map / canvas-sampler pattern.
function bindWaypointRedraw(){
  if(_wpRedrawBound || !MAP) return;
  _wpRedrawBound = true;
  let hidden = false;
  // We only hide during ZOOM. Panning doesn't need it — Leaflet shifts the whole
  // marker layer cheaply during a pan, so hiding on movestart caused a blink on
  // every touch/tap. Zoom is the expensive case (markers rescale per frame).
  const hideForZoom = () => {
    if(wpLayerGroup && !hidden && layerVis.waypoints){
      wpLayerGroup.clearLayers();
      _wpRenderedBounds = null;
      hidden = true;
    }
  };
  MAP.on("zoomstart", hideForZoom);
  MAP.on("zoomend", () => {
    hidden = false;
    // Scale changed — force a rebuild for the new zoom level/viewport.
    if(layerVis.waypoints && _wpInRangeCache) renderWaypointMarkers(true);
  });
  // Pan: never hide. When it settles, re-cull — but renderWaypointMarkers skips
  // the rebuild entirely if the view is still inside what we already drew, so a
  // tap or small pan produces no blink.
  MAP.on("moveend", () => {
    if(!hidden && layerVis.waypoints && _wpInRangeCache){
      clearTimeout(_wpMoveTimer);
      _wpMoveTimer = setTimeout(() => renderWaypointMarkers(false), 140);
    }
  });
}

// ── Boat ramps ───────────────────────────────────────────────────────────────
// Public boat-ramp layer, mirroring the waypoint pattern. Data lives in the inline
// window.BW_RAMPS block (empty until a ramp CSV is wired in). Ramps within the
// currently-selected radius band (wpRadiusNm) of the active port are shown with a
// distinct teal launch-ramp badge so they read differently from fishing spots.
let rampLayerGroup = null;

// Ramps within wpRadiusNm of the active port. Each item: {name, lat, lng, nm}. Nearest-first.
// Distinct ramp marker: teal rounded-square badge with a white launch-ramp glyph
// (a slipway descending into water). Visually distinct from fishing-spot badges.
// The ramp marker is identical for every ramp, so build it once and share the
// instance across all 643 ramp markers rather than allocating a new divIcon
// (with its SVG string) on every draw.
let _rampIcon = null;
function rampIcon(){
  if(_rampIcon) return _rampIcon;
  _rampIcon = L.divIcon({
    className: "ramp-marker",
    html: `<div style="
      width:24px;height:24px;
      background:#0ea5e9;
      border:2px solid rgba(255,255,255,.92);
      border-radius:7px;
      box-shadow:0 2px 5px rgba(0,0,0,.55);
      display:flex;align-items:center;justify-content:center;
      pointer-events:none;
    "><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5 L11 18"></path><path d="M8 5 L15 18"></path><path d="M2 18 h20"></path><path d="M14 14 q3 -1 6 0"></path><path d="M14 17 q3 -1 6 0"></path></svg></div>`,
    iconSize: [24,24], iconAnchor: [12,12],
  });
  return _rampIcon;
}

let _rampDrawSeq = 0;
async function drawRamps(){
  if(!rampLayerGroup){ rampLayerGroup = L.layerGroup().addTo(MAP); }
  rampLayerGroup.clearLayers();
  if(!layerVis.ramps || !activePort || !PORTS[activePort]) return;
  const seq = ++_rampDrawSeq;
  const p = PORTS[activePort];
  const { rows: items } = await window.BW_DATA.rampsWithin(p.lat, p.lng, wpRadiusNm);
  if(seq !== _rampDrawSeq) return;
  const MAX_DRAW = 1200;  // perf cap, matching waypoints
  for(const r of items.slice(0, MAX_DRAW)){
    const latStr = Math.abs(r.lat).toFixed(5) + (r.lat>=0 ? "° N" : "° S");
    const lngStr = Math.abs(r.lng).toFixed(5) + (r.lng>=0 ? "° E" : "° W");
    const m = L.marker([r.lat, r.lng], {icon: rampIcon()})
      .bindTooltip(
        `<b>${r.name}</b><br>Public boat ramp · ${r.nm.toFixed(1)} nm<br><span style="font-size:10px;opacity:.85">${latStr}, ${lngStr}</span>`,
        {direction:"top", offset:[0,-8]}
      );
    bindRulerMarkerClick(m, r.lat, r.lng);
    rampLayerGroup.addLayer(m);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MEMORY CARD EXPORT (Premium) — pick a port + range (up to 100 nm), export all
// waypoints in that circle to a GPX file for a chartplotter memory card. This is
// independent of the live map radius buttons so it never disturbs the map view.
// ════════════════════════════════════════════════════════════════════════════
const MCE_MAX_NM = 100;        // hard cap per product spec
let mceRangeNm = 50;           // default slider value
let mcePort = null;            // selected port for export — no default; user must choose

// Charted waypoints for an explicit port via the server-enforced RPC.
// Returns { rows, entitled, total } — the RPC returns the full set only for
// entitled users (owner / Pro subscriber); non-entitled callers get no positions.
// For a locked user we still surface the COUNT (via pack_port_count RPC) so they
// can see how many a subscription unlocks.
async function mceChartedRows(portName, radiusNm){
  const p = PORTS[portName];
  const sbc = window.BW_AUTH && window.BW_AUTH._sb;
  if(!p || !sbc) return { rows: [], entitled: false, total: 0 };
  try {
    const { data, error } = await sbc.rpc("pack_waypoints_within", {
      p_port: portName, p_lat: p.lat, p_lng: p.lng, p_radius_nm: Math.min(radiusNm, 120), p_types: null,
    });
    if(error) throw error;
    const rows = (data || []).map(r => ({ name: r.name, lat: r.lat, lng: r.lng, t: r.type_code, nm: r.nm }));
    const entitled = (typeof BW_PREMIUM !== "undefined" && BW_PREMIUM);
    let total = rows.length;
    if(!entitled){ try { const { data: c } = await sbc.rpc("pack_port_count", { p_lat: p.lat, p_lng: p.lng }); if(typeof c === "number") total = c; } catch(e){} }
    return { rows, entitled, total };
  } catch(e){ return { rows: [], entitled: false, total: 0 }; }
}

function mceBuildGpx(items, portName, radiusNm){
  const head =
`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Bluewater Intel" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${gpxEscape(portName)} — fishing waypoints</name>
<desc>${items.length} waypoints within ${radiusNm} nm of ${gpxEscape(portName)}. Exported from Bluewater Intel. Informational only — not for navigation; verify every position before use.</desc></metadata>`;
  const body = items.map(w=>{
    const s = WP_TYPE_STYLE[w.t] || {label:"Spot"};
    return `<wpt lat="${w.lat}" lon="${w.lng}"><name>${gpxEscape(w.name)}</name>`+
           `<type>${gpxEscape(s.label)}</type>`+
           `<desc>${gpxEscape(s.label)} · ${w.nm.toFixed(1)} nm from ${gpxEscape(portName)}</desc></wpt>`;
  }).join("\n");
  return head + "\n" + body + "\n</gpx>";
}

function mceOnPortChange(v){ mcePort = v; mceUpdate(); }
function mceOnRangeChange(v){ mceRangeNm = Math.min(MCE_MAX_NM, Math.max(1, parseInt(v,10)||1)); mceUpdate(); }

// Unified export: a single source selector decides what the one Download button
// exports — the user's own saved waypoints, or the built-in dataset by port+range.
let expSource = "mine";
function expOnSourceChange(v){
  expSource = v;
  const dsEl = document.getElementById("exp-dataset-controls");
  const mineEl = document.getElementById("exp-mine-note");
  const goBtn = document.getElementById("exp-go-btn");
  if(dsEl) dsEl.style.display = (v === "dataset") ? "block" : "none";
  if(mineEl) mineEl.style.display = (v === "mine") ? "block" : "none";
  if(v === "dataset"){
    mceUpdate();   // sets button state based on port/results
  } else if(goBtn){
    goBtn.disabled = false;   // personal export always available (guards empty itself)
  }
}
function expRun(){
  if(expSource === "dataset"){
    mceExport();
  } else {
    wpExportGPX();
  }
}

// Recompute the live preview (count + breakdown) whenever port/range changes.
async function mceUpdate(){
  const rangeLabel = document.getElementById("mce-range-label");
  if(rangeLabel) rangeLabel.textContent = mceRangeNm + " nm";
  const countEl = document.getElementById("mce-count");
  const breakdownEl = document.getElementById("mce-breakdown");
  const btn = (typeof expSource !== "undefined" && expSource === "dataset")
    ? document.getElementById("exp-go-btn") : null;
  if(!mcePort || !PORTS[mcePort]){
    if(countEl) countEl.textContent = "Select a port";
    if(breakdownEl) breakdownEl.innerHTML = "";
    if(btn) btn.disabled = true;
    return;
  }
  const { rows, entitled, total } = await mceChartedRows(mcePort, mceRangeNm);
  if(countEl) countEl.textContent = total.toLocaleString();
  if(breakdownEl){
    if(!entitled){
      breakdownEl.innerHTML = `<span style="font-size:12px;color:#fbbf24">Locked — subscribe to Pro to export these ${total.toLocaleString()} charted waypoints.</span>`;
    } else {
      const counts = {};
      rows.forEach(w => { counts[w.t] = (counts[w.t]||0) + 1; });
      const chips = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).map(t=>{
        const s = WP_TYPE_STYLE[t] || {label:t, color:"#888"};
        return `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(15,36,68,.6);border:1px solid rgba(107,191,234,.18);border-radius:8px;padding:3px 9px;font-size:11px;color:#dde8f5;margin:0 5px 5px 0">
          <span style="width:9px;height:9px;border-radius:2px;background:${s.color};display:inline-block"></span>${s.label}: <b>${counts[t]}</b></span>`;
      }).join("");
      breakdownEl.innerHTML = chips || `<span style="font-size:12px;color:#9ca3af">No waypoints within ${mceRangeNm} nm of this port.</span>`;
    }
  }
  // Locked users keep the button live so a click routes them to upgrade.
  if(btn) btn.disabled = entitled && total === 0;
}

async function wpExportChartedGPX(){
  const port = (typeof wpChartedPort === "function") ? wpChartedPort() : null;
  if(!port || !PORTS[port]){
    showToast("Select a home port in the dropdown first.", "info");
    return;
  }
  if(typeof BW_PREMIUM !== "undefined" && !BW_PREMIUM){
    if(typeof openPricing === "function") openPricing();
    else showToast("Subscribe to Pro to export the charted waypoint database.", "info");
    return;
  }
  const radius = Math.min(MCE_MAX_NM, (typeof maxRangeForPort === "function") ? maxRangeForPort(PORTS[port]) : MCE_MAX_NM);
  mcePort = port;
  const { rows, entitled } = await mceChartedRows(port, radius);
  if(!entitled){
    if(typeof openPricing === "function") openPricing();
    else showToast("Subscribe to Pro to export charted waypoints.", "info");
    return;
  }
  if(rows.length === 0){
    showToast(`No charted waypoints within ${radius} nm of ${port}.`, "info");
    return;
  }
  const gpx = mceBuildGpx(rows, port, radius);
  const blob = new Blob([gpx], {type:"application/gpx+xml"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = port.replace(/[^a-z0-9]+/gi,"_");
  a.href = url;
  a.download = `bluewater_${safe}_${radius}nm.gpx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  showToast(`Exported ${rows.length.toLocaleString()} waypoints to GPX.`, "success");
}

async function mceExport(){
  if(!mcePort || !PORTS[mcePort]){ showToast("Select a home port first.", "info"); return; }
  const { rows, entitled } = await mceChartedRows(mcePort, mceRangeNm);
  // Charted export requires waypoint access (Pro subscription or owner).
  if(!entitled){
    if(typeof openPricing === "function") openPricing();
    else showToast("Subscribe to Pro to export charted waypoints.", "info");
    return;
  }
  if(rows.length === 0){ showToast("No waypoints within "+mceRangeNm+" nm of "+mcePort+".", "info"); return; }
  const items = rows;
  const gpx = mceBuildGpx(items, mcePort, mceRangeNm);
  const blob = new Blob([gpx], {type:"application/gpx+xml"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = mcePort.replace(/[^a-z0-9]+/gi,"_");
  a.href = url;
  a.download = `bluewater_${safe}_${mceRangeNm}nm.gpx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

function gpxEscape(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
// Radius setter from the UI.
function setWpRadius(nm){
  wpRadiusNm = nm;
  const sel = document.getElementById("wp-radius-select");
  if(sel && Number(sel.value) !== nm) sel.value = String(nm);
  drawWaypoints();
  drawRamps();
}
// Populate the distance-from-port dropdown (in the left waypoint legend) once.
function buildWpRadiusButtons(){
  const sel = document.getElementById("wp-radius-select");
  if(!sel || sel.children.length) return;
  WP_RADII.forEach(nm=>{
    const o = document.createElement("option");
    o.value = String(nm);
    o.textContent = nm + " nm";
    if(nm === wpRadiusNm) o.selected = true;
    sel.appendChild(o);
  });
}

// Count readout: total in range vs how many are actually drawn (capped).
function updateWaypointPanel(total, drawn, status){
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
    total = items.length;
    drawn = Math.min(total, 1200);
  }
  if(total === 0){ el.textContent = `none within ${wpRadiusNm} nm of ${PORTS[activePort]?.short||activePort}${tag}`; return; }
  const capped = drawn < total ? ` (showing nearest ${drawn})` : "";
  el.textContent = `${total} within ${wpRadiusNm} nm${capped}${tag}`;
}

// Build the type legend once (mirrors the marker glyphs/colors exactly).
function buildWpLegend(){
  const row = document.getElementById("wp-legend-rows");
  if(!row || row.children.length) return;
  for(const code in WP_TYPE_STYLE){
    const s = WP_TYPE_STYLE[code];
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:7px;font-size:11px;color:#dde8f5;white-space:nowrap";
    item.innerHTML = `
      <span style="
        width:18px;height:18px;flex-shrink:0;
        background:${s.color};border:1.5px solid rgba(255,255,255,.9);
        border-radius:5px;
        display:inline-flex;align-items:center;justify-content:center;">${structureIconSvg(s.type)}</span>
      <span>${s.label}</span>`;
    row.appendChild(item);
  }
}

// Show the waypoint control only when the layer is on AND a port is chosen.
function updateWaypointControlVisibility(){
  // Radius selector + in-range count now live in the left waypoint legend; keep
  // them built and current. Legend visibility itself is handled below.
  if(layerVis.waypoints){ buildWpRadiusButtons(); updateWaypointPanel(); }
  refreshWpLegendDisplay();
  restackBottomControls();
}

let _wpLegendOpen = false;   // phone-popup open state
function isPhoneView(){ return window.innerWidth <= 680; }

// Decide what's visible: on desktop the legend shows whenever the layer is on; on
// phones only a small "KEY" button shows, and the legend popup opens on demand.
function refreshWpLegendDisplay(){
  const legend = document.getElementById("waypoint-legend");
  const toggle = document.getElementById("wp-legend-toggle");
  const closeBtn = document.getElementById("wp-legend-close");
  if(!legend || !toggle) return;
  buildWpLegend();
  const layerOn = layerVis.waypoints;
  if(!layerOn){
    legend.style.display = "none";
    toggle.style.display = "none";
    _wpLegendOpen = false;
    return;
  }
  if(isPhoneView()){
    // Phone: button always available; legend only when opened.
    toggle.style.display = _wpLegendOpen ? "none" : "block";
    legend.style.display = _wpLegendOpen ? "block" : "none";
    if(closeBtn) closeBtn.style.display = "block";   // show the × on phones
  } else {
    // Desktop: persistent legend, no toggle button, no close ×.
    toggle.style.display = "none";
    legend.style.display = "block";
    if(closeBtn) closeBtn.style.display = "none";
    _wpLegendOpen = false;
  }
}
function toggleWpLegend(){
  _wpLegendOpen = !_wpLegendOpen;
  refreshWpLegendDisplay();
}
// Re-evaluate desktop-vs-phone legend behavior when the viewport crosses the
// breakpoint (rotate/resize), so it doesn't get stuck in the wrong mode.
window.addEventListener("resize", () => {
  syncHeaderHeightVar();
  refreshWpLegendDisplay();
  restackBottomControls();
  if(typeof isPhoneView === "function" && !isPhoneView()){
    if(typeof closeOceanLegendSheet === "function") closeOceanLegendSheet();
    document.querySelectorAll(".map-time-pill--open").forEach(p => {
      p.classList.remove("map-time-pill--open");
      const b = p.querySelector(".map-time-pill-expand");
      if(b) b.textContent = "▾";
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MARINE CLOSURES
// Renders permanent spatial closures (sanctuaries, no-take reserves, HAPCs)
// as semi-transparent polygons. Color codes by severity:
//   noTake    → solid red (do not fish)
//   hapc      → purple stripes (bottom-gear restrictions)
//   closure   → red dashed (general closures)
//   sanctuary → orange (fishing allowed with restrictions)
// Tap a polygon to see rules and a link to the official regulation page.
// ════════════════════════════════════════════════════════════════════════════
function drawClosures(){
  closureLayers.forEach(l => MAP.removeLayer(l));
  closureLayers = [];
  if(!layerVis.closures) return;
  if(typeof MARINE_CLOSURES === "undefined") return;
  MARINE_CLOSURES.forEach(c => {
    // Visual style per closure type — color, line, fill opacity
    let style;
    switch(c.type){
      case "noTake":
        style = {color: c.color, weight: 2.5, opacity: 0.95, fillColor: c.color, fillOpacity: 0.25, dashArray: null};
        break;
      case "hapc":
        style = {color: c.color, weight: 2, opacity: 0.90, fillColor: c.color, fillOpacity: 0.12, dashArray: "8 4"};
        break;
      case "closure":
        style = {color: c.color, weight: 2, opacity: 0.90, fillColor: c.color, fillOpacity: 0.10, dashArray: "10 6"};
        break;
      case "sanctuary":
      default:
        style = {color: c.color, weight: 1.8, opacity: 0.85, fillColor: c.color, fillOpacity: 0.08, dashArray: null};
        break;
    }
    const poly = L.polygon(c.polygon, Object.assign(style, {interactive: true})).addTo(MAP);
    // Type label for badge
    const typeLabel = c.type === "noTake" ? "NO FISHING"
                    : c.type === "hapc" ? "HAPC"
                    : c.type === "closure" ? "CLOSED"
                    : "SANCTUARY";
    const badgeColor = c.type === "noTake" ? "#dc2626"
                     : c.type === "hapc" ? "#a855f7"
                     : c.type === "closure" ? "#ef4444"
                     : "#fbbf24";
    const popupHtml = `
      <div style="min-width:220px;max-width:280px;font-family:Arial,sans-serif">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-weight:bold;font-size:13px;color:${c.color}">${c.name}</span>
          <span style="font-size:8px;font-weight:700;color:#fff;background:${badgeColor};padding:2px 6px;border-radius:5px;letter-spacing:.05em">${typeLabel}</span>
        </div>
        <div style="font-size:11px;color:#f0f6ff;line-height:1.5;margin-bottom:8px;font-weight:500">${c.desc}</div>
        <div style="font-size:11px;color:#fde68a;line-height:1.45;background:rgba(245,158,11,.15);border-left:3px solid #fbbf24;padding:6px 9px;margin-bottom:8px;font-weight:500">
          <b style="color:#fbbf24">Rules:</b> ${c.rules}
        </div>
        <a href="${c.link}" target="_blank" rel="noopener" style="font-size:11px;color:#7dd3fc;text-decoration:underline;font-weight:600">View official regulations →</a>
        <div style="font-size:9px;color:#9ca3af;margin-top:8px;font-style:italic">Always verify current rules with the responsible agency.</div>
      </div>`;
    poly.bindPopup(popupHtml, {maxWidth: 300, closeButton: true});
    closureLayers.push(poly);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// GULF OF MEXICO PLATFORMS (BSEE federal OCS — active, above-water only)
// Port-scoped: rigs within PLAT_RADIUS_NM of the active port, viewport-culled,
// spatially subsampled when over the draw cap, and Pro-gated. Data excludes
// removed structures and subsea manifolds/PLETs (rebuild: npm run build:platforms).
// ════════════════════════════════════════════════════════════════════════════
let platformLayerGroup = null;
let _platformRedrawBound = false;
let _platformRenderedBounds = null;
let _platMoveTimer = null;
const PLAT_RADIUS_NM = 150;
const PLAT_VIEW_BUFFER = 0.35;
let _platInRangeCache = null;
let _platInRangePort = null;

function platMaxDraw(){
  if(!MAP) return 550;
  const z = MAP.getZoom();
  if(z <= 6) return 250;
  if(z <= 7) return 400;
  if(z <= 8) return 550;
  if(z <= 9) return 700;
  if(z <= 10) return 900;
  return 1100;
}

// When the viewport holds more rigs than platMaxDraw(), pick a geographically
// even subset (grid cell per rig) instead of nearest-first so offshore rigs
// stay visible when zoomed out over the home port.
function platPickSpatialSpread(candidates, bounds, maxDraw){
  if(!candidates.length) return [];
  if(candidates.length <= maxDraw) return candidates;
  const south = bounds.getSouth(), north = bounds.getNorth();
  const west = bounds.getWest(), east = bounds.getEast();
  const latSpan = Math.max(north - south, 1e-6);
  const lngSpan = Math.max(east - west, 1e-6);
  const cols = Math.ceil(Math.sqrt(maxDraw));
  const rows = Math.ceil(maxDraw / cols);
  const cellBuckets = new Map();
  for(const p of candidates){
    const ci = Math.min(cols - 1, Math.floor(((p.lat - south) / latSpan) * cols));
    const cj = Math.min(rows - 1, Math.floor(((p.lng - west) / lngSpan) * rows));
    const key = ci + ":" + cj;
    const bucket = cellBuckets.get(key);
    if(!bucket) cellBuckets.set(key, [p]);
    else bucket.push(p);
  }
  const picked = [];
  for(const bucket of cellBuckets.values()){
    picked.push(bucket[0]);
    if(picked.length >= maxDraw) break;
  }
  if(picked.length < maxDraw){
    const seen = new Set(picked.map(p => p.lat + "," + p.lng));
    for(const p of candidates){
      if(picked.length >= maxDraw) break;
      const id = p.lat + "," + p.lng;
      if(!seen.has(id)){ picked.push(p); seen.add(id); }
    }
  }
  return picked.slice(0, maxDraw);
}

function platformPopupHtml(p){
  const latStr = Math.abs(p.lat).toFixed(5) + (p.lat>=0 ? "° N" : "° S");
  const lngStr = Math.abs(p.lng).toFixed(5) + (p.lng>=0 ? "° E" : "° W");
  const safeName = String(p.name).replace(/'/g, "\\'");
  return `<div style="text-align:center;font-family:'Segoe UI',Arial,sans-serif;min-width:190px">
    <div style="font-weight:700;color:#f0f6ff;margin-bottom:2px;font-size:14px;padding:0 12px">${p.name}</div>
    ${p.complex ? `<div style="font-size:11px;color:#fde68a;margin-bottom:4px">Complex ${p.complex}</div>` : ""}
    <div style="font-size:12px;color:#cfe5ff;margin-bottom:2px">${p.nm.toFixed(1)} nm from ${activePort.split(",")[0]}</div>
    <div style="font-size:10.5px;color:#8fb4d8;margin-bottom:8px">${latStr}, ${lngStr}</div>
    <div style="font-size:9.5px;color:#9ca3af;line-height:1.4;margin-bottom:8px;font-style:italic">BSEE active platform — informational only, not for navigation.</div>
    <button onclick="showForecast(${p.lat},${p.lng},'${safeName}')" style="
      width:100%;background:#2979b5;color:#fff;border:none;border-radius:9px;
      padding:10px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
      6-Day Forecast
    </button>
  </div>`;
}

function onPlatformMarkerClick(e){
  const p = e.target && e.target._platData;
  if(!p) return;
  if(rulerHandleMarkerClick(e, p.lat, p.lng)) return;
  const m = e.target;
  if(!m.getPopup()) m.bindPopup(platformPopupHtml(p), {offset:[0,-8], className:"wp-fc-popup"});
  m.openPopup();
}

function buildPlatformInRangeCache(){
  const p = PORTS[activePort];
  const data = window.BW_GOM_PLATFORMS;
  if(!p || !data || !data.length) return [];
  const items = [];
  for(const row of data){
    const lat = row[1], lng = row[2];
    const nm = nmBetween(p.lat, p.lng, lat, lng);
    if(nm <= PLAT_RADIUS_NM){
      items.push({ name: row[0] || "Platform", lat, lng, complex: row[3] || "", nm });
    }
  }
  return items;
}

function drawPlatforms(){
  if(!platformLayerGroup){ platformLayerGroup = L.layerGroup().addTo(MAP); }
  if(!BW_PREMIUM || !layerVis.platforms || !activePort || !PORTS[activePort] ||
     typeof window.BW_GOM_PLATFORMS === "undefined" || !window.BW_GOM_PLATFORMS.length){
    platformLayerGroup.clearLayers();
    _platformRenderedBounds = null;
    _platInRangeCache = null;
    _platInRangePort = null;
    bindPlatformRedraw();
    return;
  }
  if(_platInRangePort !== activePort){
    _platInRangeCache = buildPlatformInRangeCache();
    _platInRangePort = activePort;
  }
  renderPlatformMarkers(true);
  bindPlatformRedraw();
}

function renderPlatformMarkers(force){
  if(!platformLayerGroup){ platformLayerGroup = L.layerGroup().addTo(MAP); }
  if(!BW_PREMIUM || !layerVis.platforms || !_platInRangeCache || !_platInRangeCache.length){
    platformLayerGroup.clearLayers();
    _platformRenderedBounds = null;
    return;
  }
  let viewBounds = null;
  try { viewBounds = MAP.getBounds(); } catch(e){ viewBounds = null; }
  if(!force && _platformRenderedBounds && viewBounds && _platformRenderedBounds.contains(viewBounds)){
    return;
  }
  const bounds = viewBounds ? viewBounds.pad(PLAT_VIEW_BUFFER) : null;
  platformLayerGroup.clearLayers();
  _platformRenderedBounds = bounds;
  const maxDraw = platMaxDraw();
  const inView = [];
  for(const p of _platInRangeCache){
    if(bounds && !bounds.contains([p.lat, p.lng])) continue;
    inView.push(p);
  }
  const toDraw = bounds ? platPickSpatialSpread(inView, bounds, maxDraw) : inView.slice(0, maxDraw);
  for(const p of toDraw){
    const m = L.circleMarker([p.lat, p.lng], {
      radius: 5,
      color: "rgba(255,255,255,.9)",
      weight: 1.5,
      fillColor: "#f59e0b",
      fillOpacity: 0.92,
      interactive: true,
    });
    m._platData = p;
    m.on("click", onPlatformMarkerClick);
    platformLayerGroup.addLayer(m);
  }
}

function bindPlatformRedraw(){
  if(_platformRedrawBound || !MAP) return;
  _platformRedrawBound = true;
  let hidden = false;
  const hideForZoom = () => {
    if(platformLayerGroup && !hidden && layerVis.platforms){
      platformLayerGroup.clearLayers();
      _platformRenderedBounds = null;
      hidden = true;
    }
  };
  MAP.on("zoomstart", hideForZoom);
  MAP.on("zoomend", () => {
    hidden = false;
    if(layerVis.platforms && _platInRangeCache) renderPlatformMarkers(true);
  });
  MAP.on("moveend", () => {
    if(!hidden && layerVis.platforms && _platInRangeCache){
      clearTimeout(_platMoveTimer);
      _platMoveTimer = setTimeout(() => renderPlatformMarkers(false), 140);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PREDICTIVE HEAT MAP ENGINE
// Combines SST, chlorophyll, bathymetry, ocean currents/altimetry, recent catch
// reports, and Gulf Stream proximity to produce per-cell probability scores for
// the target species.
//
// The scoring runs client-side but reads ONLY real data — the ocean edge
// function serves live NASA/NOAA/ERDDAP grids (MUR SST, VIIRS chlorophyll,
// bathymetry, currents) which this engine scores. There is no synthetic data
// fallback: cells with no real input are left unscored rather than invented.
// ════════════════════════════════════════════════════════════════════════════

// Species temperature & habitat preferences (research-derived)
// ── SHARED BITE-SCORE VERDICT SCALE ───────────────────────────────────────
// One source of truth for the score → verdict mapping so every surface uses the
// SAME words and the SAME thresholds (75 / 60 / 40). Two color encodings are
// provided for the SAME words, because the app intentionally uses two visual
// languages on different axes:
//   • color      — "hot = good" heat scale (red = excellent). Used on the
//                   prediction heat map and the explainer panel that describes
//                   it, matching what anglers expect from a fishing heat map.
//   • colorTraffic— traffic-light (green = good). Used in the hotspot popup
//                   summary chip where there's no heat ramp for context.
// The WORDS (EXCELLENT / GOOD / FAIR / POOR) are identical in both, so the
// legend reads consistently regardless of which color encoding a surface uses.
const BITE_VERDICT_SCALE = [
  { min:75, emoji:"🔥", label:"EXCELLENT", color:"#dc2626", colorTraffic:"#22c55e", text:"Prime fishing conditions" },
  { min:60, emoji:"🎣", label:"GOOD",      color:"#f59e0b", colorTraffic:"#84cc16", text:"Solid conditions worth a run" },
  { min:40, emoji:"⚠",  label:"FAIR",      color:"#eab308", colorTraffic:"#fbbf24", text:"Mixed signals — pick your spots" },
  { min:0,  emoji:"❄",  label:"POOR",      color:"#65a30d", colorTraffic:"#f87171", text:"Tough conditions for fishing" },
];
function biteVerdict(score100){
  for(const v of BITE_VERDICT_SCALE){ if(score100 >= v.min) return v; }
  return BITE_VERDICT_SCALE[BITE_VERDICT_SCALE.length - 1];
}

function pbody(h){
  const el = document.getElementById("explainer-subpanel-content");
  if(!el) return;
  el.innerHTML = `
    <style scoped>
      #explainer-subpanel-content{color:#e8f4ff}
      #explainer-subpanel-content .wx-card,
      #explainer-subpanel-content .zcard,
      #explainer-subpanel-content .info-box{
        background:rgba(255,255,255,.05) !important;
        border:1px solid rgba(107,191,234,.2) !important;
        color:#e8f4ff !important;
      }
      #explainer-subpanel-content .wx-lbl,
      #explainer-subpanel-content .gng-lbl{color:#9ec5e8 !important}
      #explainer-subpanel-content .wx-val{color:#f0f6ff !important}
      #explainer-subpanel-content b{color:#fbbf24}
      #explainer-subpanel-content h1,#explainer-subpanel-content h2,
      #explainer-subpanel-content h3,#explainer-subpanel-content h4{color:#f0f6ff}
      #explainer-subpanel-content .bout-hdr{
        background:rgba(168,85,247,.18) !important;
        color:#c084fc !important;
        border-color:rgba(168,85,247,.35) !important;
      }
      #explainer-subpanel-content #brief-out{
        background:rgba(255,255,255,.04) !important;
        border:1px solid rgba(107,191,234,.2) !important;
        color:#e8f4ff !important;
      }
    </style>
    ${h}
  `;
}

// ── WEATHER ───────────────────────────────────────────────────────────────────
let wxAutoRefreshTimer = null;
function fmtTime(d){return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}

// Tide for the conditions panel comes ONLY from real NOAA CO-OPS data (via the
// ocean backend). The old synthetic calcTides() (random next-event times,
// hardcoded stations) was removed — renderWX reads the real tide state below.

async function renderWX(lat,lng){
  pbody(`<div style="padding:30px 20px;text-align:center;color:#9a7030;font-size:11px">
    <div style="font-size:24px;margin-bottom:8px;animation:spin 1.4s linear infinite;display:inline-block">⏳</div>
    <div>Loading conditions for ${lat.toFixed(2)}°N ${Math.abs(lng).toFixed(2)}°W...</div>
  </div><style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>`);

  // Pull REAL conditions from the ocean data function (NDBC buoys + ERDDAP).
  // No synthetic fallback: any value without real data renders as "—" (No data).
  let wx = null;
  let isLive = false;
  let oceanData = null;
  if(typeof BW_OCEAN !== "undefined"){
    try {
      oceanData = await BW_OCEAN.fetchOcean(lat, lng);
      const o = oceanData;
      const hasReal = o && (o.wind?.value != null || o.sst?.value != null || o.waterTemp?.value != null);
      if(hasReal){
        const nm = (typeof nmOffshore === "function") ? Math.round(nmOffshore(lat, lng)) : 0;
        const waterF = (o.waterTemp?.value != null) ? o.waterTemp.value : o.sst?.value;
        wx = {
          buoy: o.sources?.buoy?.id ? `${o.sources.buoy.id} NDBC` : "Forecast model",
          nm,
          waterTempF: waterF != null ? Math.round(waterF * 10) / 10 : null,
          airTempF:   o.airTemp?.value != null ? Math.round(o.airTemp.value) : null,
          waveHt:     o.waves?.value != null ? Math.round(o.waves.value * 10) / 10 : null,
          wavePer:    o.waves?.periodS != null ? Math.round(o.waves.periodS) : null,
          windKt:     o.wind?.value != null ? Math.round(o.wind.value) : null,
          windDir:    o.wind?.dir != null ? bwiCompass16(o.wind.dir) : null,
          pressure:   o.barometer?.value != null ? Math.round(o.barometer.value) : null,
        };
        isLive = true;
      }
    } catch(e){ /* no real data → render "—" */ }
  }
  if(!wx){
    // No real data available — render everything as "—" instead of synthesizing.
    const nm = (typeof nmOffshore === "function") ? Math.round(nmOffshore(lat, lng)) : 0;
    wx = { buoy: "No live data", nm, waterTempF: null, airTempF: null, waveHt: null, wavePer: null, windKt: null, windDir: null, pressure: null };
  }
  // Tide from REAL data only (NOAA CO-OPS via the ocean backend) — never synthetic.
  const _tideState = oceanData?.tide?.state || null;
  const tide = {
    state: _tideState ? _tideState.charAt(0).toUpperCase() + _tideState.slice(1) : null,
    height: null, nextHigh: null, nextLow: null,
    station: oceanData?.sources?.tide || null,
  };
  const windDir = wx.windDir || "—";
  const lastUpdate = new Date();

  // Bite quality assessment
  const biteScore = ()=>{
    let s = 50;
    if(wx.waterTempF != null){
      if(wx.waterTempF >= 68 && wx.waterTempF <= 78) s += 25;
      else if(wx.waterTempF >= 65 && wx.waterTempF <= 82) s += 12;
    }
    if(wx.waveHt != null){
      if(wx.waveHt <= 4) s += 15;
      else if(wx.waveHt <= 6) s += 5;
      else s -= 15;
    }
    if(wx.windKt != null){
      if(wx.windKt <= 15) s += 10;
      else if(wx.windKt > 25) s -= 20;
    }
    return Math.max(0, Math.min(100, s));
  };
  const bite = biteScore();
  const _v = biteVerdict(bite);
  const verdict = { emoji:_v.emoji, label:_v.label, color:_v.colorTraffic, text:_v.text };

  // Build factor rows — each is a label, value, and weighted bar
  const factor = (name, value, score, raw) => {
    const w = Math.min(100, Math.max(0, score * 100));
    return `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11px;margin-bottom:3px">
          <span style="color:#cfe5ff;font-weight:600">${name}</span>
          <span style="color:#f0f6ff;font-weight:700;font-family:monospace">${raw}</span>
        </div>
        <div style="height:4px;background:rgba(107,191,234,.12);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${w}%;background:linear-gradient(90deg,#dc2626,#f59e0b,#65a30d,#16a34a)"></div>
        </div>
      </div>
    `;
  };

  // Score each factor 0-1 based on how favorable it is (null → neutral 0.5).
  const tempScore  = wx.waterTempF == null ? 0.5 : (wx.waterTempF >= 68 && wx.waterTempF <= 78 ? 1.0 : wx.waterTempF >= 65 && wx.waterTempF <= 82 ? 0.7 : 0.3);
  const waveScore  = wx.waveHt == null ? 0.5 : (wx.waveHt <= 3 ? 1.0 : wx.waveHt <= 5 ? 0.7 : wx.waveHt <= 7 ? 0.4 : 0.15);
  const windScore  = wx.windKt == null ? 0.5 : (wx.windKt <= 12 ? 1.0 : wx.windKt <= 18 ? 0.7 : wx.windKt <= 25 ? 0.4 : 0.15);
  const tideScore  = tide.state ? ((tide.state === "Rising" || tide.state === "Falling") ? 0.85 : 0.4) : 0.5;
  const presScore  = wx.pressure == null ? 0.5 : (wx.pressure >= 1015 && wx.pressure <= 1022 ? 0.85 : 0.65);

  pbody(`
    <!-- Status bar -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(107,191,234,.15);font-size:10px;font-family:monospace;flex-wrap:wrap">
      <span style="color:${isLive?'#10b981':'#fbbf24'};font-weight:bold">${isLive?'● LIVE':'● NO DATA'}</span>
      <span style="color:#9ec5e8">${lat.toFixed(3)}°N ${Math.abs(lng).toFixed(3)}°W · ${wx.nm}nm offshore</span>
      <span style="margin-left:auto;color:#7dd3fc">${wx.buoy} · ${fmtTime(lastUpdate)}</span>
    </div>

    ${FORECAST_HOUR_OFFSET > 0 ? `
    <!-- Forecast horizon banner -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:6px 10px;background:rgba(168,85,247,.10);border:1px solid rgba(168,85,247,.30);border-radius:7px;font-size:10px">
      <span style="font-size:14px">🔮</span>
      <span style="flex:1;color:#cfe5ff">
        <b style="color:#c084fc">Forecast +${FORECAST_HOUR_OFFSET}h</b> · ${forecastTimeDisplay()}
      </span>
    </div>
    ` : ""}

    <!-- Verdict header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:0 2px">
      <div style="font-size:36px;line-height:1">${verdict.emoji}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:bold;color:${verdict.color};line-height:1.2">${verdict.label}</div>
        <div style="font-size:11px;color:#cfe5ff;margin-top:2px">${verdict.text}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:28px;font-weight:bold;color:${verdict.color};line-height:1">${bite}<span style="font-size:13px;font-weight:normal">/100</span></div>
        <div style="font-size:9px;color:#7dd3fc;letter-spacing:.07em;font-weight:600">BITE QUALITY</div>
      </div>
    </div>

    <!-- Factor list -->
    <div style="font-size:10px;color:#7dd3fc;letter-spacing:.1em;font-weight:700;text-transform:uppercase;margin-bottom:8px">Current Conditions</div>
    ${factor("🌊 Water Temperature", wx.waterTempF, tempScore, wx.waterTempF != null ? `${wx.waterTempF}°F` : "—")}
    ${factor("〰 Wave Height",        wx.waveHt,    waveScore, wx.waveHt != null ? `${wx.waveHt}ft${wx.wavePer ? ` @ ${wx.wavePer}s` : ""}` : "—")}
    ${factor("💨 Wind",               wx.windKt,    windScore, wx.windKt != null ? `${wx.windKt}kt ${windDir}` : "—")}
    ${factor("📊 Pressure",           wx.pressure,  presScore, wx.pressure != null ? `${wx.pressure} hPa` : "—")}
    ${factor(`🌙 Tide${tide.station ? ` (${tide.station})` : ""}`, null, tideScore, tide.state ? `${tide.state}${tide.state==="Rising"?" ↑":tide.state==="Falling"?" ↓":""}` : "—")}

    <!-- Tide times row -->
    <div style="display:flex;gap:10px;margin-top:6px;padding:8px 10px;background:rgba(107,191,234,.08);border:1px solid rgba(107,191,234,.15);border-radius:6px">
      <div style="flex:1">
        <div style="font-size:9px;color:#7dd3fc;letter-spacing:.05em;font-weight:600">NEXT HIGH</div>
        <div style="font-size:13px;font-weight:700;color:#f0f6ff">${tide.nextHigh || "—"}</div>
      </div>
      <div style="flex:1">
        <div style="font-size:9px;color:#7dd3fc;letter-spacing:.05em;font-weight:600">NEXT LOW</div>
        <div style="font-size:13px;font-weight:700;color:#f0f6ff">${tide.nextLow || "—"}</div>
      </div>
      <div style="flex:1">
        <div style="font-size:9px;color:#7dd3fc;letter-spacing:.05em;font-weight:600">☀ AIR TEMP</div>
        <div style="font-size:13px;font-weight:700;color:#f0f6ff">${wx.airTempF != null ? wx.airTempF + "°F" : "—"}</div>
      </div>
    </div>

    <div style="text-align:center;margin-top:10px;font-size:9px;color:#9ec5e8;letter-spacing:.05em">
      Auto-refreshes every 60s
    </div>
  `);

  // Auto-refresh — refreshes only if the WX sub-panel is currently open inside
  // a hotspot popup. Detected by checking for our subpanel container.
  if(wxAutoRefreshTimer) clearInterval(wxAutoRefreshTimer);
  wxAutoRefreshTimer = setInterval(()=>{
    const sp = document.getElementById("explainer-subpanel-content");
    const isWxOpen = sp && sp.dataset && sp.dataset.kind === "wx";
    if(isWxOpen) renderWX(lat, lng);
  }, 60000);
}

// ── ZONES ─────────────────────────────────────────────────────────────────────
// ── REPORTS ───────────────────────────────────────────────────────────────────
function renderReports(){
  // If a pin is dropped, filter to reports near that location (within ~150nm of any port).
  // Otherwise show all reports sorted by recency.
  let list = SOCIAL.slice().sort((a,b) => (a.hoursAgo||999) - (b.hoursAgo||999));
  let filterNote = "";

  if(pinLL && typeof PORTS !== "undefined"){
    const NM_PER_DEG = 60;
    const nearby = list.filter(r => {
      if(!r.port || !PORTS[r.port]) return false;
      const p = PORTS[r.port];
      const dist = Math.sqrt((p.lat - pinLL.lat)**2 + ((p.lng - pinLL.lng)*Math.cos(pinLL.lat*Math.PI/180))**2) * NM_PER_DEG;
      return dist < 150;
    });
    if(nearby.length > 0){
      list = nearby;
      filterNote = `<div style="font-size:11px;color:#cfe5ff;margin-bottom:8px;padding:6px 10px;background:rgba(41,121,181,.08);border-radius:6px;border-left:3px solid #2979b5">📍 Showing <b>${nearby.length}</b> report${nearby.length===1?"":"s"} within 150nm of your pin</div>`;
    }
  }

  // Limit drop-up to top 8 most recent so it fits comfortably; offer "See All" link
  const TOP_N = 8;
  const truncated = list.length > TOP_N;
  list = list.slice(0, TOP_N);

  const cards = list.map(p => {
    const sps = (p.species || []).map(r => {
      const sp = SPECIES.find(s => s.id === r);
      return sp ? `<span style="font-weight:bold;font-size:10px;color:${sp.color};margin-right:6px">${sp.name}</span>` : "";
    }).join("");
    const srcColor = p.src === "THT"     ? "#dbeafe,#1d4ed8" :
                     p.src === "FB"      ? "#dbeafe,#1d4ed8" :
                     p.src === "REDDIT"  ? "#ffedd5,#9a3412" :
                     p.src === "CHARTER" ? "#d1fae5,#065f46" :
                                           "#ede9fe,#6d28d9";
    const [bg, fg] = srcColor.split(",");
    const timeStr = p.hoursAgo < 1 ? "now" : p.hoursAgo < 24 ? `${Math.round(p.hoursAgo)}h ago` : `${Math.round(p.hoursAgo/24)}d ago`;
    return `<div class="rcard">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:8px;background:${bg};color:${fg};white-space:nowrap">${p.srcName}</span>
        <span style="font-size:10px;color:#9ec5e8;font-weight:500;text-align:right;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.area || ""}</span>
        <span style="font-size:9px;color:#9ec5e8;font-weight:600;white-space:nowrap">${timeStr}</span>
      </div>
      <div style="font-size:12px;font-style:italic;color:#f0f6ff;line-height:1.6;margin:6px 0;padding:7px 10px;background:#fafaf5;border-radius:4px;border:1px solid #e8ddb8">"${p.snippet}"</div>
      <div>${sps}</div>
    </div>`;
  }).join("");

  const seeAll = truncated || SOCIAL.length > TOP_N
    ? `<button onclick="openReports()" style="width:100%;margin-top:8px;padding:10px;background:rgba(41,121,181,.15);border:1px solid rgba(41,121,181,.4);color:#1c3a5e;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">📰 See All ${SOCIAL.length} Reports →</button>`
    : "";

  pbody(filterNote + cards + seeAll);
}

// ── BRIEF ─────────────────────────────────────────────────────────────────────
// Render the model's markdown brief into clean, styled HTML. Deliberately small
// and safe: escape everything first, then translate the limited markdown the
// prompt emits (## headers, ### species, **bold**, - bullets, --- rules, and a
// leading "Heads up:" line into a callout). No raw HTML from the model is ever
// trusted — we only add our own tags around escaped text.
function briefMarkdownToHtml(md){
  if(!md || typeof md !== "string") return `<div class="brief-empty">No brief content.</div>`;
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(?<!\*)\*(?!\s)([^*]+?)\*(?!\*)/g, "<i>$1</i>");
  const lines = md.replace(/\r/g, "").split("\n");
  let html = "", listOpen = false;
  const closeList = () => { if(listOpen){ html += "</ul>"; listOpen = false; } };
  for(let raw of lines){
    const line = raw.trim();
    if(!line){ closeList(); continue; }
    // Heads-up safety callout (with or without bold markers)
    const hu = line.match(/^\*{0,2}heads up:?\*{0,2}\s*(.*)$/i);
    if(hu){
      closeList();
      const body = hu[1].replace(/\*\*/g, "");
      html += `<div class="brief-headsup"><span class="bh-icon">⚠️</span><div><b>Heads up:</b> ${inline(body)}</div></div>`;
      continue;
    }
    if(/^---+$/.test(line) || /^\*\*\*+$/.test(line)){ closeList(); continue; }
    if(line.startsWith("### ")){ closeList(); html += `<h3>${inline(line.slice(4))}</h3>`; continue; }
    if(line.startsWith("## ")){ closeList(); html += `<h2>${inline(line.slice(3))}</h2>`; continue; }
    if(line.startsWith("# ")){ closeList(); html += `<h2>${inline(line.slice(2))}</h2>`; continue; }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if(bullet){
      if(!listOpen){ html += "<ul>"; listOpen = true; }
      html += `<li>${inline(bullet[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

// Show the finished brief front-and-center in a modal so the captain doesn't
// have to scroll a side panel to find it. Header shows port + day + run/depth.
function briefModalSubtitle(){
  const parts = [];
  if(activePort) parts.push(activePort);
  parts.push(briefDayLabel(briefDayOffset));
  if(pinLL && typeof activePort !== "undefined" && activePort && typeof PORTS !== "undefined" && PORTS[activePort] && typeof nmBetween === "function"){
    const p = PORTS[activePort];
    const nm = Math.round(nmBetween(p.lat, p.lng, pinLL.lat, pinLL.lng));
    if(Number.isFinite(nm)) parts.push(`${nm} nm run`);
  }
  return parts.join("  ·  ");
}
let _lastBriefId = null;

function briefHistoryPanelHtml(opts = {}){
  const max = opts.max ?? 6;
  const placement = opts.placement || "inline";
  const recent = briefHistoryLoad();
  if(!recent.length){
    return opts.showEmpty ? `
      <div class="brief-history brief-history--empty brief-history--${placement}">
        <div class="brief-history-hdr">Recent briefs (48 hours)</div>
        <p class="brief-empty">Briefs you generate are saved here for 48 hours so you can reopen them.</p>
      </div>` : "";
  }
  const items = recent.slice(0, max).map(b => {
    const spLabel = (b.speciesNames && b.speciesNames.length)
      ? (b.speciesAutoPick ? "Bluewater Recommendation · " : "") + b.speciesNames.slice(0, 2).join(", ") + (b.speciesNames.length > 2 ? "…" : "")
      : "General";
    const run = b.runFromPortNm != null ? `${b.runFromPortNm} nm` : "";
    const safeId = (b.id || "").replace(/'/g, "\\'");
    const active = opts.highlightId && b.id === opts.highlightId;
    return `<button type="button" class="brief-history-btn${active ? " brief-history-btn--active" : ""}" onclick="recallBrief('${safeId}')">
      <div class="brief-history-btn-title">${briefDayLabel(b.fishDayOffset || 0)} · ${(b.port || "Custom pin").replace(/</g,"")}</div>
      <div class="brief-history-btn-meta">${spLabel}${run ? " · " + run : ""} · ${briefHistoryAgeLabel(b.createdAt)}</div>
    </button>`;
  }).join("");
  return `
    <div class="brief-history brief-history--${placement}">
      <div class="brief-history-hdr">Recent briefs (48 hours)</div>
      <div class="brief-history-list">${items}</div>
    </div>`;
}

function openBriefModal(){
  const modal = document.getElementById("brief-modal");
  const body = document.getElementById("brief-modal-body");
  const sub = document.getElementById("brief-modal-sub");
  if(!modal || !body) return;
  const hasBrief = briefLooksSuccessful(aiCOA);
  const historyHtml = briefHistoryPanelHtml({ placement: "modal", max: 6, highlightId: _lastBriefId });
  body.innerHTML = (hasBrief ? `<div class="brief-md">${briefMarkdownToHtml(aiCOA)}</div>` : "")
    + historyHtml
    + (!hasBrief && !historyHtml ? `<p class="brief-empty">Generate a brief from the chart, or open one from your saved list above.</p>` : "");
  if(sub) sub.textContent = hasBrief ? briefModalSubtitle() : (briefHistoryLoad().length ? "Tap a saved brief below to reopen it" : briefModalSubtitle());
  modal.classList.add("open");
  body.scrollTop = 0;
}
function openRecentBriefs(){
  if(!requirePaid()) return;
  const settings = document.getElementById("settings-modal");
  if(settings && settings.classList.contains("open") && typeof toggleSettingsPanel === "function"){
    toggleSettingsPanel();
  }
  openRecentBriefsModal();
}
function openRecentBriefsModal(){
  if(!requirePaid()) return;
  const modal = document.getElementById("brief-modal");
  const body = document.getElementById("brief-modal-body");
  const sub = document.getElementById("brief-modal-sub");
  if(!modal || !body) return;
  const recent = briefHistoryLoad();
  if(!recent.length){
    body.innerHTML = `
      <p class="brief-empty">No saved briefs on this device yet. To create one, open the bite map, tap a cell, and choose <b>AI Captain's Brief</b>. Each brief you generate is saved here for 48 hours.</p>
      <p class="brief-empty" style="margin-top:10px;font-size:12px">Reach this list anytime from <b>MENU → Recent Captain's Briefs</b> or <b>Settings → Recent Captain's Briefs</b>.</p>`;
    if(sub) sub.textContent = "Saved on this device · 48-hour recall";
  } else {
    body.innerHTML = briefHistoryPanelHtml({ placement: "modal", max: 8, highlightId: _lastBriefId });
    if(sub) sub.textContent = `${recent.length} saved · last 48 hours`;
  }
  modal.classList.add("open");
  body.scrollTop = 0;
}
function closeBriefModal(){
  const modal = document.getElementById("brief-modal");
  if(modal) modal.classList.remove("open");
}
// Close on Escape for desktop users.
document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;

  // 1. Brief modal (highest z-index content overlay)
  const briefM = document.getElementById("brief-modal");
  if(briefM && briefM.classList.contains("open")){ closeBriefModal(); return; }

  // 2. Centered modals: layers, basemap, settings
  const layersM = document.getElementById("layers-modal");
  if(layersM && layersM.classList.contains("open")){ toggleLayersPanel(); return; }
  const baseM = document.getElementById("basemap-modal");
  if(baseM && baseM.classList.contains("open")){ toggleBaseMapPanel(); return; }
  const setM = document.getElementById("settings-modal");
  if(setM && setM.classList.contains("open")){ toggleSettingsPanel(); return; }

  // 3. Ocean-legend detail bottom sheet
  const legendSheet = document.getElementById("ocean-legend-sheet");
  if(legendSheet && legendSheet.classList.contains("open")){ closeOceanLegendSheet(); return; }

  // 4. Header dropdowns (species / port)
  const spDd = document.getElementById("sp-dd");
  if(spDd && spDd.classList.contains("open")){ closeDd(); return; }
  const portDd = document.getElementById("port-dd");
  if(portDd && portDd.classList.contains("open")){ closePortDd(); return; }

  // 5. Bite-map explainer panel
  const expl = document.getElementById("predict-explainer");
  if(expl){ closeExplainer(); return; }

  // 6. Nav menu
  if(document.body.classList.contains("nav-open")){ closeNav(); return; }
});

function briefDayLabel(off){
  const tz = displayTimezone();
  const ms = Date.now() + (off || 0) * 86400000;
  const todayKey = calendarDayKeyInTz(Date.now(), tz);
  const targetKey = calendarDayKeyInTz(ms, tz);
  if(off === 0 || targetKey === todayKey) return "Today";
  if(off === 1 || targetKey === nextCalendarDayKeyInTz(Date.now(), tz)) return "Tomorrow";
  return formatWeekdayInTz(ms, tz);
}
function setBriefDay(off){ briefDayOffset = off; renderBrief(); }

function briefLooksSuccessful(text){
  if(!text || !String(text).trim()) return false;
  const t = String(text).trim();
  if(/^(sign in|brief unavailable|couldn't reach|empty brief)/i.test(t)) return false;
  if(/^brief /i.test(t)) return false;
  return /##\s/m.test(t) || /\*\*[^*]+\*\*/.test(t);
}

// ── Brief history (48-hour recall) ───────────────────────────────────────────
function briefHistoryLoad(){
  try {
    const now = Date.now();
    const raw = JSON.parse(localStorage.getItem(BRIEF_HISTORY_KEY) || "[]");
    return raw.filter(b => b && b.expiresAt > now && b.brief)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch { return []; }
}
function briefHistorySave(list){
  try { localStorage.setItem(BRIEF_HISTORY_KEY, JSON.stringify(list.slice(0, BRIEF_HISTORY_MAX))); } catch(e){}
}
function refreshBriefRecallUi(){
  const count = briefHistoryLoad().length;
  const navSub = document.getElementById("nav-brief-recall-sub");
  if(navSub){
    navSub.textContent = count
      ? `${count} saved on this device · last 48 hours`
      : "Reopen briefs from the last 48 hours";
  }
  const settingsBtn = document.getElementById("settings-recent-briefs-btn");
  if(settingsBtn){
    settingsBtn.textContent = count
      ? `📋 Recent Captain's Briefs (${count})`
      : "📋 Recent Captain's Briefs";
  }
  const settingsHint = document.getElementById("settings-recent-briefs-hint");
  if(settingsHint){
    settingsHint.textContent = count
      ? `${count} brief${count === 1 ? "" : "s"} saved on this device. Tap to reopen without rerunning the bite map.`
      : "Briefs you generate are saved on this device for 48 hours so you can reopen them without rerunning the bite map.";
  }
}
function briefHistoryAdd(entry){
  const list = briefHistoryLoad();
  list.unshift(entry);
  briefHistorySave(list);
  refreshBriefRecallUi();
}
function briefHistoryAgeLabel(createdAt){
  const h = Math.floor((Date.now() - createdAt) / 3600000);
  if(h < 1) return "just now";
  if(h === 1) return "1h ago";
  if(h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1d ago" : `${d}d ago`;
}
function recallBrief(id){
  const h = briefHistoryLoad().find(b => b.id === id);
  if(!h || !h.brief) return;
  _lastBriefId = h.id;
  aiCOA = h.brief;
  pinLL = { lat: h.pinLat, lng: h.pinLng };
  briefDayOffset = h.fishDayOffset || 0;
  briefSp = Array.isArray(h.speciesIds) ? h.speciesIds.filter(x => x) : [];
  briefAutoPick = !!h.speciesAutoPick;
  if(typeof classifyWaterType === "function"){
    const wt = classifyWaterType(h.pinLat, h.pinLng);
    briefRunZone = (wt === "bay") ? "inshore" : wt;
  }
  renderBrief();
  openBriefModal();
}

function renderBrief(){
  const portObj = (activePort && typeof PORTS !== "undefined") ? PORTS[activePort] : null;
  if(portObj && !briefRunZone && activeSpId && activeSpId !== "all"){
    briefRunZone = defaultBriefRunZone(activeSpId);
    pinLL = briefPinForZone(portObj, briefRunZone);
  }
  const allowed = briefSpeciesForSpot();
  briefSp = briefSp.filter(id => allowed.some(s => s.id === id)).slice(0, BRIEF_MAX_SPECIES);
  if(briefDayOffset > 1) briefDayOffset = 1;
  if(!briefAutoPick && !briefSp.length && typeof activeSpId !== "undefined" &&
     activeSpId && activeSpId !== "all" && allowed.some(s => s.id === activeSpId)){
    briefSp = [activeSpId];
  }
  const autoPreview = (briefAutoPick && pinLL)
    ? briefPickSpeciesAuto(pinLL.lat, pinLL.lng, allowed, BRIEF_MAX_SPECIES)
    : { picks: [], candidates: [] };
  const recOn = briefAutoPick;
  const recColor = "#5eead4";
  const atCap = !briefAutoPick && briefSp.length >= BRIEF_MAX_SPECIES;
  const speciesPills = allowed.map(sp => {
    const on = !briefAutoPick && briefSp.includes(sp.id);
    const disabled = briefAutoPick || (atCap && !on) ? "disabled" : "";
    const dim = briefAutoPick ? "opacity:.45;pointer-events:none"
      : (atCap && !on) ? "opacity:.35;pointer-events:none" : "";
    return `<button class="sp-pill" style="border-color:${on?sp.color:"rgba(255,255,255,.16)"};background:${on?sp.color+"22":"rgba(255,255,255,.04)"};color:${on?sp.color:"#cfe5ff"};${dim}" ${disabled} onclick="toggleBriefSp('${sp.id}')">${sp.name}</button>`;
  }).join("");
  const recPill = `<button type="button" class="sp-pill" style="border-color:${recOn?recColor:"rgba(94,234,212,.35)"};background:${recOn?"rgba(14,165,165,.22)":"rgba(255,255,255,.04)"};color:${recOn?recColor:"#9ec5e8"};font-weight:800" onclick="setBriefAutoPick(true)">✦ Bluewater Recommendation</button>`;
  const autoPreviewHtml = recOn && autoPreview.picks.length
    ? `<p style="color:#99f6e4;font-size:12px;margin:0 0 10px;line-height:1.45"><b>Targeting:</b> ${autoPreview.picks.map(p => `${p.name} (${p.scorePct}/100${p.inSeason ? "" : ", off-season"})`).join(" · ")}</p>`
    : (recOn && pinLL
      ? `<p style="color:#f0a868;font-size:12px;margin:0 0 10px;line-height:1.45">No strong bite for any species here on ${briefDayLabel(briefDayOffset)}. Pick a target manually to brief it anyway.</p>`
      : "");
  const speciesCapNote = !briefAutoPick
    ? `<p style="color:#9ec5e8;font-size:11px;margin:0 0 8px;line-height:1.4">Pick up to ${BRIEF_MAX_SPECIES} targets${atCap ? " (max reached)" : ""} — multi-species briefs get a separate run for each fish when their best water differs.</p>`
    : "";
  const recentCount = briefHistoryLoad().length;
  const recentFooter = recentCount
    ? `<button type="button" class="brief-view-btn brief-recent-btn" onclick="openRecentBriefsModal()">Open all recent briefs (${recentCount}) ↗</button>`
    : "";
  const dayBtns = [0,1].map(off=>{
    const on = briefDayOffset === off;
    return `<button class="brief-day" style="border:1px solid ${on?'#5eead4':'rgba(255,255,255,.12)'};background:${on?'rgba(14,165,165,.18)':'rgba(255,255,255,.04)'};color:${on?'#5eead4':'#9ec5e8'};font-family:inherit;font-weight:700;font-size:11px;padding:7px 14px;border-radius:8px;cursor:pointer;white-space:nowrap" onclick="setBriefDay(${off})">${briefDayLabel(off)}</button>`;
  }).join("");
  const hasPin = !!pinLL;
  const showZonePicker = !!portObj;
  let runMeta = "";
  if(portObj && pinLL && typeof nmBetween === "function"){
    const nm = Math.round(nmBetween(portObj.lat, portObj.lng, pinLL.lat, pinLL.lng));
    let brg = "";
    if(typeof bwiCompass16 === "function"){
      const toRad = d => d * Math.PI / 180;
      const y = Math.sin(toRad(pinLL.lng - portObj.lng)) * Math.cos(toRad(pinLL.lat));
      const x = Math.cos(toRad(portObj.lat)) * Math.sin(toRad(pinLL.lat)) -
                Math.sin(toRad(portObj.lat)) * Math.cos(toRad(pinLL.lat)) * Math.cos(toRad(pinLL.lng - portObj.lng));
      brg = bwiCompass16((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
    }
    runMeta = `⛵ ${nm} nm${brg ? " " + brg : ""} out`;
  }
  const planCount = Array.isArray(_briefRunPlanSpots) ? _briefRunPlanSpots.length : 0;
  const departCard = `
    <div class="brief-depart">
      <div class="brief-depart-main">
        <span class="brief-depart-ico" aria-hidden="true">⚓</span>
        <div style="min-width:0">
          <div class="brief-depart-lbl">Departing from</div>
          <div class="brief-depart-port${activePort ? "" : " none"}">${activePort || "No home port selected — pick one to set your run"}</div>
        </div>
      </div>
      <div class="brief-depart-meta">
        ${planCount > 1 ? `<span class="brief-depart-chip">Top ${planCount} Bite Map spots</span>` : ""}
        ${briefRunZone ? `<span class="brief-depart-chip">${briefZoneLabel(briefRunZone)}</span>` : ""}
        ${runMeta ? `<span>${runMeta}</span>` : ""}
        <span>🗓️ ${briefDayLabel(briefDayOffset)}</span>
      </div>
      ${planCount > 1 ? `<div style="font-size:10.5px;color:#7dd3fc;margin-top:7px;line-height:1.4">Ranked from the Bite Map's highest-scoring water for your species — not a fixed inshore/offshore choice.</div>` : ""}
    </div>`;
  const zoneBtns = ["inshore", "nearshore", "offshore"].map(zone => {
    const on = briefRunZone === zone;
    return `<button class="brief-day" style="border:1px solid ${on?'#5eead4':'rgba(255,255,255,.12)'};background:${on?'rgba(14,165,165,.18)':'rgba(255,255,255,.04)'};color:${on?'#5eead4':'#9ec5e8'};font-family:inherit;font-weight:700;font-size:11px;padding:7px 14px;border-radius:8px;cursor:pointer;white-space:nowrap" onclick="setBriefRunZone('${zone}')">${briefZoneLabel(zone)}</button>`;
  }).join("");
  const speciesNote = !allowed.length
    ? `<p style="color:#9ec5e8;font-size:12px;margin-bottom:8px">Select a home port and fishing zone to see species for your area.</p>`
    : "";
  pbody(`
    ${departCard}
    ${!hasPin && !showZonePicker ? `<p style="color:#9ec5e8;font-size:12px;margin-bottom:12px;line-height:1.5">Tap the chart to drop a weather pin first.</p>` : ""}
    <div style="font-size:11px;color:#cfe5ff;font-weight:600;margin-bottom:6px;letter-spacing:.05em">WHICH DAY ARE YOU FISHING?</div>
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px">${dayBtns}</div>
    ${showZonePicker ? `
    <div style="font-size:11px;color:#cfe5ff;font-weight:600;margin-bottom:6px;letter-spacing:.05em">WHERE ARE YOU FISHING?</div>
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px">${zoneBtns}</div>` : ""}
    <div style="font-size:11px;color:#cfe5ff;font-weight:600;margin-bottom:6px;letter-spacing:.05em">TARGET SPECIES</div>
    ${speciesNote}
    ${speciesCapNote}
    ${autoPreviewHtml}
    <div class="sp-pills">${speciesPills || `<span style="font-size:12px;color:#9ec5e8">No species for this zone yet.</span>`}${allowed.length ? recPill : ""}</div>
    <button id="brief-btn" ${!hasPin||aiLoading?"disabled":""} onclick="runBrief()">
      ${aiLoading?"GENERATING BRIEF...":"GENERATE AI CAPTAIN'S BRIEF"}</button>
    ${(briefLooksSuccessful(aiCOA) && !aiLoading)?`<button type="button" class="brief-view-btn" onclick="openBriefModal()">View your Captain's Brief ↗</button>`:""}
    ${(aiCOA && !aiLoading && !briefLooksSuccessful(aiCOA))?`<p style="margin-top:10px;font-size:12px;color:#f0a0a0;line-height:1.45">${String(aiCOA).replace(/</g,"&lt;")}</p>`:""}
    ${recentFooter}
  `);
}
function toggleBriefSp(id){
  briefAutoPick = false;
  if(briefSp.includes(id)){
    briefSp = briefSp.filter(x => x !== id);
  } else {
    if(briefSp.length >= BRIEF_MAX_SPECIES){
      if(typeof showToast === "function"){
        showToast(`Captain's Brief is capped at ${BRIEF_MAX_SPECIES} species — deselect one to add another.`, "info");
      }
      return;
    }
    briefSp = [...briefSp, id];
  }
  renderBrief();
}
function setBriefAutoPick(on){
  briefAutoPick = !!on;
  if(briefAutoPick){
    briefSp = [];
    const preview = (pinLL && typeof briefPickSpeciesAuto === "function")
      ? briefPickSpeciesAuto(pinLL.lat, pinLL.lng, briefSpeciesForSpot(), 1)
      : { picks: [] };
    if(preview.picks[0] && preview.picks[0].lat != null){
      pinLL = { lat: preview.picks[0].lat, lng: preview.picks[0].lng };
    }
  }
  renderBrief();
}
function structureNear(lat, lng, maxNm = 40, limit = 4){
  if(typeof CANYONS === "undefined") return [];
  // Great-circle initial bearing (deg) from the pin toward a structure, so the
  // brief can say which way to slide (e.g. "the canyon edge 6 nm SE").
  const bearingTo = (la2, ln2) => {
    const toRad = d => d * Math.PI / 180;
    const y = Math.sin(toRad(ln2 - lng)) * Math.cos(toRad(la2));
    const x = Math.cos(toRad(lat)) * Math.sin(toRad(la2)) -
              Math.sin(toRad(lat)) * Math.cos(toRad(la2)) * Math.cos(toRad(ln2 - lng));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  return CANYONS
    .map(c => ({
      name: c.name,
      nm: Math.round(nmBetween(lat, lng, c.lat, c.lng)),
      bearing: (typeof bwiCompass16 === "function") ? bwiCompass16(bearingTo(c.lat, c.lng)) : null,
      // Short human description + the species this structure is known for, so
      // the brief has real context instead of just a name and distance.
      desc: c.desc || null,
      fish: Array.isArray(c.fish) ? c.fish : null,
    }))
    .filter(c => c.nm <= maxNm)
    .sort((a,b) => a.nm - b.nm)
    .slice(0, limit);
}

// Are the shared ocean-data grids already loaded with coverage at this pin? The
// AI brief reads water temp, chlorophyll, thermal break, and the bite-score
// factors from the SAME grids that power the Bite Map (SST_GRID / CHLOR_GRID /
// OCEAN_FIELD / PREDICT_CUR_GRID). Those grids are normally built when the heat
// map renders — so a captain who just drops a pin and hits "Generate Brief"
// without ever turning on an overlay would otherwise send an empty payload and
// get a data-poor brief. This lets runBrief() know when it must load them first.
function briefGridsCoverPin(pinLL){
  const sstOk = (typeof sstGridAt === "function" && !!sstGridAt(pinLL.lat, pinLL.lng)) ||
                (typeof SST_GRID !== "undefined" && SST_GRID && SST_GRID.median != null);
  const fieldOk = (typeof OCEAN_FIELD !== "undefined" && OCEAN_FIELD.samples && OCEAN_FIELD.samples.length > 0);
  return !!(sstOk && fieldOk);
}

// Proactively load the ocean/prediction grids for the area we're briefing, so
// the brief is DATA-RICH even when no map overlay is on. Scopes a bounding box
// around the departure port's fishing range (falling back to a box around the
// pin) and calls the same one-request loader the Bite Map uses. Best-effort:
// on any failure the brief still builds from whatever data is already present.
async function ensureBriefOceanData(pinLL, portObj){
  try {
    if(briefGridsCoverPin(pinLL)) return;
    if(typeof buildPredictInputs !== "function") return;
    const LAT_MIN = 24.0, LAT_MAX = 43.5, LNG_MIN = -97.5, LNG_MAX = -68.5;
    let latMin, latMax, lngMin, lngMax;
    if(portObj){
      const maxRange = (typeof maxRangeForPort === "function") ? maxRangeForPort(portObj) : 100;
      const degLat = (maxRange / 60) + 0.15;
      const degLng = (maxRange / (60 * Math.cos(portObj.lat * Math.PI / 180))) + 0.15;
      latMin = portObj.lat - degLat; latMax = portObj.lat + degLat;
      lngMin = portObj.lng - degLng; lngMax = portObj.lng + degLng;
    } else {
      const pad = 1.2;
      latMin = pinLL.lat - pad; latMax = pinLL.lat + pad;
      lngMin = pinLL.lng - pad; lngMax = pinLL.lng + pad;
    }
    // Guarantee the pin itself is inside the box — an offshore pin can sit at or
    // just beyond the port's nominal range.
    const edge = 0.25;
    latMin = Math.min(latMin, pinLL.lat - edge); latMax = Math.max(latMax, pinLL.lat + edge);
    lngMin = Math.min(lngMin, pinLL.lng - edge); lngMax = Math.max(lngMax, pinLL.lng + edge);
    // Clamp to the coastal data extent.
    latMin = Math.max(LAT_MIN, latMin); latMax = Math.min(LAT_MAX, latMax);
    lngMin = Math.max(LNG_MIN, lngMin); lngMax = Math.min(LNG_MAX, lngMax);
    await buildPredictInputs(latMin, latMax, lngMin, lngMax);
  } catch(e){ /* best-effort — brief still builds from whatever loaded */ }
}
// Top Bite-Map spots for a run plan, best-first, spread out so we don't
// recommend three cells stacked on one piece of structure (~4 nm apart).
function topBriefHotspots(limit){
  // Prefer the cached badge list so the banner run plan matches the map pins.
  if(_predictResultCache && _predictResultCache.key === predictResultCacheKey() && _predictResultCache.badges){
    return _predictResultCache.badges.slice(0, limit || 3);
  }
  return pickTopHotspotBadges(_predictGrid, limit || 3);
}

// Compact, network-free summary of one run-plan spot: coords, depth, run from
// the port, nearby structure, and the per-species bite score AT that spot (same
// engine as the Bite Map). Deliberately lean — the run plan adds spots to ONE
// model call, so we send only what distinguishes each spot, not a duplicate
// conditions block (nearby spots share the same area weather).
function briefSpotSummary(spotLL, spIds, portObj, rank){
  let depthFt = null;
  try { if(typeof realDepthAt === "function"){ const m = realDepthAt(spotLL.lat, spotLL.lng); if(m != null) depthFt = Math.round(m * 3.281); } } catch(e){}
  const bite = [];
  try {
    if(typeof scoreCell === "function"){
      for(const id of spIds){
        const r = scoreCell(spotLL.lat, spotLL.lng, id);
        if(r) bite.push({
          species: (typeof SPECIES !== "undefined" && SPECIES.find(s=>s.id===id)?.name) || id,
          score: r.score != null ? Math.round(r.score*100) : null,
          confidence: r.confidence != null ? Math.round(r.confidence*100) : null,
          topFactor: r.topFactor || null,
          inSeason: r.inSeason !== false,
          sstF: r.sst != null ? Math.round(r.sst*10)/10 : null,
          thermalBreakFper10nm: (r.tBreak != null && r.tBreak > 0) ? Math.round(r.tBreak*10)/10 : null,
        });
      }
    }
  } catch(e){}
  return {
    rank,
    lat: spotLL.lat, lng: spotLL.lng,
    depthFt,
    runFromPortNm: (portObj && typeof nmBetween === "function") ? Math.round(nmBetween(portObj.lat, portObj.lng, spotLL.lat, spotLL.lng)) : null,
    nearbyStructure: (typeof structureNear === "function") ? structureNear(spotLL.lat, spotLL.lng, 30, 2) : [],
    biteScores: bite,
  };
}

// Banner entry point removed — Captain's Brief is opened from the Bite Map
// explainer (tap a hotspot → AI Captain's Brief). Kept as a thin wrapper in
// case other UI paths need the multi-spot run plan later.
function openCaptainsBrief(){
  if(!activePort){ if(typeof showToast === "function") showToast("Pick a home port first, then tap Captain's Brief.", "info"); return; }
  const spots = topBriefHotspots(3);
  if(!spots.length){
    if(typeof showToast === "function") showToast("Turn on the Bite Map and pick a target species — then Captain's Brief will plan your top spots.", "info");
    return;
  }
  showPredictionExplainer(spots[0], _predictSpecies);
  _briefRunPlanSpots = spots;   // re-arm AFTER showPredictionExplainer (which clears it)
  if(typeof openSubPanel === "function") openSubPanel("brief");
}

async function runBrief(){
  if(!pinLL||aiLoading)return;
  // AI Captain's Brief is a PAID feature (active subscription / owner)
  // — not included in the 7-day trial. The server also enforces this + 2/day.
  if(!requirePaid()) return;

  const allowed = briefSpeciesForSpot();
  let autoPickMeta = null;
  let sp;
  if(briefAutoPick){
    const { picks } = briefPickSpeciesAuto(pinLL.lat, pinLL.lng, allowed, BRIEF_MAX_SPECIES);
    if(!picks.length){
      showToast("Nothing's biting strongly here for that day. Pick a target manually to brief it anyway.", "info");
      return;
    }
    sp = picks.map(p => p.id).slice(0, BRIEF_MAX_SPECIES);
    autoPickMeta = {
      mode: "auto",
      rationale: picks.map((p, i) => ({
        rank: i + 1,
        species: p.name,
        score: p.scorePct,
        confidence: p.confidencePct,
        inSeason: p.inSeason,
        seasonStrength: Math.round(p.seasonStrength * 100) / 100,
        topFactor: p.topFactor,
      })),
      primaryTarget: picks[0].name,
    };
  } else {
    sp = briefSp.length ? briefSp : (activeSpId==="all" ? [] : [activeSpId]);
    sp = sp.slice(0, BRIEF_MAX_SPECIES);
    if(!sp.length){
      showToast("Pick target species below, or choose Bluewater Recommendation.", "info");
      return;
    }
  }

  aiLoading=true;aiCOA="";renderBrief();

  const speciesNames = sp.map(id => SPECIES.find(s=>s.id===id)?.name).filter(Boolean);
  const port = activePort || null;
  const portObj = port && PORTS[port] ? PORTS[port] : null;

  // Make the app's rich SST/chlorophyll/current/ocean-field data available for
  // this spot BEFORE we build the payload — even if the captain never turned on
  // a map overlay. Without this the grids are empty and the brief reports "no
  // water temp / no chlorophyll / no break" despite the data existing.
  await ensureBriefOceanData(pinLL, portObj);

  // ── Gather the REAL conditions the app already has for this pin, so the brief
  //    is grounded in data instead of generic guesses. We pull live ocean/marine
  //    data (NDBC buoys + forecast model + NOAA tide) via BW_OCEAN, the bite
  //    score per selected species via scoreCell, and depth/structure context.
  //    Everything is best-effort: any field we can't get is sent as null and the
  //    prompt is instructed to omit what's missing rather than invent it.
  let cond = null, tide = null;
  try {
    if(typeof BW_OCEAN !== "undefined" && BW_OCEAN.fetchOcean){
      const o = await BW_OCEAN.fetchOcean(pinLL.lat, pinLL.lng);
      if(o){
        const waterF = (o.waterTemp?.value != null) ? o.waterTemp.value : o.sst?.value;
        cond = {
          waterTempF: waterF != null ? Math.round(waterF*10)/10 : null,
          waterTempObservedAtMs: (o.waterTemp?.observedAtMs ?? o.sst?.observedAtMs) ?? null,
          airTempF:   o.airTemp?.value != null ? Math.round(o.airTemp.value) : null,
          airTempHiF: o.airTemp?.highF != null ? Math.round(o.airTemp.highF) : null,
          airTempLoF: o.airTemp?.lowF  != null ? Math.round(o.airTemp.lowF)  : null,
          waveHtFt:   o.waves?.value != null ? Math.round(o.waves.value*10)/10 : null,
          wavePeriodS:o.waves?.periodS != null ? Math.round(o.waves.periodS) : null,
          windKt:     o.wind?.value != null ? Math.round(o.wind.value) : null,
          windDir:    o.wind?.dir != null ? (typeof bwiCompass16==="function"?bwiCompass16(o.wind.dir):o.wind.dir) : null,
          windGustKt: o.wind?.gustKts != null ? Math.max(Math.round(o.wind.gustKts), o.wind?.value != null ? Math.round(o.wind.value) : 0) : null,
          pressureMb: o.barometer?.value != null ? Math.round(o.barometer.value) : null,
          pressureTrend: o.barometer?.trend || null,
          chlorophyll: o.chlor?.value != null ? Math.round(o.chlor.value*100)/100 : null,
          // Ocean current at the pin (RTOFS via backend): drift in knots, set as
          // the compass direction the water flows toward. Null until the backend
          // returns current data; the brief prompt omits nulls.
          currentDriftKt: o.current?.driftKts != null ? Math.round(o.current.driftKts*10)/10 : null,
          currentSetDir: o.current?.setDeg != null ? (typeof bwiCompass16==="function"?bwiCompass16(o.current.setDeg):Math.round(o.current.setDeg)) : null,
          buoy: o.sources?.buoy?.id || null,
          source: o.sources?.buoy?.id ? "NDBC buoy + model" : "forecast model",
        };
        if(o.tide){
          tide = {
            state: o.tide.state || null,
            nextHigh: o.tide.nextHigh || null,
            nextLow: o.tide.nextLow || null,
            station: o.sources?.tide || null,
          };
        }
      }
    }
  } catch(e){ /* conditions are best-effort */ }

  // Overlay the FORECAST for the day the captain plans to fish. BW_OCEAN above
  // gives "now" (buoy + model), but the brief is scoped to fishDate, and we want
  // the forecasted high/low air temp for that day. fetchForecast() returns a
  // per-day forecast (air hi/lo, wind, gusts, seas) indexed by day offset, so we
  // fill the hi/lo for the fish date and, for FUTURE days, swap the live wind/seas
  // for that day's forecast. Best-effort — any failure just leaves nulls.
  try {
    if(typeof fetchForecast === "function"){
      const days = await fetchForecast(pinLL.lat, pinLL.lng);
      const fd = Array.isArray(days) ? days[briefDayOffset] : null;
      if(fd){
        cond = cond || {};
        if(fd.airHiF != null) cond.airTempHiF = fd.airHiF;
        if(fd.airLoF != null) cond.airTempLoF = fd.airLoF;
        // Open-Meteo weather code → a plain-language sky summary for the brief.
        if(fd.wxCode != null && typeof bwiWeatherIcon === "function"){
          const wx = bwiWeatherIcon(fd.wxCode, fd.precip);
          if(wx && wx.label) cond.sky = wx.label;
        }
        if(fd.precip != null) cond.precipChancePct = fd.precip;
        if(briefDayOffset > 0){
          // Future day → the live buoy reading isn't for that day; use the forecast
          // as the authoritative source for the whole conditions block.
          if(fd.windKt  != null) cond.windKt      = fd.windKt;
          if(fd.windDir != null) cond.windDir     = (typeof bwiCompass16==="function"?bwiCompass16(fd.windDir):fd.windDir);
          if(fd.gustKt  != null) cond.windGustKt  = fd.gustKt;
          if(fd.waveFt  != null) cond.waveHtFt    = fd.waveFt;
          if(fd.wavePer != null) cond.wavePeriodS = fd.wavePer;
          if(fd.sstF    != null && cond.waterTempF == null){ cond.waterTempF = fd.sstF; cond.waterTempSource = "Open-Meteo marine forecast"; }
          cond.source = "Open-Meteo forecast";
        } else {
          // Today → keep the live buoy values, but fill ANY gap from the forecast.
          // Previously wind speed/direction were never gap-filled on "today", so an
          // offshore spot with no nearby buoy showed empty wind even though a real
          // forecast was available — the exact failure captains reported.
          if(cond.windKt      == null && fd.windKt  != null) cond.windKt      = fd.windKt;
          if(cond.windDir     == null && fd.windDir != null) cond.windDir     = (typeof bwiCompass16==="function"?bwiCompass16(fd.windDir):fd.windDir);
          if(cond.windGustKt  == null && fd.gustKt  != null) cond.windGustKt  = fd.gustKt;
          if(cond.waveHtFt    == null && fd.waveFt  != null) cond.waveHtFt    = fd.waveFt;
          if(cond.wavePeriodS == null && fd.wavePer != null) cond.wavePeriodS = fd.wavePer;
          if(cond.waterTempF  == null && fd.sstF    != null){ cond.waterTempF = fd.sstF; cond.waterTempSource = "Open-Meteo marine forecast"; }
          // If the live block had no buoy AND the wind now comes from the model,
          // reflect that in the source label so the brief attributes it honestly.
          if(!cond.buoy && cond.windKt != null && (cond.source == null || cond.source === "forecast model")) cond.source = "forecast model";
        }
      }
    }
  } catch(e){ /* forecast overlay is best-effort */ }

  // Depth at the pin (for sea-state / structure context).
  let depthFt = null;
  try { if(typeof realDepthAt === "function"){ const m = realDepthAt(pinLL.lat, pinLL.lng); if(m!=null) depthFt = Math.round(m*3.281); } } catch(e){}

  // ── Fill water temp / chlorophyll from the SAME grids the Bite Map uses ──────
  // BW_OCEAN.fetchOcean() often returns null SST/chlor for a single offshore pin
  // (satellite cloud gaps, no point sample). But the app has already loaded a
  // dense SST/chlor grid for the map, with a regional-median fallback. Sample it
  // here so the brief reports real water temp/color instead of "no data", exactly
  // like the map does. Regional values are labeled so the prompt can caveat them.
  try {
    cond = cond || {};
    if(cond.waterTempF == null){
      let s = (typeof sstGridAt === "function") ? sstGridAt(pinLL.lat, pinLL.lng) : null;
      if((!s || s.value == null) && typeof SST_GRID !== "undefined" && SST_GRID && SST_GRID.median != null){
        s = { value: SST_GRID.median, observedAtMs: SST_GRID.freshestMs, _regional: true };
      }
      if(s && s.value != null){
        cond.waterTempF = Math.round(s.value*10)/10;
        cond.waterTempObservedAtMs = cond.waterTempObservedAtMs ?? s.observedAtMs ?? null;
        cond.waterTempSource = s._regional ? "satellite SST (area median)" : "satellite SST grid";
        if(s._regional) cond.waterTempRegional = true;
      }
    }
    if(cond.chlorophyll == null && typeof chlorGridAt === "function"){
      const ch = chlorGridAt(pinLL.lat, pinLL.lng);
      if(ch && ch.value != null) cond.chlorophyll = Math.round(ch.value*100)/100;
    }
    // Thermal (temperature) break strength at the pin, in °F per 10 nm, from the
    // dense SST grid — the single most important offshore tuna signal. Non-null
    // only where the grid has coverage around the pin.
    if(typeof thermalBreakReal === "function"){
      const tb = thermalBreakReal(pinLL.lat, pinLL.lng);
      if(tb != null && tb > 0) cond.thermalBreakFper10nm = Math.round(tb*10)/10;
    }
    // Ocean current at the pin from the RTOFS grid the Bite Map uses. The single
    // offshore-pin fetch above usually has no current; the grid does. Drift in
    // knots + set (compass direction the water flows toward).
    if(cond.currentDriftKt == null && typeof sampleCurrentGrid === "function" &&
       typeof PREDICT_CUR_GRID !== "undefined" && PREDICT_CUR_GRID){
      const c = sampleCurrentGrid(PREDICT_CUR_GRID, pinLL.lat, pinLL.lng);
      if(c && c.driftKts != null){
        cond.currentDriftKt = Math.round(c.driftKts*10)/10;
        cond.currentSetDir = (typeof bwiCompass16==="function") ? bwiCompass16(c.setDeg) : Math.round(c.setDeg);
      }
    }
    // Current EDGE / shear (kt per 10 nm) — the drift line (Gulf Stream wall,
    // eddy rim) where bait and weed stack. A strong edge is a prime target.
    if(typeof currentShearAt === "function"){
      const sh = currentShearAt(pinLL.lat, pinLL.lng);
      if(sh != null && sh > 0) cond.currentEdgeKtPer10nm = Math.round(sh*100)/100;
    }
  } catch(e){ /* grid sampling is best-effort */ }

  // ── Tide: use the DEPARTURE PORT (inlet) when the offshore pin has none ──────
  // Offshore spots have no nearby NOAA tide station, so the pin fetch returns no
  // tide. But the inlet the captain leaves from does — and inlet tide timing is
  // exactly what matters for the run out and back. Fill it from the port, then
  // enrich with the same CO-OPS high/low schedule the header banner uses
  // (ocean fetch only returns state, not nextHigh/nextLow).
  if(!tide && portObj && typeof BW_OCEAN !== "undefined" && BW_OCEAN.fetchOcean){
    try {
      const op = await BW_OCEAN.fetchOcean(portObj.lat, portObj.lng);
      if(op && op.tide){
        tide = {
          state: op.tide.state || null,
          nextHigh: op.tide.nextHigh || null,
          nextLow: op.tide.nextLow || null,
          station: op.sources?.tide || null,
          atPort: true,
        };
      }
    } catch(e){ /* port tide is best-effort */ }
  }
  try {
    let station = tide && tide.station;
    if(!station && portObj && typeof bwFetchPortConditions === "function"){
      const op = await bwFetchPortConditions(portObj.lat + 0.05, portObj.lng + 0.05);
      station = op && op.sources ? op.sources.tide : null;
    }
    if(station && typeof fetchNextTideEvent === "function"){
      const next = await fetchNextTideEvent(station);
      if(next && next.events && next.events.length){
        const nextH = next.events.find(e => e.type === "H");
        const nextL = next.events.find(e => e.type === "L");
        tide = {
          state: next.state || (tide && tide.state) || null,
          nextHigh: nextH ? nextH.timeTxt : null,
          nextLow: nextL ? nextL.timeTxt : null,
          nextEvents: next.events.slice(0, 2).map(e => ({
            type: e.type === "H" ? "High" : "Low",
            time: e.timeTxt,
          })),
          headerText: (typeof formatTideHeader === "function") ? formatTideHeader(next) : null,
          station,
          atPort: true,
        };
      }
    }
  } catch(e){ /* CO-OPS hi/lo enrichment is best-effort */ }

  // Per-species bite score at each species' BEST cell across the port fishing
  // range (not one shared pin). White marlin N of the inlet and wahoo S must
  // get separate run bearings when the Bite Map disagrees.
  let scored = [];
  let runPlan = null;
  let speciesLocationsDiverge = false;
  withForecastHour(forecastHourForBriefDay(briefDayOffset), () => {
    try {
      if(typeof scoreCell === "function"){
        const locations = (typeof briefPortSearchLocations === "function")
          ? briefPortSearchLocations(portObj, pinLL.lat, pinLL.lng)
          : (typeof briefPickScoreLocations === "function")
            ? briefPickScoreLocations(pinLL.lat, pinLL.lng)
            : [{ lat: pinLL.lat, lng: pinLL.lng }];
        if(!locations.length) locations.push({ lat: pinLL.lat, lng: pinLL.lng });
        for(const id of sp.slice(0, BRIEF_MAX_SPECIES)){
          let best = null;
          for(const pt of locations){
            const r = scoreCell(pt.lat, pt.lng, id);
            if(!r || r.outOfRange) continue;
            const score = Number.isFinite(r.score) ? r.score : 0;
            if(!best || score > best._score){
              best = {
                _score: score,
                speciesId: id,
                species: SPECIES.find(s=>s.id===id)?.name || id,
                score: Math.round(score * 100),
                topFactor: r.topFactor || null,
                topFactors: Array.isArray(r.topFactors) ? r.topFactors : null,
                confidence: r.confidence != null ? Math.round(r.confidence*100) : null,
                inSeason: r.inSeason !== false,
                outOfRange: r.outOfRange === true,
                seasonStrength: r.seasonStrength != null ? r.seasonStrength : null,
                sstF: r.sst != null ? Math.round(r.sst*10)/10 : null,
                thermalBreakFper10nm: r.tBreak != null && r.tBreak > 0 ? Math.round(r.tBreak*10)/10 : null,
                scoredAtLat: pt.lat,
                scoredAtLng: pt.lng,
              };
            }
          }
          if(best){
            delete best._score;
            scored.push(briefEnrichSpeciesSpot(best, portObj));
          }
        }
        // Sort best-first so the primary header follows the strongest target.
        scored.sort((a, b) => (b.score || 0) - (a.score || 0));
        // Spots diverge when any two best cells are >~10 nm apart — brief must
        // list separate runs (N vs S of the inlet) instead of one shared Point.
        if(scored.length >= 2 && typeof nmBetween === "function"){
          for(let i = 0; i < scored.length && !speciesLocationsDiverge; i++){
            for(let j = i + 1; j < scored.length; j++){
              const a = scored[i], b = scored[j];
              if(a.scoredAtLat == null || b.scoredAtLat == null) continue;
              if(nmBetween(a.scoredAtLat, a.scoredAtLng, b.scoredAtLat, b.scoredAtLng) >= 10){
                speciesLocationsDiverge = true;
                break;
              }
            }
          }
        }
        // Keep the brief pin on the primary species' best cell for area weather.
        if(scored[0] && scored[0].scoredAtLat != null){
          pinLL = { lat: scored[0].scoredAtLat, lng: scored[0].scoredAtLng };
          if(scored[0].depthFt != null) depthFt = scored[0].depthFt;
          else {
            try {
              if(typeof realDepthAt === "function"){
                const m = realDepthAt(pinLL.lat, pinLL.lng);
                if(m != null) depthFt = Math.round(m * 3.281);
              }
            } catch(e){}
          }
        }
      }
    } catch(e){}
    // Optional RUN PLAN: top 2-3 Bite Map spots in one model call.
    if(_briefRunPlanSpots && _briefRunPlanSpots.length >= 2){
      runPlan = _briefRunPlanSpots.map((s, i) => briefSpotSummary({ lat: s.lat, lng: s.lng }, sp, portObj, i + 1));
    }
  });

  // Refresh water/break at the primary species' best cell after pin snap.
  try {
    cond = cond || {};
    if(typeof sstGridAt === "function"){
      const s = sstGridAt(pinLL.lat, pinLL.lng);
      if(s && s.value != null){
        cond.waterTempF = Math.round(s.value * 10) / 10;
        cond.waterTempSource = "satellite SST grid";
        cond.waterTempRegional = false;
      }
    }
    if(typeof thermalBreakReal === "function"){
      const tb = thermalBreakReal(pinLL.lat, pinLL.lng);
      if(tb != null && tb > 0) cond.thermalBreakFper10nm = Math.round(tb * 10) / 10;
    }
    if(typeof chlorGridAt === "function"){
      const ch = chlorGridAt(pinLL.lat, pinLL.lng);
      if(ch && ch.value != null) cond.chlorophyll = Math.round(ch.value * 100) / 100;
    }
  } catch(e){}

  // Captain-facing translations — the model must use these instead of raw
  // °F/10nm / mg/m³ jargon after the first mention.
  try {
    cond = cond || {};
    if(cond.thermalBreakFper10nm != null && cond.thermalBreakFper10nm >= 1){
      const sharp = cond.thermalBreakFper10nm >= 3;
      cond.thermalBreakHowToFish = sharp
        ? "Sharp temp wall — look for a green-to-blue color change, a rip or weed line, and a jump on the surface-temp gauge. Troll ALONG that seam (repeated passes), not straight through it."
        : "Modest temp edge — watch for a subtle color change or slick; work both sides of the seam until you mark bait or birds.";
    }
    if(cond.chlorophyll != null){
      cond.waterClarityHowToFish = cond.chlorophyll < 0.3
        ? "Clean blue water — natural/translucent baits; color changes may be subtle, so trust rips, weed, birds, and the temp gauge more than a muddy edge."
        : cond.chlorophyll < 1.0
          ? "Slightly green/productive water — mix natural and higher-contrast skirts; fish the cleaner edge of the color change."
          : "Greener/dirtier water — darker, high-contrast baits; work the cleaner blue edge if you can find it.";
    }
    if(cond.currentEdgeKtPer10nm != null && cond.currentEdgeKtPer10nm >= 0.3){
      cond.currentEdgeHowToFish = "Current shear line — look for a visible rip, weed line, or current slick where drift changes; bait often pins on that edge.";
    }
  } catch(e){}

  // The day the captain plans to fish (0=today..6), as both an offset and a date
  // string, so the prompt can scope the forecast and reports to that day.
  const fishDate = new Date(); fishDate.setDate(fishDate.getDate() + briefDayOffset);

  const payload = {
    lat: pinLL.lat,
    lng: pinLL.lng,
    port: port || "",
    portLat: portObj ? portObj.lat : null,
    portLng: portObj ? portObj.lng : null,
    // ACCURATE run from the departure port to the spot (great-circle nm). This is
    // THE distance the brief should cite. We used to send nmOffshore (distance
    // from the mainland coast behind the sounds), which near Cape Hatteras reads
    // ~90 nm even for a 40 nm run from Oregon Inlet — the model then quoted that
    // as the "run," which was flat wrong. Send the real port→spot run instead.
    runFromPortNm: (portObj && typeof nmBetween === "function")
      ? Math.round(nmBetween(portObj.lat, portObj.lng, pinLL.lat, pinLL.lng))
      : null,
    depthFt,
    nearbyStructure: structureNear(pinLL.lat, pinLL.lng),
    species: speciesNames,
    speciesMode: autoPickMeta ? "auto" : "manual",
    speciesAutoPick: autoPickMeta,
    // NEW: rich grounding data
    fishDayOffset: briefDayOffset,                       // 0=today, 1=tomorrow…
    fishDate: fishDate.toISOString().slice(0,10),         // YYYY-MM-DD
    fishDayLabel: briefDayLabel(briefDayOffset),
    conditions: cond,
    tide,
    biteScores: scored,
    // Per-species best grounds (nm + compass from port). When
    // speciesLocationsDiverge is true, the brief MUST list a separate run for
    // each fish instead of collapsing everything onto one Point.
    speciesTargets: scored.map((s, i) => ({
      rank: i + 1,
      species: s.species,
      speciesId: s.speciesId || null,
      score: s.score,
      confidence: s.confidence,
      lat: s.scoredAtLat,
      lng: s.scoredAtLng,
      runFromPortNm: s.runFromPortNm,
      runCompass: s.runCompass,
      depthFt: s.depthFt,
      spotLabel: s.spotLabel,
      nearbyStructure: s.nearbyStructure,
    })),
    speciesLocationsDiverge,
    // Ranked candidate spots for a multi-spot run plan (null for single-spot).
    // The top-level spot/conditions describe rank 1's area.
    runPlan,
  };

  // A quick manifest of which REAL signals we actually have for this trip. Lets
  // the model lead with what it knows and only briefly note genuine gaps, instead
  // of writing "no data" paragraphs when data is in fact present elsewhere.
  payload.dataAvailability = {
    airTemp:      !!(cond && (cond.airTempHiF != null || cond.airTempF != null)),
    wind:         !!(cond && cond.windKt != null),
    windDir:      !!(cond && cond.windDir != null),
    seas:         !!(cond && cond.waveHtFt != null),
    waterTemp:    !!(cond && cond.waterTempF != null),
    waterTempRegional: !!(cond && cond.waterTempRegional),
    chlorophyll:  !!(cond && cond.chlorophyll != null),
    thermalBreak: !!(cond && cond.thermalBreakFper10nm != null),
    current:      !!(cond && cond.currentDriftKt != null),
    currentEdge:  !!(cond && cond.currentEdgeKtPer10nm != null),
    tide:         !!tide,
    tideAtPort:   !!(tide && tide.atPort),
    tideTimes:    !!(tide && (tide.headerText || tide.nextHigh || tide.nextLow || (tide.nextEvents && tide.nextEvents.length))),
    biteScores:   scored.length > 0,
    structure:    Array.isArray(payload.nearbyStructure) && payload.nearbyStructure.length > 0,
    sky:          !!(cond && cond.sky),
    runPlan:      !!(runPlan && runPlan.length >= 2),
    speciesLocationsDiverge,
  };

  let briefOk = false;
  try {
    const { brief } = await window.BW_AUTH.callBrief(payload);
    aiCOA = brief || "Brief unavailable.";
    briefOk = briefLooksSuccessful(aiCOA);
    if(briefOk && pinLL){
      const briefId = "b-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      _lastBriefId = briefId;
      briefHistoryAdd({
        id: briefId,
        createdAt: Date.now(),
        expiresAt: Date.now() + BRIEF_HISTORY_TTL_MS,
        port: port || "",
        pinLat: pinLL.lat,
        pinLng: pinLL.lng,
        speciesIds: [...sp],
        speciesNames,
        speciesAutoPick: !!autoPickMeta,
        fishDayOffset: briefDayOffset,
        runFromPortNm: payload.runFromPortNm,
        brief: aiCOA,
      });
    }
  } catch (e) {
    // Surface the REAL reason instead of a blanket "try again." callBrief()
    // throws with the server's own message (premium gate, daily limit, upstream
    // generation failure, "Brief service not configured", etc.), which is far
    // more actionable for the captain — and for us diagnosing it.
    const msg = (e && e.message) ? String(e.message) : "";
    console.error("Captain's Brief failed:", e);
    // Only a GENUINE network failure throws a TypeError (fetch could not reach
    // the endpoint). Server-side problems come back as a normal Error carrying
    // the server's own message — including its own "timed out generating" text —
    // so those must pass through VERBATIM. (The earlier version matched the word
    // "timed out" here and wrongly relabeled a server timeout as "couldn't reach".)
    const isNetworkError = (e && (e.name === "TypeError" || e instanceof TypeError))
      || /failed to fetch|networkerror|load failed/i.test(msg);
    if(/sign in/i.test(msg)){
      aiCOA = "Sign in to generate a Captain's Brief.";
    } else if(isNetworkError || !msg){
      aiCOA = "Couldn't reach the Captain's Brief service. Check your connection and try again.";
    } else {
      // A real, user-readable reason from the server — show it verbatim.
      aiCOA = msg;
    }
  }
  aiLoading=false;renderBrief();
  // Pop the finished brief up front-and-center so the captain sees it
  // immediately instead of scrolling the side panel.
  if(briefOk) openBriefModal();
}

// ── MATRIX ────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// SPECIES DROPDOWN
// ════════════════════════════════════════════════════════════════════════════
function buildSpDropdown(){
  // "All Species" is intentionally omitted — the bite map scores ONE species at a
  // time (picking "all" produced an empty map). Other tabs keep their own "All"
  // filter; here the captain always chooses a concrete target.
  const cats=["offshore","nearshore","inshore"];
  let html="";
  cats.forEach(cat=>{
    const items=SPECIES.filter(s=>s.cat===cat && s.id!=="all");
    html+=`<div class="sc-lbl">${cat.toUpperCase()}</div>`;
    items.forEach(sp=>{
      html+=`<button class="sp-opt ${sp.id===activeSpId?"sel":""}" onclick="selectSp('${sp.id}')">
        <div class="sdot" style="background:${sp.color}"></div>${sp.name}
        ${sp.id===activeSpId?`<span style="margin-left:auto;color:${sp.color}">✓</span>`:""}
      </button>`;
    });
  });
  document.getElementById("sp-dd").innerHTML=html;
}
function toggleDd(){
  const dd=document.getElementById("sp-dd");
  const btn=document.getElementById("sp-btn");
  // Defensive: if dropdown is empty (init never ran or failed), populate it now
  if(!dd.children.length || dd.innerHTML.trim()===""){
    try { buildSpDropdown(); } catch(e){ console.error("buildSpDropdown failed:", e); }
  }
  const willOpen = !dd.classList.contains("open");

  if(willOpen){
    // ── OPEN ──
    // Move the dropdown to <body> so it escapes parent stacking contexts
    // and overflow:hidden clipping on the header bar.
    document.body.appendChild(dd);

    const isPortraitPhone = window.innerWidth <= 680;
    if(isPortraitPhone){
      // Bottom drawer style on phones
      dd.style.cssText=`
        position:fixed !important;
        bottom:0 !important; left:0 !important; right:0 !important;
        top:auto !important;
        width:100% !important; max-width:100% !important;
        border-radius:14px 14px 0 0 !important;
        max-height:65vh !important;
        box-shadow:0 -8px 32px rgba(0,0,0,.7) !important;
        background:#0f2444 !important;
        border:1px solid rgba(107,191,234,.25) !important;
        overflow-y:auto !important;
        z-index:100000 !important;
        display:block !important;
      `;
    } else {
      // Anchored dropdown below the button on tablet/desktop
      const rect=btn.getBoundingClientRect();
      dd.style.cssText=`
        position:fixed !important;
        top:${rect.bottom+6}px !important;
        left:${rect.left}px !important;
        min-width:${Math.max(240, rect.width)}px !important;
        max-height:380px !important;
        background:#0f2444 !important;
        border:1px solid rgba(107,191,234,.25) !important;
        border-radius:10px !important;
        box-shadow:0 12px 36px rgba(0,0,0,.6) !important;
        overflow-y:auto !important;
        z-index:100000 !important;
        display:block !important;
      `;
    }
    dd.classList.add("open");

    // Backdrop
    let backdrop=document.getElementById("sp-backdrop");
    if(!backdrop){
      backdrop=document.createElement("div");
      backdrop.id="sp-backdrop";
      backdrop.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;display:block";
      backdrop.onclick=function(){closeDd();};
      document.body.appendChild(backdrop);
    } else {
      backdrop.style.display="block";
      backdrop.onclick=function(){closeDd();};
    }
  } else {
    // ── CLOSE ──
    closeDd();
  }

  document.getElementById("sp-arr").textContent=willOpen?"▲":"▼";
  document.getElementById("sp-btn").setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeDd(){
  const dd=document.getElementById("sp-dd");
  dd.classList.remove("open");
  dd.style.cssText="";  // Reset inline styles so original CSS takes over
  // Move it back to its original parent (#sp-wrap) for cleanliness
  const wrap=document.getElementById("sp-wrap");
  if(wrap && dd.parentNode!==wrap) wrap.appendChild(dd);
  const backdrop=document.getElementById("sp-backdrop");
  if(backdrop) backdrop.style.display="none";
  document.getElementById("sp-arr").textContent="▼";
  document.getElementById("sp-btn").setAttribute("aria-expanded", "false");
}

// ════════════════════════════════════════════════════════════════════════════
// EMPTY-STATE OVERLAY — shows when port or species isn't selected
// ════════════════════════════════════════════════════════════════════════════
// Session-level flag: once the user dismisses the empty-state prompt with
// the X button, don't show it again this session.
let emptyStateDismissed = false;

function dismissEmptyState(){
  emptyStateDismissed = true;
  const el = document.getElementById("empty-state");
  if(el) el.style.display = "none";
}

function updateEmptyState(){
  const el = document.getElementById("empty-state");
  if(!el) return;
  // Respect the user's explicit dismissal — once they've X'd out of the
  // prompt, never re-show it this session. If they still want to pick a
  // port or species, the dropdowns at the top are always available.
  if(emptyStateDismissed){
    el.style.display = "none";
    return;
  }
  const iconEl  = document.getElementById("empty-state-icon");
  const titleEl = document.getElementById("empty-state-title");
  const textEl  = document.getElementById("empty-state-text");
  // Sequential prompts: port first (you can't fish without knowing where
  // you're leaving from), then species. Each state has its own icon, title,
  // and body so the visual matches what's being asked.
  if(!activePort){
    el.style.display = "block";
    if(iconEl)  iconEl.textContent  = "⚓";
    if(titleEl){
      titleEl.textContent = "CHOOSE YOUR HOME PORT";
      titleEl.style.color = "#7dd3fc";
    }
    textEl.innerHTML =
      "Start by picking your <b>Home Port</b> above<br>so we can find fish within range of you.";
  } else if(!activeSpId){
    el.style.display = "block";
    if(iconEl)  iconEl.textContent  = "🎯";
    if(titleEl){
      titleEl.textContent = "CHOOSE YOUR TARGET";
      titleEl.style.color = "#7dd3fc";
    }
    textEl.innerHTML =
      "Now pick your <b>Target Species</b> above<br>to see where they should be biting today.";
  } else if(isPortOutOfSpeciesRange(activePort, activeSpId)){
    // The port sits outside the species' geographic range — even a 90nm run
    // from this port won't reach the species' habitat. Tell the user why
    // they're seeing no heat instead of leaving them confused.
    const sp = SPECIES.find(s => s.id === activeSpId);
    const portShort = activePort.split(",")[0];
    el.style.display = "block";
    if(iconEl)  iconEl.textContent  = "⚠️";
    if(titleEl){
      titleEl.textContent = "OUTSIDE SPECIES RANGE";
      titleEl.style.color = "#fbbf24";
    }
    textEl.innerHTML =
      `<b>${sp ? sp.name : activeSpId}</b> aren't typically caught from <b>${portShort}</b>.<br>` +
      `Try a port within the species' range, or pick a different target.`;
  } else {
    el.style.display = "none";
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PRIMARY "CAPTAIN'S BRIEF" FAB
// One obvious call-to-action on the map. Its label + action adapt to setup:
//   no port    → open the Home Port picker
//   no species → open the Target Species picker
//   both set   → open the AI Captain's Brief panel
// Reuses existing functions; adds no new brief-generation logic.
// ════════════════════════════════════════════════════════════════════════════
function updateBriefFab(){
  const btn = document.getElementById("brief-toggle");
  if(!btn) return;

  btn.classList.remove("is-setup");
  if(!activePort || !activeSpId || activeSpId === "all"){
    btn.classList.add("is-setup");
  }
  btn.title = !activePort
    ? "Set your home port"
    : (!activeSpId || activeSpId === "all")
      ? "Pick a target species"
      : "AI Captain's Brief";
  btn.setAttribute("aria-label", btn.title);
}

function briefBestCellForSpecies(sp, portObj){
  const zone = briefRunZone || defaultBriefRunZone(sp.id);
  const zonePin = briefPinForZone(portObj, zone);
  const zoneNm = BRIEF_ZONE_NM[zone] || 12;
  let best = { lat: zonePin.lat, lng: zonePin.lng, distNm: zoneNm };
  let bestScore = -1;
  const locations = briefPickScoreLocations(zonePin.lat, zonePin.lng);
  for(const pt of locations){
    if(typeof scoreCell !== "function") break;
    const scored = scoreCell(pt.lat, pt.lng, sp.id);
    if(!scored || scored.outOfRange) continue;
    const s = Number.isFinite(scored.score) ? scored.score : 0;
    if(s > bestScore){
      bestScore = s;
      const distNm = (typeof nmBetween === "function")
        ? Math.round(nmBetween(portObj.lat, portObj.lng, pt.lat, pt.lng))
        : zoneNm;
      best = Object.assign({}, scored, { lat: pt.lat, lng: pt.lng, distNm });
    }
  }
  if(bestScore < 0 && typeof scoreCell === "function"){
    const scored = scoreCell(zonePin.lat, zonePin.lng, sp.id);
    if(scored) best = Object.assign({}, scored, { lat: zonePin.lat, lng: zonePin.lng, distNm: zoneNm });
  }
  return best;
}

function onBriefFabClick(){
  if(!activePort){
    if(typeof togglePortDd === "function") togglePortDd();
    return;
  }
  if(!activeSpId || activeSpId === "all"){
    if(typeof toggleDd === "function") toggleDd();
    return;
  }

  const p  = PORTS[activePort];
  const sp = (typeof SPECIES !== "undefined") ? SPECIES.find(s => s.id === activeSpId) : null;
  if(!p || !sp){
    updateBriefFab();
    return;
  }

  _briefRunPlanSpots = null;
  briefRunZone = defaultBriefRunZone(sp.id);
  pinLL = briefPinForZone(p, briefRunZone);
  const cell = briefBestCellForSpecies(sp, p);
  pinLL = { lat: cell.lat, lng: cell.lng };

  if(typeof showPredictionExplainer === "function"){
    showPredictionExplainer(cell, sp);
    if(typeof openSubPanel === "function") openSubPanel("brief");
  }
}

// Returns true if the port sits outside the lat range of the species AND
// would still be out of range even with the maximum allowed offshore run.
// This is what powers the "wrong port for this species" empty-state.
function isPortOutOfSpeciesRange(portName, speciesId){
  const range = (typeof SPECIES_LAT_RANGE !== "undefined") ? SPECIES_LAT_RANGE[speciesId] : null;
  if(!range) return false;  // coast-wide species — never out of range
  const port = PORTS[portName];
  if(!port) return false;
  // Boats can run roughly 1.5° of latitude in 90nm. If even a maximum run
  // from the port can't reach the species' lat band, we're out of range.
  // ~1.5° = 90nm. Use 2° to be charitable about edge of range.
  const buffer = 2.0;
  // Pick the right band based on which coast the port is on.
  let band;
  if(Array.isArray(range)){
    // Flat-array format applies to both coasts
    band = range;
  } else {
    // Per-region format — choose by port's coast
    const inGulf = (typeof isGulfContext === "function") && isGulfContext(port.lat, port.lng);
    band = inGulf ? range.gulf : range.atlantic;
    if(!band) return true;  // species absent from this coast entirely
  }
  if(port.lat < band[0] - buffer) return true;  // port too far south
  if(port.lat > band[1] + buffer) return true;  // port too far north
  return false;
}

function selectSp(id){
  activeSpId=id;
  // Picking a species is explicit intent to see predictions — clear any prior opt-out.
  _predictUserOff = false;
  const sp=SPECIES.find(s=>s.id===id);
  const dot=document.getElementById("sp-dot");
  const name=document.getElementById("sp-name");
  dot.style.background=sp.color;
  dot.style.opacity="1";
  name.textContent=sp.name;
  name.style.opacity="1";
  closeDd();
  updateLegend();
  buildSpDropdown();
  // When the user has both port and species, ensure the prediction layer is ON
  ensurePredictLayerOn();
  drawPrediction();
  updateEmptyState();
  updateBriefFab();
}

// ════════════════════════════════════════════════════════════════════════════
// HOME PORT DROPDOWN — same custom dropdown architecture as Target Species
// ════════════════════════════════════════════════════════════════════════════
const PORT_GROUPS = [
  {label:"New England", ports:["Stonington, ME","Jonesport, ME","Portland, ME","Kennebunkport, ME","Portsmouth, NH","Gloucester, MA","Boston, MA","Cape Cod, MA","Point Judith, RI"]},
  {label:"Mid-Atlantic", ports:["Long Beach, NY","Freeport, NY","Montauk, NY","Toms River, NJ","Atlantic City, NJ","Cape May, NJ","Ocean City, MD","Chincoteague, VA","Virginia Beach, VA"]},
  {label:"Chesapeake & Delaware Bay", ports:["Cape Charles, VA","Reedville, VA","Coles Point, VA","Solomons, MD","Colonial Beach, VA","Annapolis, MD","Baltimore, MD","Delaware City, DE"]},
  {label:"Carolinas", ports:["Oregon Inlet, NC","Hatteras, NC","Morehead City, NC","Oak Island, NC","Myrtle Beach, SC","Murrells Inlet, SC","Charleston, SC"]},
  {label:"South Atlantic", ports:["Savannah, GA","Brunswick, GA","St. Augustine, FL","Jacksonville, FL","Daytona Beach, FL","Port Canaveral, FL","Melbourne, FL","Vero Beach, FL"]},
  {label:"Florida East Coast", ports:["Stuart, FL","Palm Beach, FL","Fort Lauderdale, FL","Miami, FL"]},
  {label:"Bahamas", ports:["Bimini, Bahamas","West End, Bahamas","Chub Cay, Bahamas","Walker's Cay, Bahamas","Marsh Harbour, Bahamas"]},
  {label:"Florida Keys", ports:["Islamorada, FL","Marathon, FL","Key West, FL"]},
  {label:"Florida Gulf Coast", ports:["Clearwater, FL","Tampa Bay, FL","Sarasota, FL","Venice, FL","Fort Myers, FL","Naples, FL","Crystal River, FL","Cedar Key, FL","Steinhatchee, FL"]},
  {label:"Florida Panhandle", ports:["Apalachicola, FL","Panama City, FL","Destin, FL","Pensacola, FL"]},
  {label:"Alabama / Mississippi", ports:["Dauphin Island, AL","Biloxi, MS"]},
  {label:"Louisiana", ports:["Venice, LA","Grand Isle, LA","Houma, LA","Morgan City, LA","New Iberia, LA","Cameron, LA","Lake Charles, LA"]},
  {label:"Texas Coast", ports:["Sabine Pass, TX","Galveston, TX","Freeport, TX","Matagorda, TX","Port O'Connor, TX","Port Aransas, TX","Port Mansfield, TX","Port Isabel, TX"]},
  {label:"California", ports:["Monterey, CA","Moss Landing, CA","Morro Bay, CA","Port San Luis, CA","Santa Barbara, CA","Ventura, CA","Marina del Rey, CA","San Pedro, CA","Newport Beach, CA","Dana Point, CA","Oceanside, CA","San Diego, CA"]}];

function buildPortDropdown(){
  let html="";
  PORT_GROUPS.forEach(group=>{
    html+=`<div class="sc-lbl">${group.label.toUpperCase()}</div>`;
    group.ports.forEach(port=>{
      const isSel = port===activePort;
      html+=`<button class="sp-opt ${isSel?"sel":""}" onclick="selectPort('${port.replace(/'/g,"\\'")}')">
        <span style="font-size:13px;width:11px;flex-shrink:0">⚓</span>${port}
        ${isSel?`<span style="margin-left:auto;color:#f0c840">✓</span>`:""}
      </button>`;
    });
  });
  document.getElementById("port-dd").innerHTML=html;
}

function togglePortDd(){
  const dd=document.getElementById("port-dd");
  const btn=document.getElementById("port-btn");
  if(!dd.children.length || dd.innerHTML.trim()===""){
    try { buildPortDropdown(); } catch(e){ console.error("buildPortDropdown failed:", e); }
  }
  const willOpen = !dd.classList.contains("open");

  if(willOpen){
    // Move to body to escape stacking contexts
    document.body.appendChild(dd);

    const isPortraitPhone = window.innerWidth <= 680;
    if(isPortraitPhone){
      dd.style.cssText=`
        position:fixed !important;
        bottom:0 !important; left:0 !important; right:0 !important;
        top:auto !important;
        width:100% !important; max-width:100% !important;
        border-radius:14px 14px 0 0 !important;
        max-height:65vh !important;
        box-shadow:0 -8px 32px rgba(0,0,0,.7) !important;
        background:#0f2444 !important;
        border:1px solid rgba(107,191,234,.25) !important;
        overflow-y:auto !important;
        z-index:100000 !important;
        display:block !important;
      `;
    } else {
      const rect=btn.getBoundingClientRect();
      dd.style.cssText=`
        position:fixed !important;
        top:${rect.bottom+6}px !important;
        left:${rect.left}px !important;
        min-width:${Math.max(240, rect.width)}px !important;
        max-height:380px !important;
        background:#0f2444 !important;
        border:1px solid rgba(107,191,234,.25) !important;
        border-radius:10px !important;
        box-shadow:0 12px 36px rgba(0,0,0,.6) !important;
        overflow-y:auto !important;
        z-index:100000 !important;
        display:block !important;
      `;
    }
    dd.classList.add("open");

    let backdrop=document.getElementById("sp-backdrop");
    if(!backdrop){
      backdrop=document.createElement("div");
      backdrop.id="sp-backdrop";
      backdrop.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;display:block";
      backdrop.onclick=function(){closePortDd();};
      document.body.appendChild(backdrop);
    } else {
      backdrop.style.display="block";
      backdrop.onclick=function(){closePortDd();};
    }
  } else {
    closePortDd();
  }

  document.getElementById("port-arr").textContent=willOpen?"▲":"▼";
  document.getElementById("port-btn").setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closePortDd(){
  const dd=document.getElementById("port-dd");
  dd.classList.remove("open");
  dd.style.cssText="";
  const wrap=document.getElementById("port-wrap");
  if(wrap && dd.parentNode!==wrap) wrap.appendChild(dd);
  const backdrop=document.getElementById("sp-backdrop");
  if(backdrop) backdrop.style.display="none";
  document.getElementById("port-arr").textContent="▼";
  document.getElementById("port-btn").setAttribute("aria-expanded", "false");
}

function selectPort(name){
  activePort=name;
  // NOTE: selecting a port from the dropdown is a SESSION-ONLY action — it does
  // NOT change the user's saved default. The default home port is set in
  // Settings (USER_PREFS.defaultPort) and is the only thing persisted to the
  // account. So on the next login the Home Port resets to the Settings default,
  // not to whatever port was last tapped. (Previously this wrote activePort to
  // the account's home_port, which made the last-tapped port "stick" across
  // logout/login — the bug we're fixing.)
  const lbl=document.getElementById("port-name");
  lbl.textContent=name;
  lbl.style.opacity="1";
  closePortDd();
  buildPortDropdown();
  // Re-center on the new port and re-draw canyons/ports so the 200nm
  // proximity filter follows the new home location.
  //
  // IMPORTANT: pan to the port but PRESERVE the user's current zoom. Forcing a
  // fixed HOME_PORT_ZOOM here was yanking the map way out every time a port was
  // picked, which is jarring if you're zoomed in working an area. We keep the
  // current zoom and only zoom IN to frame the port when the user is currently
  // more zoomed out than the default home view — we never zoom OUT on them.
  const p = PORTS[name];
  if (p && MAP) {
    const curZoom = MAP.getZoom();
    const targetZoom = Math.max(curZoom, HOME_PORT_ZOOM);  // never below current
    MAP.setView([p.lat, p.lng], targetZoom, { animate: true });
  }
  drawCanyons();
  drawPortMarkers();
  drawWaypoints();
  drawRamps();
  drawPlatforms();
  ensurePredictLayerOn();
  primeOceanDataForPort(p);
  drawPrediction();
  if(layerVis.altimetry&&altimetryLayer){
    altimetryLayer._requestPortBreaks(true);
    altimetryLayer._draw();
  }
  updateEmptyState();
  updateHeaderConditions();
  updateBriefFab();
}

// Load real bathy + header conditions for a port's fishing range. Safe to call
// from init, selectPort, and tab-focus recovery — idempotent and best-effort.
function portOceanBbox(p){
  if(!p) return null;
  const maxRange = (typeof maxRangeForPort === "function") ? maxRangeForPort(p) : 100;
  const degLat = (maxRange / 60) + 0.15;
  const degLng = (maxRange / (60 * Math.cos(p.lat * Math.PI / 180))) + 0.15;
  const _pac = typeof isPacificContext === "function" && isPacificContext(p.lat, p.lng);
  const LAT_MIN = _pac ? 29.0 : 24.0, LAT_MAX = _pac ? 42.5 : 43.5;
  const LNG_MIN = _pac ? -126.0 : -97.5, LNG_MAX = _pac ? -116.0 : -68.5;
  return {
    latMin: Math.max(LAT_MIN, p.lat - degLat), latMax: Math.min(LAT_MAX, p.lat + degLat),
    lngMin: Math.max(LNG_MIN, p.lng - degLng), lngMax: Math.min(LNG_MAX, p.lng + degLng),
  };
}

function primeOceanDataForPort(p){
  if(!p) return;
  updateHeaderConditions();
  const bb = portOceanBbox(p);
  if(bb && typeof buildBathyGrid === "function"){
    buildBathyGrid(bb.latMin, bb.latMax, bb.lngMin, bb.lngMax).catch(() => {});
  }
}

function refreshActiveOceanLayers(){
  if(layerVis.wind && windLayer && typeof windLayer._requestData === "function"){
    windLayer._requestData();
  }
  if(layerVis.currents && typeof buildCurrentFieldForMap === "function"){
    buildCurrentFieldForMap().catch(() => {});
  }
  if(layerVis.altimetry && altimetryLayer){
    altimetryLayer._requestDisplayData();
    altimetryLayer._requestPortBreaks(true);
  }
  if(activePort) updateHeaderConditions();
}
// With no port selected there is no location to source conditions from, so the
// water cell prompts setup and the other cells stay quiet.
async function updateHeaderConditions(attempt){
  const tryNum = attempt || 0;
  const water = document.getElementById("hdr-water");
  const air   = document.getElementById("hdr-air");
  const wind  = document.getElementById("hdr-wind");
  if(!water || !air || !wind) return;
  const p = activePort ? PORTS[activePort] : null;
  if(!p){
    water.innerHTML = "<span style='opacity:.6;font-weight:600'>Select a port</span>";
    air.textContent = wind.textContent = "";
    updateHeaderTide();
    requestAnimationFrame(syncHeaderHeightVar);
    return;
  }
  updateHeaderTide();
  // REAL conditions only (NDBC buoy + forecast model + ERDDAP via the ocean
  // backend), sampled a short distance offshore from the port (where you'd fish).
  // Cells show "—" until/unless real data is available — never synthetic.
  if(typeof BW_OCEAN === "undefined" || !BW_OCEAN.fetchOcean){
    water.textContent = air.textContent = wind.textContent = "—";
    requestAnimationFrame(syncHeaderHeightVar);
    return;
  }
  const lat = p.lat + 0.05, lng = p.lng + 0.05;
  try {
    const o = await bwFetchPortConditions(lat, lng);
    // A different port may have been selected while awaiting — bail if so.
    if(!activePort || PORTS[activePort] !== p) return;
    const waterF = (o?.waterTemp?.value != null) ? o.waterTemp.value : (o?.sst?.value != null ? o.sst.value : null);
    water.innerHTML  = waterF != null ? `${Math.round(waterF)}<span class="wx-deg">°</span>F` : "—";
    air.innerHTML    = (o?.airTemp?.value != null) ? `${Math.round(o.airTemp.value)}<span class="wx-deg">°</span>F` : "—";
    // Wind cell shows direction it's blowing FROM + speed (e.g. "SW 10kt") —
    // there's room in the banner and direction is what a captain actually needs.
    if(o?.wind?.value != null){
      const dir = (o.wind.dir != null && typeof bwiCompass16 === "function") ? bwiCompass16(o.wind.dir) : null;
      wind.textContent = dir ? `${dir} ${Math.round(o.wind.value)}kt` : `${Math.round(o.wind.value)}kt`;
    } else {
      wind.textContent = "—";
    }
    const allDash = water.textContent === "—" && air.textContent === "—" && wind.textContent === "—";
    if(allDash && tryNum < 2){
      setTimeout(() => updateHeaderConditions(tryNum + 1), 600 * (tryNum + 1));
    }
  } catch(e){
    water.textContent = air.textContent = wind.textContent = "—";
    if(tryNum < 2) setTimeout(() => updateHeaderConditions(tryNum + 1), 800 * (tryNum + 1));
  }
  requestAnimationFrame(syncHeaderHeightVar);
}

// Keep --bw-hdr-h in sync with the real header height so fixed panels (nav
// menu, bite explainer) clear the two-row mobile header + safe area.
function syncHeaderHeightVar(){
  const hdr = document.getElementById("hdr");
  const px = hdr ? Math.ceil(hdr.getBoundingClientRect().height) : 64;
  document.documentElement.style.setProperty("--bw-hdr-h", px + "px");
  return px;
}
// Viewport-fixed panel top: header + optional bite banner + gap.
function viewportPanelTopPx(gap){
  const hdr = syncHeaderHeightVar();
  const banner = (typeof biteBannerHeightPx === "function") ? biteBannerHeightPx() : ((typeof layerVis !== "undefined" && layerVis.predict) ? 56 : 0);
  return hdr + banner + (gap != null ? gap : 8);
}

// Tide station cache — reused by the 6-day forecast so it doesn't need a full
// ocean round-trip just to resolve the nearest CO-OPS id.
let _tideStationCache = { key: "", station: null, atMs: 0 };
function _tideStationKey(lat, lng){ return `${lat.toFixed(2)},${lng.toFixed(2)}`; }
function _cacheTideStation(lat, lng, station){
  if(!station) return;
  _tideStationCache = { key: _tideStationKey(lat, lng), station, atMs: Date.now() };
}
function _cachedTideStation(lat, lng){
  if(_tideStationCache.key !== _tideStationKey(lat, lng)) return null;
  if(Date.now() - _tideStationCache.atMs > 30 * 60 * 1000) return null;
  return _tideStationCache.station;
}
// AbortSignal.timeout polyfill for older Safari (used by CO-OPS tide fetches).
function bwiFetchSignal(ms){
  if(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function")
    return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}
// Fast header / tide-station fetch — uses ocean edge `mode=conditions` when deployed.
function bwFetchPortConditions(lat, lng){
  if(typeof BW_OCEAN === "undefined") return Promise.reject(new Error("BW_OCEAN unavailable"));
  if(typeof BW_OCEAN.fetchConditions === "function") return BW_OCEAN.fetchConditions(lat, lng);
  return BW_OCEAN.fetchOcean(lat, lng);
}

// Tide for the header: shows the current STATE (Rising / Falling / Slack) plus
// the next two tide events in CHRONOLOGICAL order, e.g.
// "Falling · Low 1:37 AM → High 7:22 AM". This removes the old ambiguity where
// the next high was always printed first even when a low came sooner. Uses the
// deployed ocean function to get the nearest NOAA CO-OPS station id, then fetches
// that station's hi/lo predictions directly (CO-OPS sends CORS *). Cached per-port
// for 15 min; degrades gracefully.
let _hdrTide = { key: "", text: "", atMs: 0 };
async function updateHeaderTide(){
  const cell = document.getElementById("hdr-tide-cell");
  const el   = document.getElementById("hdr-tide");
  if(!cell || !el) return;
  const setTideText = (text) => {
    el.textContent = text;
    const tip = (text && text !== "—" && text !== "…") ? text : "";
    el.title = tip;
    cell.title = tip;
  };
  const p = activePort ? PORTS[activePort] : null;
  if(!p){ cell.style.display = "none"; return; }
  cell.style.display = "";
  if(_hdrTide.key === activePort && Date.now() - _hdrTide.atMs < 15 * 60 * 1000){
    setTideText(_hdrTide.text || "—");
    requestAnimationFrame(syncHeaderHeightVar);
    return;
  }
  setTideText("…");
  const portKey = activePort;
  try {
    if(typeof BW_OCEAN === "undefined"){ setTideText("—"); requestAnimationFrame(syncHeaderHeightVar); return; }
    const o = await bwFetchPortConditions(p.lat + 0.05, p.lng + 0.05);
    if(activePort !== portKey) return;  // port changed while we were fetching
    const station = o && o.sources ? o.sources.tide : null;
    if(station) _cacheTideStation(p.lat + 0.05, p.lng + 0.05, station);
    let text = "—";
    if(station){
      const next = await fetchNextTideEvent(station);
      if(activePort !== portKey) return;
      if(next && next.events && next.events.length){
        // State prefix: Rising / Falling / Slack so it's instantly clear which
        // way the water is moving right now.
        const stateTxt = next.state === "rising"  ? "Rising"
                       : next.state === "falling" ? "Falling"
                       : next.state === "slack"   ? "Slack" : "";
        // Next two events, in true chronological order (soonest first), each
        // labeled High/Low so the sequence is unambiguous.
        const seq = next.events.slice(0, 2)
          .map(e => `${e.type === "H" ? "High" : "Low"} ${e.timeTxt}`)
          .join(" → ");
        text = stateTxt ? `${stateTxt} · ${seq}` : seq;
      }
    }
    // If the live fetch produced nothing (offline/station gap) but we have a
    // saved trip for this port, fall back to its cached tide string.
    if((!text || text === "—") && typeof tripTideHeaderFor === "function"){
      const cachedTide = tripTideHeaderFor(portKey);
      if(cachedTide) text = cachedTide;
    }
    setTideText(text);
    _hdrTide = { key: portKey, text, atMs: Date.now() };
  } catch(e){
    const cachedTide = (typeof tripTideHeaderFor === "function") ? tripTideHeaderFor(portKey) : null;
    setTideText(cachedTide || "—");
    if(cachedTide) _hdrTide = { key: portKey, text: cachedTide, atMs: Date.now() };
  }
  requestAnimationFrame(syncHeaderHeightVar);
}

// Upcoming tide events for a CO-OPS station (hi/lo predictions), in
// CHRONOLOGICAL order, plus the current tide STATE.
//
// Returns:
//   { state: "rising" | "falling" | "slack" | null,
//     events: [ { type: "H"|"L", timeTxt, atMs }, ... ] }  // soonest first
//
// State logic:
//   • Next event is a High  → water is RISING toward it.
//   • Next event is a Low    → water is FALLING toward it.
//   • Within ~25 min of the previous OR next turn → SLACK (the tide is
//     pausing at the top/bottom and barely moving).
async function fetchNextTideEvent(station){
  const pad = (n)=>String(n).padStart(2,"0");
  const fmt = (d)=>`${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const now = Date.now();
  const begin = new Date(now - 6 * 3600000), end = new Date(now + 48 * 3600000);
  const url = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
    + "?product=predictions&interval=hilo&datum=MLLW&units=english&time_zone=gmt&format=json&application=bluewaterintel"
    + `&station=${encodeURIComponent(station)}&begin_date=${encodeURIComponent(fmt(begin))}&end_date=${encodeURIComponent(fmt(end))}`;
  const r = await fetch(url, { signal: bwiFetchSignal(8000) });
  if(!r.ok) return null;
  const d = await r.json();
  const preds = (d && d.predictions) ? d.predictions : [];

  // Parse all events to timestamps so we can split into past/future cleanly.
  const all = [];
  for(const pr of preds){
    const atMs = Date.parse(pr.t.replace(" ", "T") + "Z");  // CO-OPS gmt
    if(!isFinite(atMs)) continue;
    all.push({ type: pr.type, atMs });
  }
  all.sort((a, b) => a.atMs - b.atMs);

  const future = all.filter(e => e.atMs > now);
  const past   = all.filter(e => e.atMs <= now);
  const prev   = past.length ? past[past.length - 1] : null;
  const nextEv = future.length ? future[0] : null;

  // Derive state.
  let state = null;
  if(nextEv){
    state = nextEv.type === "H" ? "rising" : "falling";
    const SLACK_MS = 25 * 60 * 1000;
    const nearNext = (nextEv.atMs - now) <= SLACK_MS;
    const nearPrev = prev ? (now - prev.atMs) <= SLACK_MS : false;
    if(nearNext || nearPrev) state = "slack";
  }

  const events = future.slice(0, 4).map(e => ({
    type: e.type,
    atMs: e.atMs,
    timeTxt: (typeof formatTimeInTz === "function" && typeof displayTimezone === "function")
      ? formatTimeInTz(e.atMs, displayTimezone())
      : new Date(e.atMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  }));

  return { state, events };
}

// Turn the Bite Map on once the user has picked both required inputs.
// The layer still stays off during the initial empty state, but selecting a home
// port + target species should immediately show the fishing-spots heat map.
function ensurePredictLayerOn(){
  if(!activePort || !activeSpId || activeSpId === "all") return;
  // Respect an explicit user opt-out — don't silently re-check the box.
  if(_predictUserOff) return;
  // The Bite Map is premium — don't auto-enable it for free accounts.
  if(!BW_PREMIUM) return;
  layerVis.predict = true;
  const chk = document.getElementById("chk-predict");
  if(chk) chk.checked = true;
  updateBiteBanner();
}

// ════════════════════════════════════════════════════════════════════════════
// NAVIGATION HELPERS
// All overlay Back buttons return to the nav menu so the user can browse
// other items without having to reopen MENU. (Tapping outside the menu or
// X-ing out a second time exits to the chart.)
// ════════════════════════════════════════════════════════════════════════════
// Menu items that require a Pro subscription (Model B). Free users see them
// with a PRO badge; tapping opens the upgrade modal instead of the feature.
const PRO_MENU_FNS = ["openReports", "openWaypoints", "openDownloadTrip"];
const PAID_MENU_FNS = ["openRecentBriefs"];
let _navBackGuard = false;

function navOpenFromMenu(openFn){
  closeNav();
  // If this is a Pro feature and the user isn't entitled, show the upgrade
  // modal rather than the feature.
  const fnName = (openFn && openFn.name) ? openFn.name : "";
  if(PAID_MENU_FNS.includes(fnName) && !BW_PAID){
    if(typeof openPricing === "function") openPricing();
    return;
  }
  if(PRO_MENU_FNS.includes(fnName) && !BW_PREMIUM){
    if(typeof openPricing === "function") openPricing();
    return;
  }
  openFn();
}

function navBack(closeFn){
  // Reopen the menu under the overlay, then dismiss the overlay — so the
  // chart never flashes between the two states. A one-tick guard prevents the
  // same click from bubbling to the document outside-click handler.
  _navBackGuard = true;
  document.body.classList.add("nav-open");
  const m = document.getElementById("nav-menu");
  if(m) m.style.display = "block";
  if(typeof closeFn === "function") closeFn();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { _navBackGuard = false; });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ACCOUNT
// ════════════════════════════════════════════════════════════════════════════
// Renders the account block inside the nav menu. Called when the menu opens
// and whenever auth state changes. Logged out: shows Sign In / Create Account.
// Logged in: shows the user's name and a Sign Out button.
//
// The auth backend isn't wired up yet. signIn() and signOut() are stubs that
// will be replaced when the deployed app has a real auth endpoint. For now
// they let us verify the UI flow.
function renderAccountSection(){
  const el = document.getElementById('nav-account');
  if(!el) return;
  let acct = (typeof USER_PREFS !== 'undefined') ? USER_PREFS.account : null;
  // Source of truth for "logged in" is the live Supabase session, not just the
  // in-memory USER_PREFS.account (which can be empty if the menu renders before
  // the persisted session finishes restoring on a fresh page load). If we have a
  // session user, reflect it — and backfill USER_PREFS.account so the rest of the
  // app sees a consistent signed-in state.
  if((!acct || !acct.name) && window.BW_AUTH && typeof window.BW_AUTH.getUser === "function"){
    const user = window.BW_AUTH.getUser();
    if(user){
      acct = {
        name: (user.user_metadata && user.user_metadata.full_name)
          || (user.email ? user.email.split("@")[0] : "Captain"),
        email: user.email || "",
        id: user.id,
      };
      if(typeof USER_PREFS !== 'undefined') USER_PREFS.account = acct;
    }
  }
  if(acct && acct.name){
    // Logged in
    const initial = (acct.name[0] || '?').toUpperCase();
    const email = acct.email || '';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#2979b5,#6bbfea);
                    display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:16px;flex-shrink:0">${initial}</div>
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:700;color:#f0f6ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(acct.name)}</div>
          ${email ? `<div style="font-size:10px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(email)}</div>` : ''}
        </div>
        <button type="button" onclick="openAccountPage()" style="font-family:inherit;background:transparent;border:1px solid rgba(107,191,234,.35);
                color:#6bbfea;font-size:11px;font-weight:600;padding:6px 11px;border-radius:6px;cursor:pointer;flex-shrink:0">
          Manage
        </button>
      </div>
      <div id="nav-plan" style="margin-top:12px"></div>`;
    if(typeof renderNavPlan === "function") renderNavPlan();
  } else {
    // Logged out
    el.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:#6bbfea;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">Account</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;line-height:1.45">
        Sign in to sync your home port, target species, waypoints, and tackle box across devices.
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" onclick="signIn()" style="font-family:inherit;flex:1;background:#2979b5;border:none;
                color:#fff;font-size:12px;font-weight:700;padding:9px 12px;border-radius:6px;cursor:pointer">
          Sign In
        </button>
        <button type="button" onclick="signUp()" style="font-family:inherit;flex:1;background:transparent;border:1px solid rgba(107,191,234,.35);
                color:#6bbfea;font-size:12px;font-weight:700;padding:9px 12px;border-radius:6px;cursor:pointer">
          Create Account
        </button>
      </div>`;
  }
}

// Small helper to escape HTML when injecting user-controlled strings.
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

// Auth stubs — will be replaced by real backend calls once deployed.
// For now they show a "coming soon" notice so QA can verify the UI flow.
function signIn(){
  document.getElementById("bw-auth-gate").style.display = "flex";
}
function signUp(){
  document.getElementById("bw-auth-gate").style.display = "flex";
}
async function signOut(){
  await window.BW_AUTH.signOut();
  location.reload();
}

window.bwOnSignedIn = async function (user) {
  if(!window.WP_state || !Array.isArray(window.WP_state.userPoints)){
    setTimeout(() => window.bwOnSignedIn(user), 0);
    return;
  }
  // Resolve premium/owner entitlement before drawing gated data so owners see
  // the full waypoint set immediately and free accounts get the teaser.
  try { await refreshEntitlement(); } catch(e){ console.error("entitlement check failed", e); }
  try {
    const profile = await window.BW_AUTH.fetchProfile();
    // ── Sync ALL account settings down to this device ────────────────────────
    // If the account carries a full prefs blob (prefs_json), apply every setting
    // so the user's species, basemap, autozoom and LORAN choices follow them to
    // any device — not just the home port. The account is the source of truth on
    // login; we then write the merged result back to device localStorage. We do
    // this BEFORE resolving the port below so home_port (authoritative column)
    // can still override the port field if they ever differ.
    if(profile && profile.prefs_json){
      try {
        const acct = JSON.parse(profile.prefs_json);
        if(acct && typeof acct === "object"){
          if("defaultPort"    in acct) USER_PREFS.defaultPort    = acct.defaultPort;
          if("defaultSpecies" in acct) USER_PREFS.defaultSpecies = acct.defaultSpecies;
          if("defaultBaseMap" in acct) USER_PREFS.defaultBaseMap = acct.defaultBaseMap || "satellite";
          if("autozoomPort"   in acct) USER_PREFS.autozoomPort   = !!acct.autozoomPort;
          if("persistLoran"   in acct) USER_PREFS.persistLoran   = !!acct.persistLoran;
        }
      } catch(e){ /* malformed blob — ignore, fall back to device prefs */ }
    }
    // On LOGIN, reset the Home Port to the user's DEFAULT (set in Settings),
    // not to whatever port was last tapped in a previous session. The account's
    // home_port column stores the Settings default (written by prefSave); we
    // prefer it, then fall back to the on-device default, then the hard
    // fallback. This deliberately OVERRIDES any transient session selection so
    // a fresh login always starts at the configured default port.
    const loginDefault =
      (profile && profile.home_port && PORTS[profile.home_port] && profile.home_port) ||
      (USER_PREFS.defaultPort && PORTS[USER_PREFS.defaultPort] && USER_PREFS.defaultPort) ||
      null;
    // Keep USER_PREFS.defaultPort in sync with the account default so the
    // Settings dropdown and the in-app label agree after login.
    if(profile && profile.home_port && PORTS[profile.home_port]){
      USER_PREFS.defaultPort = profile.home_port;
      if(typeof prefSave === "function") prefSave();
      const pp = document.getElementById("pref-port");
      if(pp) pp.value = profile.home_port;
    }
    // Refresh the Settings modal controls so the synced values are reflected.
    if(typeof refreshSettingsModal === "function") refreshSettingsModal();

    // Recenter the map to the login/home port ONLY on the genuine sign-in, not
    // on every onAuthChange re-fire. Supabase fires onAuthChange again on token
    // refresh and when the tab regains focus; without this guard, returning to
    // the tab re-ran selectPort() and snapped the map back over the home port —
    // the recenter-on-tab-return the user asked to remove. The flag ensures the
    // one-time login centering happens once per page session.
    if(loginDefault && typeof selectPort === "function" && !window._bwDidLoginRecenter){
      window._bwDidLoginRecenter = true;
      selectPort(loginDefault);
    }
  } catch(e){ console.error("profile load failed", e); }
  try {
    WP_state.userPoints = await window.BW_AUTH.fetchWaypoints();
    if (typeof drawUserWaypoints === "function") drawUserWaypoints();

    const catches = await window.BW_AUTH.fetchCatches();
    USER_CATCHES.length = 0; catches.forEach((c) => USER_CATCHES.push(c));
    if (typeof catchRenderLog === "function") catchRenderLog();
    drawCatchPins();

    CM_state.log = await window.BW_AUTH.fetchLog("catch_meter");
    TB_state.favorites = await window.BW_AUTH.fetchLog("tide_favorites");

    // Load community fishing reports (de-identified) for the forum + reports factor.
    if (typeof loadReports === "function") loadReports();
  } catch (e) {
    console.error("Account hydrate failed", e);
    WP_state.userPoints = wpLoadUser();
    catchLoad();
    if (typeof drawUserWaypoints === "function") drawUserWaypoints();
  }
};

// ════════════════════════════════════════════════════════════════════════════
// NAV MENU
// ════════════════════════════════════════════════════════════════════════════
function toggleNav(){
  const m=document.getElementById('nav-menu');
  const opening = m.style.display==='none';
  m.style.display = opening ? 'block' : 'none';
  // Toggle a body class so the map's floating UI (zoom buttons, right-side
  // icon column, scale bar) can fade out via CSS while the menu is open.
  // This keeps the visual focus on the menu and avoids overlap.
  document.body.classList.toggle('nav-open', opening);
  // Refresh the account section every time the menu opens so it reflects
  // any state changes (sign-in/out) since last open.
  if(opening) renderAccountSection();
  if(opening && typeof refreshBriefRecallUi === "function") refreshBriefRecallUi();
  if(opening && typeof applyAdminNavVisibility === "function") applyAdminNavVisibility();
}
function closeNav(){
  document.getElementById('nav-menu').style.display='none';
  document.body.classList.remove('nav-open');
}

// Close nav on outside click
document.addEventListener('click',e=>{
  if(_navBackGuard) return;
  if(!e.target.closest('#nav-btn')&&!e.target.closest('#nav-menu')){
    closeNav();
  }
  if(!e.target.closest("#sp-wrap")){
    document.getElementById("sp-dd").classList.remove("open");
    document.getElementById("sp-arr").textContent="▼";
  }
});

window.addEventListener("load",initMap);
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState !== "visible") return;
  if(typeof ensureFreshestSatDates === "function") ensureFreshestSatDates();
  if(typeof refreshActiveOceanLayers === "function") refreshActiveOceanLayers();
});
window.addEventListener("pageshow", (e) => {
  if(!e.persisted) return;
  if(typeof restoreExplainerState === "function") restoreExplainerState();
});
