// Fixed-scale SST pictures. One picture per fishing region so a pan inside
// that region never recolors, and a 79–84°F Carolina break still has room
// in the rainbow. Bounds are the georeferenced image, wider than a normal
// run from the home port.

export const SST_RAMP_STOPS = [
  [0.00, 37, 99, 196],
  [0.14, 45, 160, 214],
  [0.28, 56, 190, 186],
  [0.42, 90, 196, 120],
  [0.54, 180, 206, 70],
  [0.64, 230, 200, 55],
  [0.74, 236, 154, 42],
  [0.84, 226, 96, 40],
  [0.93, 204, 60, 48],
  [1.00, 176, 40, 52],
];

// Pictures overlap, and the renderer feathers the outer half-degree, so a
// pan across Virginia or off the Stream does not hit a hard edge. The home
// port's picture stays on top until the view actually leaves it.
export const COASTS = {
  newengland: {
    label: "New England", lo: 45, hi: 70,
    s: 38.8, n: 45.8, w: -74.2, e: -63.0,
    coreLat: 43.2, coreLng: -69.8,
  },
  midatlantic: {
    label: "Mid-Atlantic", lo: 58, hi: 82,
    s: 35.2, n: 42.2, w: -78.2, e: -66.0,
    coreLat: 38.6, coreLng: -74.6,
  },
  carolinas: {
    label: "Carolinas", lo: 66, hi: 88,
    s: 26.2, n: 39.6, w: -82.2, e: -66.0,
    coreLat: 33.8, coreLng: -77.2,
  },
  southflorida: {
    label: "South Florida", lo: 74, hi: 90,
    s: 23.2, n: 30.2, w: -84.0, e: -72.0,
    coreLat: 25.6, coreLng: -79.6,
  },
  gulf: {
    label: "Gulf", lo: 70, hi: 90,
    s: 23.5, n: 31.2, w: -98.2, e: -80.5,
    coreLat: 28.2, coreLng: -89.5,
  },
  pacific: {
    label: "Pacific", lo: 52, hi: 74,
    s: 30.8, n: 38.4, w: -128.5, e: -116.2,
    coreLat: 34.2, coreLng: -120.2,
  },
};

// Northeast Florida stays on the Carolinas picture so a summer 79–84°F
// break is on the same 66–88°F ramp as Oregon Inlet. Stuart and south,
// including the Bahamas crossings, use the South Florida ramp.
export const PORT_COAST = {
  "Stonington, ME": "newengland",
  "Jonesport, ME": "newengland",
  "Portland, ME": "newengland",
  "Kennebunkport, ME": "newengland",
  "Portsmouth, NH": "newengland",
  "Gloucester, MA": "newengland",
  "Boston, MA": "newengland",
  "Cape Cod, MA": "newengland",
  "Point Judith, RI": "newengland",
  "Sandy Hook, NJ": "midatlantic",
  "Freeport, NY": "midatlantic",
  "Montauk, NY": "midatlantic",
  "Manasquan Inlet, NJ": "midatlantic",
  "Atlantic City, NJ": "midatlantic",
  "Cape May, NJ": "midatlantic",
  "Ocean City, MD": "midatlantic",
  "Chincoteague, VA": "midatlantic",
  "Virginia Beach, VA": "midatlantic",
  "Cape Charles, VA": "midatlantic",
  "Reedville, VA": "midatlantic",
  "Coles Point, VA": "midatlantic",
  "Solomons, MD": "midatlantic",
  "Colonial Beach, VA": "midatlantic",
  "Annapolis, MD": "midatlantic",
  "Baltimore, MD": "midatlantic",
  "Delaware City, DE": "midatlantic",
  "Oregon Inlet, NC": "carolinas",
  "Hatteras, NC": "carolinas",
  "Morehead City, NC": "carolinas",
  "Oak Island, NC": "carolinas",
  "Myrtle Beach, SC": "carolinas",
  "Murrells Inlet, SC": "carolinas",
  "Charleston, SC": "carolinas",
  "Savannah, GA": "carolinas",
  "Brunswick, GA": "carolinas",
  "St. Augustine, FL": "carolinas",
  "Jacksonville, FL": "carolinas",
  "Daytona Beach, FL": "carolinas",
  "Port Canaveral, FL": "carolinas",
  "Melbourne, FL": "carolinas",
  "Vero Beach, FL": "carolinas",
  "Stuart, FL": "southflorida",
  "Palm Beach, FL": "southflorida",
  "Fort Lauderdale, FL": "southflorida",
  "Miami, FL": "southflorida",
  "Bimini, Bahamas": "southflorida",
  "West End, Bahamas": "southflorida",
  "Chub Cay, Bahamas": "southflorida",
  "Walker's Cay, Bahamas": "southflorida",
  "Marsh Harbour, Bahamas": "southflorida",
  "Islamorada, FL": "southflorida",
  "Marathon, FL": "southflorida",
  "Key West, FL": "southflorida",
  "Clearwater, FL": "gulf",
  "Tampa Bay, FL": "gulf",
  "Sarasota, FL": "gulf",
  "Venice, FL": "gulf",
  "Fort Myers, FL": "gulf",
  "Naples, FL": "gulf",
  "Crystal River, FL": "gulf",
  "Cedar Key, FL": "gulf",
  "Steinhatchee, FL": "gulf",
  "Apalachicola, FL": "gulf",
  "Panama City, FL": "gulf",
  "Destin, FL": "gulf",
  "Pensacola, FL": "gulf",
  "Dauphin Island, AL": "gulf",
  "Biloxi, MS": "gulf",
  "Venice, LA": "gulf",
  "Grand Isle, LA": "gulf",
  "Houma, LA": "gulf",
  "Morgan City, LA": "gulf",
  "New Iberia, LA": "gulf",
  "Cameron, LA": "gulf",
  "Lake Charles, LA": "gulf",
  "Sabine Pass, TX": "gulf",
  "Galveston, TX": "gulf",
  "Freeport, TX": "gulf",
  "Matagorda, TX": "gulf",
  "Port O'Connor, TX": "gulf",
  "Port Aransas, TX": "gulf",
  "Port Mansfield, TX": "gulf",
  "Port Isabel, TX": "gulf",
  "Monterey, CA": "pacific",
  "Moss Landing, CA": "pacific",
  "Morro Bay, CA": "pacific",
  "Port San Luis, CA": "pacific",
  "Santa Barbara, CA": "pacific",
  "Ventura, CA": "pacific",
  "Marina del Rey, CA": "pacific",
  "San Pedro, CA": "pacific",
  "Newport Beach, CA": "pacific",
  "Dana Point, CA": "pacific",
  "Oceanside, CA": "pacific",
  "San Diego, CA": "pacific",
};

export function coastForPort(name){
  return PORT_COAST[name] || null;
}

export function sstRampRGBA(tempF, lo, hi){
  if(!Number.isFinite(tempF)) return null;
  const span = Math.max(0.001, hi - lo);
  const u = Math.max(0, Math.min(1, (tempF - lo) / span));
  let i = 0;
  while(i < SST_RAMP_STOPS.length - 2 && u > SST_RAMP_STOPS[i + 1][0]) i++;
  const a = SST_RAMP_STOPS[i];
  const b = SST_RAMP_STOPS[i + 1];
  const f = (u - a[0]) / Math.max(0.001, b[0] - a[0]);
  return [
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    Math.round(a[3] + (b[3] - a[3]) * f),
    255,
  ];
}

export function rampUnit(tempF, lo, hi){
  return Math.max(0, Math.min(1, (tempF - lo) / Math.max(0.001, hi - lo)));
}
