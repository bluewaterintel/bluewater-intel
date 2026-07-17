/* Bluewater Intel — Waypoints POI data + waypoint drop/list UI
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

// ════════════════════════════════════════════════════════════════════════════
// WAYPOINTS DATA
// ════════════════════════════════════════════════════════════════════════════

// Curated public POIs — major named structure from Portsmouth NH to Charleston SC.
// These are well-known landmarks published in countless sources; not "honey holes."
// Designed to be the starter set every user gets. Real GPS waypoints from public
// NOAA wreck data, state AR (artificial reef) programs, and named natural features.
//
// Types:
//   wreck  — sunken vessel or aircraft (often very productive bottom structure)
//   reef   — natural reef or live bottom
//   ar     — artificial reef (sunken on purpose by state programs)
//   canyon — major offshore canyon
//   ledge  — bottom ledge or hard-bottom feature
//   bump   — high spot, lump, or seamount
//   tower  — light tower or platform (good for spadefish, AJs)
//
const WP_PUBLIC = [
  // ── NEW ENGLAND ───────────────────────────────────────────────────────
  {id:"p-stellwagen",  name:"Stellwagen Bank",        type:"ledge",  lat:42.4000, lng:-70.3000, depth:"100-200ft",
   region:"Boston, MA", desc:"National Marine Sanctuary 25nm E of Boston. Major giant bluefin grounds, cod, haddock, whales."},
  {id:"p-jeffrey",     name:"Jeffrey's Ledge",        type:"ledge",  lat:42.8000, lng:-70.1000, depth:"180-300ft",
   region:"Portsmouth, NH", desc:"Massive 30-mile ledge system 25nm NE of Portsmouth. Cod, haddock, pollock, summer bluefin."},
  {id:"p-cashes",      name:"Cashes Ledge",           type:"ledge",  lat:42.8500, lng:-68.9500, depth:"200-600ft",
   region:"Portsmouth, NH", desc:"Deep offshore bank 80nm E of Portsmouth. Underwater mountain peaks; cod and pollock haven."},
  {id:"p-tilliesbank", name:"Tillies Bank",           type:"ledge",  lat:43.1000, lng:-69.5500, depth:"200-400ft",
   region:"Portsmouth, NH", desc:"Cod and haddock grounds 50nm offshore of Portsmouth. Wreck and rough bottom."},

  // ── BLOCK ISLAND / CAPE COD ───────────────────────────────────────────
  {id:"p-blockcanyon", name:"Block Canyon",           type:"canyon", lat:39.7800, lng:-71.5000, depth:"500-2000ft",
   region:"Point Judith, RI", desc:"80nm S of Block Island. Yellowfin, bigeye, marlin in summer; tilefish on walls."},
  {id:"p-atlantis",    name:"Atlantis Canyon",        type:"canyon", lat:39.9500, lng:-70.1800, depth:"500-2000ft",
   region:"Cape Cod, MA", desc:"90nm SE of Nantucket. Bigeye at night, yellowfin days, white marlin late summer."},
  {id:"p-veatch",      name:"Veatch Canyon",          type:"canyon", lat:39.9300, lng:-69.6000, depth:"500-2000ft",
   region:"Cape Cod, MA", desc:"100nm S of Nantucket. Bigeye and yellowfin grounds; longliners mark the edge."},
  {id:"p-coxsledge",   name:"Cox's Ledge",            type:"ledge",  lat:41.0000, lng:-71.1500, depth:"100-200ft",
   region:"Point Judith, RI", desc:"Major Block Island Sound ledge. Cod, BSB, bluefish, summer bluefin tuna."},

  // ── MONTAUK / LONG ISLAND ─────────────────────────────────────────────
  {id:"p-montauk-rip", name:"Montauk Rips",            type:"ledge",  lat:41.0700, lng:-71.8500, depth:"40-100ft",
   region:"Montauk, NY", desc:"Famous Montauk Point underwater shoals. Striper, bluefish, false albacore."},
  {id:"p-butterfish",  name:"Butterfish Hole",         type:"bump",   lat:40.5500, lng:-72.2000, depth:"180-280ft",
   region:"Montauk, NY", desc:"Highly productive offshore hump 30nm SE of Montauk. Yellowfin, bigeye, mahi."},
  {id:"p-bacardi",     name:"Bacardi Wreck",           type:"wreck",  lat:40.6900, lng:-72.7800, depth:"150ft",
   region:"Montauk, NY", desc:"Liquor smuggler sunk 1922 — 40nm SE Shinnecock. Cod, BSB, tog year-round."},

  // ── HUDSON CANYON / NJ ────────────────────────────────────────────────
  {id:"p-hudson",      name:"Hudson Canyon",           type:"canyon", lat:39.6650, lng:-72.4740, depth:"500-3000ft",
   region:"Cape May, NJ", desc:"Largest East Coast canyon. Tilefish on walls, bigeye, yellowfin, marlin in summer."},
  {id:"p-toms",        name:"Tom's Canyon",            type:"canyon", lat:39.1900, lng:-72.6900, depth:"500-2000ft",
   region:"Cape May, NJ", desc:"Major NJ canyon. Yellowfin and bigeye grounds; wahoo on the temperature break."},
  {id:"p-spencer",     name:"Spencer Canyon",          type:"canyon", lat:39.0500, lng:-72.7500, depth:"500-2000ft",
   region:"Cape May, NJ", desc:"Mid-NJ canyon. Bigeye tuna at night; yellowfin daytime trolling on edges."},
  {id:"p-lobsterclaw", name:"Lobster Claw",            type:"bump",   lat:39.5500, lng:-73.2000, depth:"150-200ft",
   region:"Cape May, NJ", desc:"Mid-NJ structure 50nm offshore. Mahi on weed lines; yellowfin in summer."},

  // ── WILMINGTON & BALTIMORE CANYONS (MD/DE) ────────────────────────────
  {id:"p-wilmington",  name:"Wilmington Canyon",       type:"canyon", lat:38.5070, lng:-73.4950, depth:"500-3000ft",
   region:"Ocean City, MD", desc:"Major mid-Atlantic canyon. Tilefish, bigeye, white marlin tournament grounds."},
  {id:"p-baltimore",   name:"Baltimore Canyon",        type:"canyon", lat:38.1604, lng:-73.8436, depth:"500-3000ft",
   region:"Ocean City, MD", desc:"Premier OC MD canyon. White marlin grounds for the White Marlin Open."},
  {id:"p-thefingers",  name:"The Fingers",             type:"bump",   lat:38.4000, lng:-74.2000, depth:"150-300ft",
   region:"Ocean City, MD", desc:"Famous tuna grounds 40-45nm SE of OC. Yellowfin chunking and trolling."},
  {id:"p-jackspot",    name:"Jack Spot",                type:"bump",   lat:38.0900, lng:-74.5000, depth:"100-150ft",
   region:"Ocean City, MD", desc:"Historic OC inshore tuna spot 22nm E. Yellowfin, mahi, occasional bluefin."},

  // ── VIRGINIA BEACH / NORFOLK ─────────────────────────────────────────
  {id:"p-norfolkcyn",  name:"Norfolk Canyon",          type:"canyon", lat:37.0939, lng:-74.6929, depth:"500-3000ft",
   region:"Virginia Beach, VA", desc:"Major VA canyon 65nm NE of Va Beach. Blue marlin, yellowfin, tilefish."},
  {id:"p-washington",  name:"Washington Canyon",       type:"canyon", lat:37.4431, lng:-74.4895, depth:"500-3000ft",
   region:"Virginia Beach, VA", desc:"Massive canyon NE of Va Beach. Tilefish walls, bigeye, blue marlin."},
  {id:"p-accomac",     name:"Accomac Canyon",          type:"canyon", lat:37.8401, lng:-74.0791, depth:"500-2000ft",
   region:"Chincoteague, VA", desc:"Eastern Shore canyon. Yellowfin and bigeye; closer than Norfolk for Chincoteague boats."},
  {id:"p-cbbt",        name:"Chesapeake Bay Bridge-Tunnel", type:"reef", lat:36.9700, lng:-76.0150, depth:"30-80ft",
   region:"Virginia Beach, VA", desc:"4 islands and 17-mile structure. Massive striper, cobia, tautog, sheepshead grounds."},
  {id:"p-chestertower",name:"Chesapeake Light Tower",   type:"tower",  lat:36.9050, lng:-75.7130, depth:"40-50ft",
   region:"Virginia Beach, VA", desc:"Famous offshore tower 14nm E of Va Beach. Spadefish, AJs, cobia in summer."},
  {id:"p-trianglewrk", name:"Triangle Wrecks",         type:"wreck",  lat:36.9100, lng:-75.6500, depth:"60-90ft",
   region:"Virginia Beach, VA", desc:"Cluster of three wrecks 15nm E of Va Beach. Spadefish, BSB, flounder."},

  // ── CHESAPEAKE BAY — INSIDE THE BAY ───────────────────────────────────
  {id:"p-cbbt-island1",name:"CBBT 1st Island",          type:"reef",   lat:36.9920, lng:-76.0890, depth:"15-40ft",
   region:"Chesapeake Bay (Lower)", desc:"First island of the CBBT. Striper trophy fishing, tautog year-round, sheepshead summer."},
  {id:"p-cbbt-island2",name:"CBBT 2nd Island",          type:"reef",   lat:36.9810, lng:-76.0470, depth:"30-60ft",
   region:"Chesapeake Bay (Lower)", desc:"Second island. Deeper structure. Striper, big tautog, sheepshead. Stronger current here."},
  {id:"p-cbbt-island3",name:"CBBT 3rd Island",          type:"reef",   lat:36.9650, lng:-75.9920, depth:"40-80ft",
   region:"Chesapeake Bay (Lower)", desc:"Third island. Deep channel — biggest tautog and sheepshead grounds. Cobia in summer."},
  {id:"p-cbbt-island4",name:"CBBT 4th Island",          type:"reef",   lat:36.9430, lng:-75.9690, depth:"40-80ft",
   region:"Chesapeake Bay (Lower)", desc:"Outermost island. Deep water tog/sheepshead; striper at the bridge tunnel mouth."},
  {id:"p-cbbthightun", name:"CBBT High Rise (4th Tunnel)",type:"reef", lat:36.9810, lng:-76.0250, depth:"60-80ft",
   region:"Chesapeake Bay (Lower)", desc:"High-rise span over Thimble Shoal Channel. Trophy stripers in spring/fall migrations."},
  {id:"p-thimbleshoal",name:"Thimble Shoal Channel",    type:"ledge",  lat:36.9870, lng:-76.0700, depth:"50ft",
   region:"Chesapeake Bay (Lower)", desc:"Main shipping channel into Hampton Roads. Striper highway during spring/fall migration."},
  {id:"p-yorkriver",   name:"York River Mouth",          type:"ledge",  lat:37.2300, lng:-76.3700, depth:"40-90ft",
   region:"Chesapeake Bay (Lower)", desc:"York Spit + river mouth structure. Striper, croaker, flounder, big drum spring/fall."},
  {id:"p-rappahannock",name:"Rappahannock River Mouth", type:"ledge",  lat:37.5600, lng:-76.2900, depth:"30-70ft",
   region:"Chesapeake Bay (Lower)", desc:"Major mid-Bay tributary. Striper, croaker, speckled trout, big drum at the spit."},
  {id:"p-windmillpt",  name:"Windmill Point",            type:"ledge",  lat:37.6100, lng:-76.2900, depth:"20-50ft",
   region:"Chesapeake Bay (Lower)", desc:"Mouth of Rappahannock. Striper structure on the shoal edges. Famous drum grounds."},
  {id:"p-stingraypt",  name:"Stingray Point",            type:"ledge",  lat:37.5500, lng:-76.2700, depth:"15-40ft",
   region:"Chesapeake Bay (Lower)", desc:"Major drum and striper area at the mouth of the Rappahannock. Bay-side classic."},
  {id:"p-potomacmth",  name:"Potomac River Mouth",       type:"ledge",  lat:37.9200, lng:-76.2200, depth:"40-100ft",
   region:"Chesapeake Bay (Upper)", desc:"Smith Point area. Major spring/fall striper run. Bluefish summer, croaker abundant."},
  {id:"p-pointlookout",name:"Point Lookout",             type:"ledge",  lat:38.0400, lng:-76.3200, depth:"20-50ft",
   region:"Chesapeake Bay (Upper)", desc:"MD/VA border at Potomac mouth. Striper, bluefish, drum. State line favorite."},
  {id:"p-chesvenue",   name:"Chesapeake Channel (lower)",type:"ledge",  lat:37.0500, lng:-76.0900, depth:"50-80ft",
   region:"Chesapeake Bay (Lower)", desc:"Deep shipping channel between CBBT 1st & 2nd islands. Trophy striper highway."},
  {id:"p-bayspit",     name:"Bay Spit (Cape Charles)",  type:"ledge",  lat:37.1200, lng:-75.9700, depth:"15-50ft",
   region:"Chesapeake Bay (Lower)", desc:"Eastern Shore side of the bay. Cobia, big drum, striper. Famous sight-fishing for cobia."},
  {id:"p-savageneck",  name:"Savage Neck Shoals",        type:"ledge",  lat:37.2800, lng:-75.9500, depth:"20-40ft",
   region:"Chesapeake Bay (Lower)", desc:"Eastern Shore shoals. Cobia sight-fishing in summer. Striper spring/fall."},
  {id:"p-targettower", name:"Target Ship (American Mariner)",type:"wreck",lat:37.9400,lng:-76.2900,depth:"15-40ft",
   region:"Chesapeake Bay (Upper)", desc:"Partially submerged WWII Liberty ship used as Navy target. Striper, bluefish, drum."},
  {id:"p-thomaspoint", name:"Thomas Point Light",        type:"tower",  lat:38.9000, lng:-76.4360, depth:"15-35ft",
   region:"Chesapeake Bay (Upper)", desc:"Iconic Maryland lighthouse. Hot spot for striper, perch, occasional cobia in summer."},
  {id:"p-baybridge",   name:"Bay Bridge (Annapolis)",   type:"reef",   lat:38.9950, lng:-76.3940, depth:"40-100ft",
   region:"Chesapeake Bay (Upper)", desc:"Massive structure with deep channel underneath. Trophy striper grounds in spring."},
  {id:"p-poplarflats", name:"Poplar Island Flats",       type:"ledge",  lat:38.7700, lng:-76.3700, depth:"15-30ft",
   region:"Chesapeake Bay (Upper)", desc:"Restored island complex. Excellent shallow-water striper structure, perch."},
  {id:"p-tangiersnd",  name:"Tangier Sound",             type:"ledge",  lat:37.8500, lng:-75.9500, depth:"10-30ft",
   region:"Chesapeake Bay (Upper)", desc:"Vast shallow area between Eastern Shore and mainland MD. Striper, croaker, speckled trout."},
  {id:"p-bloodypt",    name:"Bloody Point Light",        type:"tower",  lat:38.8300, lng:-76.3900, depth:"25-100ft",
   region:"Chesapeake Bay (Upper)", desc:"Old lighthouse + deep hole. Massive trophy striper grounds — Maryland's signature spot."},

  // ── OUTER BANKS / OREGON INLET / HATTERAS ─────────────────────────────
  {id:"p-pointob",     name:"The Point (Diamond Shoals)", type:"ledge", lat:35.1500, lng:-75.0500, depth:"200-400ft",
   region:"Hatteras, NC", desc:"Famous Hatteras shoal where Gulf Stream meets the shelf. Marlin, yellowfin, sailfish."},
  {id:"p-hatterascyn", name:"Hatteras Canyon",         type:"canyon", lat:35.3500, lng:-74.9200, depth:"500-2000ft",
   region:"Hatteras, NC", desc:"Major Hatteras canyon 30nm E. Blue marlin, yellowfin, mahi, wahoo."},
  {id:"p-hatterashole",name:"Hatteras Hole",           type:"canyon", lat:35.2500, lng:-74.7500, depth:"1200-2000ft",
   region:"Hatteras, NC", desc:"Deep drop sword fishing grounds 35-40nm E. Night drifts producer."},
  {id:"p-100line-or",  name:"The 100-fathom line",     type:"ledge",  lat:35.5000, lng:-74.8500, depth:"600ft",
   region:"Oregon Inlet, NC", desc:"Major bathymetric edge 35-40nm from Oregon Inlet. Wahoo, blackfin, yellowfin."},
  {id:"p-diamondtower",name:"Diamond Shoals Tower",    type:"tower",  lat:35.1530, lng:-75.3000, depth:"35ft",
   region:"Hatteras, NC", desc:"Old Coast Guard tower site near Diamond Shoals. King mackerel, AJs."},

  // ── BEAUFORT / MOREHEAD / BIG ROCK ────────────────────────────────────
  {id:"p-bigrock",     name:"The Big Rock",            type:"ledge",  lat:34.2500, lng:-76.0000, depth:"100-300ft",
   region:"Morehead City, NC", desc:"Famous Big Rock Blue Marlin Tournament grounds. Blue marlin, yellowfin, mahi."},
  {id:"p-capelookout", name:"Cape Lookout Shoals",     type:"ledge",  lat:34.4500, lng:-76.5200, depth:"30-80ft",
   region:"Morehead City, NC", desc:"Major shoal system. Spanish/king mackerel, redfish, bluefish, false albacore."},
  {id:"p-ar315",       name:"AR-315 (Hutton Wreck)",   type:"ar",     lat:34.5000, lng:-76.4500, depth:"75ft",
   region:"Morehead City, NC", desc:"NC artificial reef program — sunken tug. Sea bass, triggerfish, AJs."},
  {id:"p-ar302",       name:"AR-302 (Liberty Ship)",   type:"ar",     lat:34.7500, lng:-76.4800, depth:"65ft",
   region:"Morehead City, NC", desc:"Sunken Liberty ship for the reef program. Sea bass, AJs, triggers, occasional grouper."},

  // ── CAPE FEAR / OAK ISLAND ────────────────────────────────────────────
  {id:"p-frypan",      name:"Frying Pan Tower",         type:"tower",  lat:33.4862, lng:-77.5853, depth:"50ft",
   region:"Oak Island, NC", desc:"Iconic Coast Guard tower 32nm offshore. King mackerel, AJs, mahi, snapper."},
  {id:"p-ar410",       name:"AR-410 (Pine Knoll Shores)", type:"ar",   lat:34.6200, lng:-76.8800, depth:"60-80ft",
   region:"Oak Island, NC", desc:"Major NC artificial reef. King mackerel, Spanish, cobia, AJs in summer."},
  {id:"p-ar445",       name:"AR-445 (Yaupon Reef)",    type:"ar",     lat:33.8500, lng:-78.1300, depth:"55-65ft",
   region:"Oak Island, NC", desc:"Cape Fear-area artificial reef. King mackerel, BSB, flounder."},
  {id:"p-blackjack",   name:"Blackjack Hole",          type:"ledge",  lat:33.5500, lng:-77.0000, depth:"180-220ft",
   region:"Oak Island, NC", desc:"Live bottom ledge 40nm offshore. Grouper, snapper, AJs, occasional wahoo."},

  // ── MYRTLE BEACH / GEORGETOWN ─────────────────────────────────────────
  {id:"p-georgetown",  name:"Georgetown Hole",         type:"ledge",  lat:33.0500, lng:-78.7500, depth:"180-250ft",
   region:"Myrtle Beach, SC", desc:"Live bottom 30nm off Georgetown. Vermilion snapper, grouper, AJs."},
  {id:"p-mb-ar",       name:"Paradise Reef (10-Mile)", type:"ar",     lat:33.5000, lng:-78.7000, depth:"60ft",
   region:"Myrtle Beach, SC", desc:"SC artificial reef. King mackerel, Spanish, BSB."},

  // ── CHARLESTON / EDISTO ───────────────────────────────────────────────
  {id:"p-charlestonbump", name:"Charleston Bump",      type:"bump",   lat:31.7000, lng:-79.1000, depth:"600-1200ft",
   region:"Charleston, SC", desc:"Major offshore bump 85nm SE. Wahoo highway, blackfin, blue marlin, swordfish."},
  {id:"p-edistobanks", name:"Edisto Banks",            type:"ledge",  lat:32.1500, lng:-79.2500, depth:"100-300ft",
   region:"Charleston, SC", desc:"Live bottom 40nm S of Charleston. Grouper, snapper, AJs, wahoo on the edge."},
  {id:"p-comanche",    name:"Comanche Reef",           type:"ar",     lat:32.6900, lng:-79.6800, depth:"75ft",
   region:"Charleston, SC", desc:"SC artificial reef. Cobia, king mackerel, BSB, AJs."},

  // ── HILTON HEAD / SAVANNAH ──────────────────────────────────────────
  {id:"p-bettyrose",   name:"Betty Rose Reef",         type:"ar",     lat:32.0500, lng:-80.40,  depth:"40-50ft",
   region:"Savannah, GA", desc:"SC AR program. Spadefish, BSB, kingfish in summer."},
  {id:"p-hh-areas",    name:"HH Offshore Reefs",       type:"ar",     lat:31.7500, lng:-80.20,  depth:"60-90ft",
   region:"Savannah, GA", desc:"Cluster of named artificial reefs 25-35nm SE. King mackerel, snapper, AJs."},
  {id:"p-tybeesarea",  name:"Tybee Sea Buoy Area",     type:"bump",   lat:31.9500, lng:-80.70,  depth:"40-60ft",
   region:"Savannah, GA", desc:"Live bottom area at the Savannah sea buoy. King mackerel, Spanish, cobia."},

  // ── ST. AUGUSTINE / JACKSONVILLE ─────────────────────────────────────
  {id:"p-mayport",     name:"Mayport 9-Mile Reef",     type:"ar",     lat:30.40,   lng:-81.25,  depth:"55-70ft",
   region:"Jacksonville, FL", desc:"Jacksonville AR program. King mackerel, AJs, BSB."},
  {id:"p-elton",       name:"Elton Bottom",            type:"ledge",  lat:30.20,   lng:-81.05,  depth:"90-110ft",
   region:"Jacksonville, FL", desc:"Live bottom ledge 25nm E of Jacksonville. Snapper, grouper."},
  {id:"p-eastflats",   name:"East 21 Fathom",          type:"ledge",  lat:30.00,   lng:-80.95,  depth:"125ft",
   region:"St. Augustine, FL", desc:"Hard bottom 30nm E of St. Augustine. Snapper, grouper, AJs."},
  {id:"p-niner",       name:"9-Mile Ledge",            type:"ledge",  lat:29.85,   lng:-81.15,  depth:"60-70ft",
   region:"St. Augustine, FL", desc:"Inshore ledge 9nm E. Cobia, kingfish, spadefish."},

  // ── DAYTONA / CAPE CANAVERAL ─────────────────────────────────────────
  {id:"p-8areef",      name:"8A Reef (Steeples)",      type:"ledge",  lat:29.20,   lng:-80.55,  depth:"80-120ft",
   region:"Daytona Beach, FL", desc:"Famous live-bottom area 25-30nm E of Daytona. Grouper, snapper, sailfish on edge."},
  {id:"p-pelicanflats",name:"Pelican Flats",           type:"ledge",  lat:28.80,   lng:-80.50,  depth:"60-90ft",
   region:"Daytona Beach, FL", desc:"Inshore reefs 15nm offshore. Kingfish, cobia, snapper."},
  {id:"p-pcdebris",    name:"Pelican Wreck",           type:"wreck",  lat:28.50,   lng:-80.45,  depth:"75ft",
   region:"Port Canaveral, FL", desc:"Sunken ship 15nm E of Port Canaveral. King mackerel, snapper, cobia."},
  {id:"p-canaveralreef",name:"Canaveral Bight Reef",   type:"ar",     lat:28.40,   lng:-80.40,  depth:"60-80ft",
   region:"Port Canaveral, FL", desc:"Major AR cluster. Kingfish, sailfish on Gulf Stream edge nearby."},

  // ── STUART / SAILFISH ALLEY ──────────────────────────────────────────
  {id:"p-pushbutton",  name:"Push Button Hill",        type:"bump",   lat:27.70,   lng:-79.85,  depth:"180-220ft",
   region:"Stuart, FL", desc:"Famous sailfish structure 25nm E of Fort Pierce. Live-bait kite-fishing central."},
  {id:"p-sailfishalley",name:"Sailfish Alley",         type:"ledge",  lat:27.10,   lng:-80.00,  depth:"90-150ft",
   region:"Stuart, FL", desc:"Most famous sailfish water on Earth. Color change runs 12-25nm E. Peak Dec-March."},
  {id:"p-st-lucie",    name:"St. Lucie Inlet",         type:"reef",   lat:27.16,   lng:-80.16,  depth:"15-40ft",
   region:"Stuart, FL", desc:"Inlet structure. Snook spawn here in summer. Tarpon, jacks, snapper."},

  // ── PALM BEACH / FT LAUDERDALE ───────────────────────────────────────
  {id:"p-pbedge",      name:"Palm Beach Gulf Stream Edge", type:"ledge", lat:26.70, lng:-79.95, depth:"90-200ft",
   region:"Palm Beach, FL", desc:"Gulf Stream wall runs within 2-3nm of shore. Sailfish, wahoo, blackfin year-round."},
  {id:"p-trenwreck",   name:"Trench Wreck",            type:"wreck",  lat:26.40,   lng:-80.00,  depth:"110ft",
   region:"Fort Lauderdale, FL", desc:"Sunken freighter 6nm E of Boca. Cobia, snapper, grouper, AJs."},
  {id:"p-loaree",      name:"Lo-A-Ree Wreck",          type:"wreck",  lat:26.30,   lng:-80.05,  depth:"90ft",
   region:"Fort Lauderdale, FL", desc:"Famous artificial reef wreck. Goliath grouper, snapper, AJs."},
  {id:"p-jaybreaker",  name:"Jay Scutti Reef",         type:"ar",     lat:26.20,   lng:-80.05,  depth:"65-75ft",
   region:"Fort Lauderdale, FL", desc:"FL east coast artificial reef. Snapper, grouper, cobia."},

  // ── MIAMI / KEY BISCAYNE ─────────────────────────────────────────────
  {id:"p-miamibend",   name:"Miami Sword Hole",        type:"canyon", lat:25.85,   lng:-79.85,  depth:"1500-2000ft",
   region:"Miami, FL", desc:"Daytime swordfish grounds 20nm E of Miami. Drop deep baits to the bottom."},
  {id:"p-deeppinos",   name:"Deep Pinos",              type:"ledge",  lat:25.75,   lng:-80.00,  depth:"180-300ft",
   region:"Miami, FL", desc:"Deep reef 8nm E of Government Cut. Mutton snapper, kingfish, grouper."},
  {id:"p-fowey",       name:"Fowey Rocks Light",       type:"tower",  lat:25.59,   lng:-80.10,  depth:"30-50ft",
   region:"Miami, FL", desc:"Old lighthouse on the reef. Snapper, grouper, hogfish."},
  {id:"p-biscayne",    name:"Biscayne Bay Channel",    type:"ledge",  lat:25.55,   lng:-80.20,  depth:"15-40ft",
   region:"Miami, FL", desc:"Bay-to-ocean channel structure. Tarpon, snook, bonefish, permit."},

  // ── ISLAMORADA / UPPER KEYS ──────────────────────────────────────────
  {id:"p-ishump",      name:"Islamorada Hump",         type:"bump",   lat:24.65,   lng:-80.45,  depth:"480-1100ft",
   region:"Islamorada, FL", desc:"Famous seamount 12nm SE. Bottom rises from 1100ft to 480ft. Blackfin tuna machine."},
  {id:"p-alligator",   name:"Alligator Light",         type:"tower",  lat:24.85,   lng:-80.62,  depth:"15-30ft",
   region:"Islamorada, FL", desc:"Iconic reef light. Snapper, hogfish, grouper. Tarpon in nearby channels."},
  {id:"p-alleyflats",  name:"Buchanan Bank",           type:"ledge",  lat:24.80,   lng:-80.65,  depth:"4-8ft",
   region:"Islamorada, FL", desc:"World-famous tarpon flat. Sight-casting in 4-8 feet of water. Peak May-June."},
  {id:"p-floridareef", name:"Florida Reef Tract",      type:"reef",   lat:24.90,   lng:-80.50,  depth:"20-90ft",
   region:"Islamorada, FL", desc:"Continuous coral reef from Key Largo to Key West. Hogfish, mutton, grouper everywhere."},

  // ── MARATHON / MIDDLE KEYS ───────────────────────────────────────────
  {id:"p-marathonhump",name:"Marathon Hump",           type:"bump",   lat:24.45,   lng:-80.95,  depth:"480-900ft",
   region:"Marathon, FL", desc:"~17nm S of Marathon. Smaller cousin of Islamorada Hump. Blackfin tuna, kingfish."},
  {id:"p-7mile",       name:"7-Mile Bridge",           type:"reef",   lat:24.71,   lng:-81.10,  depth:"10-30ft",
   region:"Marathon, FL", desc:"Massive structure across the Keys. Tarpon, permit, snapper, grouper."},
  {id:"p-amerlight",   name:"American Shoal Light",    type:"tower",  lat:24.52,   lng:-81.52,  depth:"30-50ft",
   region:"Marathon, FL", desc:"Reef light. Snapper, hogfish, grouper, cero mackerel."},
  {id:"p-coffins",     name:"Coffins Patch",           type:"reef",   lat:24.69,   lng:-80.97,  depth:"20-30ft",
   region:"Marathon, FL", desc:"Patch reef sanctuary. Mutton snapper, hogfish, grouper, yellowtail."},

  // ── KEY WEST / LOWER KEYS ────────────────────────────────────────────
  {id:"p-kwwall",      name:"Key West Wall",           type:"ledge",  lat:24.30,   lng:-81.80,  depth:"200-2000ft",
   region:"Key West, FL", desc:"Drop-off 10-15nm S of KW. Gulf Stream/Loop Current edge. Sailfish, blackfin, wahoo."},
  {id:"p-sandkey",     name:"Sand Key Light",          type:"tower",  lat:24.45,   lng:-81.88,  depth:"15-35ft",
   region:"Key West, FL", desc:"Old reef light. Snapper, grouper, permit, mutton."},
  {id:"p-towers",      name:"The Towers (Cosgrove)",   type:"tower",  lat:24.46,   lng:-81.45,  depth:"30-60ft",
   region:"Key West, FL", desc:"Cosgrove Shoal lighthouse. Mutton snapper, kingfish, sailfish nearby."},
  {id:"p-marquesas",   name:"Marquesas Keys",          type:"reef",   lat:24.57,   lng:-82.13,  depth:"5-15ft",
   region:"Key West, FL", desc:"Permit, tarpon, bonefish flats W of KW. Famous tournament grounds."},
  {id:"p-dryrocks",    name:"Dry Rocks",               type:"reef",   lat:24.49,   lng:-81.94,  depth:"20-40ft",
   region:"Key West, FL", desc:"Spur-and-groove reef. Yellowtail, mutton, grouper, hogfish."}];

// ── Merge in the map's structure data (CANYONS) so the Waypoints tab and the
//    map's Fishing Spots layer share ONE source of truth. Anything added to
//    CANYONS (e.g. "The Point", curated wrecks/reefs/lumps) now also appears
//    here automatically — no more drift between the two lists.
(function mergeCanyonsIntoWaypoints(){
  if(typeof CANYONS === "undefined" || !Array.isArray(CANYONS)) return;
  if(typeof PORTS === "undefined") return;

  // Nearest port name → used as the "region" label for derived waypoints.
  function nearestPortName(lat, lng){
    let best = null, bestD = Infinity;
    for(const name in PORTS){
      const p = PORTS[name];
      const d = (p.lat-lat)**2 + (p.lng-lng)**2;  // squared deg, fine for nearest
      if(d < bestD){ bestD = d; best = name; }
    }
    return best || "";
  }
  // Is there already a WP_PUBLIC entry for this spot? Match by close name or
  // by being within ~1.5nm, so we don't duplicate e.g. Hudson Canyon.
  function alreadyListed(c){
    const cn = c.name.toLowerCase().replace(/[^a-z0-9]/g,"");
    return WP_PUBLIC.some(w => {
      const wn = w.name.toLowerCase().replace(/[^a-z0-9]/g,"");
      if(wn === cn || wn.includes(cn) || cn.includes(wn)) return true;
      const dNm = Math.hypot(w.lat - c.lat, (w.lng - c.lng) * Math.cos(c.lat*Math.PI/180)) * 60;
      return dNm < 1.5;
    });
  }

  let added = 0;
  CANYONS.forEach((c, i) => {
    if(c.polygon || c.type === "closure") return;   // skip closure polygons
    if(!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;
    if(alreadyListed(c)) return;
    WP_PUBLIC.push({
      id: "c-" + (c.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || ("spot"+i)),
      name: c.name,
      type: c.type || "canyon",
      lat: c.lat,
      lng: c.lng,
      region: nearestPortName(c.lat, c.lng),
      desc: c.desc || "",
    });
    added++;
  });
})();

// Personal-waypoint type registry. The `icon` is the EMOJI shown in the Type
// dropdown and on the cards. Wreck is special: per design it uses the custom
// SVG glyph everywhere (see WRECK_SVG / wpTypeIconHTML) instead of an emoji,
// because the SVG hull reads more clearly than the ⚓ emoji.
//
// NOTE: there is exactly ONE "Bump / Lump" entry (keyed `bump`). The old build
// had both `bump` and `lump` keys with identical names, which made the dropdown
// list "Bump / Lump" twice. `lump` is kept ONLY as a lookup alias below (not in
// this iterated object) so any legacy stored value still resolves.
const WP_TYPES = {
  wreck:  {name:"Wreck",            icon:"⚓", color:"#a855f7", svg:"wreck"},
  reef:   {name:"Natural Reef",     icon:"🪸", color:"#f59e0b"},
  ar:     {name:"Artificial Reef",  icon:"🏗️", color:"#dc2626"},
  canyon: {name:"Canyon",           icon:"🌊", color:"#2979b5"},
  ledge:  {name:"Ledge / Hard Bottom", icon:"📐", color:"#16a34a"},
  bump:   {name:"Bump / Lump",      icon:"⛰️", color:"#6b7280"},
  shoal:  {name:"Shoal",            icon:"🌊", color:"#0ea5a5"},
  rock:   {name:"Rock Pile",        icon:"🪨", color:"#8a8f98"},
  tower:  {name:"Tower / Platform", icon:"🗼", color:"#0d6ea8"},
  private:{name:"Private",          icon:"⭐", color:"#f59e0b"},
};
// Lookup aliases — NOT iterated for the dropdown, so they don't create
// duplicate rows. They just let WP_TYPES[alias] resolve to a real entry.
const WP_TYPE_ALIASES = { lump: "bump" };
function wpType(key){ return WP_TYPES[key] || WP_TYPES[WP_TYPE_ALIASES[key]] || WP_TYPES.private; }

// Map each personal-waypoint type to the SAME structureIconSvg() shape the 13k
// dataset markers use on the map. This is the single source of truth that keeps
// the editor dropdown, the list cards, and the map markers showing the IDENTICAL
// symbol for a given type — so a user-entered "Ledge" looks exactly like a
// dataset "Ledge" instead of one emoji + one SVG for the same thing.
const WP_TYPE_TO_STRUCTURE = {
  wreck:  "wreck",
  reef:   "reef",
  ar:     "structure",   // artificial reef → generic structure frame
  canyon: "canyon",
  ledge:  "ledge",
  bump:   "lump",        // bump/lump → mound
  shoal:  "shoal",
  rock:   "rock",
  tower:  "tower",
  private:"structure",   // generic personal pin fallback
};

// Render the shared SVG for a personal-waypoint type, recolored via currentColor
// so it reads on both the light card chips and the colored map badges. Takes the
// dataset's structureIconSvg() output and strips its hardcoded white so the
// caller's `color` (set on the wrapping element) shows through.
function wpTypeSvg(key){
  const structType = WP_TYPE_TO_STRUCTURE[key] || WP_TYPE_TO_STRUCTURE[WP_TYPE_ALIASES[key]] || "structure";
  return structureIconSvg(structType)
    .replace(/stroke="#fff"/g, 'stroke="currentColor"')
    .replace(/fill="#fff"/g,  'fill="currentColor"');
}

// One place that decides how a personal-waypoint type renders as an inline icon.
// Now returns the SAME SVG the map uses (recolored), so the dropdown preview,
// the cards, and the map markers never drift apart.
function wpTypeIconHTML(key){
  return wpTypeSvg(key);
}

// ════════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════════
const WP_USER_KEY = "bwi_user_waypoints_v1";
var WP_state = {
  tab: "public",
  search: "",
  typeFilter: "all",
  regionFilter: "all",
  sourceFilter: "all",   // "all" | "manual" | a pack id — filters the My Waypoints list
  userPoints: [],
  editing: null,
  // Charted database waypoints (the ~13k dataset) shown in the Waypoints panel
  // for Pro users. Fetched per active port from pack_waypoints_within and cached.
  charted: [],
  chartedPort: null,
  chartedStatus: "idle",  // "idle" | "loading" | "live" | "error" | "none"
};

// DB type_code (WP_TYPE_STYLE) → panel WP_TYPES key, so charted rows render with
// the right icon/color/pill and respond to the panel's type filter.
const WP_CODE_TO_PANEL_TYPE = {
  wk:"wreck", rf:"reef", st:"ar", ld:"ledge", rk:"rock",
  hl:"ledge", hp:"bump", cy:"canyon", tw:"tower", pf:"tower", rg:"tower",
};
const WP_CHARTED_MAX = 800;  // cap rendered charted cards (thousands are possible)
let _wpFetchSeq = 0;

// Which port's charted database should the panel load? Prefer the port the user
// picked in the region dropdown; fall back to the map's active home port.
function wpChartedPort(){
  if(WP_state.regionFilter && WP_state.regionFilter !== "all" &&
     typeof PORTS !== "undefined" && PORTS[WP_state.regionFilter]){
    return WP_state.regionFilter;
  }
  if(typeof activePort !== "undefined" && activePort &&
     typeof PORTS !== "undefined" && PORTS[activePort]) return activePort;
  return null;
}

// User changed the port/region dropdown — refetch charted waypoints for that port.
function wpOnRegionChange(val){
  WP_state.regionFilter = val;
  if(val !== WP_state.chartedPort){
    WP_state.charted = [];
    WP_state.chartedStatus = "idle";
  }
  wpFetchCharted(true);
}

// Fetch the charted-waypoint database for the selected port and cache it on
// WP_state so the panel's Waypoints tab can browse/search it. Pro-gated: the
// RPC returns nothing for free accounts, so this is a no-op for them.
async function wpFetchCharted(force){
  const premium = (typeof BW_PREMIUM !== "undefined") && BW_PREMIUM;
  const port = wpChartedPort();
  if(!premium || !port){
    WP_state.charted = []; WP_state.chartedPort = null;
    WP_state.chartedStatus = premium ? "none" : "idle";
    if(WP_state.tab === "public" && document.getElementById("wp-content")) wpRender();
    return;
  }
  if(!force && WP_state.chartedPort === port && WP_state.chartedStatus === "live") return;
  const seq = ++_wpFetchSeq;
  const p = PORTS[port];
  WP_state.chartedStatus = "loading";
  if(WP_state.tab === "public" && document.getElementById("wp-content")) wpRender();
  try {
    const sbc = window.BW_AUTH && window.BW_AUTH._sb;
    if(!sbc) throw new Error("auth not ready");
    const radius = (typeof maxRangeForPort === "function") ? maxRangeForPort(p) : 120;
    const { data, error } = await sbc.rpc("pack_waypoints_within", {
      p_port: port, p_lat: p.lat, p_lng: p.lng, p_radius_nm: radius, p_types: null,
    });
    if(error) throw error;
    if(seq !== _wpFetchSeq || wpChartedPort() !== port) return;
    WP_state.charted = (data || []).map((r, i) => {
      const style = WP_TYPE_STYLE[r.type_code] || {};
      const label = style.label || "Waypoint";
      const nm = Number.isFinite(r.nm) ? r.nm : null;
      return {
        id: "db-" + port + "-" + i,
        name: (r.name && r.name !== label) ? r.name : label,
        type: WP_CODE_TO_PANEL_TYPE[r.type_code] || "private",
        lat: r.lat, lng: r.lng,
        region: port,
        desc: nm != null ? `${nm.toFixed(1)} nm from ${port}` : "",
        charted: true,
      };
    });
    WP_state.chartedPort = port;
    WP_state.chartedStatus = "live";
  } catch(e){
    if(seq !== _wpFetchSeq) return;
    WP_state.charted = []; WP_state.chartedStatus = "error";
  }
  if(WP_state.tab === "public" && document.getElementById("wp-content")) wpRender();
}

// ── LEGACY PORT PACKS ────────────────────────────────────────────────────────
// A "port pack" was a bundle of waypoints for a specific port, merged into the
// user's personal database (WP_state.userPoints) tagged with a `pack` field so
// each point behaves like a manually-added waypoint (shows in My Waypoints,
// editable, exportable, deletable). Port packs are DISCONTINUED — there is no
// catalog, demo, or purchase path anymore. The list/remove helpers below are
// kept only so legacy accounts that already have pack-tagged waypoints can
// see and remove them.

// List the distinct packs currently present in the user's personal database.
function wpInstalledPacks(){
  const seen = new Map();
  for(const p of WP_state.userPoints){
    if(p.pack && p.pack.id && !seen.has(p.pack.id)) seen.set(p.pack.id, p.pack.name);
  }
  return [...seen.entries()].map(([id, name]) => ({id, name}));
}

// Remove an entire pack's worth of waypoints in one action.
function wpRemovePack(packId){
  const pack = WP_state.userPoints.find(p => p.pack && p.pack.id === packId);
  const name = pack && pack.pack ? pack.pack.name : "this pack";
  const count = WP_state.userPoints.filter(p => p.pack && p.pack.id === packId).length;
  if(!count) return;
  if(!confirm(`Remove all ${count} waypoints from "${name}"? This deletes them from your personal database. (You can re-add the pack later.)`)) return;
  const toDelete = WP_state.userPoints.filter(p => p.pack && p.pack.id === packId).map(p => p.id);
  WP_state.userPoints = WP_state.userPoints.filter(p => !(p.pack && p.pack.id === packId));
  if(WP_state.sourceFilter === packId) WP_state.sourceFilter = "all";
  wpSaveUser();
  if(window.BW_AUTH) toDelete.forEach(id => window.BW_AUTH.deleteWaypoint(id).catch(e => console.error("waypoint delete", e)));
  drawUserWaypoints();
  wpRender();
}

function wpLoadUser(){
  try { return JSON.parse(localStorage.getItem(WP_USER_KEY) || "[]"); }
  catch { return []; }
}
function wpSaveUser(){
  try { localStorage.setItem(WP_USER_KEY, JSON.stringify(WP_state.userPoints)); } catch(e){}
}

function openWaypoints(){
  if(!WP_state.userPoints.length) WP_state.userPoints = wpLoadUser();
  // Public tab always scopes to a port — default to the map's active home port.
  if(WP_state.tab === "public" && WP_state.regionFilter === "all" &&
     typeof activePort !== "undefined" && activePort){
    WP_state.regionFilter = activePort;
  }
  document.getElementById("wp-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  wpRender();
  // Pull the charted database for the active port so Pro users can browse the
  // full ~13k dataset in the panel (not just the curated public spots).
  if(typeof wpFetchCharted === "function") wpFetchCharted();
}
function closeWaypoints(){
  document.getElementById("wp-overlay").style.display = "none";
  document.body.style.overflow = "";
}
function wpSwitchTab(tab){
  WP_state.tab = tab;
  WP_state.search = "";
  if(tab === "public" && WP_state.regionFilter === "all" &&
     typeof activePort !== "undefined" && activePort){
    WP_state.regionFilter = activePort;
  }
  document.querySelectorAll(".wp-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  wpRender();
  if(tab === "public" && typeof wpFetchCharted === "function") wpFetchCharted();
}

// ════════════════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════════════════
function wpRender(){
  const root = document.getElementById("wp-content");
  if(WP_state.tab === "public")      root.innerHTML = wpRenderPublic();
  else if(WP_state.tab === "mine")   root.innerHTML = wpRenderMine();
  else if(WP_state.tab === "import"){ root.innerHTML = wpRenderImport(); mceInitControls(); }
  else                                root.innerHTML = wpRenderAbout();
}

// Populate the port dropdown + range slider and refresh the live count for the
// port/range GPX export now embedded in the Import/Export tab.
function mceInitControls(){
  const premium = (typeof BW_PREMIUM !== "undefined") && BW_PREMIUM;
  const defaultSource = premium ? "dataset" : "mine";
  expSource = defaultSource;
  const srcSel = document.getElementById("exp-source");
  if(srcSel) srcSel.value = defaultSource;
  expOnSourceChange(defaultSource);
  const sel = document.getElementById("mce-port");
  if(sel && sel.options.length <= 1){
    Object.keys(PORTS).sort().forEach(name=>{
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
  }
  const portDefault = mcePort || (typeof wpChartedPort === "function" ? wpChartedPort() : null) ||
    (typeof activePort !== "undefined" ? activePort : null);
  if(portDefault && PORTS[portDefault]){
    mcePort = portDefault;
    if(sel) sel.value = mcePort;
  } else if(sel){
    sel.value = mcePort || "";
  }
  const slider = document.getElementById("mce-range");
  if(slider) slider.value = mceRangeNm;
  if(defaultSource === "dataset") mceUpdate();
}

function wpWithinPortNm(p, portName){
  const port = (typeof PORTS !== "undefined") ? PORTS[portName] : null;
  if(!port || !Number.isFinite(port.lat) || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  const rangeNm = (typeof maxRangeForPort === "function") ? maxRangeForPort(port) : 120;
  const dNm = Math.hypot(port.lat - p.lat, (port.lng - p.lng) * Math.cos(port.lat * Math.PI / 180)) * 60;
  return dNm <= rangeNm;
}

function wpFilteredList(list){
  let out = list;
  // Source filter — only meaningful on the My Waypoints tab. "manual" = points
  // with no pack; a pack id = only that pack's points; "all" = everything.
  if(WP_state.tab === "mine" && WP_state.sourceFilter && WP_state.sourceFilter !== "all"){
    if(WP_state.sourceFilter === "manual"){
      out = out.filter(p => !p.pack);
    } else {
      out = out.filter(p => p.pack && p.pack.id === WP_state.sourceFilter);
    }
  }
  if(WP_state.search){
    const q = WP_state.search.toLowerCase();
    out = out.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.desc || "").toLowerCase().includes(q) ||
      (p.region || "").toLowerCase().includes(q)
    );
  }
  if(WP_state.typeFilter !== "all") out = out.filter(p => p.type === WP_state.typeFilter);
  // Public tab: always scope to the selected port (or map home port). Never show
  // coast-wide curated spots mixed with one port's charted database.
  if(WP_state.tab === "public"){
    const displayPort = (typeof wpChartedPort === "function") ? wpChartedPort() : null;
    if(displayPort && typeof PORTS !== "undefined" && PORTS[displayPort]){
      out = out.filter(p => {
        if(p.charted) return WP_state.chartedPort === displayPort;
        return wpWithinPortNm(p, displayPort);
      });
    } else {
      out = [];
    }
  } else if(WP_state.regionFilter !== "all"){
    // Distance-based port filter (matches the map's Fishing Spots behavior):
    // a "region" is a home port, and we show every spot within that port's
    // fishable range — not just spots whose single nearest-port label matches.
    const port = (typeof PORTS !== "undefined") ? PORTS[WP_state.regionFilter] : null;
    if(port && Number.isFinite(port.lat)){
      out = out.filter(p => {
        // Charted rows are already scoped to the port we fetched for.
        if(p.charted) return WP_state.chartedPort === WP_state.regionFilter;
        // Keep user waypoints regardless (they have no meaningful port range).
        if(String(p.id || "").startsWith("u-")) return p.region === WP_state.regionFilter;
        return wpWithinPortNm(p, WP_state.regionFilter);
      });
    } else {
      // Region isn't a known port (e.g. a custom user region) — exact match.
      out = out.filter(p => p.region === WP_state.regionFilter);
    }
  }
  return out;
}

function wpToolbar(includeAdd){
  const ports = (typeof PORTS !== "undefined") ? Object.keys(PORTS).sort() : [];
  const publicTab = WP_state.tab === "public";
  return `
    <div class="wp-toolbar">
      <input class="wp-search" type="text" placeholder="Search by name, region, or description..."
        value="${WP_state.search.replace(/"/g, '&quot;')}" oninput="WP_state.search=this.value;wpRender()"/>
      <select class="wp-filter" onchange="WP_state.typeFilter=this.value;wpRender()">
        <option value="all">All Types</option>
        ${Object.entries(WP_TYPES).filter(([k]) => k !== "private").map(([k,v]) =>
          `<option value="${k}" ${WP_state.typeFilter===k?"selected":""}>${v.icon} ${v.name}</option>`
        ).join("")}
      </select>
      <select class="wp-filter" onchange="wpOnRegionChange(this.value)">
        ${publicTab ? "" : `<option value="all">All Ports</option>`}
        ${ports.map(r => `<option value="${r}" ${WP_state.regionFilter===r?"selected":""}>${r}</option>`).join("")}
      </select>
      ${includeAdd ? `<button class="wp-btn primary" onclick="wpNewWaypoint()">+ Add Waypoint</button>` : ""}
    </div>
  `;
}

function wpStatsBar(list, label, extra){
  return `
    <div class="wp-stats-bar">
      <span><b>${list.length}</b> ${label}</span>
      ${extra || ""}
      ${WP_state.typeFilter !== "all" ? `<span>· Type: <b>${wpType(WP_state.typeFilter).name}</b></span>` : ""}
      ${WP_state.regionFilter !== "all" ? `<span>· Port: <b>${WP_state.regionFilter}</b></span>` : ""}
    </div>
  `;
}

function wpCardHTML(p, isUser){
  // For private user points the meaningful type is sourceType (the structure
  // kind they picked); fall back to the raw type for public POIs.
  const iconKey = p.sourceType || p.type;
  const t = wpType(iconKey);
  const latStr = p.lat.toFixed(4) + "°N";
  const lngStr = Math.abs(p.lng).toFixed(4) + "°W";
  return `
    <div class="wp-card" onclick="wpFlyTo(${p.lat},${p.lng},'${(p.name || '').replace(/'/g,"\\\\'")}','${p.type}',${JSON.stringify(p.sourceType||'').replace(/"/g,'&quot;')})">
      <div class="wp-card-icon" style="background:${t.color}22;border-color:${t.color}55;color:${t.color}">${wpTypeIconHTML(iconKey)}</div>
      <div class="wp-card-info">
        <div class="wp-card-name">${p.name}</div>
        <div class="wp-card-meta">
          <span class="wp-type-pill ${p.type}">${t.name}</span>
          ${p.pack ? `<span class="wp-card-pack-tag" title="From port pack: ${(p.pack.name||'').replace(/"/g,'&quot;')}">📦 ${p.pack.name}</span> ` : ""}
          ${p.depth ? `<span style="color:#7dd3fc">${p.depth}</span> · ` : ""}
          ${p.region || ""}
        </div>
        ${p.desc ? `<div class="wp-card-meta" style="color:#9ec5e8;margin-top:4px">${p.desc}</div>` : ""}
        <div class="wp-card-coord">${latStr} ${lngStr}</div>
      </div>
      <div class="wp-card-actions" onclick="event.stopPropagation()">
        <button class="wp-action-btn fc" onclick="showForecast(${p.lat},${p.lng},'${(p.name || '').replace(/'/g,"\\\\'")}')" title="6-day wind &amp; sea-state forecast" aria-label="6-day forecast">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-2A4.5 4.5 0 0 0 6.5 19Z"/><path d="M8 13l-1.5 3M12 13l-1.5 3M16 13l-1.5 3"/></svg>
          <span>Forecast</span>
        </button>
        ${isUser ? `
          <button class="wp-action-btn map${p.showOnMap ? " on" : ""}" onclick="wpToggleOnMap('${p.id}')" title="${p.showOnMap ? "Showing on map — tap to hide" : "Show this waypoint on the map"}" aria-label="${p.showOnMap ? "Hide from map" : "Show on map"}" aria-pressed="${p.showOnMap ? "true" : "false"}">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${p.showOnMap ? "On map" : "Show on map"}</span>
          </button>
          <button class="wp-action-btn" onclick="wpEditWaypoint('${p.id}')" title="Edit waypoint" aria-label="Edit waypoint">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            <span>Edit</span>
          </button>
          <button class="wp-action-btn danger" onclick="wpDeleteWaypoint('${p.id}')" title="Delete waypoint" aria-label="Delete waypoint">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Delete</span>
          </button>
        ` : `
          <button class="wp-action-btn save" onclick="wpCopyToMine(${JSON.stringify(p).replace(/"/g,'&quot;')})" title="Save to My Waypoints" aria-label="Save to My Waypoints">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.9 6.2 6.8.9-5 4.7 1.3 6.7L12 17.8 5.9 20.5 7.2 13.8 2.2 9.1l6.8-.9z"/></svg>
            <span>Save</span>
          </button>
        `}
      </div>
    </div>
  `;
}

// ── PUBLIC POIs TAB ───────────────────────────────────────────────────────
function wpRenderPublic(){
  const premium = (typeof BW_PREMIUM !== "undefined") && BW_PREMIUM;
  const charted = (premium && Array.isArray(WP_state.charted)) ? WP_state.charted : [];
  const displayPort = WP_state.chartedPort || wpChartedPort() || activePort || null;
  // Curated public spots first, then the charted database (already nearest-first).
  const source = charted.length ? WP_PUBLIC.concat(charted) : WP_PUBLIC;
  const list = wpFilteredList(source);
  const shown = list.length > WP_CHARTED_MAX ? list.slice(0, WP_CHARTED_MAX) : list;
  const curatedN = list.filter(p => !p.charted).length;
  const chartedN = list.filter(p => p.charted).length;
  const chartedExportN = (displayPort && WP_state.chartedPort === displayPort) ? charted.length : 0;
  const statsExtra = (premium && chartedN > 0)
    ? `<span>· <b>${curatedN}</b> curated + <b>${chartedN}</b> charted</span>`
    : (curatedN > 0 ? `<span>· <b>${curatedN}</b> curated</span>` : "");

  // Status/info banner explains what's in this tab and its loading state.
  let banner;
  if(!displayPort){
    banner = `<div class="wp-info-box"><b>🌊 Waypoints</b> — pick a home port on the map to browse waypoints within range.</div>`;
  } else if(!premium){
    banner = `<div class="wp-info-box"><b>🌊 Curated public POIs</b> — well-known structure within range of <b>${displayPort}</b>. Upgrade to Pro to unlock the full ~13,000-waypoint charted database (wrecks, reefs, ledges, rocks and structure) for any home port.</div>`;
  } else if(WP_state.chartedStatus === "loading"){
    banner = `<div class="wp-info-box"><b>🌊 Charted database</b> — loading waypoints within range of <b>${displayPort}</b>…</div>`;
  } else if(WP_state.chartedStatus === "none"){
    banner = `<div class="wp-info-box"><b>🌊 Charted database</b> — pick a home port in the dropdown to load the full charted database within range. Curated public spots for <b>${displayPort}</b> are shown below in the meantime.</div>`;
  } else if(WP_state.chartedStatus === "error"){
    banner = `<div class="wp-info-box"><b>🌊 Charted database</b> — couldn't load charted waypoints for <b>${displayPort}</b> right now. Showing curated spots within range. <a href="#" onclick="event.preventDefault();wpFetchCharted(true)" style="color:#7dd3fc">Retry</a></div>`;
  } else if(chartedN > 0){
    banner = `<div class="wp-info-box"><b>🌊 Waypoints near ${displayPort}</b> — <b>${curatedN}</b> curated public spots and <b>${chartedN}</b> charted database entries within range. Tap a card to fly there, or ⭐ to save it to My Waypoints.</div>`;
  } else {
    banner = `<div class="wp-info-box"><b>🌊 Waypoints near ${displayPort}</b> — <b>${curatedN}</b> curated public spots within range. No charted database entries match your current filters.</div>`;
  }

  const capNote = list.length > shown.length
    ? `<div style="text-align:center;font-size:11px;color:#9ec5e8;padding:10px 8px">Showing the nearest ${shown.length.toLocaleString()} of ${list.length.toLocaleString()}. Refine with the search box or type filter to narrow the list.</div>`
    : "";

  const exportBtn = (premium && WP_state.chartedStatus === "live" && chartedExportN > 0) ? `
    <div style="margin-bottom:14px">
      <button class="wp-btn primary" onclick="wpExportChartedGPX()" style="width:100%">⬇ Export ${chartedExportN.toLocaleString()} charted waypoints to GPX</button>
      <div style="font-size:11px;color:#9ec5e8;margin-top:6px;text-align:center">Exports charted database entries within range of <b>${displayPort}</b>. Adjust port/range in the Import / Export tab.</div>
    </div>
  ` : "";

  return `
    ${wpToolbar(false)}
    ${wpStatsBar(list, "waypoints", statsExtra)}
    ${banner}
    ${exportBtn}
    <div class="wp-list">
      ${shown.length === 0 ? `
        <div class="wp-empty">
          <div class="wp-empty-icon">🔍</div>
          <div style="font-size:14px;color:#9ec5e8;margin-bottom:6px">${displayPort ? "No waypoints within range of " + displayPort : "Select a home port on the map"}</div>
          <div style="font-size:11px">${displayPort ? "Try clearing your filters or choosing another port." : ""}</div>
        </div>
      ` : shown.map(p => wpCardHTML(p, false)).join("")}
    </div>
    ${capNote}
  `;
}

// ── MY WAYPOINTS TAB ──────────────────────────────────────────────────────
// Source filter row: lets the user view all personal waypoints, only the ones
// they added manually, or only a specific purchased pack. Hidden until there's
// at least one pack installed (no point showing it for a pure-manual list).
function wpSourceFilterBar(){
  const packs = wpInstalledPacks();
  if(packs.length === 0) return "";
  const opt = (val, label) =>
    `<option value="${val}" ${WP_state.sourceFilter===val?"selected":""}>${label}</option>`;
  return `
    <div class="wp-source-bar">
      <span class="wp-source-label">SHOW</span>
      <select class="wp-filter" onchange="WP_state.sourceFilter=this.value;wpRender()">
        ${opt("all", "All my waypoints")}
        ${opt("manual", "Only ones I added")}
        ${packs.map(p => opt(p.id, "Pack: " + p.name)).join("")}
      </select>
    </div>`;
}

// Pack management: one row per installed pack with a "Remove pack" action, plus
// the demo-pack loader (stands in for a purchase until the store is wired up).
function wpPackManageBar(){
  // Port packs are discontinued. Only render this manager for legacy accounts
  // that still have pack-tagged waypoints, so they can remove them in one tap.
  const packs = wpInstalledPacks();
  if(packs.length === 0) return "";
  const rows = packs.map(p => {
    const count = WP_state.userPoints.filter(w => w.pack && w.pack.id === p.id).length;
    return `
      <div class="wp-pack-row">
        <div class="wp-pack-info">
          <span class="wp-pack-badge">PACK</span>
          <span class="wp-pack-name">${p.name}</span>
          <span class="wp-pack-count">${count} waypoint${count===1?"":"s"}</span>
        </div>
        <button class="wp-action-btn danger" onclick="wpRemovePack('${p.id}')" title="Remove this entire pack">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          <span>Remove pack</span>
        </button>
      </div>`;
  }).join("");
  return `
    <div class="wp-pack-manager">
      <div class="wp-pack-manager-head"><span>📦 Port Packs</span></div>
      ${rows}
    </div>`;
}

function wpRenderMine(){
  const list = wpFilteredList(WP_state.userPoints);
  return `
    ${wpToolbar(true)}
    ${wpSourceFilterBar()}
    ${wpStatsBar(list, "of " + WP_state.userPoints.length + " saved waypoints")}
    <div class="wp-info-box">
      <b>⭐ Your waypoint database</b> — Everything here is yours to manage: points you add by hand, and ones you save from public POIs or import from GPX. They are saved to your account and sync across your own devices, and stay private to you. Export them to GPX anytime. Add, show on the map, edit, or delete any of them.
    </div>
    ${wpPackManageBar()}
    <div class="wp-list">
      ${WP_state.userPoints.length === 0 ? `
        <div class="wp-empty">
          <div class="wp-empty-icon">⭐</div>
          <div style="font-size:14px;color:#9ec5e8;margin-bottom:6px">No personal waypoints yet</div>
          <div style="font-size:11px;line-height:1.6">Tap <b>+ Add Waypoint</b> to enter one manually, or use the <b>Import</b> tab to load a GPX file.<br>You can also tap the Save button on any public POI to copy it here.</div>
        </div>
      ` : list.length === 0 ? `
        <div class="wp-empty">
          <div class="wp-empty-icon">🔍</div>
          <div style="font-size:14px;color:#9ec5e8">No waypoints match your filters</div>
        </div>
      ` : list.map(p => wpCardHTML(p, true)).join("")}
    </div>
  `;
}

// ── IMPORT / EXPORT TAB ───────────────────────────────────────────────────
function wpRenderImport(){
  return `
    <div style="max-width:760px;margin:0 auto;padding:20px">
      <div class="wp-info-box" style="margin:0 0 16px">
        <b>📥 GPX is the universal standard</b> — every chartplotter brand (Garmin, Raymarine, Furuno, Simrad, Lowrance) and most fishing apps can import and export GPX files. Use <b>Fishing Waypoints by Port &amp; Range</b> below to download the full charted database around any home port — no need to save spots one at a time.
      </div>

      <div style="background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(107,191,234,.18);border-radius:12px;padding:18px;margin-bottom:14px">
        <div style="font-size:14px;font-weight:700;color:#f0f6ff;margin-bottom:8px">📥 Import from GPX</div>
        <div style="font-size:12px;color:#9ec5e8;line-height:1.6;margin-bottom:14px">
          Load waypoints from a GPX file exported from your chartplotter, another app, or a public source you already have.
        </div>
        <input type="file" id="wp-gpx-input" accept=".gpx,application/gpx+xml" onchange="wpImportGPX(event)" style="display:none"/>
        <button class="wp-btn primary" onclick="document.getElementById('wp-gpx-input').click()">📁 Choose GPX File</button>
        <div id="wp-import-status" style="margin-top:10px;font-size:12px;color:#9ec5e8"></div>
      </div>

      <div style="background:linear-gradient(180deg,rgba(41,121,181,.12),rgba(41,121,181,.04));border:1px solid rgba(107,191,234,.3);border-radius:12px;padding:18px">
        <div style="font-size:14px;font-weight:700;color:#f0f6ff;margin-bottom:8px">📤 Export to GPX</div>
        <div style="font-size:12px;color:#9ec5e8;line-height:1.6;margin-bottom:14px">
          Choose what to export, then download a GPX file for your chartplotter or to share with crew.
        </div>

        <label style="display:block;font-size:10px;font-weight:700;color:#6bbfea;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">What to export</label>
        <select id="exp-source" onchange="expOnSourceChange(this.value)" style="width:100%;background:#0f2444;border:1px solid rgba(107,191,234,.3);color:#f0f6ff;font-size:14px;padding:10px 12px;border-radius:10px;font-family:inherit;margin-bottom:14px">
          <option value="dataset">🌊 Fishing Waypoints by Port &amp; Range</option>
          <option value="mine">⭐ My Saved Waypoints (${WP_state.userPoints.length})</option>
        </select>

        <!-- Dataset (port + range) controls — shown only when that source is picked -->
        <div id="exp-dataset-controls" style="display:none">
          <label style="display:block;font-size:10px;font-weight:700;color:#6bbfea;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">Home Port</label>
          <select id="mce-port" onchange="mceOnPortChange(this.value)" style="width:100%;background:#0f2444;border:1px solid rgba(107,191,234,.3);color:#f0f6ff;font-size:14px;padding:10px 12px;border-radius:10px;font-family:inherit;margin-bottom:14px">
            <option value="">Select a port…</option>
          </select>

          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px">
            <label style="font-size:10px;font-weight:700;color:#6bbfea;letter-spacing:.08em;text-transform:uppercase">Range from Port</label>
            <span id="mce-range-label" style="font-size:15px;font-weight:800;color:#f0f6ff">50 nm</span>
          </div>
          <input id="mce-range" type="range" min="1" max="100" value="50" oninput="mceOnRangeChange(this.value)" style="width:100%;accent-color:#2979b5;margin-bottom:2px">
          <div style="display:flex;justify-content:space-between;font-size:9px;color:#5d96c4;margin-bottom:14px">
            <span>1 nm</span><span>Max 100 nm</span>
          </div>

          <div style="background:rgba(15,36,68,.5);border:1px solid rgba(107,191,234,.2);border-radius:10px;padding:12px;margin-bottom:14px">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
              <div id="mce-count" style="font-size:26px;font-weight:800;color:#7dd3fc;line-height:1">—</div>
              <div style="font-size:12px;color:#9ec5e8">waypoints in range</div>
            </div>
            <div id="mce-breakdown"></div>
          </div>
        </div>

        <!-- Personal (saved waypoints) note — shown only when that source is picked -->
        <div id="exp-mine-note" style="font-size:12px;color:#9ec5e8;line-height:1.6;margin-bottom:14px">
          Exports the <b>${WP_state.userPoints.length}</b> waypoint${WP_state.userPoints.length === 1 ? "" : "s"} you've personally saved on this device.
        </div>

        <button id="exp-go-btn" class="wp-btn primary" onclick="expRun()" style="width:100%">⬇ Download GPX</button>
      </div>

      <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.22);border-radius:12px;padding:14px 18px;margin-top:14px;font-size:11px;color:#fca5a5;line-height:1.55">
        <b>Not for navigation.</b> Exported positions are informational only and may be inaccurate or out of date. Always verify against official charts and your own equipment before relying on any waypoint on the water.
      </div>

      <div style="background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.3);border-radius:12px;padding:14px 18px;margin-top:14px">
        <div style="font-size:13px;font-weight:700;color:#f87171;margin-bottom:6px">⚠ Clear All Waypoints</div>
        <div style="font-size:12px;color:#fca5a5;line-height:1.6;margin-bottom:10px">
          Permanently deletes all ${WP_state.userPoints.length} of your saved waypoints. Cannot be undone — export first.
        </div>
        <button class="wp-btn danger" onclick="wpClearAll()" ${WP_state.userPoints.length === 0 ? "disabled" : ""}>🗑 Clear All My Waypoints</button>
      </div>
    </div>
  `;
}

// ── ABOUT TAB ─────────────────────────────────────────────────────────────
function wpRenderAbout(){
  return `
    <div style="max-width:760px;margin:0 auto;padding:24px;line-height:1.75">
      <h3 style="font-size:13px;color:#7dd3fc;letter-spacing:.12em;font-weight:700;text-transform:uppercase;margin-bottom:12px">About Waypoints &amp; Structure</h3>

      <p style="font-size:13px;color:#c8d8e8">This page helps you build and manage a personal database of fishing waypoints — structure that holds fish like wrecks, reefs, canyons, ledges, towers, and natural live bottom.</p>

      <h3 style="font-size:13px;color:#7dd3fc;letter-spacing:.12em;font-weight:700;text-transform:uppercase;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(107,191,234,.15)">Privacy &amp; Storage</h3>
      <p style="font-size:13px;color:#c8d8e8"><b>Privacy &amp; Storage.</b> Your account holds your waypoints and catches and syncs them across your devices — sign in anywhere and your data is there. Your private numbers are visible only to you: every record is locked to your account by row-level security, so no other user can read it. You stay in control — export your full account data or delete your account at any time.</p>

      <h3 style="font-size:13px;color:#7dd3fc;letter-spacing:.12em;font-weight:700;text-transform:uppercase;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(107,191,234,.15)">Why GPX?</h3>
      <p style="font-size:13px;color:#c8d8e8">GPX (GPS eXchange Format) is the industry-standard XML format for waypoints, routes, and tracks. Every modern chartplotter and mapping app supports it:</p>
      <ul style="font-size:13px;color:#cfe5ff;padding-left:24px">
        <li>Garmin chartplotters (via SD card or ActiveCaptain)</li>
        <li>Raymarine Axiom (via microSD)</li>
        <li>Furuno NavNet TZtouch (via USB)</li>
        <li>Simrad / B&amp;G / Lowrance HDS (via microSD)</li>
        <li>Navionics Boating, C-Map, OpenCPN, and most fishing apps</li>
      </ul>

      <h3 style="font-size:13px;color:#7dd3fc;letter-spacing:.12em;font-weight:700;text-transform:uppercase;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(107,191,234,.15)">Community Sharing (Roadmap)</h3>
      <p style="font-size:13px;color:#c8d8e8">We plan to let captains optionally share specific waypoints with the community (with anonymity controls). Well-known public landmarks could be community-validated; private numbers stay private. Always opt-in, never automatic.</p>

      <h3 style="font-size:13px;color:#7dd3fc;letter-spacing:.12em;font-weight:700;text-transform:uppercase;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(107,191,234,.15)">Bulk Import Workflow</h3>
      <p style="font-size:13px;color:#c8d8e8">To add thousands of public points like NOAA wrecks:</p>
      <ol style="font-size:13px;color:#cfe5ff;padding-left:24px">
        <li>Visit one of the public sources listed in the Import tab</li>
        <li>Download the GPX file for your region</li>
        <li>Use Import GPX above to load all of them at once</li>
        <li>Each becomes a private waypoint on your device</li>
        <li>Use search and type filters to find specific structure quickly</li>
      </ol>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════════════════════
// Currently-displayed waypoint marker. Tracked globally so that flying to
// a new waypoint replaces the previous marker instead of stacking them up.
let _wpActiveMarker = null;

// ── Persistent "show on map" layer for personal waypoints ───────────────────
// Separate from the transient fly-to marker above. Any user waypoint with
// showOnMap=true is drawn here and STAYS on the map (alongside the 13k dataset
// markers) until the user toggles it off. Survives reloads because showOnMap is
// stored on the waypoint in localStorage.
let userWpLayerGroup = null;

function userWpMarkerIcon(p){
  const iconKey = p.sourceType || p.type;
  const t = wpType(iconKey);
  // Star badge corner so a personal pin reads differently from the public
  // dataset badges, but same rounded-square language as the rest of the app.
  return L.divIcon({
    className: "user-wp-marker",
    html: `<div style="
      position:relative;width:26px;height:26px;
      background:${t.color};
      border:2px solid rgba(255,255,255,.95);
      border-radius:7px;
      box-shadow:0 2px 6px rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:14px;line-height:1;
      pointer-events:none;
    ">${wpTypeIconHTML(iconKey)}<span style="
      position:absolute;top:-6px;right:-6px;font-size:11px;
      filter:drop-shadow(0 1px 1px rgba(0,0,0,.7))">⭐</span></div>`,
    iconSize:[26,26], iconAnchor:[13,13],
  });
}

// Rebuild the persistent personal-waypoint layer from the user's saved points.
// Called on load, after any add/edit/delete, and when a show-on-map toggle flips.
function drawUserWaypoints(){
  if(typeof MAP === "undefined") return;
  if(!userWpLayerGroup){ userWpLayerGroup = L.layerGroup().addTo(MAP); }
  userWpLayerGroup.clearLayers();
  for(const p of WP_state.userPoints){
    if(!p.showOnMap) continue;
    if(typeof p.lat !== "number" || typeof p.lng !== "number") continue;
    const iconKey = p.sourceType || p.type;
    const t = wpType(iconKey);
    const latStr = Math.abs(p.lat).toFixed(5) + (p.lat>=0 ? "° N" : "° S");
    const lngStr = Math.abs(p.lng).toFixed(5) + (p.lng>=0 ? "° E" : "° W");
    const safeName = (p.name || "Waypoint").replace(/'/g, "\\'");
    // ONE combined bubble: name + type/depth + coordinates + the forecast
    // button, in a single interactive popup (was a hover tooltip plus a
    // separate overlapping forecast popup).
    const m = L.marker([p.lat, p.lng], {icon: userWpMarkerIcon(p), zIndexOffset: 800});
    m.bindPopup(
      `<div style="text-align:center;font-family:'Segoe UI',Arial,sans-serif;min-width:170px">
        <div style="font-weight:700;color:#f0f6ff;margin-bottom:2px;font-size:15px;padding:0 18px">${p.name || "Waypoint"}</div>
        <div style="font-size:12px;color:#cfe5ff;margin-bottom:2px">${t.name}${p.depth ? " · " + p.depth : ""}</div>
        <div style="font-size:10.5px;color:#8fb4d8;margin-bottom:9px">${latStr}, ${lngStr}</div>
        <button onclick="showForecast(${p.lat},${p.lng},'${safeName}')" style="
          width:100%;background:#2979b5;color:#fff;border:none;border-radius:9px;
          padding:11px 12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;
          display:flex;align-items:center;justify-content:center;gap:7px">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-2A4.5 4.5 0 0 0 6.5 19Z"/><path d="M8 13l-1.5 3M12 13l-1.5 3M16 13l-1.5 3"/></svg>
          6-Day Forecast
        </button>
      </div>`,
      {offset:[0,-46], className:"wp-fc-popup"}
    );
    bindRulerMarkerClick(m, p.lat, p.lng);
    userWpLayerGroup.addLayer(m);
  }
}

// Flip a personal waypoint's show-on-map flag, persist it, refresh the map
// layer and re-render the list (so the toggle button reflects the new state).
function wpToggleOnMap(id){
  const p = WP_state.userPoints.find(x => x.id === id);
  if(!p) return;
  p.showOnMap = !p.showOnMap;
  wpSaveUser();
  drawUserWaypoints();
  wpRender();
  // Brief confirmation so the user knows it worked even if the map is behind
  // the waypoints panel.
  if(p.showOnMap && typeof showToast === "function"){
    showToast(`"${p.name}" is now shown on the map`);
  }
}

function wpFlyTo(lat, lng, name, type, sourceType){
  closeWaypoints();
  if(typeof MAP !== "undefined"){
    MAP.flyTo([lat, lng], 11, {duration: 1.2});
    // Drop a persistent marker. Previous behavior auto-removed after 12s,
    // which made the marker vanish while the user was still zooming or
    // panning to find their location. Now the marker stays until they
    // navigate to another waypoint or tap the marker to dismiss it.
    const iconKey = sourceType || type;
    const t = wpType(iconKey);
    // Remove any prior waypoint marker first (only one shown at a time)
    if(_wpActiveMarker){ try { MAP.removeLayer(_wpActiveMarker); } catch(e){} _wpActiveMarker = null; }
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: "",
        html: `<div title="Tap to dismiss" style="background:${t.color};color:white;border:3px solid white;
          border-radius:50%;width:34px;height:34px;display:flex;align-items:center;
          justify-content:center;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.5);cursor:pointer">
          ${wpTypeIconHTML(iconKey)}</div>`,
        iconSize:[34,34], iconAnchor:[17,17],
      }),
      zIndexOffset: 1000,
    }).bindTooltip(name, {permanent:true, direction:"top", offset:[0,-20], opacity:0.95, className:"wp-active-tooltip"}).addTo(MAP);
    // Tap the marker to open a small popup with a 6-day Forecast button (and a
    // dismiss action). Older behavior dismissed on tap; the popup is friendlier
    // and surfaces the new forecast feature right where the user is looking.
    const safeName = (name||"").replace(/'/g,"\\'");
    marker.bindPopup(
      `<div style="text-align:center;font-family:'Segoe UI',Arial,sans-serif;min-width:150px">
        <div style="font-weight:700;color:#f0f6ff;margin-bottom:8px;font-size:13px;padding:0 18px">${name||"Waypoint"}</div>
        <button onclick="showForecast(${lat},${lng},'${safeName}')" style="
          width:100%;background:#2979b5;color:#fff;border:none;border-radius:8px;
          padding:9px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
          display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-2A4.5 4.5 0 0 0 6.5 19Z"/><path d="M8 13l-1.5 3M12 13l-1.5 3M16 13l-1.5 3"/></svg>
          6-Day Forecast
        </button>
        <button onclick="wpDismissActiveMarker()" style="
          width:100%;background:transparent;color:#cfe5ff;border:1px solid rgba(207,229,255,.25);border-radius:8px;
          padding:6px;font-size:11px;cursor:pointer;font-family:inherit">Remove pin</button>
      </div>`,
      {offset:[0,-52], closeButton:true, className:"wp-fc-popup"}
    );
    marker.on("click", () => {
      if(rulerHandleMarkerClick({target: marker}, lat, lng)) return;
      marker.openPopup();
    });
    _wpActiveMarker = marker;
  }
}

// Remove the single active fly-to pin (called from its popup's "Remove pin").
function wpDismissActiveMarker(){
  if(_wpActiveMarker && typeof MAP !== "undefined"){
    try { MAP.removeLayer(_wpActiveMarker); } catch(e){}
  }
  _wpActiveMarker = null;
}

function wpCopyToMine(p){
  const newPoint = {
    ...p,
    id: "u-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    type: "private",
    sourceType: p.type,
    addedAt: new Date().toISOString(),
    showOnMap: true,   // saved POIs appear on the map by default
  };
  WP_state.userPoints.push(newPoint);
  wpSaveUser();
  if(window.BW_AUTH) window.BW_AUTH.saveWaypoint(newPoint).catch(e => console.error("waypoint sync", e));
  drawUserWaypoints();
  showToast(`"${p.name}" saved to your waypoints and shown on the map.`, "success");
}

function wpNewWaypoint(){
  WP_state.editing = {
    id: "u-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    name: "",
    type: "wreck",
    lat: "",
    lng: "",
    depth: "",
    region: "",
    desc: "",
  };
  wpShowEditor(true);
}

function wpEditWaypoint(id){
  const p = WP_state.userPoints.find(x => x.id === id);
  if(!p) return;
  WP_state.editing = {...p};
  wpShowEditor(false);
}

function wpShowEditor(isNew){
  const p = WP_state.editing;
  const modal = document.createElement("div");
  modal.className = "wp-modal";
  modal.id = "wp-editor-modal";
  modal.innerHTML = `
    <div class="wp-modal-content">
      <div class="wp-modal-head">
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700;color:#f0f6ff">${isNew ? "Add Waypoint" : "Edit Waypoint"}</div>
          <div style="font-size:11px;color:#9ec5e8;margin-top:2px">Saved to your device only</div>
        </div>
      </div>
      <div class="wp-modal-body">
        <div class="wp-field">
          <label class="wp-label">Name</label>
          <input class="wp-input" id="wp-edit-name" value="${(p.name||'').replace(/"/g,'&quot;')}" placeholder="e.g. The Manuela Wreck"/>
        </div>
        <div class="wp-field">
          <label class="wp-label">Type</label>
          <div style="display:flex;align-items:center;gap:10px">
            <!-- Live preview that shows the EXACT map symbol for the chosen
                 type, since native <option> can't render SVG. This is what the
                 waypoint will look like on the map. -->
            <span id="wp-edit-type-preview" class="wp-type-preview" style="color:${wpType(p.sourceType||p.type||"wreck").color}">${wpTypeIconHTML(p.sourceType||p.type||"wreck")}</span>
            <select class="wp-select" id="wp-edit-type" style="flex:1" onchange="wpEditTypePreview(this.value)">
              ${Object.entries(WP_TYPES).filter(([k]) => k !== "private").map(([k,v]) =>
                `<option value="${k}" ${(p.sourceType||p.type)===k?"selected":""}>${v.icon} ${v.name}</option>`
              ).join("")}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="wp-field">
            <label class="wp-label">Latitude (decimal °N)</label>
            <input class="wp-input" id="wp-edit-lat" type="number" step="0.00001" value="${p.lat}" placeholder="35.7800"/>
          </div>
          <div class="wp-field">
            <label class="wp-label">Longitude (decimal °W; use negative)</label>
            <input class="wp-input" id="wp-edit-lng" type="number" step="0.00001" value="${p.lng}" placeholder="-74.9200"/>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="wp-field">
            <label class="wp-label">Depth (optional)</label>
            <input class="wp-input" id="wp-edit-depth" value="${(p.depth||'').replace(/"/g,'&quot;')}" placeholder="120ft"/>
          </div>
          <div class="wp-field">
            <label class="wp-label">Region / Port (optional)</label>
            <input class="wp-input" id="wp-edit-region" value="${(p.region||'').replace(/"/g,'&quot;')}" placeholder="Hatteras, NC"/>
          </div>
        </div>
        <div class="wp-field">
          <label class="wp-label">Notes</label>
          <textarea class="wp-input wp-textarea" id="wp-edit-desc" placeholder="What's here, what species, best times...">${p.desc || ""}</textarea>
        </div>
      </div>
      <div class="wp-modal-foot">
        <button class="wp-btn" onclick="wpCloseEditor()">Cancel</button>
        <button class="wp-btn primary" onclick="wpSaveEditor(${isNew})">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// Update the live type-symbol preview in the editor when the dropdown changes,
// so the user sees the exact map symbol their waypoint will use.
function wpEditTypePreview(key){
  const el = document.getElementById("wp-edit-type-preview");
  if(el){
    el.innerHTML = wpTypeIconHTML(key);
    el.style.color = wpType(key).color;
  }
}

function wpCloseEditor(){
  const m = document.getElementById("wp-editor-modal");
  if(m) m.remove();
  WP_state.editing = null;
  if(typeof wpClearDropPin === "function") wpClearDropPin();
}

function wpSaveEditor(isNew){
  const get = id => document.getElementById(id).value.trim();
  const name = get("wp-edit-name");
  const lat  = parseFloat(get("wp-edit-lat"));
  const lng  = parseFloat(get("wp-edit-lng"));
  if(!name){ showToast("Name is required.", "warning"); return; }
  if(isNaN(lat) || isNaN(lng)){ showToast("Latitude and longitude must be valid numbers.", "warning"); return; }
  if(lat < -90 || lat > 90){ showToast("Latitude must be between -90 and 90.", "warning"); return; }
  if(lng < -180 || lng > 180){ showToast("Longitude must be between -180 and 180.", "warning"); return; }

  const updated = {
    id: WP_state.editing.id,
    name,
    type: "private",
    sourceType: get("wp-edit-type"),
    lat, lng,
    depth: get("wp-edit-depth") || null,
    region: get("wp-edit-region") || null,
    desc: get("wp-edit-desc") || null,
    addedAt: WP_state.editing.addedAt || new Date().toISOString(),
    // New waypoints default to visible on the map; edits keep the prior choice.
    showOnMap: isNew ? true : (WP_state.editing.showOnMap !== false),
  };

  if(isNew){
    WP_state.userPoints.push(updated);
  } else {
    const i = WP_state.userPoints.findIndex(x => x.id === updated.id);
    if(i >= 0) WP_state.userPoints[i] = updated;
  }
  wpSaveUser();
  if(window.BW_AUTH) window.BW_AUTH.saveWaypoint(updated).catch(e => console.error("waypoint sync", e));
  drawUserWaypoints();
  if(typeof wpClearDropPin === "function") wpClearDropPin();
  wpCloseEditor();
  wpRender();
}

function wpDeleteWaypoint(id){
  const p = WP_state.userPoints.find(x => x.id === id);
  if(!p) return;
  if(!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
  WP_state.userPoints = WP_state.userPoints.filter(x => x.id !== id);
  wpSaveUser();
  if(window.BW_AUTH) window.BW_AUTH.deleteWaypoint(id).catch(e => console.error("waypoint delete", e));
  drawUserWaypoints();
  wpRender();
}

function wpClearAll(){
  if(!confirm(`Permanently delete ALL ${WP_state.userPoints.length} of your waypoints? This cannot be undone.`)) return;
  if(!confirm("Are you absolutely sure? Export your waypoints first if you want a backup.")) return;
  const allIds = WP_state.userPoints.map(p => p.id);
  WP_state.userPoints = [];
  wpSaveUser();
  if(window.BW_AUTH) allIds.forEach(id => window.BW_AUTH.deleteWaypoint(id).catch(e => console.error("waypoint delete", e)));
  drawUserWaypoints();
  wpRender();
}

// ════════════════════════════════════════════════════════════════════════════
// GPX IMPORT / EXPORT
// ════════════════════════════════════════════════════════════════════════════
function wpImportGPX(e){
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const xml = ev.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");
      const wpts = doc.getElementsByTagName("wpt");
      let added = 0, skipped = 0;
      const newOnes = [];
      const guessType = (name, desc) => {
        const s = (name + " " + (desc||"")).toLowerCase();
        if(s.includes("wreck") || s.includes("sunk")) return "wreck";
        if(s.includes("artificial") || /\bar[-\s]?\d/.test(s)) return "ar";
        if(s.includes("canyon")) return "canyon";
        if(s.includes("tower") || s.includes("platform")) return "tower";
        if(s.includes("reef")) return "reef";
        if(s.includes("ledge") || s.includes("bottom")) return "ledge";
        if(s.includes("bump") || s.includes("lump") || s.includes("hole")) return "bump";
        return "wreck";
      };
      for(let i = 0; i < wpts.length; i++){
        const w = wpts[i];
        const lat = parseFloat(w.getAttribute("lat"));
        const lng = parseFloat(w.getAttribute("lon"));
        if(isNaN(lat) || isNaN(lng)){ skipped++; continue; }
        const name = w.getElementsByTagName("name")[0]?.textContent || `Waypoint ${i+1}`;
        const desc = w.getElementsByTagName("desc")[0]?.textContent ||
                     w.getElementsByTagName("cmt")[0]?.textContent || null;
        const ele  = w.getElementsByTagName("ele")[0]?.textContent;
        const wp = {
          id: "u-" + Date.now() + "-" + i + "-" + Math.random().toString(36).slice(2,7),
          name: name.trim(),
          type: "private",
          sourceType: guessType(name, desc),
          lat, lng,
          depth: ele ? Math.round(parseFloat(ele)) + "m" : null,
          region: null,
          desc: desc ? desc.trim() : null,
          addedAt: new Date().toISOString(),
          showOnMap: false,
        };
        WP_state.userPoints.push(wp);
        newOnes.push(wp);
        added++;
      }
      wpSaveUser();
      if(window.BW_AUTH && newOnes.length) window.BW_AUTH.saveWaypointsBulk(newOnes).catch(e => console.error("waypoint sync", e));
      drawUserWaypoints();
      const status = document.getElementById("wp-import-status");
      if(status){
        status.innerHTML = `<span style="color:#34d399"><b>✓ Imported ${added} waypoint${added===1?"":"s"}</b>${skipped ? ` · ${skipped} skipped (invalid coordinates)` : ""}</span>`;
      }
    } catch(err) {
      const status = document.getElementById("wp-import-status");
      if(status) status.innerHTML = `<span style="color:#f87171">✗ Failed to parse GPX file: ${err.message}</span>`;
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function wpExportGPX(){
  if(WP_state.userPoints.length === 0){
    showToast("You haven't saved any personal waypoints yet — add some in the Waypoints tab, or switch the export source to Fishing Waypoints by Port & Range.", "info");
    return;
  }
  const now = new Date().toISOString();
  const escapeXml = s => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const wpts = WP_state.userPoints.map(p => {
    const fullDesc = [
      p.desc,
      p.depth ? `Depth: ${p.depth}` : null,
      p.region ? `Region: ${p.region}` : null,
      p.sourceType ? `Type: ${wpType(p.sourceType).name}` : null].filter(Boolean).join(" · ");
    return `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${escapeXml(p.name)}</name>
    <desc>${escapeXml(fullDesc)}</desc>
    <type>${escapeXml(p.sourceType || "Waypoint")}</type>
  </wpt>`;
  }).join("\n");

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Bluewater Intel" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Bluewater Intel Waypoints</name>
    <time>${now}</time>
  </metadata>
${wpts}
</gpx>`;

  const blob = new Blob([gpx], {type:"application/gpx+xml"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bluewater-intel-waypoints-${now.slice(0,10)}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════════════════════════
// 5-DAY MARINE FORECAST  (wind + sea state for a tapped spot)
// ════════════════════════════════════════════════════════════════════════════
// Opens a modal and fetches a free, key-less marine + weather forecast from the
// Open-Meteo APIs for a specific lat/lng (a tapped waypoint). We pull daily wind
// (speed, gusts, dominant direction) from the weather API and daily wave height
// + period from the marine API, then render a 6-day strip with a plain-language
// "fishability" read so it's useful at a glance without running the algorithm.
//
// Design notes (intentional for a mixed-age audience):
//  • Big numbers, high contrast, generous spacing — easy to read on a phone in
//    sunlight and friendly to older eyes.
//  • Plain words ("Calm", "Choppy", "Rough") and a color dot, not just data.
//  • A compass arrow rotates to show wind direction — instantly legible.
//  • Graceful loading + error states; no blank screens, no silent failures.

let _forecastReqId = 0;   // guard against out-of-order responses

function bwiCompass16(deg){
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}

function bwiKmhToKt(kmh){ return kmh * 0.539957; }
function bwiMToFt(m){ return m * 3.28084; }

// Map a WMO weather code (from Open-Meteo `weather_code`) to a compact SVG icon
// and a short plain label. Covers the conditions that matter offshore: sun,
// partly cloudy, cloudy, fog, drizzle/rain, snow, and thunderstorms. The icons
// are inline SVG so they scale and recolor cleanly.
function bwiWeatherIcon(code, precip){
  const c = (code==null) ? -1 : code;
  // Color + path chosen per condition group.
  const sun =
    `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`;
  const partly =
    `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fbbf24"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1"/></g><path d="M17.5 20H9a4 4 0 0 1-.4-8 5 5 0 0 1 9.5 1.2A3.4 3.4 0 0 1 17.5 20Z" fill="#cbd5e1" stroke="#94a3b8"/></svg>`;
  const cloudy =
    `<svg viewBox="0 0 24 24" width="30" height="30" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.6" stroke-linejoin="round"><path d="M17.5 19H7a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 17.5 19Z"/></svg>`;
  const fog =
    `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"><path d="M3 8h15M5 12h14M3 16h12M7 20h11"/></svg>`;
  const rain =
    `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 15H7a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 17.5 15Z" fill="#cbd5e1" stroke="#94a3b8"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#38bdf8"/></svg>`;
  const snow =
    `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 14H7a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 17.5 14Z" fill="#cbd5e1" stroke="#94a3b8"/><path d="M8 18h.01M12 19h.01M16 18h.01M10 21h.01M14 21h.01" stroke="#e0f2fe"/></svg>`;
  const storm =
    `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 13H7a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 17.5 13Z" fill="#94a3b8" stroke="#64748b"/><path d="M12 12l-2.5 4.5h3L10 21" stroke="#fbbf24" fill="none"/></svg>`;

  if(c === 0)                       return {icon:sun,    label:"Sunny"};
  if(c === 1)                       return {icon:partly, label:"Mostly sunny"};
  if(c === 2)                       return {icon:partly, label:"Partly cloudy"};
  if(c === 3)                       return {icon:cloudy, label:"Cloudy"};
  if(c === 45 || c === 48)          return {icon:fog,    label:"Fog"};
  if(c >= 51 && c <= 57)            return {icon:rain,   label:"Drizzle"};
  if(c >= 61 && c <= 65)            return {icon:rain,   label:"Rain"};
  if(c >= 66 && c <= 67)            return {icon:rain,   label:"Freezing rain"};
  if(c >= 71 && c <= 77)            return {icon:snow,   label:"Snow"};
  if(c >= 80 && c <= 82)            return {icon:rain,   label:"Showers"};
  if(c >= 85 && c <= 86)            return {icon:snow,   label:"Snow showers"};
  if(c >= 95)                       return {icon:storm,  label:"T-Storms"};
  // Unknown / no code — fall back to cloud, or sun if precip chance is low.
  return {icon:(precip!=null && precip < 20) ? sun : cloudy, label:"—"};
}

function showForecast(lat, lng, name){
  // The 6-day forecast is a premium feature (trial or subscription).
  if(!requirePremium()) return;
  // Build (or reuse) the modal shell.
  let modal = document.getElementById("forecast-modal");
  if(!modal){
    modal = document.createElement("div");
    modal.id = "forecast-modal";
    modal.className = "fc-modal";
    modal.innerHTML = `
      <div class="modal-dialog fc-dialog" role="dialog" aria-modal="true" aria-label="6-day marine forecast">
        <div class="modal-header fc-header">
          <span id="fc-title">6-Day Forecast</span>
          <button class="layers-close-btn" onclick="closeForecast()" aria-label="Close forecast">&times;</button>
        </div>
        <div id="fc-body" class="fc-body"></div>
      </div>`;
    document.body.appendChild(modal);
    // Tap the dimmed backdrop (but not the dialog) to close.
    modal.addEventListener("click", (e)=>{ if(e.target === modal) closeForecast(); });
  }
  const title = document.getElementById("fc-title");
  title.textContent = name ? name : "6-Day Forecast";
  const body = document.getElementById("fc-body");
  const latStr = Math.abs(lat).toFixed(3) + (lat>=0?"°N":"°S");
  const lngStr = Math.abs(lng).toFixed(3) + (lng>=0?"°E":"°W");
  body.innerHTML = `
    <div class="fc-sub">${latStr}, ${lngStr}</div>
    <div class="fc-loading">
      <div class="fc-spinner" aria-hidden="true"></div>
      <div>Getting wind &amp; sea state…</div>
    </div>`;
  modal.classList.add("open");
  if(typeof BWI !== "undefined") BWI.track("forecast_open");

  const reqId = ++_forecastReqId;
  fetchForecast(lat, lng).then(slots=>{
    if(reqId !== _forecastReqId) return;   // a newer request superseded this one
    // Cache this successful result for offline use later.
    if(typeof BWI !== "undefined") BWI.saveForecast(lat, lng, slots);
    renderForecast(body, slots, latStr, lngStr, Date.now(), true);
  }).catch(err=>{
    if(reqId !== _forecastReqId) return;
    if(typeof BWI !== "undefined") BWI.logError("forecast", err && err.message, latStr+","+lngStr);
    // Offline fallback: if we have a cached forecast for this spot, show it with
    // a clear "offline / last updated" banner instead of a dead error.
    const cached = (typeof BWI !== "undefined") ? BWI.loadForecast(lat, lng) : null;
    const slots = cached && (cached.slots || cached.days) ? (cached.slots || cached.days) : null;
    if(slots && slots.length){
      renderForecast(body, slots, latStr, lngStr, cached.savedAt, false);
      return;
    }
    body.innerHTML = `
      <div class="fc-sub">${latStr}, ${lngStr}</div>
      <div class="fc-error">
        <div style="font-size:30px;line-height:1">📡</div>
        <div style="font-weight:700;margin:6px 0 4px;font-size:15px">No forecast available offline</div>
        <div style="font-size:13px;color:#9ec5e8;line-height:1.5">
          A live forecast needs an internet connection, and this spot hasn't been
          loaded before. Open it once while online and it'll be available offline
          afterward.
        </div>
        <button class="fc-retry" onclick="showForecast(${lat},${lng},${JSON.stringify(name||"").replace(/"/g,'&quot;')})">Try again</button>
      </div>`;
  });
}

function closeForecast(){
  _forecastReqId++;   // cancel any in-flight render
  const modal = document.getElementById("forecast-modal");
  if(modal) modal.classList.remove("open");
}

// Fetch + merge Open-Meteo hourly endpoints into 3-hour forecast slots (6 days).
async function fetchForecast(lat, lng){
  const base = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&forecast_days=6&timezone=auto`;
  const marineUrl  = `https://marine-api.open-meteo.com/v1/marine?${base}` +
    `&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?${base}` +
    `&hourly=weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation_probability` +
    `&wind_speed_unit=kn&temperature_unit=fahrenheit`;

  const [wRes, mRes] = await Promise.all([
    fetch(weatherUrl),
    fetch(marineUrl).catch(()=>null),
  ]);
  if(!wRes || !wRes.ok) throw new Error("weather fetch failed");
  const w = await wRes.json();
  let m = null;
  try { if(mRes && mRes.ok) m = await mRes.json(); } catch(e){ m = null; }

  const wh = w.hourly || {};
  const mh = (m && m.hourly) || {};
  const times = wh.time || [];
  const out = [];
  for(let i = 0; i < times.length && out.length < 48; i += 3){
    const time = times[i];
    const windKt = wh.wind_speed_10m ? wh.wind_speed_10m[i] : null;
    const gustKt = wh.wind_gusts_10m ? wh.wind_gusts_10m[i] : null;
    const windDir = wh.wind_direction_10m ? wh.wind_direction_10m[i] : null;
    const airF = wh.temperature_2m ? wh.temperature_2m[i] : null;
    const waveFt = (mh.wave_height && mh.wave_height[i]!=null) ? bwiMToFt(mh.wave_height[i]) : null;
    const wavePer = (mh.wave_period && mh.wave_period[i]!=null) ? mh.wave_period[i] : null;
    const waveDir = (mh.wave_direction && mh.wave_direction[i]!=null) ? mh.wave_direction[i] : null;
    const sstC = (mh.sea_surface_temperature && mh.sea_surface_temperature[i]!=null) ? mh.sea_surface_temperature[i] : null;
    const sstF = sstC!=null ? (sstC * 9/5 + 32) : null;
    const wxCode = (wh.weather_code && wh.weather_code[i]!=null) ? wh.weather_code[i] : null;
    const precip = (wh.precipitation_probability && wh.precipitation_probability[i]!=null) ? wh.precipitation_probability[i] : null;
    out.push({
      time,
      windKt: windKt!=null ? Math.round(windKt) : null,
      gustKt: gustKt!=null ? Math.round(gustKt) : null,
      windDir,
      airF: airF!=null ? Math.round(airF) : null,
      waveFt: waveFt!=null ? Math.round(waveFt*10)/10 : null,
      wavePer: wavePer!=null ? Math.round(wavePer) : null,
      waveDir,
      sstF: sstF!=null ? Math.round(sstF*10)/10 : null,
      wxCode,
      precip,
    });
  }
  if(!out.length) throw new Error("no forecast data");

  // Attach the nearest high/low tide to the row it falls closest to (best-effort;
  // the forecast still renders if tide data is unavailable). Each tide event is
  // pinned to exactly one 3-hour row — the one within ~90 min — so "High 11:30"
  // lands on the noon line, and most rows simply have no tide marker.
  try {
    const firstMs = Date.parse(out[0].time);
    const lastMs  = Date.parse(out[out.length - 1].time);
    if(isFinite(firstMs) && isFinite(lastMs)){
      const events = await _fcFetchTideEvents(lat, lng, firstMs - 3 * 3600000, lastMs + 3 * 3600000);
      if(events && events.length){
        const slotMs = out.map(s => Date.parse(s.time));
        for(const ev of events){
          let best = -1, bestDt = Infinity;
          for(let k = 0; k < slotMs.length; k++){
            const dt = Math.abs(slotMs[k] - ev.atMs);
            if(dt < bestDt){ bestDt = dt; best = k; }
          }
          if(best >= 0 && bestDt <= 90 * 60 * 1000){
            const cur = out[best].tide;
            const curDt = cur ? Math.abs(slotMs[best] - cur.atMs) : Infinity;
            if(bestDt < curDt){
              out[best].tide = {
                type: ev.type,
                atMs: ev.atMs,
                timeTxt: new Date(ev.atMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
              };
            }
          }
        }
      }
    }
  } catch(e){ /* tides optional — forecast renders without them */ }

  return out;
}

// Nearest NOAA CO-OPS station's high/low tide predictions across a time window,
// as [{ type:"H"|"L", atMs }]. Reuses the same station-resolution path the
// header tide uses (bwFetchPortConditions → sources.tide). Returns [] on any gap.
async function _fcFetchTideEvents(lat, lng, startMs, endMs){
  // Prefer home-port inlet tides for offshore pins (same as the header banner).
  let tideLat = lat, tideLng = lng;
  const portHint = (typeof activePort !== "undefined") ? activePort : null;
  if(portHint && typeof PORTS !== "undefined" && PORTS[portHint]){
    const p = PORTS[portHint];
    tideLat = p.lat;
    tideLng = p.lng;
  }
  if(typeof fetchOpenWatersTideEvents === "function"){
    const ow = await fetchOpenWatersTideEvents(tideLat, tideLng, startMs, endMs);
    if(ow && ow.all && ow.all.length) return ow.all;
  }
  let station = (typeof _cachedTideStation === "function") ? _cachedTideStation(tideLat, tideLng) : null;
  if(!station && typeof resolveTideStation === "function"){
    station = await resolveTideStation(tideLat, tideLng, portHint);
  }
  if(!station && typeof nearestCoopsTideStation === "function"){
    station = nearestCoopsTideStation(tideLat, tideLng, 120);
  }
  if(station && typeof fetchCoopsHiloEvents === "function"){
    const all = await fetchCoopsHiloEvents(station, startMs, endMs);
    if(all && all.length) return all;
  }
  return [];
}

function _fcSlotTimeLabel(iso){
  // Windfinder-style compact hour: "01AM", "04AM", "01PM" (no minutes, no space).
  const d = new Date(iso);
  let h = d.getHours();
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12; if(h === 0) h = 12;
  return `${String(h).padStart(2,"0")}${ap}`;
}
function _fcSlotDayKey(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday:"short", month:"numeric", day:"numeric" });
}
// Full day banner header like Windfinder: "MONDAY, 07/13".
function _fcDayHeader(iso, isToday){
  const d = new Date(iso);
  const wk = d.toLocaleDateString(undefined, { weekday:"long" }).toUpperCase();
  const md = d.toLocaleDateString(undefined, { month:"2-digit", day:"2-digit" });
  return `${isToday ? "TODAY · " : ""}${wk}, ${md}`;
}
function _fcIsLegacyDaily(data){
  return !!(data && data.length && data[0].date && !data[0].time);
}
function _fcRenderLegacyDaily(body, days, latStr, lngStr, fetchedAt, isLive){
  const fmtDay = (iso)=>{
    const d = new Date(iso + "T12:00:00");
    const wk = d.toLocaleDateString(undefined,{weekday:"short"});
    const md = d.toLocaleDateString(undefined,{month:"numeric",day:"numeric"});
    return {wk, md};
  };
  const rows = days.map((d,i)=>{
    const wx = bwiWeatherIcon(d.wxCode, d.precip);
    const {wk, md} = fmtDay(d.date);
    const arrow = d.windDir!=null
      ? `<span class="fc-arrow" style="transform:rotate(${(d.windDir+180)%360}deg)" title="Wind from ${bwiCompass16(d.windDir)}">↑</span>`
      : "";
    const windTxt = d.windKt!=null
      ? `${d.windKt}<span class="fc-unit">kt</span>${d.gustKt? ` <span class="fc-gust">g${d.gustKt}</span>`:""}`
      : "—";
    const fromDir = d.windDir!=null ? bwiCompass16(d.windDir) : "";
    const waveTxt = d.waveFt!=null
      ? `${d.waveFt}<span class="fc-unit">ft</span>${d.wavePer? ` <span class="fc-per">@${d.wavePer}s</span>`:""}`
      : `<span style="color:#7d9bb8">n/a</span>`;
    const airHi = (d.airHiF!=null) ? d.airHiF : d.airF;
    const airTxt = (airHi!=null && d.airLoF!=null)
      ? `${airHi}<span class="fc-unit">°</span>/${d.airLoF}<span class="fc-unit">°</span>`
      : (airHi!=null ? `${airHi}<span class="fc-unit">°F</span>` : "—");
    const precipTxt = (d.precip!=null && d.precip >= 20) ? `<span class="fc-precip">${d.precip}%</span>` : "";
    return `
      <div class="fc-row" ${i===0?'data-today="1"':''}>
        <div class="fc-top">
          <div class="fc-day">
            <div class="fc-dow">${i===0?"Today":wk}</div>
            <div class="fc-date">${md}</div>
          </div>
          <div class="fc-wx">
            <div class="fc-wx-icon">${wx.icon}</div>
            <div class="fc-wx-label">${wx.label}${precipTxt}</div>
          </div>
        </div>
        <div class="fc-metrics">
          <div class="fc-metric fc-air">
            <div class="fc-metric-val">${airTxt}</div>
            <div class="fc-metric-cap">${(d.airHiF!=null && d.airLoF!=null) ? "air hi/lo" : "air"}</div>
          </div>
          <div class="fc-metric">
            <div class="fc-metric-val">${arrow}${windTxt}</div>
            <div class="fc-metric-cap">wind${fromDir?` ${fromDir}`:""}</div>
          </div>
          <div class="fc-metric">
            <div class="fc-metric-val">${waveTxt}</div>
            <div class="fc-metric-cap">seas</div>
          </div>
        </div>
      </div>`;
  }).join("");
  const agoStr = (typeof BWI !== "undefined") ? BWI.ago(fetchedAt) : "";
  const freshBanner = isLive
    ? `<div class="fc-fresh live"><span class="fc-fresh-dot"></span><span>Live · updated ${agoStr}</span><span class="fc-fresh-src">Open-Meteo · daily (cached)</span></div>`
    : `<div class="fc-fresh stale"><span class="fc-fresh-dot"></span><span>Offline · last updated ${agoStr}</span><span class="fc-fresh-src">cached copy</span></div>`;
  body.innerHTML = `
    <div class="fc-sub">${latStr}, ${lngStr}</div>
    ${freshBanner}
    <div class="fc-table">${rows}</div>
    <div class="fc-foot">Older cached daily summary. Reconnect for the new 3-hour forecast.</div>`;
}

function renderForecast(body, slots, latStr, lngStr, fetchedAt, isLive){
  if(_fcIsLegacyDaily(slots)){
    _fcRenderLegacyDaily(body, slots, latStr, lngStr, fetchedAt, isLive);
    return;
  }
  const nowMs = Date.now();
  const byDay = new Map();
  for(const s of slots){
    const key = _fcSlotDayKey(s.time);
    if(!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  }
  // Wind-loaded color scale for the left accent bar (calm→gale), Windfinder-like.
  const windColor = (kt)=>{
    if(kt==null) return "#3a556f";
    if(kt < 6) return "#2fae6b";      // green — light
    if(kt < 12) return "#37b98a";
    if(kt < 17) return "#3fc0c0";     // teal
    if(kt < 22) return "#42a7d8";     // blue
    if(kt < 28) return "#c9a13b";     // amber — fresh
    if(kt < 34) return "#d97534";     // orange — strong
    return "#c83b2e";                 // red — gale
  };

  const dayBlocks = [...byDay.entries()].map(([dayLabel, daySlots], dayIdx)=>{
    const rows = daySlots.map(s=>{
      const wx = bwiWeatherIcon(s.wxCode, s.precip);
      const windArrow = s.windDir!=null
        ? `<span class="fcw-arrow" style="transform:rotate(${(s.windDir+180)%360}deg)" title="Wind from ${bwiCompass16(s.windDir)}">↑</span>`
        : "";
      const waveArrow = s.waveDir!=null
        ? `<span class="fcw-arrow fcw-arrow--sea" style="transform:rotate(${(s.waveDir+180)%360}deg)" title="Swell from ${bwiCompass16(s.waveDir)}">↑</span>`
        : "";
      const gustTxt = (s.gustKt!=null && s.gustKt >= (s.windKt||0)) ? `max ${s.gustKt}` : "";
      const precipTxt = (s.precip!=null && s.precip >= 20) ? `<div class="fcw-wx-precip">${s.precip}%</div>` : "";
      const slotMs = Date.parse(s.time);
      const isNow = isFinite(slotMs) && Math.abs(slotMs - nowMs) < 90 * 60 * 1000;
      return `
        <div class="fcw-row" ${isNow?'data-now="1"':''} style="--wind-accent:${windColor(s.windKt)}">
          <div class="fcw-c fcw-c-time">${_fcSlotTimeLabel(s.time)}</div>
          <div class="fcw-c fcw-c-wind">
            ${windArrow}
            <div class="fcw-wind-txt">
              <div class="fcw-big">${s.windKt!=null ? s.windKt : "—"}<i>kts</i></div>
              ${gustTxt ? `<div class="fcw-sub">${gustTxt}</div>` : ""}
            </div>
          </div>
          <div class="fcw-c fcw-c-wx">
            <div class="fcw-wx-icon" title="${wx.label}">${wx.icon}</div>
            ${precipTxt}
          </div>
          <div class="fcw-c fcw-c-air">
            <div class="fcw-air-chip">${s.airF!=null ? `${s.airF}°` : "—"}</div>
            ${s.sstF!=null ? `<div class="fcw-water">${s.sstF}° water</div>` : ""}
          </div>
          <div class="fcw-c fcw-c-sea">
            ${waveArrow}
            <div class="fcw-sea-txt">
              <div class="fcw-big">${s.waveFt!=null ? s.waveFt : "n/a"}${s.waveFt!=null?"<i>ft</i>":""}</div>
              ${s.wavePer? `<div class="fcw-sub">${s.wavePer}s</div>` : ""}
            </div>
          </div>
          <div class="fcw-c fcw-c-tide">
            ${s.tide
              ? `<span class="fcw-tide-ar ${s.tide.type==='H'?'up':'down'}">${s.tide.type==='H'?'▲':'▼'}</span>
                 <div class="fcw-tide-txt">
                   <div class="fcw-tide-lbl">${s.tide.type==='H'?'High':'Low'}</div>
                   <div class="fcw-sub">${s.tide.timeTxt}</div>
                 </div>`
              : `<span class="fcw-tide-empty">·</span>`}
          </div>
        </div>`;
    }).join("");
    return `
      <div class="fcw-day">${_fcDayHeader(daySlots[0].time, dayIdx===0)}</div>
      <div class="fcw-rows">${rows}</div>`;
  }).join("");

  const agoStr = (typeof BWI !== "undefined") ? BWI.ago(fetchedAt) : "";
  const freshBanner = isLive
    ? `<div class="fc-fresh live">
         <span class="fc-fresh-dot"></span>
         <span>Live · updated ${agoStr}</span>
         <span class="fc-fresh-src">Open-Meteo · 3-hour steps</span>
       </div>`
    : `<div class="fc-fresh stale">
         <span class="fc-fresh-dot"></span>
         <span>Offline · last updated ${agoStr}</span>
         <span class="fc-fresh-src">cached copy</span>
       </div>`;

  body.innerHTML = `
    <div class="fc-sub">${latStr}, ${lngStr}</div>
    ${freshBanner}
    <div class="fcw-table">
      <div class="fcw-head">
        <div class="fcw-c fcw-c-time">Time</div>
        <div class="fcw-c fcw-c-wind">Wind</div>
        <div class="fcw-c fcw-c-wx">Sky</div>
        <div class="fcw-c fcw-c-air">Air / Water</div>
        <div class="fcw-c fcw-c-sea">Waves</div>
        <div class="fcw-c fcw-c-tide">Tide</div>
      </div>
      ${dayBlocks}
    </div>
    <div class="fc-foot">
      Every row is a 3-hour model snapshot — not a daily average. Arrows show the
      direction wind and swell are moving toward. Figures grow less certain further out;
      confirm with the NWS coastal-waters forecast and a live buoy before heading out.
    </div>`;
}
