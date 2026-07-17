/* Bluewater Intel — NOAA CO-OPS tide station catalog (client-side fallback)
 * The ocean edge function resolves stations via NOAA mdapi, but that endpoint
 * often times out. The header, conditions panel, and 6-day forecast still need
 * a station id for hi/lo predictions — datagetter works reliably once we have one.
 * This bundled reference-station list covers US Atlantic, Gulf, and Pacific
 * fishing ports; nearest-station lookup runs entirely in the browser. */

const COOPS_REF_TIDE_STATIONS = [
  // New England / Northeast
  { id: "8410140", lat: 44.903, lng: -66.981 },   // Eastport, ME
  { id: "8413320", lat: 44.392, lng: -68.204 },   // Bar Harbor, ME
  { id: "8418150", lat: 43.657, lng: -70.247 },   // Portland, ME
  { id: "8423898", lat: 43.079, lng: -70.857 },   // Portsmouth, NH
  { id: "8443970", lat: 42.355, lng: -71.052 },   // Boston, MA
  { id: "8449130", lat: 41.285, lng: -70.096 },   // Nantucket, MA
  { id: "8454000", lat: 41.504, lng: -71.326 },   // Newport, RI
  { id: "8510512", lat: 41.048, lng: -71.925 },   // Montauk, NY
  { id: "8518750", lat: 40.700, lng: -74.014 },   // The Battery, NY
  { id: "8534720", lat: 39.355, lng: -74.418 },   // Atlantic City, NJ
  { id: "8536110", lat: 38.967, lng: -74.960 },   // Cape May, NJ
  { id: "8570283", lat: 38.328, lng: -75.091 },   // Ocean City, MD
  { id: "8571892", lat: 38.317, lng: -75.628 },   // Ocean City Inlet
  { id: "8575512", lat: 37.607, lng: -75.691 },   // Chincoteague, VA
  { id: "8638610", lat: 36.966, lng: -76.113 },   // Sewells Point, VA
  { id: "8638909", lat: 37.032, lng: -76.458 },   // Jamestown, VA
  { id: "8573364", lat: 38.983, lng: -76.482 },   // Annapolis, MD
  { id: "8574680", lat: 39.213, lng: -76.245 },   // Baltimore, MD
  { id: "8551910", lat: 39.585, lng: -75.588 },   // Delaware City, DE
  // Southeast Atlantic
  { id: "8651370", lat: 36.183, lng: -75.746 },   // Duck Pier, NC
  { id: "8652587", lat: 35.796, lng: -75.548 },   // Oregon Inlet Marina, NC
  { id: "8654467", lat: 35.208, lng: -75.704 },   // Hatteras, NC
  { id: "8656483", lat: 34.717, lng: -76.671 },   // Beaufort, NC
  { id: "8658120", lat: 34.227, lng: -77.953 },   // Wilmington, NC
  { id: "8665530", lat: 32.781, lng: -79.924 },   // Charleston, SC
  { id: "8669748", lat: 33.350, lng: -79.186 },   // Georgetown, SC
  { id: "8670870", lat: 32.037, lng: -80.903 },   // Fort Pulaski, GA
  { id: "8677340", lat: 30.671, lng: -81.466 },   // Fernandina Beach, FL
  { id: "8720218", lat: 30.386, lng: -81.558 },   // Mayport, FL
  { id: "8721604", lat: 28.415, lng: -80.593 },   // Trident Pier, FL
  { id: "8722670", lat: 26.612, lng: -80.034 },   // Lake Worth Pier, FL
  { id: "8723214", lat: 25.773, lng: -80.132 },   // Virginia Key, FL
  { id: "8724580", lat: 24.551, lng: -81.808 },   // Key West, FL
  { id: "8725110", lat: 26.132, lng: -81.807 },   // Naples, FL
  { id: "8725520", lat: 26.648, lng: -81.871 },   // Fort Myers, FL
  { id: "8726724", lat: 27.978, lng: -82.831 },   // Clearwater Beach, FL
  { id: "8727520", lat: 29.135, lng: -83.031 },   // Cedar Key, FL
  { id: "8728690", lat: 29.726, lng: -84.981 },   // Apalachicola, FL
  { id: "8729108", lat: 30.152, lng: -85.667 },   // Panama City, FL
  { id: "8729840", lat: 30.404, lng: -87.211 },   // Pensacola, FL
  // Gulf Coast
  { id: "8735180", lat: 30.250, lng: -88.075 },   // Dauphin Island, AL
  { id: "8737048", lat: 30.359, lng: -88.452 },   // Mobile State Docks, AL
  { id: "8761724", lat: 29.263, lng: -89.957 },   // Grand Isle, LA
  { id: "8764044", lat: 29.118, lng: -90.199 },   // Port Fourchon, LA
  { id: "8768094", lat: 29.449, lng: -91.338 },   // Calcasieu Pass, LA
  { id: "8770579", lat: 29.868, lng: -93.930 },   // Sabine Pass, TX
  { id: "8771450", lat: 29.310, lng: -94.793 },   // Galveston Pier 21, TX
  { id: "8772447", lat: 28.949, lng: -95.302 },   // Freeport, TX
  { id: "8773767", lat: 28.449, lng: -96.395 },   // Port O'Connor, TX
  { id: "8774770", lat: 27.833, lng: -97.061 },   // Port Aransas, TX
  { id: "8779748", lat: 26.073, lng: -97.215 },   // South Padre Island, TX
  // Pacific
  { id: "9413450", lat: 36.605, lng: -121.888 }, // Monterey, CA
  { id: "9412110", lat: 35.169, lng: -120.754 }, // Port San Luis, CA
  { id: "9411340", lat: 34.403, lng: -119.692 }, // Santa Barbara, CA
  { id: "9410840", lat: 34.008, lng: -118.500 }, // Santa Monica, CA
  { id: "9410660", lat: 33.720, lng: -118.272 }, // Los Angeles, CA
  { id: "9410230", lat: 33.460, lng: -117.698 }, // Dana Point, CA
  { id: "9410170", lat: 32.715, lng: -117.173 }, // San Diego, CA
];

function nmBetweenCoords(lat1, lng1, lat2, lng2){
  const dlat = (lat2 - lat1) * 60;
  const dlng = (lng2 - lng1) * 60 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function nearestCoopsTideStation(lat, lng, maxNm){
  const cap = (maxNm != null && isFinite(maxNm)) ? maxNm : 90;
  let best = null, bestNm = Infinity;
  for(const s of COOPS_REF_TIDE_STATIONS){
    const nm = nmBetweenCoords(lat, lng, s.lat, s.lng);
    if(nm < bestNm){ bestNm = nm; best = s; }
  }
  return (best && bestNm <= cap) ? best.id : null;
}
