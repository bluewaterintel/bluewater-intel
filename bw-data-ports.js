/* Bluewater Intel — data module: Ports (home ports + metadata)
 * Extracted from index.html (Approach A modularization). Loaded as a plain
 * classic <script src> before the main app script, so these top-level
 * const declarations remain global and file:// offline still works.
 * DO NOT convert to an ES module (breaks file:// via CORS). */

const PORTS={
  // ── NEW ENGLAND / NORTHEAST ──────────────────────────────────────────
  // Downeast Maine inshore: covers the Penobscot Bay / Mount Desert /
  // Cobscook Bay ramps that sit 70–155nm from Portland.
  "Stonington, ME":    {lat:44.157, lng:-68.667, short:"Stonington"},
  "Jonesport, ME":     {lat:44.532, lng:-67.597, short:"Jonesport"},
  "Portland, ME":      {lat:43.659, lng:-70.255, short:"Portland"},
  "Kennebunkport, ME": {lat:43.357, lng:-70.477, short:"Kennebunkport"},
  "Portsmouth, NH":    {lat:43.075, lng:-70.755, short:"Portsmouth"},
  "Gloucester, MA":    {lat:42.61,  lng:-70.66,  short:"Gloucester"},
  "Boston, MA":        {lat:42.36,  lng:-71.05,  short:"Boston"},
  "Cape Cod, MA":      {lat:42.05,  lng:-70.18,  short:"Cape Cod"},
  "Point Judith, RI":  {lat:41.36,  lng:-71.48,  short:"Pt Judith"},
  // ── MID-ATLANTIC ─────────────────────────────────────────────────────
  "Montauk, NY":       {lat:41.035, lng:-71.96,  short:"Montauk"},
  "Long Beach, NY":    {lat:40.583, lng:-73.66,  short:"Long Beach"},
  "Freeport, NY":      {lat:40.59,  lng:-73.575, short:"Freeport"},
  "Toms River, NJ":    {lat:39.945, lng:-74.165, short:"Toms River"},
  "Atlantic City, NJ": {lat:39.355, lng:-74.418, short:"Atlantic City"},
  "Cape May, NJ":      {lat:38.93,  lng:-74.91,  short:"Cape May"},
  "Ocean City, MD":    {lat:38.33,  lng:-75.08,  short:"Ocean City"},
  "Chincoteague, VA":  {lat:37.933, lng:-75.379, short:"Chincoteague"},
  "Virginia Beach, VA":{lat:36.85,  lng:-75.98,  short:"VA Beach"},
  // ── CHESAPEAKE BAY · POTOMAC RIVER · DELAWARE BAY (inshore) ──────────
  // Added to surface the large cluster of bay/river boat ramps that sit
  // far inland from the coastal inlet ports. Together these cover all
  // ~59 Chesapeake/Potomac/Delaware Bay ramps within the 40nm default.
  "Cape Charles, VA":  {lat:37.27,  lng:-76.02,  short:"Cape Charles"},
  "Reedville, VA":     {lat:37.84,  lng:-76.28,  short:"Reedville"},
  "Solomons, MD":      {lat:38.32,  lng:-76.45,  short:"Solomons"},
  "Colonial Beach, VA":{lat:38.255, lng:-76.96,  short:"Colonial Beach"},
  "Coles Point, VA":   {lat:38.157, lng:-76.625, short:"Coles Point"},
  "Annapolis, MD":     {lat:38.978, lng:-76.49,  short:"Annapolis"},
  "Baltimore, MD":     {lat:39.27,  lng:-76.58,  short:"Baltimore"},
  "Delaware City, DE": {lat:39.575, lng:-75.588, short:"Delaware City"},
  // ── SOUTHEAST ────────────────────────────────────────────────────────
  "Oregon Inlet, NC":  {lat:35.78,  lng:-75.55,  short:"Oregon Inlet"},
  "Hatteras, NC":      {lat:35.21,  lng:-75.69,  short:"Hatteras"},
  "Morehead City, NC": {lat:34.72,  lng:-76.73,  short:"Morehead"},
  "Oak Island, NC":    {lat:33.91,  lng:-78.11,  short:"Oak Island"},
  "Myrtle Beach, SC":  {lat:33.68,  lng:-78.89,  short:"Myrtle Beach"},
  "Murrells Inlet, SC":{lat:33.55,  lng:-79.03,  short:"Murrells Inlet"},
  "Charleston, SC":    {lat:32.77,  lng:-79.93,  short:"Charleston"},
  // ── SOUTH ATLANTIC ───────────────────────────────────────────────────
  "Savannah, GA":      {lat:32.04,  lng:-80.90,  short:"Savannah"},
  "Brunswick, GA":     {lat:31.15,  lng:-81.49,  short:"Brunswick"},
  "St. Augustine, FL": {lat:29.89,  lng:-81.31,  short:"St. Augustine"},
  "Jacksonville, FL":  {lat:30.40,  lng:-81.40,  short:"Jacksonville"},
  "Daytona Beach, FL": {lat:29.21,  lng:-81.00,  short:"Daytona"},
  "Port Canaveral, FL":{lat:28.40,  lng:-80.60,  short:"Pt. Canaveral"},
  "Melbourne, FL":     {lat:28.08,  lng:-80.60,  short:"Melbourne"},
  "Vero Beach, FL":    {lat:27.64,  lng:-80.37,  short:"Vero Beach"},
  // ── FLORIDA EAST COAST ───────────────────────────────────────────────
  "Stuart, FL":        {lat:27.20,  lng:-80.16,  short:"Stuart"},
  "Palm Beach, FL":    {lat:26.70,  lng:-80.04,  short:"Palm Beach"},
  "Fort Lauderdale, FL":{lat:26.10, lng:-80.10,  short:"Ft. Lauderdale"},
  "Miami, FL":         {lat:25.77,  lng:-80.18,  short:"Miami"},
  // ── BAHAMAS (common crossings from Florida + marquee grounds) ────────
  // The three classic FL-crossing gateways plus Abacos hubs. Fishing grounds
  // (Bimini Wall, Tongue of the Ocean, etc.) are Major Fishing Areas on the
  // map — not ports.
  "Bimini, Bahamas":            {lat:25.735, lng:-79.297, short:"Bimini"},
  "West End, Bahamas":          {lat:26.686, lng:-78.977, short:"West End"},
  "Chub Cay, Bahamas":          {lat:25.412, lng:-77.882, short:"Chub Cay"},
  "Walker's Cay, Bahamas":      {lat:27.259, lng:-78.399, short:"Walker's Cay"},
  "Marsh Harbour, Bahamas":     {lat:26.541, lng:-77.063, short:"Marsh Harbour"},
  // ── FLORIDA KEYS ─────────────────────────────────────────────────────
  "Islamorada, FL":    {lat:24.93,  lng:-80.62,  short:"Islamorada"},
  "Marathon, FL":      {lat:24.72,  lng:-81.09,  short:"Marathon"},
  "Key West, FL":      {lat:24.55,  lng:-81.78,  short:"Key West"},
  // ── FLORIDA GULF COAST ──────────────────────────────────────────────
  "Naples, FL":        {lat:26.14,  lng:-81.80,  short:"Naples"},
  "Fort Myers, FL":    {lat:26.65,  lng:-81.95,  short:"Fort Myers"},
  "Sarasota, FL":      {lat:27.34,  lng:-82.58,  short:"Sarasota"},
  "Venice, FL":        {lat:27.10,  lng:-82.45,  short:"Venice"},
  "Clearwater, FL":    {lat:27.975, lng:-82.831, short:"Clearwater"},
  "Tampa Bay, FL":     {lat:27.77,  lng:-82.55,  short:"Tampa Bay"},
  "Crystal River, FL": {lat:28.90,  lng:-82.65,  short:"Crystal River"},
  "Cedar Key, FL":     {lat:29.14,  lng:-83.03,  short:"Cedar Key"},
  "Steinhatchee, FL":  {lat:29.67,  lng:-83.39,  short:"Steinhatchee"},
  // ── FLORIDA PANHANDLE ───────────────────────────────────────────────
  "Apalachicola, FL":  {lat:29.73,  lng:-84.99,  short:"Apalachicola"},
  "Panama City, FL":   {lat:30.16,  lng:-85.67,  short:"Panama City"},
  "Destin, FL":        {lat:30.39,  lng:-86.50,  short:"Destin"},
  "Pensacola, FL":     {lat:30.41,  lng:-87.22,  short:"Pensacola"},
  // ── ALABAMA / MISSISSIPPI ───────────────────────────────────────────
  "Dauphin Island, AL":{lat:30.25,  lng:-88.08,  short:"Dauphin Island"},
  "Biloxi, MS":        {lat:30.40,  lng:-88.89,  short:"Biloxi"},
  // ── LOUISIANA ────────────────────────────────────────────────────────
  "Venice, LA":        {lat:29.27,  lng:-89.36,  short:"Venice LA"},
  "Grand Isle, LA":    {lat:29.24,  lng:-90.00,  short:"Grand Isle"},
  "Houma, LA":         {lat:29.59,  lng:-90.72,  short:"Houma"},
  "Cameron, LA":       {lat:29.80,  lng:-93.32,  short:"Cameron"},
  "Lake Charles, LA":  {lat:30.22,  lng:-93.22,  short:"Lake Charles"},
  // Atchafalaya Basin / Vermilion Bay inshore: covers New Iberia, Butte
  // La Rose, Cypremort Point ramps 55–66nm from the coastal LA ports.
  "Morgan City, LA":   {lat:29.694, lng:-91.207, short:"Morgan City"},
  "New Iberia, LA":    {lat:30.00,  lng:-91.82,  short:"New Iberia"},
  // ── TEXAS COAST ──────────────────────────────────────────────────────
  "Sabine Pass, TX":   {lat:29.73,  lng:-93.87,  short:"Sabine Pass"},
  "Galveston, TX":     {lat:29.30,  lng:-94.80,  short:"Galveston"},
  "Freeport, TX":      {lat:28.95,  lng:-95.36,  short:"Freeport"},
  "Matagorda, TX":     {lat:28.69,  lng:-95.97,  short:"Matagorda"},
  "Port O'Connor, TX": {lat:28.45,  lng:-96.39,  short:"Port O'Connor"},
  "Port Aransas, TX":  {lat:27.83,  lng:-97.06,  short:"Port Aransas"},
  // Lower Laguna Madre inshore: covers Port Mansfield, Arroyo Colorado /
  // Rio Hondo, and the Brownsville-area ramps 80–110nm from Port Aransas.
  "Port Mansfield, TX":{lat:26.55,  lng:-97.43,  short:"Port Mansfield"},
  "Port Isabel, TX":   {lat:26.073, lng:-97.21,  short:"Port Isabel"},
  // ── CALIFORNIA (Monterey → San Diego) ────────────────────────────────
  "Monterey, CA":          {lat:36.604, lng:-121.888, short:"Monterey"},
  "Moss Landing, CA":      {lat:36.804, lng:-121.786, short:"Moss Landing"},
  "Morro Bay, CA":         {lat:35.369, lng:-120.854, short:"Morro Bay"},
  "Port San Luis, CA":     {lat:35.171, lng:-120.754, short:"Port San Luis"},
  "Santa Barbara, CA":     {lat:34.403, lng:-119.692, short:"Santa Barbara"},
  "Ventura, CA":           {lat:34.248, lng:-119.264, short:"Ventura"},
  "Marina del Rey, CA":    {lat:33.978, lng:-118.451, short:"Marina del Rey"},
  "San Pedro, CA":         {lat:33.736, lng:-118.272, short:"San Pedro"},
  "Newport Beach, CA":     {lat:33.618, lng:-117.929, short:"Newport Beach"},
  "Dana Point, CA":        {lat:33.461, lng:-117.698, short:"Dana Point"},
  "Oceanside, CA":         {lat:33.195, lng:-117.385, short:"Oceanside"},
  "San Diego, CA":         {lat:32.723, lng:-117.174, short:"San Diego"},
};
