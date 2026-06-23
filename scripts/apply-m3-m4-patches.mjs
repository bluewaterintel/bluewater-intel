#!/usr/bin/env node
/**
 * Apply Milestone 3 + 4 client patches to index.html (idempotent where noted).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HTML = path.join(ROOT, "index.html");
let html = fs.readFileSync(HTML, "utf8");

function mustReplace(label, oldStr, newStr) {
  if (!html.includes(oldStr)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  html = html.replace(oldStr, newStr);
  console.log(`✓ ${label}`);
}

// ── Script tags for M4 modules ─────────────────────────────────────────────
if (!html.includes('src="bw-freshness.js"')) {
  html = html.replace(
    '<script src="bw-auth.js"></script>',
    '<script src="bw-auth.js"></script>\n<script src="bw-freshness.js"></script>\n<script src="bw-ocean.js"></script>'
  );
  console.log("✓ Added bw-freshness.js + bw-ocean.js script tags");
}

// ── M3: structureNear + runBrief ───────────────────────────────────────────
if (!html.includes("function structureNear(")) {
  mustReplace(
    "M3 structureNear + runBrief",
    `async function runBrief(){
  if(!pinLL||aiLoading)return;
  aiLoading=true;aiCOA="";renderBrief();
  const wx=calcWx(pinLL.lat,pinLL.lng);
  const sp=briefSp.length?briefSp:(activeSpId==="all"?[]:[activeSpId]);
  const port=activePort||"Oregon Inlet, NC";

  // Try backend first (uses server-side Anthropic key — secure)
  if(API.available){
    const brief = await API.getBrief({lat:pinLL.lat, lng:pinLL.lng, port, species:sp, weather:wx});
    if(brief){
      aiCOA = brief;
      aiLoading = false;
      renderBrief();
      return;
    }
  }

  // Fall back to direct API (artifact sandbox / demo only)
  const spNames=sp.map(id=>SPECIES.find(s=>s.id===id)?.name).filter(Boolean).join(", ")||"best species for conditions";
  const prompt=\`You are an elite US East Coast offshore fishing captain, 30+ years from Portsmouth NH and the Gulf of Maine south through Stellwagen Bank, the Mid-Atlantic canyons, the Outer Banks, to Charleston SC.
SPOT: \${pinLL.lat.toFixed(3)}N \${Math.abs(pinLL.lng).toFixed(3)}W | PORT: \${port} | TARGETS: \${spNames}
CONDITIONS (NDBC \${wx.buoy}): Water \${wx.waterTempF}F | Air \${wx.airTempF}F | Seas \${wx.waveHt}ft@\${wx.wavePer}s | Wind \${wx.windKt}kt SW | \${wx.pressure}hPa | \${wx.nm}nm offshore
FLEET: YFT/BFT active Oregon Inlet grounds. Blue marlin at Norfolk Canyon. Wahoo at 100-line. Sword bite Hatteras Hole nights. Big Rock bite on.
Write 4-5 sentence tactical captain's brief: (1) exact bearing+distance from \${port} to this spot, (2) top 1-2 species picks with reasoning, (3) specific technique and timing, (4) key local intel—temp break/weed line/structure/current, (5) safety note if seas exceed 4ft. Direct, salty, no filler.\`;
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:900,messages:[{role:"user",content:prompt}]})});
    const d=await r.json();aiCOA=d.content?.[0]?.text||"Brief unavailable.";
  }catch{aiCOA="AI brief unavailable — check connection.";}
  aiLoading=false;renderBrief();
}`,
    `function structureNear(lat, lng, maxNm = 15, limit = 3){
  if(typeof CANYONS === "undefined") return [];
  return CANYONS
    .map(c => ({ name: c.name, nm: nmBetween(lat, lng, c.lat, c.lng) }))
    .filter(c => c.nm <= maxNm)
    .sort((a,b) => a.nm - b.nm)
    .slice(0, limit);
}
async function runBrief(){
  if(!pinLL||aiLoading)return;
  aiLoading=true;aiCOA="";renderBrief();

  const sp = briefSp.length ? briefSp : (activeSpId==="all" ? [] : [activeSpId]);
  const speciesNames = sp.map(id => SPECIES.find(s=>s.id===id)?.name).filter(Boolean);
  const port = activePort || null;
  const portObj = port && PORTS[port] ? PORTS[port] : null;

  const payload = {
    lat: pinLL.lat,
    lng: pinLL.lng,
    port: port || "",
    portLat: portObj ? portObj.lat : null,
    portLng: portObj ? portObj.lng : null,
    nmOffshore: (typeof nmOffshore === "function") ? Math.round(nmOffshore(pinLL.lat, pinLL.lng)) : null,
    nearbyStructure: structureNear(pinLL.lat, pinLL.lng),
    species: speciesNames,
  };

  try {
    const { brief } = await window.BW_AUTH.callBrief(payload);
    aiCOA = brief || "Brief unavailable.";
  } catch (e) {
    aiCOA = (e && /sign in/i.test(e.message))
      ? "Sign in to generate a Captain's Brief."
      : "Captain's Brief is unavailable right now. Please try again.";
  }
  aiLoading=false;renderBrief();
}`
  );
}

// ── M4: ocean field helpers (before scoreCell) ─────────────────────────────
if (!html.includes("let OCEAN_FIELD")) {
  mustReplace(
    "M4 ocean field helpers",
    `function scoreCell(lat, lng, speciesId){
  const prefs = PREDICT_SPECIES_PREFS[speciesId];
  if(!prefs) return null;

  // ── Get the right weight table for this species category ──
  const W = predictWeightsFor(speciesId);
  const sp = (typeof SPECIES !== "undefined") ? SPECIES.find(s => s.id === speciesId) : null;
  const speciesCat = sp ? sp.cat : "offshore";

  const sst   = synthSST(lat, lng);
  const chlor = synthChlor(lat, lng);
  const depth = synthDepth(lat, lng);
  const tBreak = thermalBreak(lat, lng);
  const pressureTrend = synthPressureTrend();
  const solunar = solunarScore(lat, lng);
  const tide = tideStage(lat, lng);
  const moon = moonPhase();
  const wxChange = synthWeatherChange();`,
    `// Real ocean field cache for the current heatmap render (coarse grid prefetch).
let OCEAN_FIELD = { samples: [], builtAtMs: 0 };

function decimateOceanPts(pts, max){
  if(pts.length <= max) return pts;
  const out = [];
  const step = pts.length / max;
  for(let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

async function buildOceanField(latMin, latMax, lngMin, lngMax){
  if(typeof BW_OCEAN === "undefined"){ OCEAN_FIELD = { samples: [], builtAtMs: Date.now() }; return; }
  const stepDeg = 12 / 60;
  const pts = [];
  for(let la = latMin; la <= latMax; la += stepDeg)
    for(let ln = lngMin; ln <= lngMax; ln += stepDeg)
      if(isFishableWater(la, ln)) pts.push([la, ln]);
  const capped = pts.length > 60 ? decimateOceanPts(pts, 60) : pts;
  const results = await Promise.all(capped.map(([la, ln]) =>
    BW_OCEAN.fetchOcean(la, ln).then(p => ({ la, ln, p }))));
  OCEAN_FIELD = { samples: results, builtAtMs: Date.now() };
}

function nearestSample(lat, lng){
  let best = null, bestNm = Infinity;
  for(const s of OCEAN_FIELD.samples){
    const d = nmBetween(lat, lng, s.la, s.ln);
    if(d < bestNm){ bestNm = d; best = s; }
  }
  return best ? best.p : null;
}

function thermalBreakReal(lat, lng){
  const near = [];
  for(const s of OCEAN_FIELD.samples){
    const d = nmBetween(lat, lng, s.la, s.ln);
    if(d <= 20 && s.p?.sst?.value != null) near.push({ la: s.la, ln: s.ln, v: s.p.sst.value });
  }
  if(near.length < 2) return 0;
  let maxGrad = 0;
  for(let i = 0; i < near.length; i++){
    for(let j = i + 1; j < near.length; j++){
      const dNm = nmBetween(near[i].la, near[i].ln, near[j].la, near[j].ln);
      if(dNm < 0.1) continue;
      const grad = Math.abs(near[i].v - near[j].v) / dNm;
      if(grad > maxGrad) maxGrad = grad;
    }
  }
  return maxGrad;
}

function scoreCell(lat, lng, speciesId){
  const prefs = PREDICT_SPECIES_PREFS[speciesId];
  if(!prefs) return null;

  // ── Get the right weight table for this species category ──
  const W = predictWeightsFor(speciesId);
  const sp = (typeof SPECIES !== "undefined") ? SPECIES.find(s => s.id === speciesId) : null;
  const speciesCat = sp ? sp.cat : "offshore";

  const ocean = nearestSample(lat, lng);
  const sstObj   = ocean?.sst   ?? { value: null, observedAtMs: null };
  const chlorObj = ocean?.chlor ?? { value: null, observedAtMs: null };
  const windObj  = ocean?.wind  ?? { value: null, observedAtMs: null };
  const presObj  = ocean?.pressure ?? { value: null, observedAtMs: null };

  const sst   = sstObj.value;
  const chlor = chlorObj.value;
  const depth = seaDepth(lat, lng);
  const tBreak = thermalBreakReal(lat, lng);
  const pressureTrend = presObj.value;
  const solunar = solunarScore(lat, lng);
  const tide = tideStage(lat, lng);
  const moon = moonPhase();`
  );
}

// ── M4: null-guard tempScore ───────────────────────────────────────────────
if (html.includes("let tempScore;\n  if(sst >=")) {
  mustReplace(
    "M4 tempScore null guard",
    `  let tempScore;
  if(sst >= prefs.tempIdeal[0] && sst <= prefs.tempIdeal[1]){`,
    `  let tempScore = 0;
  if(sst != null && sst >= prefs.tempIdeal[0] && sst <= prefs.tempIdeal[1]){`
  );
  html = html.replace(
    `  } else if(sst < prefs.tempIdeal[0]){`,
    `  } else if(sst != null && sst < prefs.tempIdeal[0]){`
  );
  html = html.replace(
    `  } else {
    // WARM side — falloff from ideal_max up to working_max and beyond.`,
    `  } else if(sst != null) {
    // WARM side — falloff from ideal_max up to working_max and beyond.`
  );
}

// ── M4: null-guard chlorScore ───────────────────────────────────────────────
if (html.includes('let chlorScore = 0.5;\n  if(prefs.chlorPref === "low")')) {
  mustReplace(
    "M4 chlorScore null guard",
    `  let chlorScore = 0.5;
  if(prefs.chlorPref === "low")  chlorScore = chlor < 0.2 ? 1.0 : chlor < 0.5 ? 0.6 : 0.2;
  if(prefs.chlorPref === "high") chlorScore = chlor > 1.0 ? 1.0 : chlor > 0.5 ? 0.6 : 0.2;
  if(prefs.chlorPref === "edge") chlorScore = (chlor >= 0.15 && chlor <= 0.5) ? 1.0 : 0.4;
  if(prefs.chlorPref === "any")  chlorScore = 0.7;`,
    `  let chlorScore = 0;
  if(chlor != null){
    chlorScore = 0.5;
    if(prefs.chlorPref === "low")  chlorScore = chlor < 0.2 ? 1.0 : chlor < 0.5 ? 0.6 : 0.2;
    if(prefs.chlorPref === "high") chlorScore = chlor > 1.0 ? 1.0 : chlor > 0.5 ? 0.6 : 0.2;
    if(prefs.chlorPref === "edge") chlorScore = (chlor >= 0.15 && chlor <= 0.5) ? 1.0 : 0.4;
    if(prefs.chlorPref === "any")  chlorScore = 0.7;
  }`
  );
}

// ── M4: pressure score null guard ────────────────────────────────────────────
if (html.includes("let pressureScore;\n  if(pressureTrend < -3)")) {
  mustReplace(
    "M4 pressureScore null guard",
    `  let pressureScore;
  if(pressureTrend < -3) pressureScore = 1.0;
  else if(pressureTrend < -1) pressureScore = 0.85;
  else if(pressureTrend < 1) pressureScore = 0.6;
  else if(pressureTrend < 3) pressureScore = 0.4;
  else pressureScore = 0.25;`,
    `  let pressureScore = 0.5;
  if(pressureTrend != null){
    if(pressureTrend < -3) pressureScore = 1.0;
    else if(pressureTrend < -1) pressureScore = 0.85;
    else if(pressureTrend < 1) pressureScore = 0.6;
    else if(pressureTrend < 3) pressureScore = 0.4;
    else pressureScore = 0.25;
  }`
  );
}

// ── M4: wxChange neutral (no synthetic weather change in production path) ────
if (html.includes("const wxChangeScoreVal = weatherChangeScore();")) {
  mustReplace(
    "M4 wxChange neutral",
    `  const wxChangeScoreVal = weatherChangeScore();`,
    `  const wxChangeScoreVal = 0.5;`
  );
}

// ── M4: freshness confidence block ───────────────────────────────────────────
if (html.includes("const strongFactors = allScores.filter")) {
  mustReplace(
    "M4 freshness confidence",
    `  // Confidence — function of how many factors had strong signal (weighted)
  const allScores = [tempScore, chlorScore, depthScore, breakScore, seasonScore,
                     pressureScore, solunarScoreVal, tideScoreVal, windScoreVal,
                     wxChangeScoreVal, moonPhaseScoreVal];
  const strongFactors = allScores.filter(s => s > 0.7).length;
  const dataFactors = (reportScore > 0.05 ? 1 : 0) + (aisScore_ > 0.05 ? 1 : 0);
  const confidence = Math.min(95, 25 + strongFactors * 5 + dataFactors * 8);`,
    `  const now = forecastTimeMs();
  const fr = (typeof BW_FRESHNESS !== "undefined" && BW_FRESHNESS.combine)
    ? BW_FRESHNESS.combine([
        { key:"temp",   variable:"sst",      baseWeight:W.temperature,   score:tempScore,        observedAtMs:sstObj.observedAtMs },
        { key:"chlor",  variable:"chlor",    baseWeight:W.chlorophyll,   score:chlorScore,       observedAtMs:chlorObj.observedAtMs },
        { key:"wind",   variable:"wind",     baseWeight:W.wind,         score:windScoreVal,     observedAtMs:windObj.observedAtMs },
        { key:"pres",   variable:"pressure", baseWeight:W.pressure,     score:pressureScore,    observedAtMs:presObj.observedAtMs },
        { key:"depth",  variable:"depth",    baseWeight:W.depthStruct,   score:depthScore,       observedAtMs:now },
        { key:"break",  variable:"sst",      baseWeight:W.thermalBreak,  score:breakScore,       observedAtMs:sstObj.observedAtMs },
        { key:"solunar", variable:null, baseWeight:W.solunar,      score:solunarScoreVal },
        { key:"tide",    variable:null, baseWeight:W.tide,         score:tideScoreVal },
        { key:"season",  variable:null, baseWeight:W.season,       score:seasonScore },
        { key:"moon",    variable:null, baseWeight:W.moonPhase||0, score:moonPhaseScoreVal },
      ], now)
    : { confidence: Math.min(95, 25 + [tempScore, chlorScore, depthScore, breakScore].filter(s => s > 0.7).length * 5), annotations: [] };
  const confidence = fr.confidence;
  const freshnessAnnotations = fr.annotations || [];`
  );
}

// ── M4: factor raw null-safe + return freshnessAnnotations ───────────────────
if (html.includes('raw:`${sst.toFixed(1)}°F`')) {
  mustReplace(
    "M4 factor raw null-safe",
    `    {name:"Water temperature",  weight:W.temperature,   score:tempScore,        raw:\`\${sst.toFixed(1)}°F\`},
    {name:"Depth/structure",    weight:W.depthStruct,   score:depthScore,       raw:\`\${Math.round(depth)} m\`},
    {name:"Pressure trend",     weight:W.pressure,      score:pressureScore,    raw:\`\${pressureTrend > 0 ? "+" : ""}\${pressureTrend.toFixed(1)} hPa/day\`},
    {name:"Chlorophyll edge",   weight:W.chlorophyll,   score:chlorScore,       raw:\`\${chlor.toFixed(2)} mg/m³\`},`,
    `    {name:"Water temperature",  weight:W.temperature,   score:tempScore,        raw:sst != null ? \`\${sst.toFixed(1)}°F\` : "—"},
    {name:"Depth/structure",    weight:W.depthStruct,   score:depthScore,       raw:\`\${Math.round(depth)} m\`},
    {name:"Pressure trend",     weight:W.pressure,      score:pressureScore,    raw:pressureTrend != null ? \`\${pressureTrend.toFixed(1)} hPa\` : "—"},
    {name:"Chlorophyll edge",   weight:W.chlorophyll,   score:chlorScore,       raw:chlor != null ? \`\${chlor.toFixed(2)} mg/m³\` : "—"},`
  );
}

if (!html.includes("freshnessAnnotations,")) {
  mustReplace(
    "M4 return freshnessAnnotations",
    `  return {
    score: Math.max(0, Math.min(1, finalScore)),
    confidence,
    sst, chlor, depth, tBreak,`,
    `  return {
    score: Math.max(0, Math.min(1, finalScore)),
    confidence,
    freshnessAnnotations,
    sst, chlor, depth, tBreak,`
  );
}

// ── M4: async ocean prefetch in grid compute ─────────────────────────────────
if (!html.includes("await buildOceanField(")) {
  mustReplace(
    "M4 buildOceanField prefetch",
    `  requestAnimationFrame(step_frame);
  return myGen;
}`,
    `  (async () => {
    if(myGen !== _predictGen) return;
    try { await buildOceanField(LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX); }
    catch(e){ console.warn("buildOceanField", e); }
    if(myGen !== _predictGen) return;
    requestAnimationFrame(step_frame);
  })();
  return myGen;
}`
  );
}

// ── M4: tooltip null-safe SST ──────────────────────────────────────────────
if (html.includes("SST ${cell.sst.toFixed(1)}°F")) {
  mustReplace(
    "M4 tooltip SST null-safe",
    '              SST ${cell.sst.toFixed(1)}°F · ${Math.round(cell.depth)}m<br>',
    '              SST ${cell.sst != null ? cell.sst.toFixed(1) : "—"}°F · ${Math.round(cell.depth)}m<br>'
  );
}

// ── M4: explainer freshness annotations ────────────────────────────────────
if (!html.includes("cell.freshnessAnnotations")) {
  mustReplace(
    "M4 explainer annotations",
    `        <div style="font-size:9.5px;color:#7a9ec0;margin-top:2px;font-style:italic">how sure</div>
      </div>`,
    `        <div style="font-size:9.5px;color:#7a9ec0;margin-top:2px;font-style:italic">how sure</div>
        \${(cell.freshnessAnnotations && cell.freshnessAnnotations.length) ? '<div style="font-size:9.5px;color:#9ec5e8;margin-top:6px;line-height:1.4">' + cell.freshnessAnnotations.map(a => '<div>• ' + (a.message || a) + '</div>').join('') + '</div>' : ''}
      </div>`
  );
}

fs.writeFileSync(HTML, html);
console.log("\nM3+M4 patches applied to index.html");
