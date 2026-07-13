/* Bluewater Intel — Catch measure — length-to-weight formulas + regulations
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

// ════════════════════════════════════════════════════════════════════════════
// SPECIES DATABASE — length-to-weight formulas + East Coast regulations
// Source: NOAA SEFSC/NEFSC published L-W relationships, ASMFC bag/size limits
// Formula: W (lbs) = a × L^b  where L is total length in inches
// ════════════════════════════════════════════════════════════════════════════
const CM_SPECIES = [
  // Offshore pelagics
  {id:"bluemarlin",name:"Blue Marlin",cat:"offshore",a:0.000018,b:3.110,minIn:99,minNote:"99\" lower-jaw fork length (federal)",notes:"Federal HMS regulations. Tournament-only retention common.",releaseRecommended:true},
  {id:"whitemarlin",name:"White Marlin",cat:"offshore",a:0.000020,b:3.000,minIn:66,minNote:"66\" lower-jaw fork length (federal)",notes:"Federal HMS regulations. Catch and release strongly encouraged.",releaseRecommended:true},
  {id:"spearfish",name:"Longbill Spearfish",cat:"offshore",a:0.000013,b:3.020,minIn:0,minNote:"Federal HMS — Atlantic billfish; release required for most permits",notes:"Rare, slender billfish. Federal HMS regulations apply. Catch and release strongly encouraged.",releaseRecommended:true},
  {id:"sailfish",name:"Sailfish",cat:"offshore",a:0.000017,b:3.080,minIn:63,minNote:"63\" lower-jaw fork length (federal)",notes:"Federal HMS regulations.",releaseRecommended:true},
  {id:"swordfish",name:"Swordfish",cat:"offshore",a:0.000043,b:2.910,minIn:47,minNote:"47\" lower-jaw fork length (federal)",notes:"Federal HMS permit required."},
  {id:"yellowfin",name:"Yellowfin Tuna",cat:"offshore",a:0.000033,b:2.920,minIn:27,minNote:"27\" curved fork length",bag:3,notes:"3 fish per person bag limit (federal)."},
  {id:"bluefin",name:"Bluefin Tuna",cat:"offshore",a:0.000036,b:2.930,minIn:27,minNote:"27\" curved fork length minimum",notes:"NOAA HMS permit required. Strict reporting requirements."},
  {id:"blackfin",name:"Blackfin Tuna",cat:"offshore",a:0.000028,b:2.910,minIn:0,minNote:"No federal size limit",notes:"State limits may apply."},
  {id:"wahoo",name:"Wahoo",cat:"offshore",a:0.000010,b:2.980,minIn:0,minNote:"No federal size limit",bag:2,notes:"Federal 2-fish bag (SAFMC)."},
  {id:"mahi",name:"Mahi Mahi",cat:"offshore",a:0.000038,b:2.900,minIn:20,minNote:"20\" fork length (most states)",bag:10,notes:"10 fish per person, 60 per boat (federal)."},
  // Nearshore
  {id:"cobia",name:"Cobia",cat:"nearshore",a:0.000048,b:2.910,minIn:36,minNote:"36\" fork length (federal)",bag:1,notes:"1 fish per person, 6 per boat (federal). State limits may be stricter."},
  {id:"tilefish",name:"Golden Tilefish",cat:"offshore",a:0.000095,b:2.920,minIn:24,minNote:"24\" total length",bag:5,notes:"5 fish bag limit."},
  {id:"grouper",name:"Gag Grouper",cat:"nearshore",a:0.000068,b:2.940,minIn:24,minNote:"24\" total length",bag:1,notes:"Seasonal — verify NOAA dates."},
  {id:"blackseabass",name:"Black Sea Bass",cat:"nearshore",a:0.000071,b:2.970,minIn:13,minNote:"12.5-13\" depending on state",bag:10,notes:"State-specific. Check current regs."},
  {id:"tautog",name:"Tautog",cat:"nearshore",a:0.000115,b:2.940,minIn:16,minNote:"15-16\" depending on state",bag:3,notes:"Seasonal. State-specific."},
  // Inshore
  {id:"redfish",name:"Redfish",cat:"inshore",a:0.000060,b:2.920,minIn:18,maxIn:27,minNote:"18-27\" slot (NC/SC); 1 over slot per year",bag:1,notes:"Strict slot limits. State-specific."},
  {id:"flounder",name:"Summer Flounder",cat:"inshore",a:0.000070,b:2.920,minIn:18,minNote:"17-20\" depending on state",bag:4,notes:"State-specific. Check current regs."},
  {id:"snapper",name:"Red Snapper",cat:"nearshore",a:0.000097,b:2.910,minIn:20,minNote:"20\" total length",bag:1,notes:"Federal season usually 1-2 weeks/year. Verify dates."},
  {id:"sheepshead",name:"Sheepshead",cat:"inshore",a:0.000116,b:2.880,minIn:12,minNote:"12\" most states",bag:8,notes:"State-specific."},
  // ── NEW ENGLAND / NORTHEAST SPECIES ─────────────────────────────────────
  {id:"striper",name:"Striped Bass",cat:"inshore",a:0.000020,b:3.013,minIn:28,maxIn:35,minNote:"28-35\" slot (most NE states); 1 fish/day",bag:1,notes:"Strict slot limits — check current ASMFC regs. Catch-and-release for fish outside slot."},
  {id:"cod",name:"Atlantic Cod",cat:"nearshore",a:0.000088,b:2.999,minIn:22,minNote:"22\" most NE states",bag:10,notes:"GOM season usually Sept-Apr. NOAA closes recreational cod fishing seasonally — verify before trip."},
  {id:"haddock",name:"Haddock",cat:"nearshore",a:0.000065,b:3.010,minIn:17,minNote:"17\" GOM",bag:15,notes:"GOM open most of year. Most reliable groundfish keep for New England."},
  {id:"pollock",name:"Pollock",cat:"nearshore",a:0.000050,b:3.050,minIn:19,minNote:"19\" recommended (varies by state)",bag:0,notes:"Excellent fight on light tackle. No bag limit federally but check state."},
  {id:"bonito",name:"Atlantic Bonito",cat:"nearshore",a:0.000023,b:2.940,minIn:0,minNote:"No federal limit",notes:"Late summer New England favorite. Excellent table fare when bled and iced immediately."},
  {id:"falsealbacore",name:"False Albacore",cat:"nearshore",a:0.000022,b:2.960,minIn:0,minNote:"No federal size or bag limit",notes:"Premier light-tackle and fly target of the fall run. Strong, dark flesh — most are released after the fight."},
  {id:"skipjack",name:"Skipjack Tuna",cat:"offshore",a:0.000024,b:2.950,minIn:0,minNote:"No federal size limit (vessel HMS permit required)",notes:"Aggressive warm-water tuna, often first to the spread. Great live/strip bait for marlin; eat very fresh."},
  {id:"bluefish",name:"Bluefish",cat:"inshore",a:0.000030,b:2.910,minIn:0,minNote:"No federal size; 3-fish bag (private), 5-fish (charter)",bag:3,notes:"Watch for teeth — use wire leaders. Best when fresh; doesn't freeze well."},
  {id:"bigeye",name:"Bigeye Tuna",cat:"offshore",a:0.000043,b:2.900,minIn:27,minNote:"27\" curved fork length minimum",notes:"NOAA HMS permit required. Often caught at night on swordfish drifts."},
  // ── INSHORE / NEARSHORE SPECIES ────────────────────────────────────────
  {id:"speckledtrout",name:"Speckled Trout",cat:"inshore",a:0.000048,b:2.920,minIn:14,minNote:"14-18\" minimum, slot in NC/VA — check state",bag:4,notes:"Strict state-specific slot limits. Catch-and-release sensitive in cold water."},
  {id:"spadefish",name:"Atlantic Spadefish",cat:"nearshore",a:0.000118,b:2.880,minIn:0,minNote:"No federal minimum; 4-fish bag VA",bag:4,notes:"State-specific bag limits. Excellent surprise catch on nearshore towers and wrecks."},
  {id:"croaker",name:"Atlantic Croaker",cat:"inshore",a:0.000065,b:2.940,minIn:0,minNote:"No federal minimum; check state",notes:"Common panfish, great for kids. Limit per VA/NC state regulations."},
  {id:"spanishmack",name:"Spanish Mackerel",cat:"nearshore",a:0.000018,b:2.965,minIn:12,minNote:"12\" fork length (federal/state)",bag:15,notes:"Federal 15-fish bag. Excellent eating fresh — bleed immediately."},
  {id:"kingmack",name:"King Mackerel",cat:"nearshore",a:0.000030,b:2.960,minIn:24,minNote:"24\" fork length (federal)",bag:3,notes:"Federal 3-fish bag. State regs may differ. SMOKERS (40+ lbs) often released."},
  {id:"triggerfish",name:"Gray Triggerfish",cat:"nearshore",a:0.000110,b:2.900,minIn:14,minNote:"14\" fork length (S Atlantic)",bag:1,notes:"Strict 1-fish bag. Tough teeth — handle carefully. Check seasonal closures."}];

// ════════════════════════════════════════════════════════════════════════════
// REFERENCE OBJECTS — known dimensions for measurement calibration
// ════════════════════════════════════════════════════════════════════════════
const CM_REFERENCES = [
  {id:"creditcard",name:"Credit Card / Driver License",lengthIn:3.370,desc:"Standard ID-1 size: 3.37\" × 2.13\""},
  {id:"dollarbill",name:"US Dollar Bill",lengthIn:6.140,desc:"Standard US currency: 6.14\" × 2.61\""},
  {id:"iphone15",name:"iPhone 14/15 (standard)",lengthIn:5.810,desc:"iPhone 14/15: 5.81\" tall"},
  {id:"iphone15plus",name:"iPhone 14/15 Plus/Pro Max",lengthIn:6.330,desc:"iPhone 14/15 Plus or Pro Max: 6.33\" tall"},
  {id:"ruler12",name:"12-inch Ruler",lengthIn:12.000,desc:"Standard 12\" ruler"},
  {id:"measureboard24",name:"24-inch Fish Measuring Board",lengthIn:24.000,desc:"Standard 24\" fishing board"},
  {id:"measureboard36",name:"36-inch Fish Measuring Board",lengthIn:36.000,desc:"Long fishing measuring board"},
  {id:"custom",name:"Custom (enter length)",lengthIn:0,desc:"Enter your own reference object length in inches"}];

// ════════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════════
let CM_state = {
  tab: "measure",
  imageData: null,        // base64 data URL of captured photo
  imageWidth: 0,
  imageHeight: 0,
  refPoints: [],          // [{x,y},{x,y}] — pixel coords of ref object endpoints
  fishPoints: [],         // [{x,y},{x,y}] — pixel coords of fish endpoints
  marking: null,          // "ref" | "fish" | null — what we're currently marking
  refObject: "creditcard",
  refLengthCustom: "",
  species: "yellowfin",
  result: null,           // computed measurement result
  log: [],                // saved catches
  online: navigator.onLine,
};

// ════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ════════════════════════════════════════════════════════════════════════════
function openCatchMeasure(){
  CM_state.log = cmLoadLog();
  CM_updateOnlineStatus();
  document.getElementById("cm-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  cmRender();

  // Listen for online/offline
  window.addEventListener("online", CM_updateOnlineStatus);
  window.addEventListener("offline", CM_updateOnlineStatus);
}
function closeCatchMeasure(){
  document.getElementById("cm-overlay").style.display = "none";
  document.body.style.overflow = "";
  window.removeEventListener("online", CM_updateOnlineStatus);
  window.removeEventListener("offline", CM_updateOnlineStatus);
  // Stop any active camera stream
  CM_stopCamera();
}
function cmSwitchTab(tab){
  CM_state.tab = tab;
  document.querySelectorAll(".cm-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  cmRender();
}
function CM_updateOnlineStatus(){
  CM_state.online = navigator.onLine;
  const pill = document.getElementById("cm-online-pill");
  const dot  = document.getElementById("cm-online-dot");
  const txt  = document.getElementById("cm-online-txt");
  if(!pill) return;
  if(CM_state.online){
    pill.style.background = "rgba(16,185,129,.12)";
    pill.style.borderColor = "rgba(16,185,129,.3)";
    pill.style.color = "#34d399";
    dot.style.background = "#10b981";
    txt.textContent = "ONLINE";
  } else {
    pill.style.background = "rgba(245,158,11,.12)";
    pill.style.borderColor = "rgba(245,158,11,.4)";
    pill.style.color = "#fbbf24";
    dot.style.background = "#f59e0b";
    txt.textContent = "OFFLINE";
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE — catch log persists across sessions, fully offline
// ════════════════════════════════════════════════════════════════════════════
const CM_LOG_KEY = "bwi_catch_log_v1";
function cmLoadLog(){
  try {
    const raw = localStorage.getItem(CM_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e){ return []; }
}
function cmSaveLog(){
  try { localStorage.setItem(CM_LOG_KEY, JSON.stringify(CM_state.log)); } catch(e){}
  if(window.BW_AUTH) window.BW_AUTH.saveLog("catch_meter", CM_state.log).catch(()=>{});
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════════════════════
function cmRender(){
  const root = document.getElementById("cm-content");
  if(CM_state.tab === "measure")  root.innerHTML = cmRenderMeasure();
  else if(CM_state.tab === "log") root.innerHTML = cmRenderLog();
  else if(CM_state.tab === "help") root.innerHTML = cmRenderHelp();

  // Re-attach canvas handlers if image is loaded
  if(CM_state.tab === "measure" && CM_state.imageData) cmDrawCanvas();
}

// ── MEASURE TAB ──────────────────────────────────────────────────────────────
function cmRenderMeasure(){
  const hasImage = !!CM_state.imageData;
  const refDone  = CM_state.refPoints.length === 2;
  const fishDone = CM_state.fishPoints.length === 2;
  const ref = CM_REFERENCES.find(r => r.id === CM_state.refObject);

  return `
    <div style="margin-bottom:14px;padding:12px 16px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;font-size:11px;color:#86efac;line-height:1.6">
      <b>📡 100% Offline Capable</b> — capture a photo with a reference object next to your fish, mark both, and get an accurate length and weight estimate. No connection needed.
    </div>

    <!-- STEP 1: Capture photo -->
    <div class="cm-step ${hasImage ? "done" : ""}">
      <h3><span class="cm-step-num">${hasImage ? "" : "1"}</span> Capture Photo</h3>
      ${!hasImage ? `
        <div class="cm-photo-zone" onclick="cmStartCamera()">
          <div style="font-size:42px;margin-bottom:10px">📷</div>
          <div style="font-size:14px;font-weight:600;color:#cfe5ff;margin-bottom:6px">Take Photo of Catch</div>
          <div style="font-size:11px;color:#9ec5e8;line-height:1.5">Place a reference object (credit card, ruler, phone) flat next to the fish at the same depth/angle</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="cm-btn cm-btn-secondary" onclick="document.getElementById('cm-file-input').click()">📁 Upload Photo</button>
          <input id="cm-file-input" type="file" accept="image/*" capture="environment" style="display:none" onchange="cmHandleFile(event)"/>
        </div>
      ` : `
        <div id="cm-canvas-wrap">
          <canvas id="cm-canvas"></canvas>
          <canvas id="cm-overlay-canvas"></canvas>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="cm-btn cm-btn-secondary" onclick="cmRetake()">🔄 Retake</button>
        </div>
      `}
    </div>

    <!-- STEP 2: Choose reference -->
    <div class="cm-step ${!hasImage ? "disabled" : ""} ${refDone ? "done" : ""}">
      <h3><span class="cm-step-num">${refDone ? "" : "2"}</span> Reference Object</h3>
      <select class="cm-select" onchange="cmSetRef(this.value)">
        ${CM_REFERENCES.map(r => `<option value="${r.id}" ${r.id === CM_state.refObject ? "selected" : ""}>${r.name} (${r.lengthIn ? r.lengthIn + '"' : "custom"})</option>`).join("")}
      </select>
      ${CM_state.refObject === "custom" ? `
        <input class="cm-input" type="number" step="0.01" placeholder="Length in inches" value="${CM_state.refLengthCustom}" oninput="CM_state.refLengthCustom=this.value;cmCompute()" style="margin-top:8px"/>
      ` : `
        <div style="font-size:10px;color:#9ec5e8;margin-top:6px">${ref?.desc || ""}</div>
      `}
      ${hasImage ? `
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="cm-btn" onclick="cmStartMarking('ref')">${refDone ? "✓ Tap two ends of reference" : "📍 Mark Reference Endpoints"}</button>
          ${refDone ? `<button class="cm-btn cm-btn-secondary" onclick="cmClearRef()">Clear</button>` : ""}
        </div>
        ${CM_state.marking === "ref" ? `<div style="margin-top:8px;font-size:11px;color:#fbbf24;font-weight:600">→ Tap the two ends of the reference object on the photo</div>` : ""}
      ` : ""}
    </div>

    <!-- STEP 3: Mark fish -->
    <div class="cm-step ${!refDone ? "disabled" : ""} ${fishDone ? "done" : ""}">
      <h3><span class="cm-step-num">${fishDone ? "" : "3"}</span> Mark Fish Length</h3>
      <select class="cm-select" onchange="cmSetSpecies(this.value)">
        <optgroup label="Offshore">
          ${CM_SPECIES.filter(s => s.cat === "offshore").map(s => `<option value="${s.id}" ${s.id === CM_state.species ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
        <optgroup label="Nearshore">
          ${CM_SPECIES.filter(s => s.cat === "nearshore").map(s => `<option value="${s.id}" ${s.id === CM_state.species ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
        <optgroup label="Inshore">
          ${CM_SPECIES.filter(s => s.cat === "inshore").map(s => `<option value="${s.id}" ${s.id === CM_state.species ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
      </select>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="cm-btn" onclick="cmStartMarking('fish')" ${!refDone ? "disabled" : ""}>${fishDone ? "✓ Tap nose and tail" : "🐟 Mark Fish Endpoints"}</button>
        ${fishDone ? `<button class="cm-btn cm-btn-secondary" onclick="cmClearFish()">Clear</button>` : ""}
      </div>
      ${CM_state.marking === "fish" ? `<div style="margin-top:8px;font-size:11px;color:#fbbf24;font-weight:600">→ Tap the tip of the fish\'s nose, then tip of tail</div>` : ""}
    </div>

    <!-- STEP 4: Result -->
    ${CM_state.result ? cmRenderResult() : ""}
  `;
}

function cmRenderResult(){
  const r = CM_state.result;
  const sp = CM_SPECIES.find(s => s.id === CM_state.species);
  const cls = r.legal === "legal" ? "" : r.legal === "short" ? "danger" : r.legal === "overslot" ? "warning" : "";
  const verdict = r.legal === "legal" ? "✅ LEGAL KEEPER" :
                  r.legal === "short" ? "❌ TOO SMALL — RELEASE" :
                  r.legal === "overslot" ? "⚠ OVER SLOT — CHECK REGS" :
                  r.legal === "release" ? "↩ RELEASE RECOMMENDED" : "—";

  return `
    <div class="cm-result-card ${cls}">
      <div style="font-size:18px;font-weight:bold;color:#f0f6ff;margin-bottom:4px">${verdict}</div>
      <div style="font-size:11px;color:#9ec5e8;margin-bottom:14px">${sp.name} · ${sp.minNote}</div>

      <div class="cm-stat-grid">
        <div class="cm-stat">
          <div class="cm-stat-label">Length</div>
          <div class="cm-stat-val">${r.lengthIn.toFixed(1)}"</div>
          <div class="cm-stat-sub">${(r.lengthIn * 2.54).toFixed(1)} cm</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-label">Est. Weight</div>
          <div class="cm-stat-val">${r.weightLb.toFixed(1)} lb</div>
          <div class="cm-stat-sub">${(r.weightLb * 0.4536).toFixed(2)} kg</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-label">Confidence</div>
          <div class="cm-stat-val" style="color:${r.confidence > 75 ? "#34d399" : r.confidence > 50 ? "#fbbf24" : "#f87171"}">${r.confidence}%</div>
          <div class="cm-stat-sub">${r.confidence > 75 ? "High" : r.confidence > 50 ? "Medium" : "Low"}</div>
        </div>
      </div>

      <div style="margin-top:12px;padding:10px 12px;background:rgba(0,0,0,.25);border-radius:8px;font-size:10px;color:#9ec5e8;line-height:1.55">
        <b>Note:</b> ${sp.notes} Weight is an estimate from species-standard length-weight formula (W = ${sp.a} × L^${sp.b}); actual weight varies ±10-15% by condition and time of year.
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="cm-btn" onclick="cmSaveCatch()">💾 Save to Catch Log</button>
        <button class="cm-btn cm-btn-secondary" onclick="cmStartOver()">🔄 New Measurement</button>
      </div>
    </div>
  `;
}

// ── LOG TAB ──────────────────────────────────────────────────────────────────
function cmRenderLog(){
  if(CM_state.log.length === 0){
    return `
      <div style="text-align:center;padding:60px 20px;color:#5d96c4">
        <div style="font-size:48px;margin-bottom:12px">📋</div>
        <div style="font-size:14px;font-weight:600;color:#9ec5e8;margin-bottom:6px">No catches logged yet</div>
        <div style="font-size:11px">Measure your first catch to start your log.</div>
      </div>
    `;
  }
  const cards = CM_state.log.slice().reverse().map((c, i) => {
    const sp = CM_SPECIES.find(s => s.id === c.species);
    const date = new Date(c.timestamp);
    const dateStr = date.toLocaleDateString([], {month:"short", day:"numeric", year:"numeric"});
    const timeStr = date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    return `
      <div class="cm-log-card">
        <div class="cm-log-thumb" style="${c.thumb ? `background-image:url(${c.thumb})` : ''}">${c.thumb ? "" : "🐟"}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:#f0f6ff">${sp ? sp.name : c.species}</div>
          <div style="font-size:11px;color:#9ec5e8;margin-top:2px">${c.lengthIn.toFixed(1)}" · ${c.weightLb.toFixed(1)} lb · ${c.legal === "legal" ? "✅ Legal" : c.legal === "short" ? "❌ Short" : c.legal === "overslot" ? "⚠ Over Slot" : "↩ Release"}</div>
          <div style="font-size:10px;color:#5d96c4;margin-top:2px">${dateStr} · ${timeStr}</div>
        </div>
        <button onclick="cmDeleteEntry(${CM_state.log.length - 1 - i})" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:18px;padding:6px;flex-shrink:0">🗑</button>
      </div>
    `;
  }).join("");

  const totalCatches = CM_state.log.length;
  const totalWeight = CM_state.log.reduce((s,c) => s + c.weightLb, 0);
  const biggest = CM_state.log.reduce((max, c) => c.weightLb > (max?.weightLb||0) ? c : max, null);

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="cm-stat"><div class="cm-stat-label">Total Catches</div><div class="cm-stat-val">${totalCatches}</div></div>
      <div class="cm-stat"><div class="cm-stat-label">Total Weight</div><div class="cm-stat-val">${totalWeight.toFixed(0)} lb</div></div>
      <div class="cm-stat"><div class="cm-stat-label">Biggest</div><div class="cm-stat-val">${biggest ? biggest.weightLb.toFixed(0) + " lb" : "—"}</div></div>
    </div>
    ${cards}
    <div style="margin-top:18px;text-align:center">
      <button class="cm-btn cm-btn-danger" onclick="cmClearLog()">🗑 Clear All</button>
    </div>
  `;
}

// ── HELP TAB ─────────────────────────────────────────────────────────────────
function cmRenderHelp(){
  return `
    <div class="cm-step">
      <h3>📐 How to Get Accurate Measurements</h3>
      <div style="font-size:13px;color:#c8d8e8;line-height:1.8">
        <p><b>1. Pick a reference object.</b> A credit card or driver license works great — they're a standard 3.37" wide. A 12" ruler or measuring board is even better for big fish.</p>
        <p style="margin-top:10px"><b>2. Place the reference flat next to the fish.</b> Both should be on the same plane (deck, cooler lid). The reference must NOT be tilted toward or away from the camera.</p>
        <p style="margin-top:10px"><b>3. Shoot from directly above.</b> Hold the camera perpendicular to the fish — think of looking straight down. Side-angle shots distort the measurement.</p>
        <p style="margin-top:10px"><b>4. Get the whole fish + reference in frame</b> with a little space around the edges. Don't crop tight.</p>
        <p style="margin-top:10px"><b>5. Tap precisely.</b> When marking endpoints, tap the exact tip of the nose and the exact tip of the tail. Pinch to zoom for precision.</p>
      </div>
    </div>

    <div class="cm-step">
      <h3>🎯 Confidence Score</h3>
      <div style="font-size:13px;color:#c8d8e8;line-height:1.8">
        Based on photo quality, marker placement consistency, and reference object size relative to fish:
        <ul style="margin-top:8px;padding-left:24px">
          <li><b style="color:#34d399">High (75%+):</b> Good lighting, large reference, fish fills decent portion of frame</li>
          <li><b style="color:#fbbf24">Medium (50-75%):</b> Acceptable but could be better — try retaking</li>
          <li><b style="color:#f87171">Low (&lt;50%):</b> Reference too small or photo at bad angle — retake recommended</li>
        </ul>
      </div>
    </div>

    <div class="cm-step">
      <h3>⚖ Weight Estimation</h3>
      <div style="font-size:13px;color:#c8d8e8;line-height:1.8">
        Weights use NOAA/state-published length-to-weight formulas (W = a × L^b) calibrated for each species. Actual weight varies ±10-15% based on:
        <ul style="margin-top:8px;padding-left:24px">
          <li>Time of year (pre/post-spawn condition)</li>
          <li>Recent feeding</li>
          <li>Sex (males/females may differ)</li>
        </ul>
        For tournament weigh-ins, always use a certified scale. This is an estimate for catch-and-release records.
      </div>
    </div>

    <div class="cm-step">
      <h3>📡 Offline & Privacy</h3>
      <div style="font-size:13px;color:#c8d8e8;line-height:1.8">
        <b>Your data syncs to your account.</b> Your catch log, measurements, photos, and waypoints are saved to your Bluewater Intel account — sign in on any device (phone, tablet, or computer) and your data is there. Recent data is also cached on the device so the app keeps working offline once loaded.
        <br><br>
        Your data is private to your account and is never shared with other users. <b>Your GPS location is never shared.</b>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════════════
// CAMERA & FILE INPUT
// ════════════════════════════════════════════════════════════════════════════
let CM_videoStream = null;
async function cmStartCamera(){
  // Use file input with capture attribute — works offline, on iOS, no permissions issues
  document.getElementById("cm-file-input").click();
}
function CM_stopCamera(){
  if(CM_videoStream){
    CM_videoStream.getTracks().forEach(t => t.stop());
    CM_videoStream = null;
  }
}
function cmHandleFile(e){
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    // Resize image to max 1600px for performance, preserve aspect
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      CM_state.imageData = c.toDataURL("image/jpeg", 0.85);
      CM_state.imageWidth = w;
      CM_state.imageHeight = h;
      CM_state.refPoints = [];
      CM_state.fishPoints = [];
      CM_state.result = null;
      cmRender();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ════════════════════════════════════════════════════════════════════════════
// CANVAS DRAWING & POINT MARKING
// ════════════════════════════════════════════════════════════════════════════
function cmDrawCanvas(){
  const canvas = document.getElementById("cm-canvas");
  const overlay = document.getElementById("cm-overlay-canvas");
  if(!canvas || !overlay) return;

  const img = new Image();
  img.onload = () => {
    // Fit image to container width
    const wrap = document.getElementById("cm-canvas-wrap");
    const maxW = wrap.parentElement.clientWidth - 4;
    const scale = Math.min(1, maxW / img.width);
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);

    canvas.width = dw; canvas.height = dh;
    overlay.width = dw; overlay.height = dh;
    canvas.style.width = dw + "px";
    canvas.style.height = dh + "px";
    overlay.style.width = dw + "px";
    overlay.style.height = dh + "px";

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, dw, dh);

    cmDrawOverlay();
    overlay.onclick = cmCanvasClick;
    overlay.ontouchstart = e => { e.preventDefault(); cmCanvasClick(e.touches[0]); };
  };
  img.src = CM_state.imageData;
}

function cmDrawOverlay(){
  const overlay = document.getElementById("cm-overlay-canvas");
  if(!overlay) return;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const sx = overlay.width / CM_state.imageWidth;
  const sy = overlay.height / CM_state.imageHeight;

  // Reference line (yellow)
  if(CM_state.refPoints.length === 2){
    cmDrawLine(ctx, CM_state.refPoints, sx, sy, "#fbbf24", "REF");
  } else {
    CM_state.refPoints.forEach(p => cmDrawDot(ctx, p, sx, sy, "#fbbf24"));
  }
  // Fish line (cyan)
  if(CM_state.fishPoints.length === 2){
    cmDrawLine(ctx, CM_state.fishPoints, sx, sy, "#06b6d4", "FISH");
  } else {
    CM_state.fishPoints.forEach(p => cmDrawDot(ctx, p, sx, sy, "#06b6d4"));
  }
}
function cmDrawDot(ctx, p, sx, sy, color){
  const x = p.x * sx, y = p.y * sy;
  ctx.beginPath(); ctx.arc(x, y, 8, 0, 2*Math.PI);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "white"; ctx.stroke();
}
function cmDrawLine(ctx, pts, sx, sy, color, label){
  const a = {x:pts[0].x*sx, y:pts[0].y*sy};
  const b = {x:pts[1].x*sx, y:pts[1].y*sy};
  ctx.lineWidth = 4; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(a.x, a.y, 7, 0, 2*Math.PI); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "white"; ctx.stroke();
  ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, 2*Math.PI); ctx.fillStyle = color; ctx.fill(); ctx.stroke();
  // Label
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,.85)";
  const lw = ctx.measureText(label).width + 10;
  ctx.fillRect(mx - lw/2, my - 18, lw, 18);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, mx, my - 9);
}
function cmCanvasClick(e){
  if(!CM_state.marking) return;
  const overlay = document.getElementById("cm-overlay-canvas");
  const rect = overlay.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width;
  const cy = (e.clientY - rect.top) / rect.height;
  // Convert to image-space coords
  const x = cx * CM_state.imageWidth;
  const y = cy * CM_state.imageHeight;

  if(CM_state.marking === "ref"){
    CM_state.refPoints.push({x, y});
    if(CM_state.refPoints.length >= 2){
      CM_state.refPoints = CM_state.refPoints.slice(-2);
      CM_state.marking = null;
      cmCompute();
      cmRender();
      return;
    }
  } else if(CM_state.marking === "fish"){
    CM_state.fishPoints.push({x, y});
    if(CM_state.fishPoints.length >= 2){
      CM_state.fishPoints = CM_state.fishPoints.slice(-2);
      CM_state.marking = null;
      cmCompute();
      cmRender();
      return;
    }
  }
  cmDrawOverlay();
}

// ════════════════════════════════════════════════════════════════════════════
// MARKING CONTROLS
// ════════════════════════════════════════════════════════════════════════════
function cmStartMarking(what){
  CM_state.marking = what;
  if(what === "ref")  CM_state.refPoints  = [];
  if(what === "fish") CM_state.fishPoints = [];
  cmRender();
}
function cmClearRef(){ CM_state.refPoints = []; CM_state.result = null; cmRender(); }
function cmClearFish(){ CM_state.fishPoints = []; CM_state.result = null; cmRender(); }
function cmSetRef(id){ CM_state.refObject = id; cmCompute(); cmRender(); }
function cmSetSpecies(id){ CM_state.species = id; cmCompute(); cmRender(); }
function cmRetake(){
  CM_state.imageData = null;
  CM_state.refPoints = []; CM_state.fishPoints = [];
  CM_state.result = null; CM_state.marking = null;
  cmRender();
}
function cmStartOver(){
  CM_state.refPoints = []; CM_state.fishPoints = [];
  CM_state.result = null; CM_state.marking = null;
  cmRender();
}

// ════════════════════════════════════════════════════════════════════════════
// COMPUTATION — pixel-to-inch ratio + length-weight formula
// ════════════════════════════════════════════════════════════════════════════
function cmCompute(){
  if(CM_state.refPoints.length !== 2 || CM_state.fishPoints.length !== 2){
    CM_state.result = null;
    return;
  }
  const ref = CM_REFERENCES.find(r => r.id === CM_state.refObject);
  let refLen = ref.lengthIn;
  if(ref.id === "custom"){
    refLen = parseFloat(CM_state.refLengthCustom) || 0;
    if(refLen <= 0){ CM_state.result = null; return; }
  }
  const refPxLen   = cmDist(CM_state.refPoints[0],  CM_state.refPoints[1]);
  const fishPxLen  = cmDist(CM_state.fishPoints[0], CM_state.fishPoints[1]);
  if(refPxLen <= 0){ CM_state.result = null; return; }

  const inchesPerPx = refLen / refPxLen;
  const lengthIn    = fishPxLen * inchesPerPx;

  const sp = CM_SPECIES.find(s => s.id === CM_state.species);
  const weightLb = sp.a * Math.pow(lengthIn, sp.b);

  // Confidence based on reference size as fraction of image, both endpoints' tilt, etc.
  const refFracOfImg = refPxLen / Math.max(CM_state.imageWidth, CM_state.imageHeight);
  let confidence = 60;
  if(refFracOfImg > 0.10) confidence += 10;
  if(refFracOfImg > 0.18) confidence += 10;
  if(refFracOfImg > 0.25) confidence += 5;
  if(refFracOfImg < 0.05) confidence -= 20;
  if(refLen >= 12) confidence += 10;        // larger ref = better
  if(lengthIn / refLen < 8) confidence += 5; // fish not too much bigger than ref
  confidence = Math.max(20, Math.min(95, Math.round(confidence)));

  // Legal status
  let legal = "legal";
  if(sp.releaseRecommended) legal = "release";
  else if(sp.minIn && lengthIn < sp.minIn) legal = "short";
  else if(sp.maxIn && lengthIn > sp.maxIn) legal = "overslot";

  CM_state.result = { lengthIn, weightLb, confidence, legal };
}
function cmDist(a, b){ return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }

// ════════════════════════════════════════════════════════════════════════════
// CATCH LOG ACTIONS
// ════════════════════════════════════════════════════════════════════════════
function cmSaveCatch(){
  if(!CM_state.result) return;
  // Make a small thumbnail for the log
  const img = new Image();
  img.onload = () => {
    const tw = 100, scale = tw / img.width;
    const c = document.createElement("canvas");
    c.width = tw; c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const thumb = c.toDataURL("image/jpeg", 0.6);

    CM_state.log.push({
      timestamp: Date.now(),
      species: CM_state.species,
      lengthIn: CM_state.result.lengthIn,
      weightLb: CM_state.result.weightLb,
      confidence: CM_state.result.confidence,
      legal: CM_state.result.legal,
      thumb,
    });
    cmSaveLog();
    cmStartOver();
    CM_state.tab = "log";
    cmSwitchTab("log");
  };
  img.src = CM_state.imageData;
}
function cmDeleteEntry(idx){
  if(!confirm("Delete this catch?")) return;
  CM_state.log.splice(idx, 1);
  cmSaveLog();
  cmRender();
}
function cmClearLog(){
  if(!confirm("Delete ALL catches? This cannot be undone.")) return;
  CM_state.log = [];
  cmSaveLog();
  cmRender();
}
