/* Bluewater Intel — data module: Marine closures & protected areas
 * Extracted from index.html (Approach A modularization). Loaded as a plain
 * classic <script src> before the main app script, so these top-level
 * const declarations remain global and file:// offline still works.
 * DO NOT convert to an ES module (breaks file:// via CORS). */

const MARINE_CLOSURES = [
  // ── FLORIDA KEYS NATIONAL MARINE SANCTUARY ─────────────────────────────
  // 2,896 sq nm. Largely fishable but with strict zones. We outline the
  // overall sanctuary boundary; the no-take "Sanctuary Preservation Areas"
  // inside are smaller and listed separately below.
  {
    name: "Florida Keys NMS",
    type: "sanctuary",
    color: "#fbbf24",
    desc: "Florida Keys National Marine Sanctuary. Fishing permitted in most zones but with strict gear and method restrictions. No-take Sanctuary Preservation Areas (SPAs) within.",
    rules: "Federal regs apply: no spearing in SPAs, no anchoring on coral, no wire-line trolling, lobster permits required in season.",
    link: "https://floridakeys.noaa.gov/regs/welcome.html",
    polygon: [
      [25.10, -80.20], [25.60, -80.10], [25.30, -80.06],
      [24.55, -81.30], [24.45, -82.10], [24.30, -82.95],
      [24.45, -83.00], [24.60, -82.70], [24.95, -81.50],
      [25.05, -80.55], [25.10, -80.20]
    ],
  },
  // ── TORTUGAS ECOLOGICAL RESERVE (FL KEYS) ──────────────────────────────
  // Two no-take zones west of Key West (Tortugas N & S). Completely closed
  // to fishing. ~185 sq nm combined.
  {
    name: "Tortugas Ecological Reserve",
    type: "noTake",
    color: "#dc2626",
    desc: "No-take marine reserve. All fishing prohibited — no exceptions for recreational or commercial.",
    rules: "NO FISHING. Catch-and-release prohibited. Possession of fishing gear in deployed position prohibited.",
    link: "https://floridakeys.noaa.gov/zones/tort.html",
    polygon: [
      [24.65, -83.10], [24.80, -83.10], [24.80, -82.85],
      [24.65, -82.85], [24.65, -83.10]
    ],
  },
  // ── OCULINA BANK HAPC (FL EAST COAST) ──────────────────────────────────
  // Deep-water coral protection ~30nm off Cape Canaveral. Bottom-fishing
  // banned to protect Oculina coral. Trolling and surface fishing OK.
  {
    name: "Oculina Bank HAPC",
    type: "hapc",
    color: "#a855f7",
    desc: "Deepwater Oculina coral protection zone east of Florida. Bottom fishing for snapper-grouper species prohibited. Trolling and pelagic fishing permitted.",
    rules: "No anchoring, no bottom-tending gear, no snapper-grouper bottom fishing. Pelagic species OK on the surface.",
    link: "https://safmc.net/documents/oculina-bank-hapc/",
    polygon: [
      [27.30, -80.10], [28.50, -79.80], [28.50, -79.95],
      [27.30, -80.25], [27.30, -80.10]
    ],
  },
  // ── MADISON-SWANSON HAPC (GULF OF MEXICO) ──────────────────────────────
  // Gag grouper spawning protection ~60nm SW of Apalachicola. Closed
  // year-round to all bottom fishing.
  {
    name: "Madison-Swanson HAPC",
    type: "hapc",
    color: "#a855f7",
    desc: "Gag grouper spawning aggregation site. Closed to all fishing year-round (with limited surface-trolling exception May-October).",
    rules: "No bottom fishing year-round. Limited surface trolling for pelagics permitted May 1 – Oct 31 only.",
    link: "https://www.fisheries.noaa.gov/southeast/sustainable-fisheries/madison-swanson-and-steamboat-lumps-marine-protected-areas",
    polygon: [
      [29.16, -85.83], [29.31, -85.83], [29.31, -85.55],
      [29.16, -85.55], [29.16, -85.83]
    ],
  },
  // ── STEAMBOAT LUMPS HAPC (GULF OF MEXICO) ──────────────────────────────
  // Companion to Madison-Swanson, also gag spawning site.
  {
    name: "Steamboat Lumps HAPC",
    type: "hapc",
    color: "#a855f7",
    desc: "Gag grouper spawning site protection. Bottom fishing closed.",
    rules: "No bottom fishing year-round. Limited surface trolling May-Oct only.",
    link: "https://www.fisheries.noaa.gov/southeast/sustainable-fisheries/madison-swanson-and-steamboat-lumps-marine-protected-areas",
    polygon: [
      [28.50, -84.70], [28.62, -84.70], [28.62, -84.45],
      [28.50, -84.45], [28.50, -84.70]
    ],
  },
  // ── GRAY'S REEF NATIONAL MARINE SANCTUARY (GEORGIA) ────────────────────
  // 22 sq nm of live-bottom reef 17nm offshore. Fishing permitted with
  // rod and reel only; no bottom-tending gear.
  {
    name: "Gray's Reef NMS",
    type: "sanctuary",
    color: "#fbbf24",
    desc: "National Marine Sanctuary protecting live-bottom reef 17nm off Sapelo Island. Recreational rod-and-reel fishing permitted.",
    rules: "Rod and reel only. No bottom-tending gear, no spearfishing, no anchoring on the reef.",
    link: "https://graysreef.noaa.gov/management/regulations.html",
    polygon: [
      [31.36, -80.95], [31.45, -80.95], [31.45, -80.83],
      [31.36, -80.83], [31.36, -80.95]
    ],
  },
  // ── MONITOR NATIONAL MARINE SANCTUARY (USS Monitor wreck, NC) ──────────
  // Official NOAA boundary: 1nm-diameter vertical water column centered at
  // 35.00639°N, 75.40889°W (per 15 CFR 922 Subpart F). Area is only 0.785
  // square miles — the sanctuary protects only the wreck site itself. The
  // 16nm SSE of Cape Hatteras. NOTE: chartplotters often display a much
  // larger LABEL or icon around this area, but the legal sanctuary is the
  // 1nm circle drawn here. Garmin Navionics shows extended advisory areas
  // around it that aren't part of the actual restricted zone.
  {
    name: "Monitor NMS",
    type: "noTake",
    color: "#dc2626",
    desc: "Protects the USS Monitor Civil War ironclad wreck site (16nm SSE of Cape Hatteras). 1-nautical-mile-diameter vertical water column. ALL activities prohibited including fishing, diving without permit, anchoring.",
    rules: "ALL FISHING PROHIBITED. No anchoring. Permit required for any activity. Sanctuary is small (1nm diameter) — easy to fish around.",
    link: "https://monitor.noaa.gov/management/regulations.html",
    polygon: [
      [35.00639, -75.39872],
      [35.00958, -75.39949],
      [35.01228, -75.40170],
      [35.01409, -75.40500],
      [35.01472, -75.40889],
      [35.01409, -75.41278],
      [35.01228, -75.41608],
      [35.00958, -75.41829],
      [35.00639, -75.41906],
      [35.00320, -75.41829],
      [35.00050, -75.41608],
      [34.99869, -75.41278],
      [34.99806, -75.40889],
      [34.99869, -75.40500],
      [35.00050, -75.40170],
      [35.00320, -75.39949],
      [35.00639, -75.39872]
    ],
  },
  // ── STELLWAGEN BANK NMS (MASSACHUSETTS) ────────────────────────────────
  // 638 sq nm of productive grounds at the mouth of Massachusetts Bay.
  // Fishing IS permitted — it's not a no-take. Some gear restrictions only.
  {
    name: "Stellwagen Bank NMS",
    type: "sanctuary",
    color: "#fbbf24",
    desc: "National Marine Sanctuary at the mouth of Massachusetts Bay. Hugely productive for tuna, cod, haddock. Recreational fishing fully permitted.",
    rules: "Most fishing permitted. Federal NMFS regs apply (cod closures, bag limits, gear restrictions for some species).",
    link: "https://stellwagen.noaa.gov/visit/recreation/fishing.html",
    polygon: [
      [42.65, -70.65], [42.65, -70.02], [42.05, -70.02],
      [42.05, -70.65], [42.65, -70.65]
    ],
  },
  // ── NORTHEAST CLOSED AREA II (GULF OF MAINE COD RECOVERY) ──────────────
  // Year-round closure for cod stock recovery. Recreational fishing for
  // cod has been suspended at various times — verify current status.
  {
    name: "NE Closed Area II",
    type: "closure",
    color: "#ef4444",
    desc: "Year-round groundfish closure for cod stock recovery in the Gulf of Maine. Affects cod, haddock, flounder, hake retention.",
    rules: "Recreational cod fishing currently closed in Gulf of Maine federal waters. Verify current status with NOAA before fishing.",
    link: "https://www.fisheries.noaa.gov/new-england-mid-atlantic/recreational-fishing/recreational-fishing-northeast",
    polygon: [
      [41.50, -67.30], [41.50, -66.50], [40.80, -66.50],
      [40.80, -67.30], [41.50, -67.30]
    ],
  },
  // ── SOUTHERN CALIFORNIA ───────────────────────────────────────────────────
  // Channel Islands NMS — simplified outer boundary (full CFR boundary has
  // ~100+ vertices; this is a planning reference, not a navigation chart).
  {
    name: "Channel Islands NMS",
    type: "sanctuary",
    color: "#fbbf24",
    desc: "National Marine Sanctuary around the northern Channel Islands and Santa Barbara Island (~1,110 sq nm). Fishing is permitted in much of the sanctuary but with strict gear, method, and zone restrictions. Numerous no-take marine reserves inside.",
    rules: "Varies by zone — many areas prohibit bottom fishing or all take. Check NOAA sanctuary maps and California MPA regulations before fishing.",
    link: "https://channelislands.noaa.gov/manage/regulations.html",
    polygon: [
      [33.94, -119.27], [34.18, -119.93], [34.17, -119.96], [34.14, -120.25],
      [34.11, -120.43], [33.52, -120.66], [33.36, -119.91], [33.54, -119.92],
      [33.94, -119.27]
    ],
  },
  // Cowcod conservation area — simplified offshore envelope (actual boundary
  // follows depth/latitude lines in federal regs; verify before bottom fishing).
  {
    name: "SoCal Cowcod Conservation Area",
    type: "hapc",
    color: "#a855f7",
    desc: "Federal cowcod conservation area off Southern California. Bottom fishing for rockfish and other groundfish is heavily restricted in this broad offshore zone.",
    rules: "Strict cowcod and rockfish conservation rules apply. Many bottom-fishing methods prohibited or limited. Verify 50 CFR 660 and PFMC regs.",
    link: "https://www.fisheries.noaa.gov/west-coast/fisheries/groundfish/cowcod-conservation-areas",
    polygon: [
      [32.0, -121.5], [36.67, -121.5], [36.67, -117.2], [32.0, -117.2], [32.0, -121.5]
    ],
  },
  // La Jolla State Marine Reserve (no-take)
  {
    name: "La Jolla SMR",
    type: "noTake",
    color: "#dc2626",
    desc: "California State Marine Reserve off La Jolla — all fishing and take prohibited.",
    rules: "NO FISHING. No take of any kind. Possession of fishing gear in deployed position prohibited.",
    link: "https://wildlife.ca.gov/Conservation/Marine/MPAs/La-Jolla",
    polygon: [
      [32.892, -117.278], [32.892, -117.252], [32.868, -117.252], [32.868, -117.278], [32.892, -117.278]
    ],
  },
  // Cabrillo State Marine Reserve (San Diego)
  {
    name: "Cabrillo SMR",
    type: "noTake",
    color: "#dc2626",
    desc: "California State Marine Reserve at Cabrillo National Monument area — all fishing prohibited.",
    rules: "NO FISHING. No take of any kind within the reserve boundary.",
    link: "https://wildlife.ca.gov/Conservation/Marine/MPAs/Cabrillo",
    polygon: [
      [32.692, -117.252], [32.692, -117.228], [32.668, -117.228], [32.668, -117.252], [32.692, -117.252]
    ],
  },
  // ── THE BAHAMAS ───────────────────────────────────────────────────────────
  // Exuma Cays Land & Sea Park — world's first land-and-sea park (BNT, est. 1959).
  // Official boundary corners per Bahamas National Trust (DMS converted to decimal).
  {
    name: "Exuma Cays Land & Sea Park",
    type: "noTake",
    color: "#dc2626",
    desc: "Bahamas National Trust no-take reserve (~176 sq mi). Nothing living or dead may be removed — no fishing, conching, lobstering, or shelling.",
    rules: "NO FISHING. No take of any marine or fisheries resource. Fines and vessel confiscation for violations.",
    link: "https://bnt.bs/explore/exuma/exuma-cays-land-sea-park/",
    polygon: [
      [24.5103, -76.8769], [24.5917, -76.7639], [24.3103, -76.4797],
      [24.2403, -76.6006], [24.5103, -76.8769]
    ],
  },
  // Moriah Harbour Cay NP — simplified envelope (BNT map is reference-only;
  // western boundary ~3.5 nm into Exuma Sound, eastern ~3 nm off Forbes Hill).
  {
    name: "Moriah Harbour Cay NP",
    type: "noTake",
    color: "#dc2626",
    desc: "Bahamas National Trust national park between Great Exuma and Stocking Island. All extractive fishing prohibited — no hook-and-line, spearfishing, netting, or trapping.",
    rules: "NO FISHING. No extractive fishing of any kind. Bonefishing on the fly may be permitted in designated zones — verify current BNT rules.",
    link: "https://bnt.bs/explore/exuma/moriah-harbour-cay-national-park/",
    polygon: [
      [23.56, -75.84], [23.56, -75.56], [23.38, -75.56], [23.38, -75.84], [23.56, -75.84]
    ],
  },
  // Walker's Cay National Park — zoned BNT marine park north of Walker's Cay.
  // Simplified planning envelope; actual park uses management zones.
  {
    name: "Walker's Cay National Park",
    type: "sanctuary",
    color: "#fbbf24",
    desc: "Bahamas National Trust marine park around the barrier reef north of Walker's Cay. Zoned management — spearfishing and gill nets prohibited; some zones restrict all take.",
    rules: "Check BNT zoning maps. Spearfishing and destructive gear prohibited. Verify zone rules before fishing near the reef.",
    link: "https://bnt.bs/explore/abaco/walkers-cay-national-park/",
    polygon: [
      [27.35, -78.55], [27.35, -78.25], [27.20, -78.25], [27.20, -78.55], [27.35, -78.55]
    ],
  },
];
