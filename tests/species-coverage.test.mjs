/* Regional coverage for the species added for California and the Northeast:
   lingcod, calico bass and porgy/scup — plus the Pacific yellowfin habitat
   override.

   The thing that actually goes wrong when a species is added to this app is not
   the data entry, it is the GATING. A species needs an entry in several
   independent tables before the bite map behaves, and the failure mode when one
   is missing is silent and asymmetric:

     • no SPECIES_LAT_RANGE entry  → speciesAllowedAtLat defaults to "allowed
       everywhere", so a Pacific-only fish lights up the Atlantic.
     • no PACIFIC_SPECIES entry    → the Pacific gate rejects it, so a Pacific
       fish scores nowhere at all on the coast it belongs to.
     • no REGIONAL_SEASONS entry   → the season curve falls back to the generic
       peak curve everywhere instead of being suppressed out of range.
     • no SPECIES_RUN_NM entry     → the nearshore default (40 nm) silently caps
       the fishery short of its real grounds.
     • not listed in any CANYONS `fish` array → nearestStructureNm() filters
       structure BY SPECIES, so a structure-oriented (breakPref "stable") fish
       collects no structure bonus anywhere and its reefs score the same as open
       sand. This one is the easiest to miss because nothing errors: the species
       renders on the map, just uniformly and wrongly flat.

   These tests pin all five for the new species, and check the Atlantic/Gulf
   side stays untouched.

   NOTE ON DEPTH: depth is deliberately not asserted here. scoreCell's depth
   factor reads predictDepth(), which prefers the bathymetry grid fetched from
   the ocean edge function at runtime. Offline it falls back to seaDepth(),
   whose static model is Atlantic/Gulf only and returns 3000 m for the entire
   Pacific (see the comment on seaDepth). Depth bands are covered instead by
   tests/habitat-depth-consistency.test.mjs, which is pure data. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PORTS, SPECIES, CANYONS, PREDICT_SPECIES_PREFS, PACIFIC_SPECIES, PACIFIC_SPECIES_PREFS,
  REGIONAL_SEASONS, ENC_SPECIES, SPECIES_RUN_NM,
  speciesAllowedAtLat, getRegionalSeasons, speciesRunRangeNm,
  effectiveSpeciesHabitat, isPacificContext, nearestStructureNm, nmBetween,
} = loadBw([
  "PORTS", "SPECIES", "CANYONS", "PREDICT_SPECIES_PREFS", "PACIFIC_SPECIES", "PACIFIC_SPECIES_PREFS",
  "REGIONAL_SEASONS", "ENC_SPECIES", "SPECIES_RUN_NM",
  "speciesAllowedAtLat", "getRegionalSeasons", "speciesRunRangeNm",
  "effectiveSpeciesHabitat", "isPacificContext", "nearestStructureNm", "nmBetween",
], [
  // The harness default omits the encyclopedia, but the seasonal curve scoreCell
  // uses is read from ENC_SPECIES, so it has to be loaded here.
  "bw-data-ports.js",
  "bw-data-species.js",
  "bw-data-encyclopedia.js",
  "bw-data-canyons.js",
  "bw-data-bathy.js",
  "bw-data-closures.js",
  "bw-breaks.js",
  "bw-core.js",
]);

const { check, done } = makeChecker();

const NEW_SPECIES = ["lingcod", "calicobass", "porgy"];
const PACIFIC_NEW = ["lingcod", "calicobass"];

// Real grounds, used as the "must score here" coordinates.
const CA_GROUNDS = {
  "Monterey / Pt Pinos reef":    [36.62, -121.95],
  "Carmel Bay / Pt Lobos":       [36.50, -121.97],
  "Morro Bay reef":              [35.36, -121.00],
  "Point Loma kelp":             [32.667, -117.267],
  "Catalina front side":         [33.35, -118.42],
  "Horseshoe Kelp (Long Beach)": [33.68, -118.23],
};
const NE_GROUNDS = {
  "Block Island rockpile": [41.10, -71.55],
  "Montauk rockpile":      [41.03, -71.80],
  "NJ inshore wreck":      [39.90, -73.85],
  "DelMarVa wreck":        [38.10, -74.90],
};
// Places each new species must NOT appear.
const ATLANTIC_CELLS = {
  "Oregon Inlet, NC": [35.78, -75.30],
  "Virginia Beach, VA": [36.83, -75.55],
  "Montauk, NY": [41.03, -71.80],
  "Key West, FL": [24.50, -81.80],
};
const GULF_CELLS = {
  "Venice, LA": [28.90, -89.30],
  "Tampa shelf, FL": [27.60, -83.20],
  "Galveston, TX": [28.90, -94.60],
};

console.log("\nnew species are fully registered:");
for(const id of NEW_SPECIES){
  check(`${id} is in SPECIES`, SPECIES.some(s => s.id === id));
  check(`${id} has prediction prefs`, !!PREDICT_SPECIES_PREFS[id]);
  check(`${id} has an encyclopedia entry (required — the season curve is read from it)`,
    ENC_SPECIES.some(s => s.id === id && s.seasons));
  check(`${id} has regional seasons`, Array.isArray(REGIONAL_SEASONS[id]) && REGIONAL_SEASONS[id].length > 0);
  check(`${id} has an explicit run cap`, SPECIES_RUN_NM[id] != null);
  check(`${id} has an effective habitat`, (effectiveSpeciesHabitat(id) || []).length > 0);
}

console.log("\nPacific species score on the California coast:");
for(const id of PACIFIC_NEW){
  check(`${id} is in the PACIFIC_SPECIES allow-list`, !!PACIFIC_SPECIES[id]);
}
for(const [name, [lat, lng]] of Object.entries(CA_GROUNDS)){
  check(`${name} is Pacific context`, isPacificContext(lat, lng));
  check(`lingcod is allowed at ${name}`, speciesAllowedAtLat("lingcod", lat, lng));
  check(`lingcod has an in-range season curve at ${name}`, !!getRegionalSeasons("lingcod", lat, lng));
}
// Calico bass stop at Point Conception, so they are checked only where they belong.
for(const name of ["Point Loma kelp", "Catalina front side", "Horseshoe Kelp (Long Beach)", "Morro Bay reef"]){
  const [lat, lng] = CA_GROUNDS[name];
  check(`calico bass is allowed at ${name}`, speciesAllowedAtLat("calicobass", lat, lng));
  check(`calico bass has an in-range season curve at ${name}`, !!getRegionalSeasons("calicobass", lat, lng));
}
check("calico bass does NOT claim a Monterey fishery (they thin out past Pt Conception)",
  !speciesAllowedAtLat("calicobass", ...CA_GROUNDS["Monterey / Pt Pinos reef"]));
check("lingcod DOES cover Monterey — the central coast is its core fishery",
  speciesAllowedAtLat("lingcod", ...CA_GROUNDS["Monterey / Pt Pinos reef"]));

console.log("\nPacific species never light up the Atlantic or Gulf:");
for(const id of PACIFIC_NEW){
  for(const [name, [lat, lng]] of Object.entries({ ...ATLANTIC_CELLS, ...GULF_CELLS })){
    check(`${id} is excluded at ${name}`, !speciesAllowedAtLat(id, lat, lng));
  }
  check(`${id} is excluded out to the whole East Coast latitude sweep`,
    [24, 28, 32, 36, 40, 44].every(la => !speciesAllowedAtLat(id, la, -75.0)));
}

console.log("\nporgy covers the Northeast and nothing else:");
for(const [name, [lat, lng]] of Object.entries(NE_GROUNDS)){
  check(`porgy is allowed at ${name}`, speciesAllowedAtLat("porgy", lat, lng));
  check(`porgy has an in-range season curve at ${name}`, !!getRegionalSeasons("porgy", lat, lng));
}
for(const [name, [lat, lng]] of Object.entries(GULF_CELLS)){
  check(`porgy is excluded on the Gulf at ${name}`, !speciesAllowedAtLat("porgy", lat, lng));
}
check("porgy is excluded south of the Chesapeake (Key West)",
  !speciesAllowedAtLat("porgy", ...ATLANTIC_CELLS["Key West, FL"]));
check("porgy is excluded in the Pacific", PACIFIC_SPECIES.porgy == null &&
  !speciesAllowedAtLat("porgy", ...CA_GROUNDS["Point Loma kelp"]));

console.log("\nseasonal curves have the right shape:");
{
  const at = (id, name, grounds) => getRegionalSeasons(id, ...grounds[name]);
  const ling = at("lingcod", "Monterey / Pt Pinos reef", CA_GROUNDS);
  check("lingcod peaks in spring off Monterey (Apr-Jun >= 2.5)",
    ling.Apr >= 2.5 && ling.May >= 2.5 && ling.Jun >= 2.5);
  check("lingcod has a second fall peak off Monterey (Sep-Oct >= 2.5)",
    ling.Sep >= 2.5 && ling.Oct >= 2.5);
  check("lingcod is shut down in midwinter off Monterey (Jan-Feb = 0, groundfish closure)",
    ling.Jan === 0 && ling.Feb === 0);

  const cal = at("calicobass", "Point Loma kelp", CA_GROUNDS);
  check("calico bass peaks in summer off Point Loma (Jun-Sep >= 2.5)",
    cal.Jun >= 2.5 && cal.Jul >= 2.5 && cal.Aug >= 2.5 && cal.Sep >= 2.5);
  check("calico bass is never zero — they are a year-round resident",
    Object.values(cal).every(v => v > 0));

  const pgy = at("porgy", "Block Island rockpile", NE_GROUNDS);
  check("porgy peaks May-Oct off Block Island (>= 2.5)",
    ["May","Jun","Jul","Aug","Sep","Oct"].every(m => pgy[m] >= 2.5));
  check("porgy is zero in midwinter off Block Island (they move offshore)",
    pgy.Jan === 0 && pgy.Feb === 0 && pgy.Dec === 0);
}

console.log("\nrun caps reach the real grounds:");
{
  const rangeAt = (port, sp) => speciesRunRangeNm(sp, PORTS[port]);
  // Big Sur / Point Sur pinnacles are a 25-40 nm run from Monterey; the SoCal
  // island hard bottom (Catalina 22, San Clemente 55) is the long end.
  check("lingcod from Monterey reaches the outer pinnacles (>=60 nm)",
    rangeAt("Monterey, CA", "lingcod") >= 60);
  check("lingcod from Morro Bay reaches the offshore reefs (>=60 nm)",
    rangeAt("Morro Bay, CA", "lingcod") >= 60);
  check("calico bass from San Pedro reaches Catalina (>=25 nm)",
    rangeAt("San Pedro, CA", "calicobass") >= 25);
  check("calico bass from San Diego reaches San Clemente Island (>=55 nm)",
    rangeAt("San Diego, CA", "calicobass") >= 55);
  // Scup is a party-boat fishery, not an offshore run.
  check("porgy from Point Judith gets rockpile reach (>=40 nm)",
    rangeAt("Point Judith, RI", "porgy") >= 40);
  check("porgy stays a day-boat fishery (<=50 nm)",
    rangeAt("Point Judith, RI", "porgy") <= 50);
  check("no new species exceeds its port's own reach", NEW_SPECIES.every(id =>
    Object.keys(PORTS).every(p => speciesRunRangeNm(id, PORTS[p]) <= speciesRunRangeNm("all", PORTS[p]))));
}

// scoreCell gives breakPref "stable" species up to +35% for sitting on mapped
// structure, full inside 2 nm and fading out by 12 nm. nearestStructureNm()
// only counts a structure whose `fish` array contains the species, so a fish
// missing from those arrays gets a flat field with no reef anywhere.
const STRUCTURE_FADE_NM = 12;
console.log("\nstructure-oriented species get structure credit on their real grounds:");
{
  const listedOn = id => CANYONS.filter(c => Array.isArray(c.fish) && c.fish.includes(id));
  for(const id of NEW_SPECIES){
    check(`${id} is structure-oriented (breakPref "stable"), so it needs mapped structure`,
      PREDICT_SPECIES_PREFS[id].breakPref === "stable");
    check(`${id} is listed on at least one mapped structure`, listedOn(id).length > 0);
  }

  // Only the grounds where the fishery is genuinely strong. The DelMarVa/VA end
  // of the scup range is deliberately excluded: it is a weak, fringe region in
  // REGIONAL_SEASONS and there is no curated inshore reef mapped off Ocean City
  // to hang it on, so asserting structure there would be inventing a fishery.
  const STRUCTURE_GROUNDS = {
    lingcod: {
      "Monterey / Pt Pinos reef":    CA_GROUNDS["Monterey / Pt Pinos reef"],
      "Carmel Bay / Pt Lobos":       CA_GROUNDS["Carmel Bay / Pt Lobos"],
      "Morro Bay reef":              CA_GROUNDS["Morro Bay reef"],
      "Point Loma kelp":             CA_GROUNDS["Point Loma kelp"],
      "Catalina front side":         CA_GROUNDS["Catalina front side"],
      "Horseshoe Kelp (Long Beach)": CA_GROUNDS["Horseshoe Kelp (Long Beach)"],
    },
    calicobass: {
      "Point Loma kelp":             CA_GROUNDS["Point Loma kelp"],
      "Catalina front side":         CA_GROUNDS["Catalina front side"],
      "Horseshoe Kelp (Long Beach)": CA_GROUNDS["Horseshoe Kelp (Long Beach)"],
      "Morro Bay reef":              CA_GROUNDS["Morro Bay reef"],
    },
    porgy: {
      "Block Island rockpile": NE_GROUNDS["Block Island rockpile"],
      "Montauk rockpile":      NE_GROUNDS["Montauk rockpile"],
      "NJ inshore wreck":      NE_GROUNDS["NJ inshore wreck"],
    },
  };
  for(const [id, grounds] of Object.entries(STRUCTURE_GROUNDS)){
    for(const [name, [lat, lng]] of Object.entries(grounds)){
      const d = nearestStructureNm(lat, lng, id);
      check(`${id} finds structure within ${STRUCTURE_FADE_NM} nm at ${name} (${d == null ? "none" : d.toFixed(1) + " nm"})`,
        d != null && d <= STRUCTURE_FADE_NM);
    }
  }

  // Species chips must not put a Pacific fish on Atlantic structure or vice
  // versa — the map would draw the chip on a spot the range gate then blanks.
  for(const id of PACIFIC_NEW){
    const strays = listedOn(id).filter(c => !isPacificContext(c.lat, c.lng)).map(c => c.name);
    check(`${id} is only listed on Pacific structure (${strays.join(", ") || "clean"})`,
      strays.length === 0);
  }
  const pgyStrays = listedOn("porgy")
    .filter(c => !speciesAllowedAtLat("porgy", c.lat, c.lng)).map(c => c.name);
  check(`porgy is only listed where its range gate admits it (${pgyStrays.join(", ") || "clean"})`,
    pgyStrays.length === 0);

  // A typo in a `fish` array fails silently — the id just never matches.
  const ids = new Set(SPECIES.map(s => s.id));
  const dangling = [...new Set(CANYONS.flatMap(c => c.fish || []))].filter(f => !ids.has(f));
  check(`every CANYONS fish id resolves to a real species (${dangling.join(", ") || "clean"})`,
    dangling.length === 0);

  // Regression guard: the central-coast ports had no mapped grounds at all, so
  // Major Fishing Areas was empty and lingcod had no reef to score against.
  for(const port of ["Monterey, CA", "Moss Landing, CA", "Morro Bay, CA", "Port San Luis, CA"]){
    const p = PORTS[port];
    const near = CANYONS.filter(c => nmBetween(p.lat, p.lng, c.lat, c.lng) <= 60);
    check(`${port} has mapped fishing areas within 60 nm (${near.length})`, near.length > 0);
    check(`${port} has lingcod structure within 60 nm`,
      near.some(c => (c.fish || []).includes("lingcod")));
  }
}

console.log("\nSoCal yellowfin is scored on Pacific habitat, not Atlantic habitat:");
{
  const base = PREDICT_SPECIES_PREFS.yellowfin;
  const pac  = PACIFIC_SPECIES_PREFS.yellowfin;
  check("yellowfin has a Pacific habitat override", !!pac);
  check("the Pacific ideal band is COOLER than the Atlantic one (California Current, not Gulf Stream)",
    pac.tempIdeal[0] < base.tempIdeal[0] && pac.tempIdeal[1] < base.tempIdeal[1]);
  check("a 67F SoCal day is inside the Pacific ideal band",
    67 >= pac.tempIdeal[0] && 67 <= pac.tempIdeal[1]);
  check("...and was NOT inside the Atlantic ideal band it used to be scored against",
    !(67 >= base.tempIdeal[0] && 67 <= base.tempIdeal[1]));
  const shallowestPac  = Math.min(...pac.depthBands.map(b => b[0]));
  const shallowestBase = Math.min(...base.depthBands.map(b => b[0]));
  check("the Pacific depth floor is shallower, so the SoCal banks are in-band",
    shallowestPac < shallowestBase);
  check("the SoCal banks (~60 fathom / 110 m) are inside a Pacific band",
    pac.depthBands.some(([lo, hi]) => 110 >= lo && 110 <= hi));
  check("the Atlantic prefs are untouched (150 m floor still guards the Mid-Atlantic shelf)",
    shallowestBase === 150);
  check("Atlantic yellowfin still has its full set of regions",
    REGIONAL_SEASONS.yellowfin.length >= 6);
  check("yellowfin still has a Southern California region",
    REGIONAL_SEASONS.yellowfin.some(r => /southern california/i.test(r.label)));
}

console.log("\nno species reference dangles (every tackle/encyclopedia id resolves):");
{
  const ids = new Set(SPECIES.map(s => s.id));
  check("porgy now resolves — it was referenced by a tackle entry before it existed",
    ids.has("porgy"));
  const encOrphans = ENC_SPECIES.filter(e => !ids.has(e.id)).map(e => e.id);
  check(`no encyclopedia entry for a non-existent species (${encOrphans.join(", ") || "none"})`,
    encOrphans.length === 0);
  const noPrefs = SPECIES.filter(s => s.id !== "all" && !PREDICT_SPECIES_PREFS[s.id]).map(s => s.id);
  check(`every species has prediction prefs (${noPrefs.join(", ") || "none"})`, noPrefs.length === 0);
  const noEnc = SPECIES.filter(s => s.id !== "all" && !ENC_SPECIES.some(e => e.id === s.id)).map(s => s.id);
  check(`every species has an encyclopedia entry (${noEnc.join(", ") || "none"})`, noEnc.length === 0);
}

done();
