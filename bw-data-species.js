/* Bluewater Intel — data module: Species list + prediction preferences/weights
 * Extracted from index.html (Approach A modularization). Loaded as a plain
 * classic <script src> before the main app script, so these top-level
 * const declarations remain global and file:// offline still works.
 * DO NOT convert to an ES module (breaks file:// via CORS). */

const SPECIES=[
  {id:"all",         name:"All Species",    color:"#888",   cat:"all"},
  {id:"bluemarlin",  name:"Blue Marlin",    color:"#1a4e8a",cat:"offshore"},
  {id:"whitemarlin", name:"White Marlin",   color:"#2979b5",cat:"offshore"},
  {id:"spearfish",   name:"Longbill Spearfish",color:"#4a90c8",cat:"offshore"},
  {id:"sailfish",    name:"Sailfish",       color:"#5b4fcf",cat:"offshore"},
  {id:"swordfish",   name:"Swordfish",      color:"#7c2d8e",cat:"offshore"},
  {id:"yellowfin",   name:"Yellowfin Tuna", color:"#c47a0a",cat:"offshore"},
  {id:"bigeye",      name:"Bigeye Tuna",    color:"#1a3060",cat:"offshore"},
  {id:"bluefin",     name:"Bluefin Tuna",   color:"#0d6ea8",cat:"offshore"},
  {id:"blackfin",    name:"Blackfin Tuna",  color:"#1a6b55",cat:"offshore"},
  {id:"falsealbacore",name:"False Albacore", color:"#3a8fa0",cat:"nearshore"},
  {id:"skipjack",    name:"Skipjack Tuna",  color:"#0a8a6e",cat:"offshore"},
  {id:"wahoo",       name:"Wahoo",          color:"#c84a10",cat:"offshore"},
  {id:"mahi",        name:"Mahi Mahi",      color:"#0f7a50",cat:"offshore"},
  {id:"cobia",       name:"Cobia",          color:"#8b5e1a",cat:"nearshore"},
  {id:"tilefish",    name:"Golden Tilefish", color:"#a83010",cat:"offshore"},
  {id:"bluelinetile",name:"Blueline Tilefish",color:"#3a6080",cat:"offshore"},
  {id:"redfish",     name:"Redfish",        color:"#b91414",cat:"inshore"},
  {id:"flounder",    name:"Flounder",       color:"#4d8a0a",cat:"inshore"},
  {id:"blackseabass",name:"Black Sea Bass", color:"#2d2fa8",cat:"nearshore"},
  {id:"sheepshead",  name:"Sheepshead",     color:"#5c1e8e",cat:"inshore"},
  {id:"spadefish",   name:"Spadefish",      color:"#3a5a7c",cat:"nearshore"},
  {id:"speckledtrout",name:"Speckled Trout", color:"#7a9a4a",cat:"inshore"},
  {id:"croaker",     name:"Atlantic Croaker", color:"#b89868",cat:"inshore"},
  {id:"spanishmack", name:"Spanish Mackerel", color:"#3a8a4a",cat:"nearshore"},
  {id:"kingmack",    name:"King Mackerel",   color:"#1a5878",cat:"nearshore"},
  {id:"triggerfish", name:"Triggerfish",     color:"#6a4a7a",cat:"nearshore"},
  {id:"tautog",      name:"Tautog",         color:"#0a5c8a",cat:"nearshore"},
  {id:"grouper",     name:"Grouper",        color:"#4a4038",cat:"nearshore"},
  {id:"snapper",     name:"Red Snapper",    color:"#991010",cat:"nearshore"},
  // ── NEW ENGLAND / NORTHEAST SPECIES ─────────────────────────────────
  {id:"striper",     name:"Striped Bass",   color:"#4a7a3a",cat:"inshore"},
  {id:"bluefish",    name:"Bluefish",       color:"#3a5878",cat:"inshore"},
  {id:"cod",         name:"Atlantic Cod",   color:"#6a5440",cat:"nearshore"},
  {id:"haddock",     name:"Haddock",        color:"#8a7050",cat:"nearshore"},
  {id:"pollock",     name:"Pollock",        color:"#5a6048",cat:"nearshore"},
  {id:"bonito",      name:"Atlantic Bonito",color:"#2a7080",cat:"nearshore"},
  // ── FLORIDA / TROPICAL SPECIES ──────────────────────────────────────
  {id:"tarpon",      name:"Tarpon",         color:"#a8a8a8",cat:"inshore"},
  {id:"snook",       name:"Snook",          color:"#9a8a4a",cat:"inshore"},
  {id:"bonefish",    name:"Bonefish",       color:"#88a8c4",cat:"inshore"},
  {id:"permit",      name:"Permit",         color:"#b8b890",cat:"inshore"},
  {id:"ceromack",    name:"Cero Mackerel",  color:"#5a8a3a",cat:"nearshore"},
  {id:"hogfish",     name:"Hogfish",        color:"#c44a4a",cat:"nearshore"},
  {id:"muttonsnap",  name:"Mutton Snapper", color:"#7a1a40",cat:"nearshore"},
  // ── GULF COAST SPECIES ──────────────────────────────────────────────
  {id:"gaggrouper",  name:"Gag Grouper",    color:"#403828",cat:"nearshore"},
  {id:"amberjack",   name:"Greater Amberjack",color:"#a8771a",cat:"nearshore"},
  {id:"tripletail",  name:"Tripletail",     color:"#6a5a3a",cat:"nearshore"},
  {id:"pompano",     name:"Florida Pompano",color:"#c4b078",cat:"inshore"},
  {id:"vermilion",   name:"Vermilion Snapper",color:"#c43030",cat:"nearshore"},
  {id:"lanesnap",    name:"Lane Snapper",   color:"#b04848",cat:"nearshore"},
  {id:"yellowtail",  name:"Yellowtail Snapper",color:"#e8b820",cat:"nearshore"},
  // ── PACIFIC / SOUTHERN CALIFORNIA SPECIES ───────────────────────────
  {id:"cayellowtail",name:"California Yellowtail",color:"#d9a520",cat:"nearshore"}];

const PREDICT_SPECIES_PREFS = {
  // Blue marlin band starts at 150 m (≈80 fathoms): a large share of Atlantic
  // blues are raised right on the 100-fathom line and canyon lips (150–275 m),
  // not only over 200 m+ deep water. Starting at 200 m made the exact edge these
  // are trolled on read "poor." The blue-water gate still requires real depth.
  bluemarlin:   {tempIdeal:[76,84], tempWorking:[72,86], chlorPref:"low",     depthBands:[[150,1500]], breakPref:"edge"  },
  // White marlin — shelf-edge (100 m) out over deep canyon/abyssal water. Upper
  // bound extended 800→2000 m: white marlin roam deep blue water on the break,
  // and the new bottom-structure factor (not a hard depth cap) now handles
  // "featureless deep vs real canyon feature," so the cap no longer needs to.
  whitemarlin:  {tempIdeal:[72,80], tempWorking:[68,82], chlorPref:"low",     depthBands:[[100,2000]], breakPref:"edge"  },
  // Spearfish band starts at 150 m (≈80 fathoms): longbills are a true blue-water
  // fish but are routinely raised in Mid-Atlantic white-marlin spreads right on
  // the 100-fathom line — starting at 300 m scored those grounds ~0%.
  spearfish:    {tempIdeal:[74,82], tempWorking:[70,84], chlorPref:"low",     depthBands:[[150,2000]], breakPref:"edge"  },
  sailfish:     {tempIdeal:[74,82], tempWorking:[70,84], chlorPref:"low",     depthBands:[[50,500]],   breakPref:"edge"  },
  // Swordfish night fishery works the canyon lip at ~1,000 ft (≈300 m); daytime
  // drops go deeper. Lower bound 250 m (was 300) so the classic canyon-edge bite
  // isn't scored as out-of-band.
  swordfish:    {tempIdeal:[64,72], tempWorking:[58,76], chlorPref:"any",     depthBands:[[250,2000]], breakPref:"any"  },
  // Yellowfin — deep-water. Lower bound 150 m is the key guard: the old [40,300]
  // band let shallow shelf cells near VA Beach (108 ft / 33m) score "ideal,"
  // which was wrong (real yellowfin are 80+ fathom fish, ≥150 m). Upper bound
  // extended 800→2000 m: canyon yellowfin routinely hold over 1,000 m+ water on
  // the break, and the bottom-structure factor now separates a real canyon
  // feature from flat abyssal plain — so the cap no longer has to.
  yellowfin:    {tempIdeal:[70,78], tempWorking:[66,82], chlorPref:"edge",    depthBands:[[150,2000]], breakPref:"edge"  },
  // Bluefin — multimodal. NC fall blitz happens in 18-35m (60-115 ft)
  // close to the beach; Mid-Atlantic schoolies hunt the 60-180m shelf
  // break in summer; canyon giants come up over 200-600m water.
  // Three bands so the species shows reasonable scores in all three
  // contexts depending on where you're fishing.
  bluefin:      {tempIdeal:[58,68], tempWorking:[52,72], chlorPref:"edge",    depthBands:[[18,40],[60,180],[200,600]], breakPref:"any"},
  blackfin:     {tempIdeal:[72,80], tempWorking:[68,82], chlorPref:"edge",    depthBands:[[60,400]],   breakPref:"edge" },
  falsealbacore:{tempIdeal:[69,74], tempWorking:[66,78], chlorPref:"edge",    depthBands:[[10,120]],   breakPref:"any"  },
  skipjack:     {tempIdeal:[76,82], tempWorking:[72,86], chlorPref:"edge",    depthBands:[[50,600]],   breakPref:"edge" },
  // Wahoo — shelf edge (60 m) and deep drop-offs. Upper bound extended
  // 500→1500 m: wahoo are high-speed trolled along the break AND over deep water
  // near banks/canyons (e.g. Bahamas walls, canyon lips), so 500 m was clipping
  // legitimate deep grounds. Structure factor handles concentration.
  wahoo:        {tempIdeal:[72,82], tempWorking:[68,84], chlorPref:"low",     depthBands:[[60,1500]],  breakPref:"edge"  },
  // Mahi — happy chasing weed lines from canyon water inshore to the
  // shelf edge. Two bands: ride-along on Gulf Stream (deep) + shelf
  // weed-line patches (shallower).
  mahi:         {tempIdeal:[74,82], tempWorking:[70,84], chlorPref:"edge",    depthBands:[[30,150],[200,1000]], breakPref:"any"},
  cobia:        {tempIdeal:[68,78], tempWorking:[64,82], chlorPref:"high",    salinityPref:"high", depthBands:[[2,40]],     breakPref:"stable", warmAdapted:true },
  redfish:      {tempIdeal:[62,78], tempWorking:[58,84], chlorPref:"high",    depthBands:[[1,15]],     breakPref:"stable"},
  flounder:     {tempIdeal:[60,72], tempWorking:[55,76], chlorPref:"high",    depthBands:[[2,80]],     breakPref:"stable", demersal:true },
  blackseabass: {tempIdeal:[58,72], tempWorking:[52,76], chlorPref:"high",    depthBands:[[15,200]],   breakPref:"stable", demersal:true },
  tautog:       {tempIdeal:[44,58], tempWorking:[40,62], chlorPref:"high",    depthBands:[[10,80]],    breakPref:"stable", demersal:true },
  // Golden tilefish — two fisheries, not canyon-gated. Mid-Atlantic canyon mud
  // (MAFMC 250-450 ft ≈ 75-140 m) and a deeper shelf-edge / Gulf band (~575-1,380 ft
  // ≈ 175-420 m). The old [[150,500]] floor (~492 ft) zeroed classic canyon mud and
  // most shelf ledges via the steep shallow-side decay.
  tilefish:     {tempIdeal:[48,60], tempWorking:[42,64], chlorPref:"any",     depthBands:[[75,140],[175,420]], breakPref:"any", bottom:true },
  snapper:      {tempIdeal:[68,78], tempWorking:[62,82], chlorPref:"any",     depthBands:[[20,100]],   breakPref:"any", demersal:true },
  grouper:      {tempIdeal:[64,76], tempWorking:[58,80], chlorPref:"any",     depthBands:[[30,200]],   breakPref:"any", demersal:true },
  sheepshead:   {tempIdeal:[60,76], tempWorking:[55,82], chlorPref:"high",    depthBands:[[2,30]],     breakPref:"stable"},
  // ── NEW ENGLAND / NORTHEAST SPECIES ───────────────────────────────────
  // Striper — also multimodal. Surf + back-bay (shallow) AND offshore
  // bunker schools (40-80m) in summer/fall.
  striper:      {tempIdeal:[55,68], tempWorking:[48,72], chlorPref:"high",    salinityPref:"moderate", depthBands:[[1,15],[20,80]], breakPref:"stable"},
  cod:          {tempIdeal:[40,52], tempWorking:[36,58], chlorPref:"high",    depthBands:[[50,300]],   breakPref:"stable", demersal:true },
  haddock:      {tempIdeal:[42,52], tempWorking:[38,58], chlorPref:"high",    depthBands:[[60,250]],   breakPref:"stable", demersal:true },
  pollock:      {tempIdeal:[44,54], tempWorking:[40,60], chlorPref:"high",    depthBands:[[80,300]],   breakPref:"stable", demersal:true },
  bonito:       {tempIdeal:[64,72], tempWorking:[60,76], chlorPref:"edge",    depthBands:[[10,80]],    breakPref:"any"  },
  bluefish:     {tempIdeal:[60,72], tempWorking:[55,78], chlorPref:"high",    salinityPref:"moderate", depthBands:[[1,60]],     breakPref:"stable"},
  // Bigeye band starts at 180 m (100-fathom line): Mid-Atlantic/canyon bigeye
  // are worked on the shelf-edge lip and canyon walls at dawn/dusk, not only in
  // 300 m+ water. Starting at 300 m scored the 100-fathom troll at ~20%.
  bigeye:       {tempIdeal:[64,74], tempWorking:[58,78], chlorPref:"low",     depthBands:[[180,2000]], breakPref:"edge"  },
  // ── INSHORE / NEARSHORE EAST COAST ─────────────────────────────────────
  speckledtrout:{tempIdeal:[62,75], tempWorking:[55,82], chlorPref:"high",    salinityPref:"moderate", depthBands:[[2,20]],     breakPref:"stable"},
  spadefish:    {tempIdeal:[70,80], tempWorking:[66,84], chlorPref:"any",     depthBands:[[6,80]],     breakPref:"any"  },
  croaker:      {tempIdeal:[60,75], tempWorking:[55,82], chlorPref:"high",    depthBands:[[2,60]],     breakPref:"stable"},
  spanishmack:  {tempIdeal:[68,80], tempWorking:[62,84], chlorPref:"edge",    depthBands:[[5,40]],     breakPref:"any", warmAdapted:true },
  kingmack:     {tempIdeal:[70,82], tempWorking:[66,85], chlorPref:"edge",    depthBands:[[15,80]],    breakPref:"any", warmAdapted:true },
  triggerfish:  {tempIdeal:[68,80], tempWorking:[64,84], chlorPref:"any",     depthBands:[[20,80]],    breakPref:"any", demersal:true },
  // ── FLORIDA / TROPICAL SPECIES ──────────────────────────────────────────
  tarpon:       {tempIdeal:[72,84], tempWorking:[68,88], chlorPref:"high",    salinityPref:"moderate", depthBands:[[3,40]],     breakPref:"stable"},
  snook:        {tempIdeal:[70,84], tempWorking:[64,88], chlorPref:"high",    salinityPref:"moderate", depthBands:[[2,30]],     breakPref:"stable"},
  bonefish:     {tempIdeal:[74,84], tempWorking:[70,88], chlorPref:"high",    depthBands:[[1,6]],      breakPref:"stable"},
  permit:       {tempIdeal:[74,84], tempWorking:[70,88], chlorPref:"high",    depthBands:[[2,80]],     breakPref:"stable"},
  ceromack:     {tempIdeal:[72,82], tempWorking:[68,86], chlorPref:"edge",    depthBands:[[10,80]],    breakPref:"any", warmAdapted:true },
  hogfish:      {tempIdeal:[70,80], tempWorking:[66,84], chlorPref:"any",     depthBands:[[10,40]],    breakPref:"any", demersal:true },
  muttonsnap:   {tempIdeal:[72,82], tempWorking:[68,86], chlorPref:"any",     depthBands:[[20,80]],    breakPref:"any", demersal:true },
  // ── GULF COAST + DEEP REEF SPECIES ─────────────────────────────────
  // Blueline tilefish — hard-bottom ledges ~240-820 ft (70-250 m). Canyons are hot
  // spots but not required; the old [[120,700]] floor (~394 ft) kept 300-400 ft
  // shelf ledges cold on the bite map.
  bluelinetile: {tempIdeal:[55,68], tempWorking:[50,72], chlorPref:"any",     depthBands:[[70,250]],  breakPref:"any", bottom:true },
  gaggrouper:   {tempIdeal:[66,76], tempWorking:[60,82], chlorPref:"any",     depthBands:[[20,150]],   breakPref:"any", demersal:true },
  amberjack:    {tempIdeal:[68,80], tempWorking:[64,84], chlorPref:"any",     depthBands:[[20,100]],   breakPref:"any", demersal:true },
  tripletail:   {tempIdeal:[72,84], tempWorking:[68,88], chlorPref:"any",     depthBands:[[2,40]],     breakPref:"any"  },
  pompano:      {tempIdeal:[68,78], tempWorking:[62,82], chlorPref:"any",     depthBands:[[2,15]],     breakPref:"stable"},
  // Vermilion (beeliner): a warm-temperate hard-bottom snapper caught on ledges
  // in ~100-350 ft (30-107m) — NOT the old 50-200m band, whose 50m (164 ft) floor
  // zeroed the depth score across the shallow shelf where most vermilion are
  // caught (the ÷12 shallow-decay nukes anything >12m under the band). Temp range
  // widened to reflect that they hold on warm summer shelf bottoms (upper 70s-low
  // 80s°F) as readily as cooler deep water, so the bottom-temp model no longer
  // penalizes their prime Gulf grounds. This is what kept Gulf vermilion dark.
  vermilion:    {tempIdeal:[66,82], tempWorking:[60,85], chlorPref:"any",     depthBands:[[30,120]],   breakPref:"any", demersal:true },
  lanesnap:     {tempIdeal:[70,82], tempWorking:[66,86], chlorPref:"any",     depthBands:[[20,80]],    breakPref:"any", demersal:true },
  yellowtail:   {tempIdeal:[74,84], tempWorking:[68,86], chlorPref:"low",     depthBands:[[10,40]],    breakPref:"any", demersal:true },
  // ── PACIFIC / SOUTHERN CALIFORNIA ───────────────────────────────────
  // California yellowtail (Seriola lalandi) — a structure-oriented pelagic jack
  // that stacks on offshore banks, hard bottom, kelp edges and paddies from the
  // Coronados/San Diego up the SoCal bight. Cool-temperate range (upper 50s-low
  // 70s°F), roaming (not strictly demersal) so it scores over banks and the
  // shelf edge, not just the bottom.
  cayellowtail: {tempIdeal:[63,71], tempWorking:[58,74], chlorPref:"edge",    depthBands:[[6,90]],     breakPref:"any" },
};

const MIGRATION_PHASE = {
  // ── HIGHLY MIGRATORY PELAGICS (fast north-south following SST) ───────
  bluefin:      {refLat: 39, latPhase: 0.25},  // Conservative — bluefin baseline data already
                                                 // encodes both NC winter & Cape Cod summer peaks,
                                                 // so we apply only a mild shift to avoid overshoot.
  yellowfin:    {refLat: 36, latPhase: 0.50},
  bigeye:       {refLat: 36, latPhase: 0.50},
  blackfin:     {refLat: 32, latPhase: 0.45},
  bluemarlin:   {refLat: 33, latPhase: 0.50},
  whitemarlin:  {refLat: 35, latPhase: 0.40},
  sailfish:     {refLat: 30, latPhase: 0.40},
  mahi:         {refLat: 33, latPhase: 0.50},
  wahoo:        {refLat: 30, latPhase: 0.40},
  // ── COASTAL MIGRATORS (spring north / fall south) ────────────────────
  // NOTE: striper, bluefish, cobia, tarpon, king/Spanish mackerel, bonito,
  // false albacore, snook, redfish, speckledtrout, bonefish, permit,
  // cayellowtail, spearfish, swordfish, skipjack, snapper, gaggrouper, vermilion,
  // amberjack, blackseabass, spadefish, triggerfish, sheepshead, grouper, hogfish,
  // muttonsnap, lanesnap, yellowtail, pompano, tripletail, ceromack, and tautog now use
  // explicit REGIONAL_SEASONS tables (below), which bypass this latitude-shift
  // entirely. Entries kept here only for species WITHOUT a regional table take
  // effect.
  striper:      {refLat: 38, latPhase: 0.30},
  bluefish:     {refLat: 36, latPhase: 0.30},
  cobia:        {refLat: 32, latPhase: 0.30},
  tarpon:       {refLat: 27, latPhase: 0.30},
  // ── NORTHERN RESIDENTS (minimal migration; small but nonzero shift) ──
  cod:          {refLat: 42, latPhase: 0.10},
  haddock:      {refLat: 42, latPhase: 0.10},
  pollock:      {refLat: 42, latPhase: 0.10},
  // ── RESIDENTS (no significant latitudinal migration) ─────────────────
  // Anything not listed here defaults to latPhase: 0 — including all the
  // inshore tropical residents (snook, redfish, flounder, snapper, grouper,
  // bonefish, permit, cod, haddock, pollock, tilefish, bluelinetile,
  // croaker, etc.).
};

const REGIONAL_SEASONS = {
  // ── STRIPER ──────────────────────────────────────────────────────────
  // Three distinct fisheries: NC/VA winter trophy run, Mid-Atlantic spring/
  // fall, New England summer. Winter peak in the south, summer peak in
  // the north — opposite seasons same coast.
  striper: [
    {centerLat: 35.5, centerLng: -75.5, radiusNm: 180, label: "OBX/NC trophy run",
     // Big cows leaving Chesapeake head south Nov-Feb. Spring run pushing
     // back north Mar-Apr. Off May-Oct (fish are way north).
     seasons:{Jan:3,Feb:3,Mar:2,Apr:1,May:0,Jun:0,Jul:0,Aug:0,Sep:0,Oct:1,Nov:2,Dec:3}},
    {centerLat: 37.0, centerLng: -76.0, radiusNm: 150, label: "Chesapeake/VA Beach",
     // Bay anglers know it: spring run Apr-Jun, fall run Sep-Dec, summer
     // is hot and the fish are deep or up the bay.
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 40.0, centerLng: -73.5, radiusNm: 200, label: "Mid-Atlantic NJ/NY",
     // Spring run May-Jun arrival from south, fall run Oct-Nov departure.
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:3,Jun:3,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:1}},
    {centerLat: 41.8, centerLng: -70.7, radiusNm: 200, label: "New England summer",
     // Cape Cod, Block Island, MA: peak Jun-Sep, off Nov-Apr (fish gone south).
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
  ],

  // ── BLUEFIN TUNA ─────────────────────────────────────────────────────
  // Two huge fisheries, completely different seasons. NC winter giants
  // Dec-Mar (Hatteras/Diamond Shoals); New England summer Jun-Oct
  // (Stellwagen, Cape Cod Bay, Jeffrey's Ledge).
  bluefin: [
    {centerLat: 35.3, centerLng: -75.0, radiusNm: 180, label: "Hatteras winter giants",
     seasons:{Jan:3,Feb:3,Mar:2,Apr:1,May:0,Jun:0,Jul:0,Aug:0,Sep:0,Oct:1,Nov:2,Dec:3}},
    {centerLat: 38.5, centerLng: -73.8, radiusNm: 150, label: "Mid-Atlantic schoolies",
     // Smaller fishery, transitional schoolies Jul-Sep
     seasons:{Jan:1,Feb:1,Mar:1,Apr:1,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 42.3, centerLng: -70.0, radiusNm: 220, label: "New England summer giants",
     // Stellwagen, Cape Cod Bay, Jeffrey's Ledge — Jun-Oct prime
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:0}},
    {centerLat: 28.5, centerLng: -88.5, radiusNm: 200, label: "Gulf spawning",
     // Mississippi/Desoto Canyons, East Breaks — spring spawning Apr-Jun
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:1,Aug:0,Sep:0,Oct:0,Nov:0,Dec:1}},
    // ── PACIFIC — Southern California ──────────────────────────────────
    // The modern SoCal Pacific-bluefin fishery (San Diego/Coronados up through
    // the Channel Islands): building in late spring, prime summer through fall,
    // tapering in winter. Centered offshore of San Diego with a radius that
    // reaches the full CA port list. This region is ~2,000 nm from every
    // Atlantic/Gulf region, so it never affects East Coast/Gulf scoring.
    {centerLat: 32.8, centerLng: -118.5, radiusNm: 340, label: "Southern California",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:1,May:2,Jun:2,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
  ],

  // ── YELLOWFIN TUNA ─────────────────────────────────────────────────
  // Highly migratory — fisheries shift north with warming water. Hatteras/NC
  // peaks late spring–early summer; mid-summer (Jul–Aug) the better bite is
  // often off MD/DE/NJ canyons as fish push north and shelf water off Hatteras
  // warms. A secondary fall run sometimes revisits VA/NC (Sep–Oct).
  yellowfin: [
    {centerLat: 35.0, centerLng: -75.0, radiusNm: 120, label: "Hatteras/OBX Gulf Stream edge",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:3,May:3,Jun:3,Jul:1,Aug:1,Sep:2,Oct:3,Nov:2,Dec:0}},
    {centerLat: 38.5, centerLng: -73.5, radiusNm: 180, label: "Mid-Atlantic canyons (MD/DE/NJ)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 41.5, centerLng: -69.5, radiusNm: 220, label: "New England canyon grounds",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 33.0, centerLng: -77.5, radiusNm: 160, label: "Carolinas shelf/Stream",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 26.5, centerLng: -79.5, radiusNm: 170, label: "SE FL / Keys",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 28.0, centerLng: -88.0, radiusNm: 260, label: "Gulf of Mexico",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    // ── PACIFIC — Southern California ──────────────────────────────────
    // SoCal yellowfin (San Diego banks up through the bight): a warm-season
    // fishery building in summer, best mid-summer through fall, gone in winter.
    // Without this region the out-of-range guard would suppress every CA cell.
    {centerLat: 32.8, centerLng: -118.5, radiusNm: 340, label: "Southern California",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
  ],

  // ── BLACKFIN TUNA ────────────────────────────────────────────────────
  // A WARM-WATER, Gulf-Stream species. Genuinely abundant only along the
  // SE US (Cape Hatteras south) and through FL/Gulf, where the Stream runs
  // close to the shelf. North of Hatteras they thin out fast and are a rare
  // stray off VA/the Mid-Atlantic — and essentially never on the inner shelf.
  // Regions below deliberately give NO coverage to the Chesapeake/VA Beach
  // nearshore zone, so the season gate suppresses the inshore red bloom seen
  // there. (A blackfin off VA Beach in July is not a real fishery.)
  blackfin: [
    {centerLat: 35.0, centerLng: -75.0, radiusNm: 70, label: "Outer Banks (Hatteras) edge",
     // Reliable along the OBX Gulf-Stream edge, warm months best; tight radius
     // keeps influence on the Hatteras Stream and OFF the VA inner shelf.
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 33.5, centerLng: -77.0, radiusNm: 160, label: "Carolinas Gulf Stream",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
    {centerLat: 30.5, centerLng: -80.0, radiusNm: 180, label: "GA/N. FL Stream",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 26.5, centerLng: -79.8, radiusNm: 170, label: "SE FL / Keys",
     // Closest blue water on the coast — year-round, winter peak.
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:3,Dec:3}},
    {centerLat: 28.0, centerLng: -88.0, radiusNm: 260, label: "Gulf of Mexico",
     // Rigs/canyons — year-round resident, warm-season best.
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:2,Dec:2}},
  ],

  // ── BLUELINE TILEFISH ────────────────────────────────────────────────
  // Mid-Atlantic shelf winter/spring staple (Norfolk/Hatteras ledges); Gulf
  // hard-bottom a longer season. Without this table July cells used the generic
  // peak curve and overstated a summer blueline bite off VA/NC.
  bluelinetile: [
    {centerLat: 36.5, centerLng: -75.5, radiusNm: 130, label: "Mid-Atlantic shelf (VA/NC)",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:1,Jul:1,Aug:1,Sep:1,Oct:2,Nov:3,Dec:3}},
    {centerLat: 28.5, centerLng: -88.5, radiusNm: 220, label: "Gulf deep ledges",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:2}},
  ],

  // ── BLUEFISH ─────────────────────────────────────────────────────────
  // Spring/fall blitz pattern in mid-Atlantic; summer resident in NE.
  bluefish: [
    {centerLat: 36.0, centerLng: -75.5, radiusNm: 180, label: "NC/VA spring & fall",
     // Spring run Apr-May, summer offshore, fall run Sep-Nov
     seasons:{Jan:0,Feb:0,Mar:1,Apr:3,May:3,Jun:1,Jul:1,Aug:1,Sep:3,Oct:3,Nov:2,Dec:0}},
    {centerLat: 39.5, centerLng: -74.0, radiusNm: 180, label: "Mid-Atlantic NJ/DE",
     // Spring/fall runs more pronounced than summer
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 41.8, centerLng: -70.7, radiusNm: 200, label: "New England summer",
     // Resident summer blues Jun-Sep peak
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
  ],

  // ── COBIA ────────────────────────────────────────────────────────────
  // Famous Chesapeake Bay run May-Sep; spread fishery in NC; Gulf resident.
  cobia: [
    {centerLat: 37.0, centerLng: -76.0, radiusNm: 130, label: "Chesapeake Bay run",
     // CBBT, mouth of bay — peak May-Aug, off Nov-Apr (fish gone south)
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 39.2, centerLng: -74.4, radiusNm: 140, label: "DelMarVa/NJ summer",
     // Summer push up the coast to Delaware Bay and the NJ shore
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 36.0, centerLng: -75.9, radiusNm: 90, label: "Albemarle/Outer Banks sounds",
     // Summer fish in Albemarle/Pamlico sounds + Oregon Inlet
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 34.5, centerLng: -76.5, radiusNm: 180, label: "NC/SC coast",
     // Year-round-ish with spring/summer peak
     seasons:{Jan:0,Feb:0,Mar:1,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 30.0, centerLng: -81.5, radiusNm: 200, label: "FL/GA Atlantic",
     // Longer season, peak Apr-Jul
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:2,Sep:2,Oct:2,Nov:1,Dec:1}},
    {centerLat: 25.8, centerLng: -80.3, radiusNm: 190, label: "South FL / Keys",
     // Wintering/migrating fish — cooler-season presence, spring push north.
     seasons:{Jan:2,Feb:3,Mar:3,Apr:3,May:2,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:2,Dec:2}},
    {centerLat: 27.5, centerLng: -83.0, radiusNm: 180, label: "Gulf FL west coast",
     // FL Gulf coast run — spring peak, present into fall.
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:1,Nov:1,Dec:1}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf (Panhandle/LA)",
     // Gulf cobia: spring/summer peak
     seasons:{Jan:0,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:2,Sep:2,Oct:1,Nov:1,Dec:0}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     // Texas "ling" run — spring peak Mar-May, tapering through summer.
     seasons:{Jan:0,Feb:1,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
  ],

  // ── TARPON ───────────────────────────────────────────────────────────
  // Boca Grande spring/early-summer peak; Gulf coast slightly later;
  // GA/SC summer push (stragglers).
  tarpon: [
    {centerLat: 25.5, centerLng: -80.5, radiusNm: 150, label: "South FL/Keys",
     // Migration through Florida Bay, Keys — peak Mar-Jun
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:2,Aug:1,Sep:1,Oct:1,Nov:1,Dec:1}},
    {centerLat: 27.0, centerLng: -82.5, radiusNm: 150, label: "Gulf FL Boca Grande",
     // The famous Boca Grande Pass tarpon fishery — peak May-Jul
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:2,Sep:1,Oct:1,Nov:1,Dec:1}},
    {centerLat: 29.5, centerLng: -84.0, radiusNm: 180, label: "FL Panhandle/Gulf",
     // Panhandle tarpon: peak Jun-Aug
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 31.5, centerLng: -81.0, radiusNm: 200, label: "GA/SC summer push",
     // Northern stragglers — peak Jun-Aug, short season
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
  ],

  // ── SAILFISH ───────────────────────────────────────────────────────────
  // The textbook "blanket seasons fail" species: SE Florida / the Keys are a
  // famous WINTER fishery (the "Sailfish Capital" run peaks Dec–Mar), while off
  // NC (Oregon Inlet/Hatteras) and the Mid-Atlantic sailfish are a SUMMER–FALL
  // Gulf Stream fishery (Jul–Oct). A single national curve + latitude shift
  // can't hold two opposite peaks on one coast, so we map each region directly.
  sailfish: [
    {centerLat: 40.5, centerLng: -70.0, radiusNm: 230, label: "New England canyons (rare)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:0,Jul:1,Aug:1,Sep:1,Oct:0,Nov:0,Dec:0}},
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 200, label: "Mid-Atlantic canyons (MD/DE/NJ)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:1,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 36.5, centerLng: -74.7, radiusNm: 130, label: "Virginia/Norfolk Canyon",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:2,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 35.0, centerLng: -75.0, radiusNm: 150, label: "NC / OBX Gulf Stream",
     // Summer–fall run — the strong Oregon Inlet/Hatteras bite, good numbers Jul.
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 200, label: "Carolinas Gulf Stream",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:1,May:2,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 30.5, centerLng: -80.0, radiusNm: 180, label: "GA / NE Florida",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 28.2, centerLng: -80.2, radiusNm: 130, label: "Central FL Atlantic (Canaveral)",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:2}},
    {centerLat: 26.3, centerLng: -79.9, radiusNm: 170, label: "SE FL (Stuart/Palm Beach/Miami)",
     // The classic winter sailfish run — peak Dec–Mar on north cold fronts.
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:1,Jun:1,Jul:1,Aug:1,Sep:2,Oct:2,Nov:3,Dec:3}},
    {centerLat: 24.6, centerLng: -81.4, radiusNm: 150, label: "Florida Keys",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:1,Jul:1,Aug:1,Sep:1,Oct:2,Nov:2,Dec:3}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:2,Jun:1,Jul:1,Aug:1,Sep:1,Oct:2,Nov:2,Dec:3}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
  ],

  // ── BLUE MARLIN ────────────────────────────────────────────────────────
  // Warm-season Gulf Stream/blue-water fishery up the whole Atlantic shelf edge
  // (Jun–Sep, earlier and longer the farther south); Bahamas spring peak; Gulf
  // Jun–Aug. Off NC (Oregon Inlet) the big-blue bite runs late spring–summer.
  bluemarlin: [
    {centerLat: 40.5, centerLng: -70.0, radiusNm: 230, label: "New England canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 200, label: "Mid-Atlantic canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 35.5, centerLng: -74.8, radiusNm: 170, label: "NC / OBX (Oregon Inlet)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 200, label: "Carolinas Gulf Stream",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:1,Dec:0}},
    {centerLat: 30.5, centerLng: -80.0, radiusNm: 180, label: "GA / NE Florida",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 27.5, centerLng: -79.9, radiusNm: 180, label: "SE FL / Central FL",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:1}},
    {centerLat: 24.8, centerLng: -80.8, radiusNm: 160, label: "Florida Keys",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:1,Oct:1,Nov:1,Dec:1}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 180, label: "Bahamas (spring peak)",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:1,Oct:1,Nov:1,Dec:1}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
  ],

  // ── WHITE MARLIN ───────────────────────────────────────────────────────
  // Mid-Atlantic canyons (Ocean City "White Marlin Capital") peak Jul–Sep; NC
  // and Carolinas summer; Gulf Jul–Sep. Concentrated warm-season shelf-edge fish.
  whitemarlin: [
    {centerLat: 40.5, centerLng: -70.0, radiusNm: 230, label: "New England canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 200, label: "Mid-Atlantic canyons (Ocean City)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:1,Nov:0,Dec:0}},
    {centerLat: 35.5, centerLng: -74.8, radiusNm: 170, label: "NC / OBX",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 200, label: "Carolinas Gulf Stream",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:2,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 30.0, centerLng: -80.0, radiusNm: 200, label: "GA / FL Atlantic",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:1,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:1,Nov:1,Dec:0}},
    {centerLat: 26.0, centerLng: -78.5, radiusNm: 200, label: "SE FL / Bahamas",
     seasons:{Jan:0,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:1,Oct:1,Nov:0,Dec:0}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
  ],

  // ── MAHI (DOLPHINFISH) ─────────────────────────────────────────────────
  // NC/Mid-Atlantic late-spring–summer (peak May–Jul off NC); FL spring peak
  // and near year-round in the south; NE mid-summer; Gulf spring–fall; plus a
  // SoCal (dorado) summer/fall paddy fishery that MUST be covered or the
  // out-of-range guard would suppress every California cell.
  mahi: [
    {centerLat: 40.5, centerLng: -70.0, radiusNm: 230, label: "New England canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 200, label: "Mid-Atlantic canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:3,Jul:3,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 35.3, centerLng: -75.0, radiusNm: 160, label: "NC / OBX",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:3,Jun:3,Jul:3,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 200, label: "Carolinas",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:1,Nov:1,Dec:0}},
    {centerLat: 30.0, centerLng: -80.0, radiusNm: 200, label: "GA / NE Florida",
     seasons:{Jan:0,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 26.5, centerLng: -79.6, radiusNm: 180, label: "SE FL (spring peak)",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:1}},
    {centerLat: 24.6, centerLng: -81.2, radiusNm: 160, label: "Florida Keys",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:1,Sep:1,Oct:2,Nov:2,Dec:1}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 180, label: "Bahamas",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:1,Oct:2,Nov:1,Dec:1}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:0,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:2,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 32.8, centerLng: -118.5, radiusNm: 340, label: "Southern California (dorado)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
  ],

  // ── WAHOO ──────────────────────────────────────────────────────────────
  // Another south-vs-north season inversion: SE FL / Bahamas / Keys are a
  // WINTER fishery (Nov–Mar), while NC and the Mid-Atlantic peak in the FALL
  // (Sep–Nov). Gulf holds them year-round with a fall peak.
  wahoo: [
    {centerLat: 40.5, centerLng: -70.0, radiusNm: 230, label: "New England canyons (rare)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:0,Jul:1,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 200, label: "Mid-Atlantic canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:1,Jul:1,Aug:2,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 35.3, centerLng: -75.0, radiusNm: 160, label: "NC / OBX (fall peak)",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 200, label: "Carolinas Gulf Stream",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 30.0, centerLng: -80.0, radiusNm: 200, label: "GA / NE Florida",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 26.5, centerLng: -79.6, radiusNm: 180, label: "SE FL (winter peak)",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:3,Dec:3}},
    {centerLat: 24.6, centerLng: -81.2, radiusNm: 160, label: "Florida Keys",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:1,Sep:2,Oct:2,Nov:3,Dec:3}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 180, label: "Bahamas (winter peak)",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:3,Dec:3}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
  ],

  // ── BIGEYE TUNA ────────────────────────────────────────────────────────
  // A canyon dawn/dusk/night fishery. Mid-Atlantic and New England canyons are
  // the heart of it (peak Jun–Oct); present but thinner off NC and in the Gulf.
  // Not a shelf/Keys fishery, so those areas are intentionally left uncovered
  // (the out-of-range guard correctly suppresses them there).
  bigeye: [
    {centerLat: 40.5, centerLng: -70.0, radiusNm: 240, label: "New England canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 210, label: "Mid-Atlantic canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 35.5, centerLng: -74.8, radiusNm: 160, label: "NC / OBX canyons",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:1,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 190, label: "Carolinas Gulf Stream",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:1,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:0}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:2,Nov:1,Dec:1}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
  ],

  // ── KING MACKEREL ────────────────────────────────────────────────────────
  // A classic coastal migrator with OPPOSITE seasons by latitude: they WINTER
  // in South FL/Keys (Nov–Mar peak) and only push into the Carolinas/Mid-Atl
  // in summer (Jul–Oct). The Gulf runs spring & fall. The old latitude-shift
  // put a bogus January peak off Montauk, so this replaces it with real
  // regional timing. Kings essentially do not occur north of ~NJ, so New
  // England is intentionally uncovered (out-of-range guard suppresses it).
  kingmack: [
    {centerLat: 38.6, centerLng: -74.2, radiusNm: 170, label: "Mid-Atlantic (NJ/DE/MD)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 35.3, centerLng: -75.7, radiusNm: 160, label: "NC / OBX",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:0}},
    {centerLat: 32.2, centerLng: -79.9, radiusNm: 190, label: "SC / GA",
     seasons:{Jan:0,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 29.2, centerLng: -80.8, radiusNm: 160, label: "NE FL Atlantic",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:2,Jun:1,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 25.7, centerLng: -80.1, radiusNm: 190, label: "SE FL / Keys",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:2,Nov:3,Dec:3}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 190, label: "Gulf FL west coast",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 230, label: "N. Gulf (Panhandle/LA)",
     seasons:{Jan:0,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 27.6, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
  ],

  // ── SPANISH MACKEREL ───────────────────────────────────────────────────────
  // Warm-season migrator: arrives as inshore water warms through ~68–70°F and
  // leaves when it drops. Summer in the Mid-Atlantic/NC, spring–fall in the SE
  // and Gulf, and a winter fishery only in South FL. The latitude-shift wrongly
  // gave the Northeast a Nov/Dec peak (water is 50°F then); regional timing fixes it.
  spanishmack: [
    {centerLat: 38.8, centerLng: -74.2, radiusNm: 175, label: "Mid-Atlantic (NJ/DE/MD)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:1,Nov:0,Dec:0}},
    {centerLat: 35.3, centerLng: -75.7, radiusNm: 160, label: "NC / OBX",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 32.2, centerLng: -79.9, radiusNm: 190, label: "SC / GA",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 29.2, centerLng: -80.8, radiusNm: 160, label: "NE FL Atlantic",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 25.7, centerLng: -80.1, radiusNm: 190, label: "SE FL / Keys",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:2,Nov:3,Dec:3}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 190, label: "Gulf FL west coast",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 230, label: "N. Gulf (Panhandle/LA)",
     seasons:{Jan:0,Feb:0,Mar:2,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 27.6, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
  ],

  // ── ATLANTIC BONITO ────────────────────────────────────────────────────────
  // A temperate species — the real fishery is a late-summer/fall run in New
  // England and the Mid-Atlantic (Aug–Oct), tapering to a spring/fall shoulder
  // off NC/VA. They are rare south of Cape Hatteras and essentially absent in
  // the Gulf, so those areas are intentionally uncovered (the latitude-shift had
  // been inventing a bogus spring peak in the Keys and Gulf).
  bonito: [
    {centerLat: 41.2, centerLng: -70.6, radiusNm: 220, label: "New England",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 39.3, centerLng: -73.6, radiusNm: 200, label: "Mid-Atlantic (NY/NJ)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:1,Jul:2,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 36.3, centerLng: -75.4, radiusNm: 190, label: "NC / VA",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:2,Nov:1,Dec:0}},
  ],

  // ── FALSE ALBACORE (little tunny) ────────────────────────────────────────────
  // Famous as a FALL light-tackle run (Cape Lookout NC in Nov; NE Sep–Oct).
  // Present much of the year in the SE/FL and Gulf but best in the cooler
  // shoulders. The old latitude-shift peaked South FL in spring/summer, which is
  // backwards for the fishery.
  falsealbacore: [
    {centerLat: 41.2, centerLng: -70.8, radiusNm: 210, label: "New England",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:0,Jul:1,Aug:2,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 39.0, centerLng: -74.0, radiusNm: 190, label: "Mid-Atlantic (NY/NJ)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:1,Aug:2,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 34.6, centerLng: -76.4, radiusNm: 170, label: "NC (Cape Lookout)",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:1,May:1,Jun:1,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:1}},
    {centerLat: 32.0, centerLng: -79.9, radiusNm: 180, label: "SC / GA",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:2,Jun:2,Jul:1,Aug:1,Sep:2,Oct:3,Nov:2,Dec:1}},
    {centerLat: 26.8, centerLng: -80.0, radiusNm: 230, label: "FL Atlantic / Keys",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:2,May:2,Jun:1,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.8, centerLng: -84.0, radiusNm: 220, label: "Gulf FL west coast",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:2,May:2,Jun:1,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 28.5, centerLng: -91.0, radiusNm: 320, label: "N. Gulf (LA→TX)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:1}},
  ],

  // ── FLOUNDER (summer flounder north / southern flounder south) ───────────────
  // Modeled as "Summer Flounder (Fluke)" but the range spans two fisheries with
  // different timing. Fluke (Cape Cod→NC) is a summer open-water fishery
  // (May–Oct). Southern/Gulf flounder (SC→TX) peak in the FALL migration run
  // (Oct–Nov) — the single flat May–Oct curve wrongly zeroed out November on the
  // Gulf coast, which is prime flounder-gigging season there.
  flounder: [
    {centerLat: 40.2, centerLng: -72.5, radiusNm: 260, label: "NE / Mid-Atlantic (fluke)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 35.6, centerLng: -75.9, radiusNm: 160, label: "NC",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:0}},
    {centerLat: 31.5, centerLng: -80.6, radiusNm: 210, label: "SC / GA / NE FL",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 26.2, centerLng: -80.3, radiusNm: 200, label: "S FL / Keys",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:1,Jul:1,Aug:1,Sep:2,Oct:3,Nov:2,Dec:1}},
    {centerLat: 27.6, centerLng: -83.0, radiusNm: 190, label: "Gulf FL west coast",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 29.4, centerLng: -89.5, radiusNm: 250, label: "N. Gulf (Panhandle/LA)",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:1}},
  ],

  // ── SNOOK ────────────────────────────────────────────────────────────────
  // A subtropical inshore predator — essentially a Florida/Gulf fishery. Freeze
  // events keep resident fish south of ~Cape Canaveral; north of that is seasonal
  // push only. Without a regional map the generic year-round curve lit up snook
  // off New Jersey and Maine.
  snook: [
    {centerLat: 25.7, centerLng: -80.1, radiusNm: 200, label: "SE FL / Miami / Keys",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:2,Dec:2}},
    {centerLat: 27.2, centerLng: -80.2, radiusNm: 160, label: "Central FL Atlantic (Stuart–Canaveral)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 29.0, centerLng: -80.9, radiusNm: 150, label: "NE FL (Daytona–Jax)",
     // Seasonal visitors only — warm months; gone after hard freezes.
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 26.5, centerLng: -82.0, radiusNm: 170, label: "SW FL (Fort Myers–Naples)",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:2,Nov:2,Dec:2}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 120, label: "South TX (rare)",
     // Occasional Gulf snook strays — low abundance, warm months only.
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:2,Jul:2,Aug:2,Sep:1,Oct:0,Nov:0,Dec:0}},
  ],

  // ── REDFISH (RED DRUM) ───────────────────────────────────────────────────
  // Atlantic and Gulf inshore icon from NC sounds through Texas. Peak fall
  // bull-drum run (Sep–Nov); year-round in the warmest Gulf/FL zones.
  redfish: [
    {centerLat: 35.0, centerLng: -76.2, radiusNm: 160, label: "Pamlico / OBX sounds",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 36.8, centerLng: -76.0, radiusNm: 120, label: "VA Beach / Chesapeake mouth",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 32.7, centerLng: -79.9, radiusNm: 180, label: "SC / GA (Charleston)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 30.0, centerLng: -81.2, radiusNm: 160, label: "NE FL Atlantic",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf (LA/MS/AL)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
  ],

  // ── SPECKLED TROUT (SPOTTED SEATROUT) ────────────────────────────────────
  // Premier inshore fish from Chesapeake south through the Gulf. Spring and fall
  // peaks; summer doldrums in the hottest shallows.
  speckledtrout: [
    {centerLat: 36.9, centerLng: -76.0, radiusNm: 130, label: "VA Beach / Lynnhaven",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:0}},
    {centerLat: 35.2, centerLng: -75.8, radiusNm: 150, label: "NC sounds / OBX",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 32.7, centerLng: -79.9, radiusNm: 180, label: "SC / GA",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 29.0, centerLng: -80.9, radiusNm: 170, label: "NE FL (Mosquito Lagoon)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:3,Dec:2}},
  ],

  // ── BONEFISH ───────────────────────────────────────────────────────────────
  // Keys/Bahamas tropical flats species — extremely limited range. Intentionally
  // NO Atlantic coast north of Miami and NO Gulf coverage.
  bonefish: [
    {centerLat: 25.0, centerLng: -80.5, radiusNm: 120, label: "Florida Keys flats",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
    {centerLat: 25.7, centerLng: -80.2, radiusNm: 80, label: "Biscayne / Key Largo",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
  ],

  // ── PERMIT ───────────────────────────────────────────────────────────────
  // Keys/Bahamas flats holy grail; nearshore wrecks in South FL. Peak spring.
  permit: [
    {centerLat: 24.6, centerLng: -81.4, radiusNm: 140, label: "Florida Keys",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:1}},
    {centerLat: 25.7, centerLng: -80.1, radiusNm: 120, label: "SE FL nearshore",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:1}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:1}},
  ],

  // ── CALIFORNIA YELLOWTAIL ────────────────────────────────────────────────
  // Seriola lalandi — a SoCal-only fishery. Without this region the generic curve
  // scored yellowtail off Oregon Inlet and the Gulf. ~2,000 nm from Atlantic
  // regions so no cross-coast bleed.
  cayellowtail: [
    {centerLat: 32.8, centerLng: -118.5, radiusNm: 340, label: "Southern California",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
  ],

  // ── LONGBILL SPEARFISH ───────────────────────────────────────────────────
  // Rare Atlantic billfish raised in white-marlin spreads. Same broad geography
  // but much lower abundance — peaks scaled down vs white marlin.
  spearfish: [
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 200, label: "Mid-Atlantic canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 35.5, centerLng: -74.8, radiusNm: 170, label: "NC / OBX Gulf Stream",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:1,Jul:2,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 190, label: "Carolinas Gulf Stream",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:1,Jun:1,Jul:2,Aug:2,Sep:1,Oct:1,Nov:0,Dec:0}},
    {centerLat: 26.0, centerLng: -78.5, radiusNm: 200, label: "SE FL / Bahamas",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:1,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:0,Dec:0}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:1,Jun:2,Jul:2,Aug:2,Sep:1,Oct:1,Nov:0,Dec:0}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:1,Jun:2,Jul:2,Aug:2,Sep:1,Oct:1,Nov:0,Dec:0}},
  ],

  // ── SWORDFISH ────────────────────────────────────────────────────────────
  // Opposite peaks by region: SE FL/Keys/Bahamas WINTER (Dec–Mar); Mid-Atlantic
  // and NC canyon summer–fall (Jul–Oct); Hatteras Hole also fishes winter daytime
  // drops; Gulf late spring–summer.
  swordfish: [
    {centerLat: 40.5, centerLng: -70.0, radiusNm: 240, label: "New England canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 210, label: "Mid-Atlantic canyons",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 35.3, centerLng: -75.0, radiusNm: 160, label: "NC / Hatteras Hole",
     // Famous winter daytime drops AND summer canyon fish.
     seasons:{Jan:2,Feb:2,Mar:2,Apr:1,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:2}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 190, label: "Carolinas Gulf Stream",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:1,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:1}},
    {centerLat: 25.7, centerLng: -80.1, radiusNm: 190, label: "SE FL / Miami",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:2,Dec:3}},
    {centerLat: 24.6, centerLng: -81.4, radiusNm: 150, label: "Florida Keys",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:2,Dec:3}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:2,Dec:3}},
    {centerLat: 28.0, centerLng: -86.5, radiusNm: 260, label: "Eastern Gulf",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 27.5, centerLng: -93.5, radiusNm: 280, label: "Western Gulf",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
  ],

  // ── SKIPJACK TUNA ────────────────────────────────────────────────────────
  // Aggressive warm-water tuna — abundant in the Gulf Stream south, summer
  // strays to the Mid-Atlantic. Essentially absent north of NJ and from cold
  // inshore shelf water.
  skipjack: [
    {centerLat: 38.3, centerLng: -73.3, radiusNm: 180, label: "Mid-Atlantic (summer)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 35.0, centerLng: -75.0, radiusNm: 150, label: "NC / OBX Gulf Stream",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 32.8, centerLng: -77.8, radiusNm: 190, label: "Carolinas Gulf Stream",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:2,Dec:1}},
    {centerLat: 30.5, centerLng: -80.0, radiusNm: 180, label: "GA / NE Florida",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
    {centerLat: 26.5, centerLng: -79.8, radiusNm: 170, label: "SE FL / Keys",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 28.0, centerLng: -88.0, radiusNm: 260, label: "Gulf of Mexico",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
  ],

  // ── RED SNAPPER ──────────────────────────────────────────────────────────
  // Federally managed — Gulf summer season (Jun–Aug) vs South Atlantic's brief
  // July window. The old flat Jul:3 curve scored red snapper off Maine and
  // California. NE and SoCal intentionally uncovered.
  snapper: [
    {centerLat: 32.5, centerLng: -79.5, radiusNm: 180, label: "SC / GA / Charleston Bump",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:3,Aug:1,Sep:0,Oct:0,Nov:0,Dec:0}},
    {centerLat: 34.5, centerLng: -76.5, radiusNm: 160, label: "NC offshore",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:3,Aug:1,Sep:0,Oct:0,Nov:0,Dec:0}},
    {centerLat: 28.5, centerLng: -80.5, radiusNm: 150, label: "FL Atlantic",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:1,Jul:2,Aug:1,Sep:0,Oct:0,Nov:0,Dec:0}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:3,Jul:3,Aug:2,Sep:1,Oct:0,Nov:0,Dec:0}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf (Panhandle/LA)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:3,Jul:3,Aug:2,Sep:1,Oct:0,Nov:0,Dec:0}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:3,Jul:3,Aug:2,Sep:1,Oct:0,Nov:0,Dec:0}},
  ],

  // ── GAG GROUPER ────────────────────────────────────────────────────────────
  // Gulf signature grouper — peak fall (Sep–Nov) on hard bottom; Feb–Mar harvest
  // closures in the Gulf. Also a FL Atlantic reef fishery; thin NC/SC presence.
  gaggrouper: [
    {centerLat: 34.0, centerLng: -77.5, radiusNm: 150, label: "NC / SC offshore",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:2,Jul:2,Aug:2,Sep:3,Oct:3,Nov:2,Dec:0}},
    {centerLat: 28.5, centerLng: -80.5, radiusNm: 160, label: "FL Atlantic",
     seasons:{Jan:1,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 29.0, centerLng: -85.5, radiusNm: 180, label: "FL Panhandle",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf (LA/MS/AL)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
  ],

  // ── GREATER AMBERJACK ────────────────────────────────────────────────────
  // Gulf rigs peak Aug–Oct (short federal harvest window); NC/VA tower fish
  // Jun–Sep; FL reefs year-round with summer peak. Not a New England fishery.
  amberjack: [
    {centerLat: 36.3, centerLng: -75.5, radiusNm: 140, label: "NC / VA offshore towers",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 32.5, centerLng: -79.5, radiusNm: 170, label: "SC / GA offshore",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 28.0, centerLng: -80.5, radiusNm: 150, label: "FL Atlantic reefs",
     seasons:{Jan:1,Feb:1,Mar:1,Apr:2,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:2,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf rigs",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:2,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX rigs)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:2,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
  ],

  // ── VERMILION SNAPPER (BEELINER) ─────────────────────────────────────────
  // Abundant year-round on Gulf hard bottom; South Atlantic ledges peak spring
  // through fall. The old flat year-round curve scored beeliners off New England.
  vermilion: [
    {centerLat: 36.5, centerLng: -75.5, radiusNm: 120, label: "VA / NC ledges",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 32.5, centerLng: -79.5, radiusNm: 180, label: "SC / GA ledges",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 28.5, centerLng: -80.5, radiusNm: 160, label: "FL Atlantic",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:3}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 280, label: "N. Gulf",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:3}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 290, label: "Western Gulf (TX)",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:3}},
  ],

  // ── BLACK SEA BASS ───────────────────────────────────────────────────────
  // Wreck/reef staple from New England through Cape Hatteras. Summer peak
  // shifts slightly later in the north; the old lat-shift curve still scored
  // sea bass off the Gulf and Pacific.
  blackseabass: [
    {centerLat: 41.5, centerLng: -70.5, radiusNm: 220, label: "New England",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 39.2, centerLng: -73.8, radiusNm: 200, label: "Mid-Atlantic (NY/NJ/DE)",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:1,Dec:0}},
    {centerLat: 37.0, centerLng: -75.8, radiusNm: 150, label: "VA / Chesapeake",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
    {centerLat: 35.0, centerLng: -75.5, radiusNm: 160, label: "NC / OBX",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:0}},
  ],

  // ── ATLANTIC SPADEFISH ───────────────────────────────────────────────────
  // Classic Mid-Atlantic/NC summer wreck fish — Chesapeake Light Tower, Va Beach
  // Triangle Wrecks, OBX towers, Cape Lookout. The flat national curve lit up
  // spadefish off Maine and the Gulf where they are not a real fishery.
  spadefish: [
    {centerLat: 36.8, centerLng: -75.6, radiusNm: 180, label: "Mid-Atlantic (VA/DE)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:2,Oct:1,Nov:0,Dec:0}},
    {centerLat: 35.0, centerLng: -75.5, radiusNm: 180, label: "NC / OBX towers",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 32.0, centerLng: -79.5, radiusNm: 160, label: "SC / GA nearshore",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:0,May:1,Jun:2,Jul:2,Aug:2,Sep:2,Oct:1,Nov:0,Dec:0}},
  ],

  // ── GRAY TRIGGERFISH ─────────────────────────────────────────────────────
  // Artificial-reef specialist from VA south through the Gulf. Federal harvest
  // closures aside, the old flat curve scored triggers off New England and
  // SoCal where they are essentially absent.
  triggerfish: [
    {centerLat: 36.9, centerLng: -75.7, radiusNm: 140, label: "VA Beach wrecks",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:0}},
    {centerLat: 34.5, centerLng: -76.5, radiusNm: 180, label: "NC artificial reefs",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 32.5, centerLng: -79.5, radiusNm: 180, label: "SC / GA reefs",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 28.5, centerLng: -80.5, radiusNm: 160, label: "FL Atlantic",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:2}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 280, label: "N. Gulf",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 290, label: "Western Gulf (TX)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
  ],

  // ── SHEEPSHEAD ───────────────────────────────────────────────────────────
  // Structure feeder on bridges, jetties, and pilings — winter peak in South
  // FL/Gulf, spring–fall peak in the Mid-Atlantic/NC. The old static curve had
  // no geographic guard and no winter FL peak.
  sheepshead: [
    {centerLat: 37.0, centerLng: -76.0, radiusNm: 130, label: "VA / CBBT",
     seasons:{Jan:0,Feb:0,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:2,Dec:0}},
    {centerLat: 35.2, centerLng: -75.8, radiusNm: 150, label: "NC / OBX",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:2,Dec:1}},
    {centerLat: 32.7, centerLng: -79.9, radiusNm: 180, label: "SC / GA",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 30.0, centerLng: -81.2, radiusNm: 160, label: "NE FL",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 25.7, centerLng: -80.1, radiusNm: 200, label: "SE FL / Keys",
     // Winter convict-fish run on jetties and bridges.
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:3,Dec:3}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:2,Sep:2,Oct:3,Nov:3,Dec:3}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 280, label: "N. Gulf",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:1,Sep:2,Oct:3,Nov:3,Dec:3}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 290, label: "Western Gulf (TX)",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:2,Jun:2,Jul:2,Aug:1,Sep:2,Oct:3,Nov:3,Dec:3}},
  ],

  // ── GROUPER (GAG / BLACK / SCAMP) ─────────────────────────────────────────
  // Generic grouper picker covers live-bottom fish on SE Atlantic ledges and
  // Gulf reefs. The flat May–Aug curve scored grouper off New England and
  // California. Gag has its own ID (gaggrouper); this table guards the rest.
  grouper: [
    {centerLat: 34.0, centerLng: -77.5, radiusNm: 150, label: "NC / SC ledges",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 32.5, centerLng: -79.5, radiusNm: 170, label: "Charleston Bump / GA",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 28.5, centerLng: -80.5, radiusNm: 160, label: "FL Atlantic reefs",
     seasons:{Jan:1,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 29.0, centerLng: -85.5, radiusNm: 180, label: "FL Panhandle",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:1,May:2,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:1}},
  ],

  // ── HOGFISH ────────────────────────────────────────────────────────────────
  // Keys/SE FL/Bahamas reef specialty. Atlantic harvest closed May–Oct but
  // fish are present year-round on patch reefs. No north-coast or Pacific
  // fishery.
  hogfish: [
    {centerLat: 24.8, centerLng: -81.0, radiusNm: 140, label: "Florida Keys reefs",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:2,Dec:3}},
    {centerLat: 26.5, centerLng: -79.5, radiusNm: 120, label: "SE FL Atlantic reefs",
     seasons:{Jan:2,Feb:3,Mar:3,Apr:3,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:2,Dec:2}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:3}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 180, label: "Gulf FL west coast",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
  ],

  // ── MUTTON SNAPPER ───────────────────────────────────────────────────────
  // Keys and South FL reef icon — spawning aggregations late spring. The
  // year-round national curve lit up muttons off Oregon Inlet and the Gulf
  // of Maine.
  muttonsnap: [
    {centerLat: 24.6, centerLng: -81.4, radiusNm: 150, label: "Florida Keys",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:2}},
    {centerLat: 26.5, centerLng: -79.8, radiusNm: 160, label: "SE FL nearshore reefs",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:1,Dec:1}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:2,Aug:2,Sep:2,Oct:2,Nov:2,Dec:2}},
  ],

  // ── LANE SNAPPER ─────────────────────────────────────────────────────────
  // Gulf reef schoolies year-round; Keys and South Atlantic patch reefs in
  // warm months. Absent north of the Carolinas and from the Pacific.
  lanesnap: [
    {centerLat: 32.5, centerLng: -79.5, radiusNm: 160, label: "SC / GA patch reefs",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
    {centerLat: 28.5, centerLng: -80.5, radiusNm: 150, label: "FL Atlantic",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:1}},
    {centerLat: 24.8, centerLng: -81.0, radiusNm: 140, label: "Florida Keys",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:2,Dec:2}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:3}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 280, label: "N. Gulf",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:3}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 290, label: "Western Gulf (TX)",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:3,Nov:3,Dec:3}},
  ],

  // ── YELLOWTAIL SNAPPER (KEYS) ────────────────────────────────────────────
  // Ocyurus chrysurus — the Keys chum-and-cast classic. Distinct from
  // California yellowtail (cayellowtail). No Atlantic north of FL or Pacific
  // coverage.
  yellowtail: [
    {centerLat: 24.6, centerLng: -81.4, radiusNm: 150, label: "Florida Keys",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:2,Nov:2,Dec:2}},
    {centerLat: 25.7, centerLng: -80.1, radiusNm: 100, label: "Key West / SE FL",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:2,Nov:2,Dec:2}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:2,Oct:2,Nov:2,Dec:2}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 160, label: "Gulf FL (eastern)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:2,Sep:2,Oct:1,Nov:1,Dec:1}},
  ],

  // ── FLORIDA POMPANO ──────────────────────────────────────────────────────
  // Surf-zone migrant on SE/Gulf beaches — winter residents in South FL,
  // spring/fall runs along the Panhandle and Texas coast. Not a Mid-Atlantic
  // or Pacific target.
  pompano: [
    {centerLat: 26.5, centerLng: -80.0, radiusNm: 180, label: "SE FL beaches",
     seasons:{Jan:3,Feb:3,Mar:3,Apr:2,May:1,Jun:1,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:3}},
    {centerLat: 30.0, centerLng: -81.2, radiusNm: 140, label: "NE FL beaches",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:2,Jun:1,Jul:0,Aug:0,Sep:2,Oct:3,Nov:2,Dec:1}},
    {centerLat: 29.0, centerLng: -85.0, radiusNm: 200, label: "FL Panhandle beaches",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 250, label: "N. Gulf beaches",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:2}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 270, label: "Western Gulf (TX)",
     seasons:{Jan:1,Feb:2,Mar:3,Apr:3,May:3,Jun:2,Jul:1,Aug:1,Sep:2,Oct:3,Nov:3,Dec:2}},
  ],

  // ── TRIPLETAIL ───────────────────────────────────────────────────────────
  // Buoy-and-debris specialist of the Gulf and nearshore SE Atlantic. The
  // year-round curve scored tripletail off New England and SoCal.
  tripletail: [
    {centerLat: 29.0, centerLng: -85.0, radiusNm: 200, label: "FL Panhandle / Apalachicola",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 27.4, centerLng: -83.1, radiusNm: 200, label: "Gulf FL west coast",
     seasons:{Jan:2,Feb:2,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 29.5, centerLng: -88.0, radiusNm: 280, label: "N. Gulf (LA marsh)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 27.8, centerLng: -95.5, radiusNm: 290, label: "Western Gulf (TX)",
     seasons:{Jan:1,Feb:1,Mar:2,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:1,Dec:1}},
    {centerLat: 32.5, centerLng: -79.5, radiusNm: 150, label: "SC nearshore",
     seasons:{Jan:0,Feb:0,Mar:1,Apr:2,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:0,Dec:0}},
  ],

  // ── CERO MACKEREL ────────────────────────────────────────────────────────
  // Tropical Spanish-mackerel cousin — essentially a Keys/South FL/Bahamas
  // fish. The flat year-round curve credited cero off New Jersey and the
  // Gulf of Maine.
  ceromack: [
    {centerLat: 24.8, centerLng: -81.2, radiusNm: 160, label: "Florida Keys",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:2,Dec:2}},
    {centerLat: 26.5, centerLng: -80.0, radiusNm: 150, label: "SE FL (Miami–Keys)",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:2,Dec:2}},
    {centerLat: 26.0, centerLng: -78.0, radiusNm: 170, label: "Bahamas",
     seasons:{Jan:2,Feb:2,Mar:3,Apr:3,May:3,Jun:3,Jul:3,Aug:3,Sep:3,Oct:2,Nov:2,Dec:2}},
  ],

  // ── TAUTOG (BLACKFISH) ───────────────────────────────────────────────────
  // Northeast/Mid-Atlantic wreck-and-rock specialist — spring and fall peaks,
  // summer doldrums. The flat national curve scored tog off the Gulf and
  // South Atlantic where they are not a real fishery.
  tautog: [
    {centerLat: 41.5, centerLng: -70.5, radiusNm: 220, label: "New England",
     seasons:{Jan:1,Feb:0,Mar:0,Apr:3,May:2,Jun:0,Jul:0,Aug:0,Sep:1,Oct:3,Nov:3,Dec:3}},
    {centerLat: 39.2, centerLng: -73.8, radiusNm: 200, label: "Mid-Atlantic (NY/NJ)",
     seasons:{Jan:1,Feb:0,Mar:0,Apr:3,May:2,Jun:0,Jul:0,Aug:0,Sep:1,Oct:3,Nov:3,Dec:3}},
    {centerLat: 37.0, centerLng: -76.0, radiusNm: 130, label: "VA / CBBT",
     seasons:{Jan:1,Feb:0,Mar:0,Apr:3,May:2,Jun:0,Jul:0,Aug:0,Sep:1,Oct:3,Nov:3,Dec:2}},
    {centerLat: 35.0, centerLng: -75.5, radiusNm: 120, label: "NC / OBX (southern edge)",
     seasons:{Jan:0,Feb:0,Mar:0,Apr:2,May:2,Jun:0,Jul:0,Aug:0,Sep:1,Oct:2,Nov:2,Dec:1}},
  ],
};

const PREDICT_WEIGHTS = {
  offshore: {
    temperature:   0.22,   // Trimmed — warm water alone was over-credited. Pelagics hold at the
                           //   EDGE, not just the hottest water; emphasis moves to the edge factors.
    depthStruct:   0.09,   // Depth-BAND match only. Trimmed from 0.16 because offshore bands are
                           //   broad (e.g. 150–1500 m all = 1.0), so band-match barely discriminates
                           //   one deep cell from another — the freed weight moves to `structure`.
    structure:     0.07,   // Bottom STRUCTURE (slope/steepness): shelf-edge lip, canyon walls, humps,
                           //   fingers. This is what separates the canyon rip from flat abyssal plain —
                           //   the water tournament boats actually key on. See bottomStructureStrengthAt().
    chlorophyll:   0.11,   // Color breaks.
    thermalBreak:  0.16,   // Temperature break — a defined thermal wall stacks bait and fish.
    convergence:   0.18,   // Rewards where SST break + chlorophyll edge COINCIDE (altimetry). Boosted
                           //   to widen the gap between a true front and warm-but-featureless water.
    reports:       0.00,   // Moved out of weighted sum — pure additive bonus
    season:        0.04,
    pressure:      0.07,
    solunar:       0.04,
    tide:          0.00,   // Tide irrelevant in deep blue water
    wind:          0.00,   // Removed — captured indirectly via weather change
    weatherChange: 0.02,
    moonPhase:     0.00,   // Not significant for pelagics (not light-sensitive at depth)
  },
  nearshore: {
    temperature:   0.17,
    depthStruct:   0.25,   // Still the primary anchor (wreck/ledge/reef), but trimmed so a
                           //   structure-less-but-fishy bait line isn't blind-spotted. Pairs with
                           //   the raised depth-gate floor to relieve double-counting.
    chlorophyll:   0.07,   // Bumped — nearshore color changes/edges hold bait.
    thermalBreak:  0.09,   // Bumped — a temp break along the beach concentrates the bite.
    convergence:   0.08,   // Bumped — a break + color edge coinciding is a real nearshore tell.
    reports:       0.00,
    season:        0.05,
    pressure:      0.06,
    solunar:       0.05,
    tide:          0.06,
    wind:          0.06,   // Re-enabled with REAL buoy wind — onshore wind stacks bait on structure
    weatherChange: 0.04,
    moonPhase:     0.02,   // Small credit — full/new moons lift the nearshore bite.
  },
  // NEARSHORE REEF/BOTTOM (demersal): snapper, grouper, gag, amberjack, black
  // sea bass, tautog, triggerfish, hogfish, mutton/lane/vermilion snapper, cod,
  // haddock, pollock. These fish are GLUED to a wreck/ledge/reef — the bite is
  // driven by STRUCTURE + CURRENT + pressure/solunar feeding windows, NOT by
  // surface thermal fronts or chlorophyll color edges (which the roving
  // nearshore pelagics DO chase). The generic nearshore table spent ~24% of its
  // weight on thermalBreak + convergence + chlorophyll, all of which are
  // irrelevant to a bottom fish and diluted the structure signal that actually
  // matters. This profile redistributes that weight into structure, tide/current,
  // pressure and solunar. Selected via predictWeightsFor() when the species is
  // nearshore AND flagged demersal/bottom.
  nearshoreReef: {
    temperature:   0.16,   // Bottom-temp scored (see tempForScore); still gates cold shutdown.
    depthStruct:   0.36,   // DECISIVE — reef/wreck/ledge fish live ON the structure.
    chlorophyll:   0.00,   // Irrelevant to bottom fish; unreliable over structure anyway.
    thermalBreak:  0.00,   // They don't hunt surface thermal fronts.
    convergence:   0.00,   // Same — no relationship to surface convergence.
    reports:       0.00,
    season:        0.07,
    pressure:      0.10,   // Bottom fish react strongly to a falling barometer.
    solunar:       0.09,   // Feeding windows over the structure.
    tide:          0.12,   // Current over the structure turns the bite on/off.
    wind:          0.02,   // Mostly sea-state/access, not the bite itself.
    weatherChange: 0.05,
    moonPhase:     0.03,   // Full/new moons lift the reef bite via current strength.
  },
  inshore: {
    temperature:   0.14,   // Raised — cold/wrong-temp water should actually suppress the bite
                           //   (works with the firmer inshore temp gate), not lean on season alone.
    depthStruct:   0.23,   // Structure still matters, but eased so imprecise/coarse depth doesn't
                           //   over-penalize; the raised depth-gate floor shares that relief.
    chlorophyll:   0.00,   // Zeroed — satellite chlor is unreliable in shallow water
                           //   (bottom reflectance, sediment contamination)
    thermalBreak:  0.00,   // Inshore species want stable water, not breaks
    convergence:   0.00,   // Irrelevant inshore (no offshore edges).
    reports:       0.00,
    season:        0.11,   // Raised — seasonality drives the inshore pattern hard.
    pressure:      0.09,
    solunar:       0.10,
    tide:          0.20,   // DOMINANT — real NOAA CO-OPS tide stage
    wind:          0.04,   // Real buoy wind — offshore wind clears inshore water
    weatherChange: 0.04,
    moonPhase:     0.05,   // full/new moons trigger feeding via tidal range
                           //   amplification + nighttime light. Independent of solunar
                           //   (which is time-of-day) and tide (which is local water move).
  },
};
