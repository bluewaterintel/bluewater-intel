/* Bluewater Intel — Fishing reports page + tutorial overlay
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

// ════════════════════════════════════════════════════════════════════════════
// FISHING REPORTS PAGE
// ════════════════════════════════════════════════════════════════════════════
function openTutorial(){
  document.getElementById("tut-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  // Scroll to top in case user scrolled previously
  document.getElementById("tut-overlay").scrollTop = 0;
}
function closeTutorial(){
  document.getElementById("tut-overlay").style.display = "none";
  document.body.style.overflow = "";
}

// ════════════════════════════════════════════════════════════════════════════
// MY CATCHES PAGE
// Open/close, render list with stats, filter/sort controls, delete action.
// ════════════════════════════════════════════════════════════════════════════
function openMyCatches(){
  document.getElementById("catches-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  if(typeof catchInitFilterDropdowns === "function") catchInitFilterDropdowns();
  if(typeof catchSyncFilterControls === "function") catchSyncFilterControls();
  if(typeof closeCatchesFilterPopup === "function") closeCatchesFilterPopup();
  renderMyCatches();
}

function closeMyCatches(){
  if(typeof closeCatchesFilterPopup === "function") closeCatchesFilterPopup();
  document.getElementById("catches-overlay").style.display = "none";
  document.body.style.overflow = "";
}

function renderMyCatches(){
  // Stats summary
  const statsEl = document.getElementById("catches-stats");
  const listEl = document.getElementById("catches-list");
  if(!statsEl || !listEl) return;

  if(USER_CATCHES.length === 0){
    statsEl.innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:42px;margin-bottom:8px">🎣</div>
        <div class="catch-empty-title" style="font-size:15px;font-weight:700;color:#f0f6ff;margin-bottom:4px">No catches yet</div>
        <div class="catch-empty-sub" style="font-size:11px;color:#9ca3af;margin-bottom:14px">Tap the button below to log your first catch.<br/>Conditions auto-fill from current data.</div>
        <button class="catches-log-btn" onclick="openLogCatch()" style="
          background:#2979b5;border:none;color:#fff;
          padding:10px 18px;border-radius:8px;font-size:13px;font-weight:700;
          cursor:pointer;font-family:inherit;
        ">+ Log Your First Catch</button>
      </div>`;
    listEl.innerHTML = "";
    const filterBtn = document.getElementById("catches-filter-btn");
    const filterRow = document.getElementById("catches-filter-row");
    if(filterBtn) filterBtn.style.display = "none";
    if(filterRow) filterRow.style.display = "none";
    if(typeof closeCatchesFilterPopup === "function") closeCatchesFilterPopup();
    return;
  }
  const filterBtn = document.getElementById("catches-filter-btn");
  const filterRow = document.getElementById("catches-filter-row");
  if(filterRow) filterRow.style.display = "block";
  if(filterBtn) filterBtn.style.display = "inline-flex";
  if(typeof catchUpdateFilterBtnState === "function") catchUpdateFilterBtnState();

  const stats = catchStats();
  const biggestText = stats.biggest && stats.biggest.weight
    ? `${stats.biggest.weight}lb ${(SPECIES.find(s => s.id === stats.biggest.species) || {name: stats.biggest.species}).name}`
    : "—";
  const speciesCount = Object.keys(stats.bySpecies).length;

  statsEl.innerHTML = `
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${statCard("Total Catches", stats.total)}
      ${statCard("Species", speciesCount)}
      ${statCard("Personal Best", biggestText)}
    </div>
    <div style="margin-top:14px">
      <button id="run-analytics-btn" onclick="runCatchAnalytics()" style="
        width:100%;background:linear-gradient(135deg,#2979b5,#1d5e91);border:none;color:#fff;
        padding:12px 18px;border-radius:10px;font-size:13px;font-weight:700;
        cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;
        box-shadow:0 2px 8px rgba(41,121,181,.35)">
        📈 Run Catch Analytics
      </button>
    </div>
    <div id="catch-analytics-output"></div>`;

  // Keep Filters directly under analytics (move the row after stats content).
  if(filterRow && statsEl.nextElementSibling !== filterRow){
    statsEl.insertAdjacentElement("afterend", filterRow);
  }

  if(typeof catchReadFilterControls === "function") catchReadFilterControls();
  else {
    const dateFromEl = document.getElementById("catches-filter-date-from");
    const dateToEl = document.getElementById("catches-filter-date-to");
    const tackleEl = document.getElementById("catches-filter-tackle");
    if(dateFromEl) CATCH_FILTER.dateFrom = dateFromEl.value || "";
    if(dateToEl) CATCH_FILTER.dateTo = dateToEl.value || "";
    if(tackleEl) CATCH_FILTER.tackle = tackleEl.value || "all";
  }

  const sortVal = document.getElementById("catches-sort")?.value || "date";
  const speciesIds = CATCH_FILTER.species && CATCH_FILTER.species !== "all" ? [CATCH_FILTER.species] : null;
  const lureColors = CATCH_FILTER.color && CATCH_FILTER.color !== "all" ? [CATCH_FILTER.color] : null;
  const filtered = catchList({
    speciesIds,
    lureColors,
    dateFrom: CATCH_FILTER.dateFrom,
    dateTo: CATCH_FILTER.dateTo,
    tackleType: CATCH_FILTER.tackle,
    sortBy: sortVal,
  });

  if(filtered.length === 0){
    listEl.innerHTML = `<div style="text-align:center;color:#9ca3af;font-size:13px;padding:24px 0">No catches match this filter.</div>`;
    return;
  }
  listEl.innerHTML = filtered.map(c => renderCatchCard(c)).join("");
}

// Triggered by the "Run Catch Analytics" button. Computes and renders the
// pattern analysis into its container, using the current species filter.
function runCatchAnalytics(){
  const out = document.getElementById("catch-analytics-output");
  const btn = document.getElementById("run-analytics-btn");
  if(!out) return;
  if(typeof catchReadFilterControls === "function") catchReadFilterControls();
  const sp = CATCH_FILTER.species === "all" ? "all" : CATCH_FILTER.species;
  out.innerHTML = renderCatchInsights(sp);
  out.scrollIntoView({behavior:"smooth", block:"nearest"});
  if(btn) btn.textContent = "📈 Refresh Analytics";
}

// Renders the "Your Patterns" analytics panel for the My Catches page.
function renderCatchInsights(speciesFilter){
  const a = catchAnalytics(speciesFilter);
  const spName = (speciesFilter && speciesFilter !== "all")
    ? (SPECIES.find(s=>s.id===speciesFilter)||{name:speciesFilter}).name
    : null;
  const heading = spName ? `Your ${spName} Patterns` : "Your Patterns";

  // Not enough data yet — encourage logging, be honest about the threshold.
  if(!a.enough){
    const remaining = a.need - a.n;
    return `
      <div style="margin-top:16px;background:rgba(107,191,234,.05);border:1px dashed rgba(107,191,234,.25);border-radius:12px;padding:16px">
        <div style="font-size:11px;font-weight:700;color:#6bbfea;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">📈 ${heading}</div>
        <div style="font-size:12px;color:#cdd9e8;line-height:1.5">
          Log <b>${remaining}</b> more ${spName ? spName+" " : ""}catch${remaining===1?"":"es"} to unlock pattern analysis.
          The app studies the moon phase, tide, barometric trend, wind, water temp, and time of day behind your catches to find what's working for you.
        </div>
      </div>`;
  }

  // Build the insight chips
  const chips = a.insights.map(ins => `
    <div style="background:rgba(15,36,68,.6);border:1px solid rgba(107,191,234,.18);border-radius:10px;padding:10px 12px;min-width:0">
      <div style="font-size:9px;font-weight:700;color:#6bbfea;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px">${ins.icon} ${ins.label}</div>
      <div style="font-size:14px;font-weight:700;color:#f0f6ff;line-height:1.2">${ins.value}</div>
      <div style="font-size:9px;color:#8aa;margin-top:3px">${ins.pct}% of catches · ${ins.count} fish</div>
    </div>`).join("");

  const summaryBits = [];
  if(a.topSpecies && !spName) summaryBits.push(`Most logged: <b style="color:#f0f6ff">${a.topSpecies.value}</b> (${a.topSpecies.count})`);
  if(a.topPort) summaryBits.push(`Top spot: <b style="color:#f0f6ff">${a.topPort.value}</b> (${a.topPort.count})`);

  return `
    <div style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:11px;font-weight:700;color:#6bbfea;letter-spacing:.1em;text-transform:uppercase">📈 ${heading}</div>
        <div style="font-size:9px;color:#8aa">from ${a.n} catches</div>
      </div>
      ${chips ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">${chips}</div>`
              : `<div style="font-size:12px;color:#9ca3af;padding:4px 0">No strong patterns yet — your catches are spread evenly across conditions. Keep logging.</div>`}
      ${summaryBits.length ? `<div style="font-size:11px;color:#aab8c8;margin-top:10px;line-height:1.5">${summaryBits.join(" &nbsp;·&nbsp; ")}</div>` : ""}
      <div style="font-size:9px;color:#667;margin-top:8px;font-style:italic">Patterns reflect your logged data only — more catches sharpen them. Conditions are from the same model driving the Bite Map.</div>
    </div>`;
}

// Single stat card helper for the summary row
function statCard(label, value){
  return `<div style="flex:1;min-width:96px;background:rgba(107,191,234,.06);border:1px solid rgba(107,191,234,.18);border-radius:10px;padding:10px 14px">
    <div class="catch-stat-label" style="font-size:9px;font-weight:700;color:#6bbfea;letter-spacing:.12em;text-transform:uppercase">${label}</div>
    <div class="catch-stat-value" style="font-size:18px;font-weight:700;color:#f0f6ff;margin-top:3px">${value}</div>
  </div>`;
}

// Render a single catch as a card (used in the list)
function renderCatchCard(c){
  const sp = SPECIES.find(s => s.id === c.species);
  const spName = sp ? sp.name : c.species;
  const color = sp ? sp.color : "#22c55e";
  const date = new Date(c.timestamp);
  const dateStr = date.toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"});
  const timeStr = date.toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"});
  const sizeBits = [];
  if(c.weightUnknown) sizeBits.push("Weight unknown");
  else if(c.weight) sizeBits.push(`${c.weight}lb`);
  if(c.lengthUnknown) sizeBits.push("Length unknown");
  else if(c.length) sizeBits.push(`${c.length}"`);
  const sizeText = sizeBits.join(" · ");
  const tackleBits = [];
  if(c.tackleType === "bait") tackleBits.push("Bait");
  else if(c.tackleType === "artificial") tackleBits.push("Artificial");
  if(c.lureColor) tackleBits.push(typeof catchLureColorLabel === "function" ? catchLureColorLabel(c.lureColor) : c.lureColor);
  const cond = c.conditions || {};
  const condBits = [];
  if(cond.sst != null)    condBits.push(`<span style="color:#fbbf24">SST ${cond.sst}°</span>`);
  if(cond.moon)           condBits.push(`<span style="color:#a78bfa">${cond.moon}</span>`);
  if(cond.tide)           condBits.push(`<span style="color:#34d399">${cond.tide}</span>`);
  if(cond.pressureTrend)  condBits.push(`<span style="color:#9ec5e8">${cond.pressureTrend}</span>`);
  return `
    <div class="catch-card" style="background:rgba(15,36,68,.55);border:1px solid rgba(107,191,234,.15);border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;gap:14px">
      ${c.photo ? `<img src="${c.photo}" alt="" style="width:72px;height:72px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#0a1a2e"/>` : `<div style="width:72px;height:72px;border-radius:8px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;font-size:34px;flex-shrink:0">🐟</div>`}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <span class="catch-card-name" style="font-size:14px;font-weight:700;color:${color}">${spName}</span>
          ${sizeText ? `<span class="catch-card-size" style="font-size:12px;color:#f0f6ff;font-weight:600">${sizeText}</span>` : ""}
          ${c.shared ? `<span style="font-size:8px;font-weight:700;color:#fbbf24;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);padding:1px 6px;border-radius:6px">SHARED</span>` : ""}
        </div>
        <div class="catch-card-meta" style="font-size:10px;color:#9ca3af;margin-top:2px">${dateStr} · ${timeStr}${c.port ? " · " + (c.locationMode === "port" ? c.port.split(",")[0] + " (port)" : c.port.split(",")[0]) : ""}</div>
        ${tackleBits.length ? `<div class="catch-card-meta" style="font-size:10px;color:#9ec5e8;margin-top:2px">${tackleBits.join(" · ")}</div>` : ""}
        ${c.notes ? `<div class="catch-card-notes" style="font-size:12px;color:#cfe5ff;line-height:1.45;margin-top:6px">${escapeHtml(c.notes)}</div>` : ""}
        ${condBits.length ? `<div class="catch-card-cond" style="font-size:10px;margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${condBits.join("")}</div>` : ""}
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="catch-card-edit" onclick="openEditCatch('${c.id}')" style="
            background:rgba(41,121,181,.15);border:1px solid rgba(41,121,181,.35);
            color:#7dd3fc;padding:5px 11px;border-radius:6px;
            font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;
          ">Edit</button>
          <button class="catch-card-delete" onclick="confirmDeleteCatch('${c.id}')" style="
            background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);
            color:#f87171;padding:5px 11px;border-radius:6px;
            font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;
          ">Delete</button>
        </div>
      </div>
    </div>`;
}

function confirmDeleteCatch(id){
  if(!confirm("Delete this catch? This can't be undone.")) return;
  // If shared, also remove from SOCIAL reports feed
  const c = catchGet(id);
  if(c && c.shared) catchUnshare(id);
  catchDelete(id);
  drawCatchPins();
  renderMyCatches();
}

// ════════════════════════════════════════════════════════════════════════════
// REGULATIONS PAGE
// Links to official federal and state regulatory sources. Port-aware: if
// the user has selected a home port, surface that state's agency at the top.
// ════════════════════════════════════════════════════════════════════════════

// Mapping of state codes (from port names like "Cape May, NJ") to state agency
// regulation pages. Each entry: name (state name), agency, url, plus optional
// notable rules summary (short, evergreen things that don't change yearly).
const REGS_BY_STATE = {
  ME: {name: "Maine", agency: "Maine DMR", url: "https://www.maine.gov/dmr/fisheries/recreational",
       notes: "Striped bass slot 28-31\" or 35-40\" depending on season. Tuna requires HMS permit."},
  NH: {name: "New Hampshire", agency: "NH Fish & Game", url: "https://www.wildlife.nh.gov/saltwater-fisheries-new-hampshire/recreational-saltwater-fishing",
       notes: "Striper, bluefish, fluke. Recreational saltwater registry required."},
  MA: {name: "Massachusetts", agency: "Mass DMF", url: "https://www.mass.gov/recreational-saltwater-fishing",
       notes: "Striped bass slot 28\"-31\". Recreational saltwater permit required."},
  RI: {name: "Rhode Island", agency: "RI DEM", url: "https://dem.ri.gov/natural-resources-bureau/marine-fisheries/recreational-saltwater-fishing",
       notes: "Striper slot, summer flounder, scup. Saltwater license required for non-residents."},
  CT: {name: "Connecticut", agency: "CT DEEP", url: "https://portal.ct.gov/deep/fishing/saltwater-fishing-guide",
       notes: "Striper slot, blackfish, summer flounder. Saltwater stamp required."},
  NY: {name: "New York", agency: "NY DEC", url: "https://dec.ny.gov/things-to-do/saltwater-fishing",
       notes: "Striper slot, fluke, blackfish, scup. Marine registry required."},
  NJ: {name: "New Jersey", agency: "NJ DEP F&W", url: "https://dep.nj.gov/njfw/fishing/marine/",
       notes: "Striper slot, summer flounder, blackfish. Saltwater registry required."},
  DE: {name: "Delaware", agency: "DE DNREC", url: "https://dnrec.delaware.gov/fish-wildlife/fishing/regulations/",
       notes: "Striper, summer flounder, weakfish. Saltwater license required."},
  MD: {name: "Maryland", agency: "MD DNR", url: "https://dnr.maryland.gov/fisheries/Pages/default.aspx",
       notes: "Striped bass Chesapeake Bay rules differ from coastal. Tidal sportfishing license."},
  VA: {name: "Virginia", agency: "VMRC", url: "https://www.mrc.virginia.gov/regulations/",
       notes: "Striper, cobia, summer flounder. Saltwater license required."},
  NC: {name: "North Carolina", agency: "NC DMF", url: "https://www.deq.nc.gov/about/divisions/marine-fisheries/rules-proclamations-and-size-and-bag-limits/recreational-size-and-bag-limits",
       notes: "Coastal Recreational Fishing License required. King mackerel, red drum, speckled trout."},
  SC: {name: "South Carolina", agency: "SC DNR", url: "https://saltwaterfishing.sc.gov/regulations.html",
       notes: "Saltwater license required. Red drum, spotted seatrout, sheepshead."},
  GA: {name: "Georgia", agency: "GA DNR", url: "https://coastalgadnr.org/RecreationalFishing",
       notes: "Saltwater Information Program (SIP) registration required."},
  FL: {name: "Florida", agency: "FWC", url: "https://myfwc.com/fishing/saltwater/recreational/",
       notes: "Snook closed seasons vary by coast. Tarpon tag required. Goliath grouper catch-release. Reef fish federal permit required for federal water reef species."},
  AL: {name: "Alabama", agency: "AL Marine Resources", url: "https://www.outdooralabama.com/fishing/saltwater-recreational-size-creel-limits",
       notes: "Saltwater license required. Red snapper season opens/closes — verify."},
  MS: {name: "Mississippi", agency: "MS DMR", url: "https://dmr.ms.gov/recreational-fishing/",
       notes: "Saltwater license required. Speckled trout, red drum, red snapper federal seasons."},
  LA: {name: "Louisiana", agency: "LA Wildlife & Fisheries", url: "https://www.wlf.louisiana.gov/page/recreational-saltwater-finfish",
       notes: "Basic + saltwater license required. Strict speckled trout / redfish limits."},
  TX: {name: "Texas", agency: "TPWD", url: "https://tpwd.texas.gov/regulations/outdoor-annual/fishing/saltwater-fishing/",
       notes: "Saltwater license required. Red drum, spotted seatrout. Strict snook regs (slot, season)."},
  CA: {name: "California", agency: "CDFW", url: "https://wildlife.ca.gov/Fishing/Ocean/Regulations",
       notes: "Ocean Sport Fishing regulations + Marine Protected Area (MPA) network. Strict no-take zones along SoCal coast. Yellowtail, white seabass, lobster, rockfish — verify in-season dates and MPA boundaries."},
};

// Non-US territories and crossings (Bahamas ports, etc.)
const REGS_BY_TERRITORY = {
  BS: {name: "The Bahamas", agency: "Dept. of Marine Resources", url: "https://www.bahamas.gov.bs/service/sport-fishing-permit",
       notes: "Sport fishing permit required at port of entry for foreign-owned vessels. Billfish must be released unless in an approved tournament. Lobster closed Apr 1–Jul 31. No take in BNT national parks. Sharks protected — release if hooked."},
};

const REGS_FEDERAL = [
  {region: "Federal Highly Migratory Species", agency: "NOAA NMFS HMS",
   url: "https://www.fisheries.noaa.gov/topic/atlantic-highly-migratory-species",
   desc: "Tuna, billfish, sharks. Atlantic Tunas permit required for tuna fishing. Strict reporting requirements for marlin/swordfish."},
  {region: "Northeast Federal Waters", agency: "NOAA GARFO",
   url: "https://www.fisheries.noaa.gov/region/new-england-mid-atlantic",
   desc: "Cod (currently closed in GoM), haddock, summer flounder, scup, black sea bass federal seasons & limits."},
  {region: "Mid-Atlantic Federal Waters", agency: "NOAA MAFMC",
   url: "https://www.mafmc.org/",
   desc: "Tilefish, summer flounder, scup, black sea bass, bluefish, mackerels."},
  {region: "South Atlantic Federal Waters", agency: "SAFMC",
   url: "https://safmc.net/regulations/regulations-by-species/",
   desc: "Snapper-grouper complex (red snapper Atlantic, gag, mutton, yellowtail), king/Spanish mackerel, dolphinfish."},
  {region: "Gulf of Mexico Federal Waters", agency: "NOAA SERO Gulf",
   url: "https://www.fisheries.noaa.gov/southeast/recreational-fishing/gulf-mexico-recreational-fishing",
   desc: "Red snapper season (annual federal opening), grouper complex, amberjack. State-specific waters extend further in some Gulf states."},
  {region: "Pacific Federal Waters (West Coast)", agency: "NOAA WCR + Pacific Fishery Management Council",
   url: "https://www.fisheries.noaa.gov/region/west-coast",
   desc: "Southern California groundfish, cowcod conservation areas, yellowtail, white seabass, tuna, and salmon. Essential for SoCal offshore trips."},
];

// Open / close handlers
function openRegulations(){
  document.getElementById("regs-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  renderRegulations();
}
function closeRegulations(){
  document.getElementById("regs-overlay").style.display = "none";
  document.body.style.overflow = "";
}

// ── LEGAL & PRIVACY ──────────────────────────────────────────────────────────
// Terms of Use + Privacy Policy. Boilerplate intended to limit liability and set
// expectations; NOT legal advice — see the attorney-review notice in the content.
function openLegal(){
  document.getElementById("legal-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  showLegalTab("terms");
}
function closeLegal(){
  document.getElementById("legal-overlay").style.display = "none";
  document.body.style.overflow = "";
}
function showLegalTab(which){
  const termsBtn = document.getElementById("legal-tab-terms");
  const privBtn  = document.getElementById("legal-tab-privacy");
  const on  = "flex:1;padding:9px 10px;border-radius:9px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;background:rgba(125,211,252,.20);border:1px solid rgba(125,211,252,.5);color:#7dd3fc;";
  const off = "flex:1;padding:9px 10px;border-radius:9px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);color:#9ec5e8;";
  if(termsBtn) termsBtn.style.cssText = which === "terms" ? on : off;
  if(privBtn)  privBtn.style.cssText  = which === "privacy" ? on : off;
  const el = document.getElementById("legal-content");
  if(el) el.innerHTML = (which === "privacy") ? LEGAL_PRIVACY_HTML : LEGAL_TERMS_HTML;
  // scroll the overlay back to top when switching tabs
  const ov = document.getElementById("legal-overlay");
  if(ov) ov.scrollTop = 0;
}

// Shared styling helpers for the legal copy (kept as constants so the two
// documents render consistently).
const _LEGAL_H = 'font-size:18px;font-weight:700;color:#f0f6ff;margin:18px 0 6px';
const _LEGAL_P = 'margin:0 0 10px';
const _LEGAL_EFFECTIVE = "Effective July 28, 2026.";

const LEGAL_TERMS_HTML = `
  <div style="${_LEGAL_H}">Terms of Use</div>
  <p style="${_LEGAL_P}">These Terms of Use ("Terms") are entered into between you and Bluewater Intel LLC ("Company," "we," "us," or "our") and govern your access to and use of the Bluewater Intel application, website, and any related services (collectively, the "Services"). Please read them carefully. <b>By accessing or using the Services, you accept and agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not access or use the Services.</b></p>

  <div style="${_LEGAL_H}">1. What Bluewater Intel Is — and Is Not</div>
  <p style="${_LEGAL_P}">Bluewater Intel is an <b>educational and planning tool</b> intended to help you learn <b>how to fish, where to fish, and when to fish</b>. It aggregates and models oceanographic and environmental information to produce estimates and suggestions.</p>
  <p style="${_LEGAL_P}"><b>The Services are NOT a navigation system and must not be used for any navigation, positioning, mapping, tracking, routing, or GPS purpose.</b> Do not use the Services for marine navigation, route planning, collision avoidance, or to identify hazards, depths, or safe passage. Waypoints, charts, and positions shown may be inaccurate, incomplete, or out of date. Always rely on official nautical charts, properly maintained navigational equipment, and your own seamanship. Marine conditions are dangerous and change rapidly; you are solely responsible for the safety of yourself, your crew, and your vessel.</p>

  <div style="${_LEGAL_H}">1a. Waypoint &amp; Structure Information</div>
  <p style="${_LEGAL_P}">Fishing waypoints, structure markers, ramps, and similar locations shown in the Services are compiled from a variety of sources, including <b>state and federal government databases</b>, other <b>public records</b>, <b>open-source information</b>, information <b>submitted by users</b>, and information <b>provided by fishermen and other contributors</b>. The waypoint database is updated regularly, but <b>a coordinate or marker does not guarantee that fish, bait, or bottom structure is present at that location</b> at any given time. Ocean currents, storms, sediment movement, fishing pressure, and natural bottom changes can shift, cover, or alter structure over time.</p>
  <p style="${_LEGAL_P}">Waypoints and structure markers are intended as a <b>planning guide and reference tool</b> to help fishermen explore and organize trips — not as a promise of catch, navigational certainty, or current seafloor conditions. <b>Bluewater Intel will not be held liable for any loss of time, fuel, bait, equipment, or other expenses</b> arising from your reliance on any waypoint, structure marker, or related location information in the Services, or from traveling to or fishing any such location.</p>

  <div style="${_LEGAL_H}">2. No Guarantee of Results</div>
  <p style="${_LEGAL_P}">Fishing involves countless factors outside anyone's control. The Services' predictions, scores, waypoints, and "hot spots" are <b>estimates and guides, not guarantees</b>. We do not promise that fish are present at any location, that you will catch fish, or that any prediction will prove accurate. Information is based in part on historical and modeled data. Past conditions and model outputs do not guarantee future results.</p>

  <div style="${_LEGAL_H}">3. Eligibility &amp; Your Account</div>
  <p style="${_LEGAL_P}">You must be of legal age to form a binding contract to use the Services. If you create an account, you agree to provide accurate, current, and complete information and to keep it updated. You are responsible for safeguarding your login credentials and for all activity under your account, and agree not to share your account or use another person's account. Notify us promptly of any unauthorized use. We are not liable for any loss arising from unauthorized use of your account. We may suspend or terminate accounts, in our sole discretion, for any violation of these Terms or for conduct we deem harmful, abusive, or unlawful.</p>

  <div style="${_LEGAL_H}">3a. Community Fishing Reports &amp; User Content</div>
  <p style="${_LEGAL_P}">The Services may allow you to post <b>community fishing reports</b> and other content you submit (together, "User Content"), such as report text, target species, the port you fished from, and the date fished. <b>When you post a fishing report, that User Content is public to other users of the Services</b> under an anonymous handle — not under your name or email. You choose the port and date; the region is derived from the port. You may edit reports you authored.</p>
  <p style="${_LEGAL_P}">You retain ownership of your User Content. By posting, you grant Bluewater Intel LLC a worldwide, non-exclusive, royalty-free, transferable license to host, store, display, reproduce, and use that User Content in connection with operating, improving, and promoting the Services (including using port-level report signals in Bite Map scoring). You represent that you have the right to post the content and that it is accurate to the best of your knowledge. You agree not to post content that is unlawful, harassing, defamatory, spam, or that reveals another person's private information. We may remove or refuse User Content at our discretion. Community reports are user-submitted and are not verified by us; they are not a guarantee of fishing conditions or catch.</p>

  <div style="${_LEGAL_H}">4. Follow All Laws and Regulations</div>
  <p style="${_LEGAL_P}">You are responsible for knowing and obeying all applicable fishing, boating, environmental, and safety laws — including licenses, seasons, size and bag limits, protected areas, and closures. Regulatory information in the Services may be incomplete or out of date; always confirm current rules with the responsible government agency before fishing.</p>

  <div style="${_LEGAL_H}">5. Intellectual Property</div>
  <p style="${_LEGAL_P}">The Services and all content, software, designs, text, graphics, data compilations, waypoint datasets, and other materials, together with the underlying source and object code and the structure, organization, scoring algorithms, models, and methods of the Services, are owned by the Company or its licensors and are protected by intellectual property and other laws. We grant you a limited, revocable, non-exclusive, non-transferable, non-sublicensable license to access and use the Services for your personal, non-commercial use only. You acquire no other rights, by implication or otherwise, in the Services.</p>

  <div style="${_LEGAL_H}">6. Prohibited Uses</div>
  <p style="${_LEGAL_P}">You agree that you will not: (a) copy, modify, distribute, sell, resell, sublicense, publish, or make any commercial use of the Services or any content without our written permission; (b) decompile, reverse engineer, disassemble, or otherwise attempt to derive the source code, algorithms, or data structures of the Services; (c) access, scrape, harvest, or copy any part of the Services using any robot, spider, scraper, or other automated means without our written permission; (d) circumvent, disable, or interfere with any security, access-control, or usage-limitation feature; (e) remove or alter any copyright, trademark, disclaimer, or other proprietary notice; (f) introduce any virus or harmful code, or otherwise impair or interfere with the Services or any other person's use of them; or (g) use the Services in any unlawful manner or in any way that suggests an unauthorized association with the Company.</p>

  <div style="${_LEGAL_H}">7. Third-Party Data, Content &amp; Links</div>
  <p style="${_LEGAL_P}">The Services display information from third parties, including government and public sources (for example NOAA and NASA) and other data providers. Such materials are the responsibility of the parties that provide them, may be inaccurate or unavailable, and do not necessarily reflect our views. The Services may also contain links to third-party sites and resources provided for convenience only. We do not control and are not responsible for third-party content, data, or sites, and your use of them is at your own risk and subject to their terms.</p>

  <div style="${_LEGAL_H}">8. Advertising &amp; Use of Data</div>
  <p style="${_LEGAL_P}">The Services may be supported by advertising, and we reserve the right to display advertising within them. We also reserve the right to generate, use, share, and sell <b>aggregated and de-identified information</b> derived from usage and from the data you provide — information combined and stripped so that it cannot reasonably be used to identify you — for any purpose, including analytics, research, and commercial data products. <b>We do not sell or share the personal information that identifies you</b>, and we will not publicly identify you. Our handling of your information is governed by our Privacy Policy, which controls in the event of any conflict on privacy matters.</p>

  <div style="${_LEGAL_H}">9. Subscriptions, Payments &amp; Refunds</div>
  <p style="${_LEGAL_P}">Some features of the Services are offered on a <b>paid subscription</b> basis. By starting a subscription you authorize us and our payment processor to charge the applicable fees and any taxes to your selected payment method, on a recurring basis, until you cancel.</p>
  <p style="${_LEGAL_P}"><b>Payment processing.</b> Payments are processed by <b>Stripe, Inc.</b>, our third-party payment processor. By subscribing you also agree to Stripe's terms and authorize Stripe to store and charge your payment method. We do <b>not</b> collect or store your full payment-card number; that information is handled directly by Stripe under its own terms and privacy policy. You are responsible for providing accurate, current payment information and for keeping it up to date.</p>
  <p style="${_LEGAL_P}"><b>Plans and pricing.</b> Current plans and prices are shown in the app at the point of purchase (for example, a monthly plan and a discounted annual plan). Prices are stated in U.S. dollars and exclude any applicable taxes, which may be added. We may change prices prospectively; any price change will not take effect until your next renewal after we provide notice, and your continued subscription after a price change takes effect constitutes acceptance of the new price.</p>
  <p style="${_LEGAL_P}"><b>Free trial.</b> If we offer a free trial, you may be required to provide a valid payment method to start it. Unless you cancel before the trial ends, your subscription will automatically convert to a paid subscription and your payment method will be charged the then-current fee. The trial length and terms are shown at sign-up. Only one trial per customer unless we state otherwise; we may modify or withdraw trial offers at any time.</p>
  <p style="${_LEGAL_P}"><b>Automatic renewal.</b> Subscriptions <b>renew automatically</b> at the end of each billing period (monthly or annually, as selected) at the then-current rate, and your payment method will be charged at the start of each new period, until you cancel. By subscribing you acknowledge and consent to this automatic, recurring billing.</p>
  <p style="${_LEGAL_P}"><b>Cancellation.</b> You may cancel at any time through the billing/account management portal in the app (which opens our payment processor's customer portal) or by contacting us at info@bluewaterintel.com. When you cancel, your subscription remains active through the end of the current paid period and then does not renew; access to paid features ends when that period ends. Canceling stops future charges but does not, by itself, generate a refund of amounts already paid.</p>
  <p style="${_LEGAL_P}"><b>Refunds.</b> Except where required by law, all charges are <b>non-refundable</b> and we do not provide refunds or credits for partial billing periods, unused time, or features you did not use. We may, in our sole discretion, offer a refund, discount, or credit in a particular case, which does not entitle you or anyone else to the same in any other case. If you purchased through a third-party app store, that store's refund policies and procedures may also apply.</p>
  <p style="${_LEGAL_P}"><b>App-store purchases.</b> If you purchase a subscription through a third-party platform (such as the Apple App Store or Google Play), the purchase, billing, renewal, and cancellation are also subject to that platform's terms, and you must manage or cancel the subscription through that platform's account settings. The platform — not the Company — handles those payments.</p>
  <p style="${_LEGAL_P}"><b>Failed payments.</b> If a charge is declined or a payment method fails, we (through our processor) may retry the charge and may suspend or downgrade your access to paid features until payment is successfully made. You remain responsible for any amounts owed.</p>
  <p style="${_LEGAL_P}"><b>Chargebacks.</b> If you initiate a chargeback or payment dispute, we may suspend or terminate your access pending resolution. Please contact us first so we can try to resolve any billing concern.</p>

  <div style="${_LEGAL_H}">10. Disclaimer of Warranties</div>
  <p style="${_LEGAL_P}">THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. We do not warrant that the Services will be accurate, reliable, uninterrupted, error-free, or secure, that defects will be corrected, or that any data (including weather, sea-surface temperature, chlorophyll, depth, waypoint, structure, or location information) is accurate, complete, or current. Waypoint and structure coordinates are compiled from third-party, public, user-submitted, and contributor sources and may be outdated or imprecise. Any reliance you place on the Services is strictly at your own risk. This does not affect any warranties that cannot be excluded or limited under applicable law.</p>

  <div style="${_LEGAL_H}">11. Limitation of Liability</div>
  <p style="${_LEGAL_P}">TO THE FULLEST EXTENT PERMITTED BY LAW, the Company and its owners, members, employees, licensors, suppliers, and partners will not be liable for any injury, death, property damage, or loss, or for any indirect, incidental, consequential, special, exemplary, or punitive damages, arising out of or relating to your access to or use of (or inability to use) the Services, including any reliance on any prediction, waypoint, structure marker, data, or content — including any loss of <b>time, fuel, bait, equipment, or other trip expenses</b> from traveling to or fishing any waypoint or location shown in the Services — even if advised of the possibility of such damages. To the extent any liability cannot be excluded, our total aggregate liability will not exceed one hundred U.S. dollars ($100) or the amount you paid us, if any, for the Services in the twelve months before the claim, whichever is greater. Your sole and exclusive remedy for dissatisfaction with the Services is to stop using them.</p>

  <div style="${_LEGAL_H}">12. Assumption of Risk</div>
  <p style="${_LEGAL_P}">Boating and offshore fishing are inherently hazardous. By using the Services you acknowledge these risks and agree that you participate at your own risk and are solely responsible for your own decisions on the water.</p>

  <div style="${_LEGAL_H}">13. Indemnification</div>
  <p style="${_LEGAL_P}">You agree to defend, indemnify, and hold harmless the Company and its owners, members, employees, licensors, suppliers, and agents from and against any claims, liabilities, damages, judgments, losses, costs, or expenses (including reasonable attorneys' fees) arising out of or relating to your use of the Services, your violation of these Terms, or your violation of any law or the rights of any third party.</p>

  <div style="${_LEGAL_H}">14. Governing Law &amp; Jurisdiction</div>
  <p style="${_LEGAL_P}">These Terms and any dispute arising out of or relating to them or the Services are governed by the laws of the Commonwealth of Virginia, without regard to its conflict-of-law rules. Any suit, action, or proceeding shall be brought exclusively in the state or federal courts located in Virginia, and you consent to the personal jurisdiction and venue of those courts.</p>

  <div style="${_LEGAL_H}">15. Limitation on Time to File Claims</div>
  <p style="${_LEGAL_P}">ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICES MUST BE COMMENCED WITHIN ONE (1) YEAR AFTER THE CAUSE OF ACTION ACCRUES; OTHERWISE IT IS PERMANENTLY BARRED.</p>

  <div style="${_LEGAL_H}">16. Changes to the Services &amp; Terms</div>
  <p style="${_LEGAL_P}">We may modify, suspend, or discontinue all or part of the Services at any time without notice, and we will not be liable if the Services are unavailable. We may revise these Terms from time to time; changes are effective when posted. Your continued use of the Services after changes are posted means you accept the revised Terms.</p>

  <div style="${_LEGAL_H}">17. Waiver &amp; Severability</div>
  <p style="${_LEGAL_P}">Our failure to enforce any provision is not a waiver of it. If any provision is held invalid or unenforceable, it will be limited or eliminated to the minimum extent necessary, and the remaining provisions will remain in full force and effect.</p>

  <div style="${_LEGAL_H}">18. Entire Agreement</div>
  <p style="${_LEGAL_P}">These Terms and our Privacy Policy constitute the entire agreement between you and the Company regarding the Services and supersede all prior understandings.</p>

  <div style="${_LEGAL_H}">19. Contact</div>
  <p style="${_LEGAL_P}">Questions about these Terms: info@bluewaterintel.com.</p>

  <p style="margin:16px 0 0;font-size:13px;color:#7a9ec0;font-style:italic">${_LEGAL_EFFECTIVE}</p>
`;

const LEGAL_PRIVACY_HTML = `
  <div style="${_LEGAL_H}">Privacy Policy</div>
  <p style="${_LEGAL_P}">Bluewater Intel LLC ("Company," "we," "us") respects your privacy and is committed to protecting it. This policy describes the information we collect through the Bluewater Intel application, website, and related services (the "Services"), how we use and protect it, and your choices. By using the Services, you agree to this policy. If you do not agree, do not use the Services.</p>

  <div style="${_LEGAL_H}">1. Our Core Commitment</div>
  <p style="${_LEGAL_P}"><b>We never sell, rent, or share the personal information that identifies you.</b> Your identity and the personal details tied to it stay private — we do not hand them to advertisers, data brokers, or other third parties for their own use.</p>
  <p style="${_LEGAL_P}"><b>Your GPS location and your saved fishing spots (waypoints) are never shared with anyone.</b> Your waypoints and saved spots are private to your account and visible only to you. When you sign in on more than one device, they sync only across <b>your own</b> devices — never to other users and never to third parties. We do not include your GPS location or your waypoints in any data we share or sell, even in aggregated or de-identified form.</p>
  <p style="${_LEGAL_P}"><b>Exception — community fishing reports you choose to post:</b> if you post a fishing report, that report is <b>public to other users</b> under an anonymous handle. Public report fields may include the report text, optional species, the <b>port you selected</b>, the <b>date fished</b>, and a coarse region derived from that port. Your name and email are not shown on reports. Do not post a report if you do not want that information visible to the community.</p>
  <p style="${_LEGAL_P}">To support and fund the Services, we may show advertising and we may share or sell <b>aggregated or de-identified information</b> — pooled statistics and trends that cannot reasonably be linked back to you as an individual (for example, general fishing-activity patterns by region or season), <b>excluding your precise GPS location and saved waypoints</b>. This is information about <i>groups and trends</i>, not about <i>you</i>. We describe how this works in Sections 4 and 5.</p>

  <div style="${_LEGAL_H}">2. Information We Collect</div>
  <p style="${_LEGAL_P}">We collect a limited amount of information to operate the Services:</p>
  <p style="${_LEGAL_P}"><b>Information you provide:</b> data you enter such as catch logs, waypoints, saved spots, preferences, home port, target species, and <b>community fishing reports</b> (report text, port fished from, date fished, optional species); and any messages you send us (for example, support or feedback emails, including your email address). Your waypoints and saved spots are stored for your use only — kept on your device and, when you are signed in, synced to your account so they are available across your own devices. They are never made visible to other users or shared externally. Community fishing reports you post are visible to other users as described in Section 1.</p>
  <p style="${_LEGAL_P}"><b>Location:</b> if you grant permission, approximate or precise device location, used on your device to show relevant conditions and predictions for your area. <b>Your device GPS location is never shared with anyone</b> and is not sold or included in aggregated data. Separately, if you post a fishing report, the <b>port you select</b> (a named harbor or access point, not your live GPS track) is shown with that public report. You can decline or revoke device location permission in your device settings.</p>
  <p style="${_LEGAL_P}"><b>Information collected automatically:</b> basic technical and usage information needed to operate and improve the Services and fix problems — for example, device and app version, general usage patterns, and, on the website, standard log data such as IP address and browser type. Where any of this is associated with you, we treat it as personal information under this policy.</p>
  <p style="${_LEGAL_P}"><b>App diagnostics &amp; performance data:</b> to keep the app reliable, we collect diagnostic, error/crash, and performance information — for example, app events (such as opening a screen or toggling a layer), error and crash reports, and performance metrics. This data is used <b>solely</b> to diagnose problems, fix bugs, and improve the app's performance and stability. It does not include your GPS location, saved spots, names, or email. Because this information is necessary to operate and maintain the Services, its collection is a required part of using the app and is <b>not optional</b>; if you do not wish for it to be collected, please do not use the Services. We continue to apply data-minimization and de-identification practices to this data.</p>
  <p style="${_LEGAL_P}"><b>Account and payment information:</b> when you create an account or purchase a paid subscription, we collect the information needed to provide it, such as your email address and subscription status. <b>Payments are processed by Stripe, Inc.</b>, our third-party payment processor, under Stripe's own privacy policy. Stripe collects and processes your payment-card and billing details directly; <b>we do not collect or store your full payment-card number</b>. We receive limited billing information from Stripe — such as your subscription plan, status, and the result of a charge — to manage your account and access. We do not use your payment information for advertising.</p>

  <div style="${_LEGAL_H}">3. Cookies &amp; Similar Technologies</div>
  <p style="${_LEGAL_P}">On the website we may use cookies or similar technologies to keep you signed in, remember your preferences, understand general usage, and support advertising. Where we serve ads, we expect to favor <b>contextual</b> ads (based on the content you're viewing) rather than ads targeted using your personal profile; if we ever use targeted advertising that involves sharing personal information with an ad network, we will provide the disclosures and opt-out choices required by law. You can set your browser to refuse some or all cookies, though parts of the website may then not function properly.</p>

  <div style="${_LEGAL_H}">4. How We Use Your Information</div>
  <p style="${_LEGAL_P}">We use the information we collect to: provide and display the Services and generate predictions and conditions for your area; save your catches, waypoints, settings, and fishing reports; operate the community fishing-reports forum; create and manage your account; process payments and manage your subscription, trial, billing, and renewals through our payment processor; respond to your requests and support messages; operate, secure, maintain, and improve the Services, including diagnosing problems, fixing bugs, and monitoring and improving app performance and stability using the diagnostic, error, and performance data described in Section 2; show advertising within the Services; and comply with our legal obligations.</p>
  <p style="${_LEGAL_P}">We may create <b>aggregated or de-identified information</b> from usage and the data you provide — combining and stripping it so it no longer identifies you — and use, share, or sell that aggregated information for any purpose, including analytics, research, and commercial products (for example, regional fishing-activity trends). We do not re-identify it, and we contractually require recipients not to attempt to re-identify it. We never use your personal information to publicly identify you.</p>

  <div style="${_LEGAL_H}">5. How We Share Information</div>
  <p style="${_LEGAL_P}"><b>We do not sell or share the personal information that identifies you.</b> We may share or sell only <b>aggregated or de-identified</b> information as described in Section 4. We disclose personal information only in these limited situations:</p>
  <p style="${_LEGAL_P}"><b>Community fishing reports:</b> when you choose to post a report, the public fields of that report (anonymous handle, text, optional species, port, date fished, and region) are displayed to other users of the Services. That is not a sale of your identity; it is content you elected to publish to the community forum.</p>
  <p style="${_LEGAL_P}"><b>Advertising partners:</b> if we show ads, advertising providers may collect limited technical data (such as device or cookie identifiers) to deliver or measure ads. We do not give them the personal details that identify you, and where any such sharing would qualify as a "sale" or "sharing" under applicable law, we will provide the required opt-out.</p>
  <p style="${_LEGAL_P}"><b>Service providers:</b> with vendors who perform services for us (such as hosting and payment processing — for example, Stripe, which processes subscription payments), under obligations to protect the information and use it only to provide those services to us.</p>
  <p style="${_LEGAL_P}"><b>Legal and safety:</b> to comply with a law, court order, or government or regulatory request; to enforce our Terms of Use or other agreements; or where we believe it is necessary to protect the rights, property, or safety of the Company, our users, or others.</p>
  <p style="${_LEGAL_P}"><b>Business transfer:</b> if the Company is involved in a merger, acquisition, financing, reorganization, or sale of assets, your information may be transferred as part of that transaction. We would seek to ensure it remains subject to protections consistent with this policy.</p>

  <div style="${_LEGAL_H}">6. Data Storage &amp; Security</div>
  <p style="${_LEGAL_P}">Some data (such as your catch log and preferences) may be stored on your device and/or on secured servers we control or use to operate the Services. We take reasonable administrative and technical measures to protect your information, but no method of storage or transmission is perfectly secure, and we cannot guarantee absolute security.</p>

  <div style="${_LEGAL_H}">7. Third-Party Data Sources &amp; Links</div>
  <p style="${_LEGAL_P}">The Services display environmental data from public providers (for example NASA and NOAA) and may contain links to third-party sites. Viewing that data or those sites is governed by those parties' own terms and privacy policies, which we do not control. We do not share your personal information with them as a condition of displaying their public data.</p>

  <div style="${_LEGAL_H}">8. Your Choices &amp; Rights</div>
  <p style="${_LEGAL_P}">You can decline or revoke location permission in your device settings (some features may be limited), clear locally stored data through the app or your device, and adjust browser cookie settings. You can edit fishing reports you authored from the Fishing Reports page. To request access to, correction of, or deletion of personal information we hold about you (including reports tied to your account), contact us at info@bluewaterintel.com and we will respond as required by applicable law. Depending on where you live, you may have additional rights under laws such as the CCPA (California) or GDPR (EU/UK).</p>

  <div style="${_LEGAL_H}">9. Do-Not-Sell / State Privacy Notice</div>
  <p style="${_LEGAL_P}"><b>We do not sell or share the personal information that identifies you</b> within the meaning of laws such as the California Consumer Privacy Act (CCPA/CPRA) or Nevada Revised Statutes Chapter 603A. We may sell or share only aggregated or de-identified information that does not identify you. If we ever introduce advertising or data practices that would qualify as a "sale" or "sharing" of your personal information under applicable law, we will post a clear "Do Not Sell or Share My Personal Information" choice and honor it. Questions or requests: info@bluewaterintel.com.</p>

  <div style="${_LEGAL_H}">10. Children</div>
  <p style="${_LEGAL_P}">The Services are not directed to children under 16, and we do not knowingly collect personal information from them. If you believe a child under 16 has provided us information, contact us at info@bluewaterintel.com and we will take reasonable steps to delete it.</p>

  <div style="${_LEGAL_H}">11. Changes to This Policy</div>
  <p style="${_LEGAL_P}">We may update this policy from time to time. The "last revised" date below reflects the latest version, and material changes will be reflected here. Your continued use of the Services after changes are posted means you accept the updated policy.</p>

  <div style="${_LEGAL_H}">12. Contact</div>
  <p style="${_LEGAL_P}">Questions about this policy or your information: info@bluewaterintel.com.</p>

  <p style="margin:16px 0 0;font-size:13px;color:#7a9ec0;font-style:italic">${_LEGAL_EFFECTIVE}</p>
`;

// Resolve the active port to a state code (e.g. "Cape May, NJ" → "NJ")
function activePortState(){
  if(!activePort) return null;
  const m = activePort.match(/,\s*([A-Z]{2})\s*$/);
  return m ? m[1] : null;
}
// Bahamas and other non-US port suffixes (e.g. "Bimini, Bahamas" → "BS")
function activePortTerritory(){
  if(!activePort) return null;
  if(/,\s*Bahamas\s*$/i.test(activePort)) return "BS";
  return null;
}

function renderRegulations(){
  // Port-aware spotlight: show user's state or territory at the top if a port is selected.
  const spotlight = document.getElementById("regs-spotlight");
  const code = activePortState();
  const territory = activePortTerritory();
  if(territory && REGS_BY_TERRITORY[territory]){
    const r = REGS_BY_TERRITORY[territory];
    spotlight.innerHTML = `
      <div style="background:rgba(41,121,181,.15);border:1px solid rgba(41,121,181,.4);border-radius:10px;padding:14px 16px">
        <div style="font-size:9px;font-weight:700;color:#7dd3fc;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">📍 Your Home Waters</div>
        <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:6px">${r.name} — ${r.agency}</div>
        <div style="font-size:11px;color:#cfe5ff;line-height:1.5;margin-bottom:8px">${r.notes}</div>
        <a href="${r.url}" target="_blank" rel="noopener" style="
          display:inline-block;background:#2979b5;color:#fff;
          padding:8px 14px;border-radius:7px;text-decoration:none;
          font-size:12px;font-weight:700;
        ">Open ${r.agency} →</a>
      </div>`;
  } else if(code && REGS_BY_STATE[code]){
    const r = REGS_BY_STATE[code];
    spotlight.innerHTML = `
      <div style="background:rgba(41,121,181,.15);border:1px solid rgba(41,121,181,.4);border-radius:10px;padding:14px 16px">
        <div style="font-size:9px;font-weight:700;color:#7dd3fc;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">📍 Your Home State</div>
        <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:6px">${r.name} — ${r.agency}</div>
        <div style="font-size:11px;color:#cfe5ff;line-height:1.5;margin-bottom:8px">${r.notes}</div>
        <a href="${r.url}" target="_blank" rel="noopener" style="
          display:inline-block;background:#2979b5;color:#fff;
          padding:8px 14px;border-radius:7px;text-decoration:none;
          font-size:12px;font-weight:700;
        ">Open ${r.agency} →</a>
      </div>`;
  } else {
    spotlight.innerHTML = "";
  }

  // Main content sections
  const content = document.getElementById("regs-content");

  // 1. Federal sources
  const fedHtml = REGS_FEDERAL.map(f => `
    <div style="padding:12px 14px;background:rgba(15,36,68,.55);border:1px solid rgba(107,191,234,.15);border-radius:9px;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;color:#f0f6ff;margin-bottom:2px">${f.region}</div>
      <div style="font-size:10px;color:#7dd3fc;font-weight:600;margin-bottom:6px">${f.agency}</div>
      <div style="font-size:11px;color:#cfe5ff;line-height:1.5;margin-bottom:8px">${f.desc}</div>
      <a href="${f.url}" target="_blank" rel="noopener" style="font-size:11px;color:#7dd3fc;text-decoration:underline;font-weight:600">Open official page →</a>
    </div>
  `).join("");

  // 2. Territory / international crossings
  const territoryEntries = Object.entries(REGS_BY_TERRITORY).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const territoryHtml = territoryEntries.map(([code, r]) => `
    <div style="padding:11px 14px;background:rgba(15,36,68,.45);border:1px solid rgba(107,191,234,.12);border-radius:8px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px">
        <div>
          <span style="font-size:12px;font-weight:700;color:#f0f6ff">${r.name}</span>
          <span style="font-size:10px;color:#9ec5e8;margin-left:6px">${r.agency}</span>
        </div>
        <a href="${r.url}" target="_blank" rel="noopener" style="font-size:10px;color:#7dd3fc;text-decoration:none;background:rgba(107,191,234,.1);border:1px solid rgba(107,191,234,.3);padding:4px 10px;border-radius:6px;flex-shrink:0">Open →</a>
      </div>
      <div style="font-size:10px;color:#cfe5ff;line-height:1.5">${r.notes}</div>
    </div>
  `).join("");

  // 3. State agency directory — alphabetical by state name
  const stateEntries = Object.entries(REGS_BY_STATE).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const stateHtml = stateEntries.map(([code, r]) => `
    <div style="padding:11px 14px;background:rgba(15,36,68,.45);border:1px solid rgba(107,191,234,.12);border-radius:8px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px">
        <div>
          <span style="font-size:12px;font-weight:700;color:#f0f6ff">${r.name}</span>
          <span style="font-size:10px;color:#9ec5e8;margin-left:6px">${r.agency}</span>
        </div>
        <a href="${r.url}" target="_blank" rel="noopener" style="font-size:10px;color:#7dd3fc;text-decoration:none;background:rgba(107,191,234,.1);border:1px solid rgba(107,191,234,.3);padding:4px 10px;border-radius:6px;flex-shrink:0">Open →</a>
      </div>
      <div style="font-size:10px;color:#cfe5ff;line-height:1.5">${r.notes}</div>
    </div>
  `).join("");

  // 4. Sanctuary list — pulled from MARINE_CLOSURES (same data the map layer uses)
  const sanctuariesHtml = MARINE_CLOSURES.map(c => {
    const typeLabel = c.type === "noTake" ? "NO FISHING"
                    : c.type === "hapc" ? "BOTTOM-GEAR HAPC"
                    : c.type === "closure" ? "CLOSURE"
                    : "SANCTUARY";
    const badgeColor = c.type === "noTake" ? "#dc2626"
                     : c.type === "hapc" ? "#a855f7"
                     : c.type === "closure" ? "#ef4444"
                     : "#fbbf24";
    return `
      <div style="padding:11px 14px;background:rgba(15,36,68,.45);border:1px solid rgba(107,191,234,.12);border-radius:8px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;font-weight:700;color:${c.color}">${c.name}</span>
          <span style="font-size:8px;font-weight:700;color:#fff;background:${badgeColor};padding:2px 6px;border-radius:5px;letter-spacing:.05em">${typeLabel}</span>
        </div>
        <div style="font-size:10px;color:#cfe5ff;line-height:1.5;margin-bottom:6px">${c.desc}</div>
        <a href="${c.link}" target="_blank" rel="noopener" style="font-size:10px;color:#7dd3fc;text-decoration:underline">Official regulations →</a>
      </div>`;
  }).join("");

  content.innerHTML = `
    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#6bbfea;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px">Federal Sources</div>
      ${fedHtml}
    </div>

    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#6bbfea;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px">Territories &amp; Crossings</div>
      ${territoryHtml}
    </div>

    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#6bbfea;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px">State Agencies</div>
      ${stateHtml}
    </div>

    <div>
      <div style="font-size:11px;font-weight:700;color:#6bbfea;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px">Marine Protected Areas &amp; Closures</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;line-height:1.45">These permanent spatial closures also appear as toggleable polygons on the map (Layers → Closures &amp; Sanctuaries).</div>
      ${sanctuariesHtml}
    </div>
  `;
}

let rpRegion = "all";  // active region tab in the forum
function openReports(){
  document.getElementById("rp-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  rpPopulateFilters();
  rpRender();
  // Pull the latest community reports, then re-render.
  if(typeof loadReports === "function") loadReports().then(() => { rpPopulateFilters(); rpRender(); });
}
function closeReports(){
  document.getElementById("rp-overlay").style.display = "none";
  document.body.style.overflow = "";
}
function rpPopulateFilters(){
  // Region tabs (All + coverage regions)
  const tabs = document.getElementById("rp-region-tabs");
  if(tabs){
    const all = [{id:"all",label:"All Regions"}].concat(REGIONS);
    tabs.innerHTML = all.map(r =>
      `<button type="button" class="rp-region-tab${rpRegion===r.id?" active":""}" onclick="rpSetRegion('${r.id}')">${r.label}</button>`
    ).join("");
  }
  // Species filter (from whatever species appear in current reports)
  const allSp = [...new Set(SOCIAL.flatMap(r => r.species || []))].sort();
  const spSel = document.getElementById("rp-species");
  if(spSel){
    const cur = spSel.value || "all";
    spSel.innerHTML = '<option value="all">All Species</option>' +
      allSp.map(s => { const sp = SPECIES.find(x => x.id === s); return `<option value="${s}">${sp ? sp.name : s}</option>`; }).join("");
    spSel.value = [...spSel.options].some(o=>o.value===cur) ? cur : "all";
  }
}
function rpSetRegion(id){
  rpRegion = id;
  rpPopulateFilters();
  rpRender();
}
function rpEsc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function rpRender(){
  const q = (document.getElementById("rp-search").value || "").toLowerCase().trim();
  const spFilter   = document.getElementById("rp-species").value;
  const timeFilter = document.getElementById("rp-time").value;

  let list = SOCIAL.slice();

  if(rpRegion !== "all") list = list.filter(r => r.region === rpRegion);
  if(q) list = list.filter(r =>
    (r.snippet||"").toLowerCase().includes(q) ||
    (r.area || "").toLowerCase().includes(q) ||
    (r.port || "").toLowerCase().includes(q) ||
    (r.srcName || "").toLowerCase().includes(q)
  );
  if(spFilter !== "all")   list = list.filter(r => (r.species || []).includes(spFilter));
  if(timeFilter !== "all"){
    const limit = parseInt(timeFilter);
    list = list.filter(r => (r.hoursAgo || 0) <= limit);
  }

  // Sort by recency (lowest hoursAgo first)
  list.sort((a,b) => (a.hoursAgo || 999) - (b.hoursAgo || 999));

  // Stats
  const stats = document.getElementById("rp-stats");
  const regions = new Set(list.map(r => r.region));
  stats.innerHTML = `
    <span><b style="color:#7dd3fc;font-size:14px">${list.length}</b> report${list.length===1?"":"s"}</span>
    <span style="color:#5d96c4">·</span>
    <span><b style="color:#7dd3fc;font-size:14px">${regions.size}</b> region${regions.size===1?"":"s"}</span>
    ${list.length > 0 ? `<span style="color:#5d96c4">·</span><span>Most recent: <b style="color:#34d399">${rpFmtTime(list[0].hoursAgo || 0)}</b></span>` : ""}
  `;

  // List
  const container = document.getElementById("rp-list");
  if(list.length === 0){
    container.innerHTML = `
      <div id="rp-empty">
        <div style="font-size:48px;margin-bottom:12px">🎣</div>
        <div style="font-size:14px;font-weight:600;color:#9ec5e8;margin-bottom:6px">No reports yet${rpRegion!=="all"?" for "+(REGION_LABELS[rpRegion]||rpRegion):""}</div>
        <div style="font-size:11px">Be the first — tap <b>✏️ Post</b> to share what's biting.</div>
      </div>`;
    return;
  }

  container.innerHTML = list.map(r => {
    const spChips = (r.species || []).slice(0,4).map(id => {
      const sp = SPECIES.find(x => x.id === id);
      if(!sp) return "";
      return `<span class="rp-sp-pill" style="background:${sp.color}18;color:${sp.color};border-color:${sp.color}44">${sp.name}</span>`;
    }).join("");
    return `
      <div class="rp-card">
        <div class="rp-card-head">
          <span class="rp-handle">${rpEsc(r.srcName)}</span>
          <div>
            <div class="rp-area">📍 ${rpEsc(r.port || r.area || "—")}</div>
            ${r.fishedAt ? `<div class="rp-fished">🗓 Fished ${rpFmtDate(r.fishedAt)}</div>` : ""}
          </div>
          <span class="rp-time">${rpFmtTime(r.hoursAgo || 0)}</span>
          ${r.isMine ? `<button type="button" class="rp-edit-btn" onclick="event.stopPropagation();rpOpenEdit('${r.id}')">Edit</button>` : ""}
        </div>
        <div class="rp-snippet">${rpEsc(r.snippet)}</div>
        <div class="rp-species">${spChips}</div>
      </div>
    `;
  }).join("");
}
// ── Post / edit a report ──
let _rpEditingId = null;

function rpTodayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rpPopulatePortSelect(selectedPort){
  const sel = document.getElementById("rp-post-port");
  if(!sel || typeof PORT_GROUPS === "undefined") return;
  if(!sel.dataset.rpBuilt){
    let html = '<option value="">— select port —</option>';
    PORT_GROUPS.forEach(g => {
      html += `<optgroup label="${rpEsc(g.label)}">`;
      g.ports.forEach(p => { html += `<option value="${rpEsc(p)}">${rpEsc(p)}</option>`; });
      html += "</optgroup>";
    });
    sel.innerHTML = html;
    sel.dataset.rpBuilt = "1";
  }
  sel.value = selectedPort && [...sel.options].some(o => o.value === selectedPort) ? selectedPort : "";
}

function rpRegionFromPort(port){
  if(!port || typeof PORTS === "undefined" || !PORTS[port]) return null;
  return (typeof regionFor === "function") ? regionFor(PORTS[port].lat, PORTS[port].lng) : null;
}

function rpUpdatePortRegionHint(){
  const port = document.getElementById("rp-post-port")?.value;
  const hint = document.getElementById("rp-post-region-hint");
  if(!hint) return;
  const reg = rpRegionFromPort(port);
  if(reg){
    const label = (typeof REGION_LABELS !== "undefined" && REGION_LABELS[reg]) ? REGION_LABELS[reg] : reg;
    hint.textContent = `Region: ${label} (from port)`;
    hint.style.display = "block";
  } else {
    hint.textContent = "";
    hint.style.display = "none";
  }
}

function rpPostPortChanged(){
  rpUpdatePortRegionHint();
}

function rpResetPostForm(){
  _rpEditingId = null;
  const title = document.getElementById("rp-post-title");
  const btn = document.getElementById("rp-post-submit");
  if(title) title.textContent = "✏️ Post a Fishing Report";
  if(btn) btn.textContent = "Post Report";
}

function rpFillPostForm(opts){
  opts = opts || {};
  rpPopulatePortSelect(opts.port || "");
  rpUpdatePortRegionHint();
  const spSel = document.getElementById("rp-post-species");
  spSel.innerHTML = '<option value="">— none —</option>' +
    SPECIES.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  if(opts.species) spSel.value = opts.species;
  else if(typeof activeSpId !== "undefined" && activeSpId) spSel.value = activeSpId;
  document.getElementById("rp-post-body").value = opts.body || "";
  const fished = document.getElementById("rp-post-fished");
  fished.max = rpTodayISO();
  fished.value = opts.fishedAt || rpTodayISO();
  const msg = document.getElementById("rp-post-msg");
  msg.style.display = "none";
}

function rpOpenPost(){
  if(!(window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser())){
    showToast("Please sign in to post a report.", "warning");
    return;
  }
  rpResetPostForm();
  rpFillPostForm({ port: (typeof activePort !== "undefined" && activePort) ? activePort : "" });
  document.getElementById("rp-post-overlay").style.display = "flex";
}

async function rpOpenEdit(reportId){
  if(!(window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser())){
    showToast("Please sign in to edit your report.", "warning");
    return;
  }
  if(!window.BW_AUTH.fetchMyReport){
    showToast("Editing is not available yet.", "warning");
    return;
  }
  try {
    const row = await window.BW_AUTH.fetchMyReport(reportId);
    _rpEditingId = reportId;
    document.getElementById("rp-post-title").textContent = "✏️ Edit Fishing Report";
    document.getElementById("rp-post-submit").textContent = "Save Changes";
    rpFillPostForm({
      port: row.port || "",
      species: row.species || "",
      body: row.body || "",
      fishedAt: row.fished_at || rpTodayISO(),
    });
    document.getElementById("rp-post-overlay").style.display = "flex";
  } catch(e){
    showToast((e && e.message) ? e.message : "Could not load report.", "warning");
  }
}

function rpClosePost(){
  document.getElementById("rp-post-overlay").style.display = "none";
  rpResetPostForm();
}

async function rpSubmitPost(){
  const msg = document.getElementById("rp-post-msg");
  const showMsg = (t, ok) => { msg.textContent = t; msg.style.display = "block";
    msg.style.background = ok ? "rgba(16,185,129,.12)" : "rgba(220,38,38,.12)";
    msg.style.color = ok ? "#34d399" : "#fca5a5"; };
  const port = document.getElementById("rp-post-port").value || null;
  const fishedAt = document.getElementById("rp-post-fished").value || null;
  const species = document.getElementById("rp-post-species").value || null;
  const body = (document.getElementById("rp-post-body").value || "").trim();
  if(!port){ showMsg("Pick the port you fished from.", false); return; }
  if(!fishedAt){ showMsg("Pick the date you fished.", false); return; }
  if(fishedAt > rpTodayISO()){ showMsg("Fishing date can't be in the future.", false); return; }
  const region = rpRegionFromPort(port);
  if(!region){ showMsg("Could not determine region for that port.", false); return; }
  let lat = null, lng = null;
  if(typeof PORTS !== "undefined" && PORTS[port]){
    lat = PORTS[port].lat;
    lng = PORTS[port].lng;
  }
  if(!body){ showMsg("Write a short report.", false); return; }
  const btn = document.getElementById("rp-post-submit");
  const saving = _rpEditingId ? "Saving…" : "Posting…";
  btn.disabled = true; btn.textContent = saving;
  const payload = { region, species, port, lat, lng, body, fished_at: fishedAt };
  try {
    if(_rpEditingId && window.BW_AUTH.updateReport){
      await window.BW_AUTH.updateReport(_rpEditingId, payload);
    } else {
      await window.BW_AUTH.postReport(payload);
      rpRegion = region;
    }
    rpClosePost();
    if(typeof loadReports === "function") await loadReports();
    rpPopulateFilters();
    rpRender();
  } catch(e){
    showMsg((e && e.message) ? e.message : "Could not save — try again.", false);
  } finally {
    btn.disabled = false;
    btn.textContent = _rpEditingId ? "Save Changes" : "Post Report";
  }
}

function rpFmtDate(isoDate){
  const d = new Date(isoDate + "T12:00:00");
  const today = new Date(rpTodayISO() + "T12:00:00");
  const diff = Math.round((today - d) / 86400000);
  if(diff === 0) return "today";
  if(diff === 1) return "yesterday";
  if(diff > 1 && diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function rpFmtTime(hours){
  if(hours < 1) return "Just now";
  if(hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours/24);
  return `${days}d ago`;
}
