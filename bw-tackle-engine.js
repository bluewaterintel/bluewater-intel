/* Bluewater Intel — Tackle box scoring engine + UI
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

// ════════════════════════════════════════════════════════════════════════════
// TACKLE DATABASE — curated lures and baits keyed by species + conditions
// Each item is scored against current conditions to produce ranked recommendations
// ════════════════════════════════════════════════════════════════════════════
//
// Tag system:
//   species: which fish this works for (any in array = match)
//   technique: trolling | chunking | jigging | livebait | casting | dropdrop
//   waterClarity: clear | green | dirty | any
//   light: bright | overcast | lowlight | night | any
//   speed: knots range for trolling (e.g. [6,9])
//   colors: which colors offered
//   tempRange: water temp °F range where this excels
//   bestSeason: spring | summer | fall | winter | any (array)
//
// TB_TACKLE moved to bw-data-tackle.js (Approach A modularization)

// ════════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════════
let TB_state = {
  tab: "recommend",
  species: "bluemarlin",
  technique: null,        // null = any
  waterClarity: "clear",
  light: "bright",
  waterTempF: 72,
  season: "summer",
  favorites: [],
  filterSpecies: "all",   // for browse tab
};

const TB_LOG_KEY = "bwi_tackle_favorites_v1";

function tbLoadFavs(){
  try {
    const raw = localStorage.getItem(TB_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e){ return []; }
}
function tbSaveFavs(){
  try { localStorage.setItem(TB_LOG_KEY, JSON.stringify(TB_state.favorites)); } catch(e){}
  if(window.BW_AUTH) window.BW_AUTH.saveLog("tide_favorites", TB_state.favorites).catch(()=>{});
}

// ════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ════════════════════════════════════════════════════════════════════════════
function openTackleBox(){
  TB_state.favorites = tbLoadFavs();

  // Pre-fill species from main app if available and valid
  if (typeof activeSpId !== "undefined" && activeSpId !== "all") {
    TB_state.species = activeSpId;
  }

  // GUARANTEE: the species we end up with has at least one tackle item.
  // Otherwise the "Top Recommendations" section will be empty and the
  // user has to re-select to get out of it. If the species has no items
  // in TB_TACKLE, fall back to bluemarlin (always populated).
  const hasItems = TB_TACKLE.some(item => item.species.includes(TB_state.species));
  if (!hasItems) {
    TB_state.species = "bluemarlin";
  }

  // Auto-detect season from current month
  const m = new Date().getMonth();
  TB_state.season = m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "fall";

  document.getElementById("tb-overlay").style.display = "block";
  document.body.style.overflow = "hidden";

  // Render immediately so the modal isn't blank, then again on the next
  // animation frame after the browser has applied display:block and laid
  // out the modal. This second render avoids any first-paint glitches
  // where computed sizes / dropdown selection state could be stale.
  tbRender();
  requestAnimationFrame(() => tbRender());
}
function closeTackleBox(){
  document.getElementById("tb-overlay").style.display = "none";
  document.body.style.overflow = "";
}
function tbSwitchTab(tab){
  TB_state.tab = tab;
  document.querySelectorAll(".tb-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  tbRender();
}

// Species-specific words in tip text — used to avoid showing e.g. "Mahi can't refuse…"
// when yellowfin is the selected target.
const TB_SPECIES_TIP_WORDS = {
  mahi:["mahi","dolphin"],
  yellowfin:["yellowfin","yft"],
  bluefin:["bluefin","giant bluefin","giants"],
  bigeye:["bigeye"],
  blackfin:["blackfin"],
  skipjack:["skipjack"],
  bluemarlin:["blue marlin"],
  whitemarlin:["white marlin","whites"],
  sailfish:["sailfish","sails"],
  spearfish:["spearfish"],
  swordfish:["swordfish"],
  wahoo:["wahoo"],
  cobia:["cobia"],
  kingmack:["king mackerel","kingfish"],
  redfish:["redfish","reds"],
  blackdrum:["black drum"],
  speckledtrout:["speckled trout","speck"],
  striper:["striper","striped bass"],
  flounder:["flounder"],
  permit:["permit"],
  grouper:["grouper"],
  snapper:["snapper"],
  amberjack:["amberjack"],
  bonito:["bonito"],
  bluefish:["bluefish"],
  tarpon:["tarpon"],
  snook:["snook"],
  bonefish:["bonefish"],
};

function tbTipMentionsOtherSpecies(tip, item, speciesId){
  const lower = (tip || "").toLowerCase();
  for (const sid of item.species) {
    if (sid === speciesId) continue;
    const words = TB_SPECIES_TIP_WORDS[sid];
    if (!words) continue;
    if (words.some(w => lower.includes(w))) return true;
  }
  return false;
}

function tbTipMentionsSpecies(tip, speciesId){
  const words = TB_SPECIES_TIP_WORDS[speciesId];
  if (!words) return false;
  const lower = (tip || "").toLowerCase();
  return words.some(w => lower.includes(w));
}

function tbTipFallback(item, speciesId){
  const sp = SPECIES.find(s => s.id === speciesId);
  const name = sp ? sp.name : speciesId;
  const colors = (item.colors && item.colors.length)
    ? ` Good colors: ${item.colors.slice(0, 3).join(", ")}.`
    : "";
  if (item.speed && item.speed[1] > 0) {
    return `Solid ${item.cat.toLowerCase()} for ${name}. Troll ${item.speed[0]}–${item.speed[1]} kt.${colors}`;
  }
  return `Effective ${item.cat.toLowerCase()} for ${name} in matching water, light, and season conditions.${colors}`;
}

function tbTipFor(item, speciesId){
  if (!speciesId) return item.tip || "";
  if (item.speciesTips && item.speciesTips[speciesId]) return item.speciesTips[speciesId];
  const tip = item.tip || "";
  if (item.species.length <= 1) return tip;
  // Tip names the selected species (e.g. "yellowfin and giants") — show it.
  if (tbTipMentionsSpecies(tip, speciesId)) return tip;
  if (tbTipMentionsOtherSpecies(tip, item, speciesId)) return tbTipFallback(item, speciesId);
  return tip;
}

function tbTipSpeciesContext(){
  if (TB_state.tab === "browse" && TB_state.filterSpecies !== "all") return TB_state.filterSpecies;
  return TB_state.species;
}

// ════════════════════════════════════════════════════════════════════════════
// SCORING — match each tackle item against current conditions
// ════════════════════════════════════════════════════════════════════════════
function tbScore(item){
  let score = 0;
  let max = 0;

  // Species match (mandatory)
  max += 40;
  if (item.species.includes(TB_state.species)) score += 40;
  else return { score: 0, pct: 0 };  // exclude entirely if species doesn't match

  // Per-species priority — how good is this bait FOR THIS species specifically.
  // priority[species] of 1 = top pick, 2 = strong, 3 = situational. Items with
  // no priority entry for this species are treated as secondary (rank ~4).
  // This keeps the cards' max at 100 so percentages stay comparable.
  max += 20;
  const rank = (item.priority && item.priority[TB_state.species]) || 4;
  score += Math.max(0, 20 - (rank - 1) * 6);  // rank1=20, rank2=14, rank3=8, rank4=2

  // Technique match
  if (TB_state.technique) {
    max += 15;
    if (item.technique.includes(TB_state.technique)) score += 15;
  }

  // Water clarity
  max += 10;
  if (item.waterClarity.includes(TB_state.waterClarity) || item.waterClarity.includes("any")) score += 10;
  else score += 3;

  // Light
  max += 10;
  if (item.light.includes(TB_state.light) || item.light.includes("any")) score += 10;
  else score += 3;

  // Temperature
  max += 15;
  const t = TB_state.waterTempF;
  if (item.bestTemp && t >= item.bestTemp[0] && t <= item.bestTemp[1]) score += 15;
  else if (item.bestTemp) {
    const dist = Math.min(Math.abs(t - item.bestTemp[0]), Math.abs(t - item.bestTemp[1]));
    score += Math.max(0, 15 - dist * 1.2);
  } else score += 8;

  // Season
  max += 10;
  if (item.bestSeason.includes(TB_state.season) || item.bestSeason.includes("any")) score += 10;
  else score += 2;

  return { score, max, pct: Math.round((score / max) * 100) };
}

// ════════════════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════════════════
function tbRender(){
  const root = document.getElementById("tb-content");
  if (TB_state.tab === "recommend")  root.innerHTML = tbRenderRecommend();
  else if (TB_state.tab === "browse")    root.innerHTML = tbRenderBrowse();
  else if (TB_state.tab === "favorites") root.innerHTML = tbRenderFavorites();
}

// ── RECOMMEND TAB ────────────────────────────────────────────────────────────
function tbRenderRecommend(){
  // Get scored, sorted tackle for current species
  const scored = TB_TACKLE
    .map(item => ({ item, ...tbScore(item) }))
    .filter(x => x.pct > 0)
    .sort((a, b) => b.pct - a.pct);

  const top = scored.slice(0, 8);
  const sp = SPECIES.find(s => s.id === TB_state.species);

  return `
    <div style="margin-bottom:14px;padding:14px 18px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;font-size:15px;color:#86efac;line-height:1.6">
      <b style="font-size:16px">📡 Smart Recommendations</b> — Pick your target and conditions. We'll rank lures and baits using captain-curated patterns. Works fully offline.
    </div>

    <!-- Species selector -->
    <div class="tb-step">
      <h3>🎯 Target Species</h3>
      <select class="tb-select" onchange="TB_state.species=this.value;tbRender()">
        <optgroup label="Offshore">
          ${SPECIES.filter(s => s.cat === "offshore" && s.id !== "all").map(s => `<option value="${s.id}" ${s.id === TB_state.species ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
        <optgroup label="Nearshore">
          ${SPECIES.filter(s => s.cat === "nearshore").map(s => `<option value="${s.id}" ${s.id === TB_state.species ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
        <optgroup label="Inshore">
          ${SPECIES.filter(s => s.cat === "inshore").map(s => `<option value="${s.id}" ${s.id === TB_state.species ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
      </select>
    </div>

    <!-- Conditions -->
    <div class="tb-step">
      <h3>🌊 Conditions</h3>

      <div style="margin-bottom:14px">
        <div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;margin-bottom:6px;text-transform:uppercase">Technique</div>
        <div class="tb-pill-group">
          <button class="tb-pill ${!TB_state.technique ? "active" : ""}" onclick="TB_state.technique=null;tbRender()">Any</button>
          <button class="tb-pill ${TB_state.technique==="trolling" ? "active" : ""}" onclick="TB_state.technique='trolling';tbRender()">🚤 Trolling</button>
          <button class="tb-pill ${TB_state.technique==="livebait" ? "active" : ""}" onclick="TB_state.technique='livebait';tbRender()">🐠 Live Bait</button>
          <button class="tb-pill ${TB_state.technique==="chunking" ? "active" : ""}" onclick="TB_state.technique='chunking';tbRender()">🩸 Chunking</button>
          <button class="tb-pill ${TB_state.technique==="jigging" ? "active" : ""}" onclick="TB_state.technique='jigging';tbRender()">⚡ Jigging</button>
          <button class="tb-pill ${TB_state.technique==="casting" ? "active" : ""}" onclick="TB_state.technique='casting';tbRender()">🎣 Casting</button>
          <button class="tb-pill ${TB_state.technique==="dropdrop" ? "active" : ""}" onclick="TB_state.technique='dropdrop';tbRender()">⚓ Deep Drop</button>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;margin-bottom:6px;text-transform:uppercase">Water Clarity</div>
        <div class="tb-pill-group">
          <button class="tb-pill ${TB_state.waterClarity==="clear" ? "active" : ""}" onclick="TB_state.waterClarity='clear';tbRender()">💎 Clear Blue</button>
          <button class="tb-pill ${TB_state.waterClarity==="green" ? "active" : ""}" onclick="TB_state.waterClarity='green';tbRender()">🌿 Green</button>
          <button class="tb-pill ${TB_state.waterClarity==="dirty" ? "active" : ""}" onclick="TB_state.waterClarity='dirty';tbRender()">☁ Dirty/Stained</button>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;margin-bottom:6px;text-transform:uppercase">Light Conditions</div>
        <div class="tb-pill-group">
          <button class="tb-pill ${TB_state.light==="bright" ? "active" : ""}" onclick="TB_state.light='bright';tbRender()">☀ Bright Sun</button>
          <button class="tb-pill ${TB_state.light==="overcast" ? "active" : ""}" onclick="TB_state.light='overcast';tbRender()">☁ Overcast</button>
          <button class="tb-pill ${TB_state.light==="lowlight" ? "active" : ""}" onclick="TB_state.light='lowlight';tbRender()">🌅 Dawn/Dusk</button>
          <button class="tb-pill ${TB_state.light==="night" ? "active" : ""}" onclick="TB_state.light='night';tbRender()">🌙 Night</button>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;margin-bottom:6px;text-transform:uppercase">
          Water Temp · <span style="color:#7dd3fc">${TB_state.waterTempF}°F</span>
        </div>
        <input type="range" min="40" max="90" step="1" value="${TB_state.waterTempF}"
          oninput="TB_state.waterTempF=parseInt(this.value);tbRender()"
          style="width:100%;accent-color:#2979b5"/>
      </div>

      <div>
        <div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;margin-bottom:6px;text-transform:uppercase">Season</div>
        <div class="tb-pill-group">
          <button class="tb-pill ${TB_state.season==="spring" ? "active" : ""}" onclick="TB_state.season='spring';tbRender()">🌷 Spring</button>
          <button class="tb-pill ${TB_state.season==="summer" ? "active" : ""}" onclick="TB_state.season='summer';tbRender()">☀ Summer</button>
          <button class="tb-pill ${TB_state.season==="fall" ? "active" : ""}" onclick="TB_state.season='fall';tbRender()">🍂 Fall</button>
          <button class="tb-pill ${TB_state.season==="winter" ? "active" : ""}" onclick="TB_state.season='winter';tbRender()">❄ Winter</button>
        </div>
      </div>
    </div>

    <!-- Recommendations -->
    <div class="tb-step">
      <h3>🏆 Top Recommendations for ${sp ? sp.name : "this Species"}</h3>
      ${top.length === 0 ? `
        <div class="tb-empty">
          <div class="tb-empty-icon">🤷</div>
          <div style="font-size:13px;color:#9ec5e8">No matches in our database for these exact conditions.</div>
          <div style="font-size:11px;margin-top:6px">Try adjusting technique or browse all tackle.</div>
        </div>
      ` : top.map((x, i) => tbRenderCard(x.item, x.pct, i === 0)).join("")}
    </div>

    <!-- Disclaimer -->
    <div style="font-size:10px;color:#5d96c4;text-align:center;padding:12px;line-height:1.6">
      Recommendations curated from veteran coastal captains. Match-percent reflects how well each item fits your conditions.<br>Local knowledge always wins — these are suggestions, not guarantees.
    </div>
  `;
}

function tbRenderCard(item, pct, isTop){
  const isFav = TB_state.favorites.includes(item.id);
  const scoreClass = pct >= 75 ? "" : pct >= 55 ? "med" : "low";
  const colorTags = (item.colors || []).slice(0, 4)
    .map(c => `<span class="tb-rec-tag color-tag">${c}</span>`).join("");
  const colorLabel = (item.colors && item.colors.length)
    ? `<span class="tb-rec-tag-label">Colors</span>` : "";
  const sizeTag = item.sizeIn
    ? `<span class="tb-rec-tag-label">Size</span><span class="tb-rec-tag size-tag">${item.sizeIn}″</span>` : "";
  const speedTag = item.speed && item.speed[1] > 0
    ? `<span class="tb-rec-tag-label">Troll speed</span><span class="tb-rec-tag">${item.speed[0]}–${item.speed[1]} kt</span>` : "";
  const tipText = tbTipFor(item, TB_state.species);

  return `
    <div class="tb-rec-card ${isTop ? "top" : ""}">
      <div class="tb-rec-head">
        <div class="tb-rec-icon">${item.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="tb-rec-name">${item.name}</div>
          <div class="tb-rec-cat">${item.cat}</div>
        </div>
        <div class="tb-rec-score ${scoreClass}">${pct}%</div>
        <button class="tb-fav-btn ${isFav ? "active" : ""}" onclick="tbToggleFav('${item.id}')" title="${isFav ? "Remove from My Box" : "Add to My Box"}">${isFav ? "★" : "☆"}</button>
      </div>
      <div class="tb-rec-tags">
        ${sizeTag}
        ${speedTag}
        ${colorLabel}
        ${colorTags}
      </div>
      <div class="tb-rec-tips">${tipText}</div>
    </div>
  `;
}

// ── BROWSE TAB ───────────────────────────────────────────────────────────────
function tbRenderBrowse(){
  let list = TB_TACKLE;
  if (TB_state.filterSpecies !== "all") {
    list = list.filter(t => t.species.includes(TB_state.filterSpecies));
  }

  return `
    <div class="tb-step">
      <h3>📚 Filter by Species</h3>
      <select class="tb-select" onchange="TB_state.filterSpecies=this.value;tbRender()">
        <option value="all" ${TB_state.filterSpecies === "all" ? "selected" : ""}>All Species</option>
        <optgroup label="Offshore">
          ${SPECIES.filter(s => s.cat === "offshore" && s.id !== "all").map(s => `<option value="${s.id}" ${s.id === TB_state.filterSpecies ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
        <optgroup label="Nearshore">
          ${SPECIES.filter(s => s.cat === "nearshore").map(s => `<option value="${s.id}" ${s.id === TB_state.filterSpecies ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
        <optgroup label="Inshore">
          ${SPECIES.filter(s => s.cat === "inshore").map(s => `<option value="${s.id}" ${s.id === TB_state.filterSpecies ? "selected" : ""}>${s.name}</option>`).join("")}
        </optgroup>
      </select>
    </div>

    <div style="font-size:11px;color:#9ec5e8;margin:6px 0 10px">${list.length} item${list.length === 1 ? "" : "s"} in the database</div>
    ${list.map(item => tbRenderBrowseCard(item)).join("")}
  `;
}

function tbRenderBrowseCard(item){
  const isFav = TB_state.favorites.includes(item.id);
  const speciesNames = item.species.slice(0, 4).map(id => {
    const s = SPECIES.find(sp => sp.id === id);
    return s ? s.name : id;
  }).join(", ");
  const colorTags = (item.colors || []).slice(0, 3).map(c => `<span class="tb-rec-tag color-tag">${c}</span>`).join("");

  return `
    <div class="tb-rec-card">
      <div class="tb-rec-head">
        <div class="tb-rec-icon">${item.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="tb-rec-name">${item.name}</div>
          <div class="tb-rec-cat">${item.cat} · ${speciesNames}</div>
        </div>
        <button class="tb-fav-btn ${isFav ? "active" : ""}" onclick="tbToggleFav('${item.id}')">${isFav ? "★" : "☆"}</button>
      </div>
      <div class="tb-rec-tags">
        ${item.sizeIn ? `<span class="tb-rec-tag size-tag">${item.sizeIn}"</span>` : ""}
        ${colorTags}
      </div>
      <div class="tb-rec-tips">${tbTipFor(item, tbTipSpeciesContext())}</div>
    </div>
  `;
}

// ── FAVORITES TAB ─────────────────────────────────────────────────────────────
function tbRenderFavorites(){
  const list = TB_TACKLE.filter(t => TB_state.favorites.includes(t.id));
  if (list.length === 0) {
    return `
      <div class="tb-empty">
        <div class="tb-empty-icon">⭐</div>
        <div style="font-size:14px;font-weight:600;color:#9ec5e8;margin-bottom:6px">My Tackle Box is empty</div>
        <div style="font-size:11px;line-height:1.6">Tap the ☆ on any recommendation to save your favorite lures and baits here.<br>Build your personal go-to box for quick reference.</div>
      </div>
    `;
  }
  return `
    <div style="font-size:11px;color:#9ec5e8;margin-bottom:10px">${list.length} item${list.length === 1 ? "" : "s"} in your tackle box</div>
    ${list.map(item => tbRenderBrowseCard(item)).join("")}
    <div style="text-align:center;margin-top:18px">
      <button onclick="tbClearFavs()" style="background:rgba(220,38,38,.15);border:1px solid rgba(220,38,38,.4);color:#f87171;padding:8px 16px;border-radius:8px;font-size:11px;cursor:pointer;font-family:inherit">🗑 Clear All</button>
    </div>
  `;
}

function tbToggleFav(id){
  const i = TB_state.favorites.indexOf(id);
  if (i >= 0) TB_state.favorites.splice(i, 1);
  else        TB_state.favorites.push(id);
  tbSaveFavs();
  tbRender();
}
function tbClearFavs(){
  if (!confirm("Clear all favorites?")) return;
  TB_state.favorites = [];
  tbSaveFavs();
  tbRender();
}
