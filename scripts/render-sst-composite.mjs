#!/usr/bin/env node
// Paint one fixed-scale SST picture per fishing region from the latest NASA
// GIBS MUR composite, mask land with the app coastline, and upload the PNGs
// plus a manifest to the chart-tiles bucket (sst/v1/). The phone downloads
// the home-port picture and pans it; it does not refetch on each move.
//
//   node scripts/render-sst-composite.mjs
//   node scripts/render-sst-composite.mjs --no-upload
//   node scripts/render-sst-composite.mjs --only=socal,centralca
//
// --only paints those pictures and merges them into sst-composite.json.
// Coasts that are no longer in COASTS (the old single Pacific picture) are
// dropped. Atlantic and Gulf entries stay, including their previous files.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { COASTS, MANIFEST_REV, sstRampRGBA } from "./sst-composite-lib.mjs";
import { decodePng } from "./png-decode.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.SST_COMPOSITE_OUT || "/tmp/sst-coasts";
const STEP = 0.01;
const Z = 7;
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default";
const CMAP_URL = "https://raw.githubusercontent.com/nasa-gibs/onearth/main/src/test/colormap_txt_test_data/expected_outputs/GHRSST_Sea_Surface_Temperature_expected.txt";
const BUCKET = "chart-tiles";
const PREFIX = "sst/v1";
const PROJECT_REF = "mealpzwbjamkjdrsszqe";
const noUpload = process.argv.includes("--no-upload");

function coastFilter(){
  const arg = process.argv.find(a => a.startsWith("--only="));
  if(!arg) return null;
  const ids = arg.slice("--only=".length).split(",").map(s => s.trim()).filter(Boolean);
  if(!ids.length) throw new Error("--only needs at least one coast id");
  for(const id of ids){
    if(!COASTS[id]) throw new Error("unknown coast " + id);
  }
  return new Set(ids);
}

function loadEnv(){
  const env = { ...process.env };
  const envPath = join(root, ".env");
  if(!existsSync(envPath)) return env;
  for(const line of readFileSync(envPath, "utf8").split("\n")){
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if(!m || line.trimStart().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function crc32(buf){
  let c = ~0;
  for(let i = 0; i < buf.length; i++){
    c ^= buf[i];
    for(let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type, data){
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for(let y = 0; y < h; y++){
    const dest = y * (w * 4 + 1);
    raw[dest] = 0;
    rgba.copy(raw, dest + 1, y * w * 4, (y + 1) * w * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function loadLandTools(){
  const src = readFileSync(join(root, "bw-core.js"), "utf8");
  const start = src.indexOf("function mainlandCoastLng(");
  const end = src.indexOf("function atlanticShelfWidthDeg(");
  const polyStart = src.indexOf("const MAIN_COAST = [");
  const polyEnd = src.indexOf("\n", src.indexOf("const LAND_POLYGONS = "));
  const bayStart = src.indexOf("const CHESAPEAKE_BAY_WATER = [");
  const bayEnd = src.indexOf("];", bayStart) + 2;
  const code = [
    src.slice(start, end),
    src.slice(polyStart, polyEnd),
    src.slice(bayStart, bayEnd),
    "globalThis.barrierCoastLng = barrierCoastLng;",
    "globalThis.LAND_POLYGONS = LAND_POLYGONS;",
    "globalThis.CHESAPEAKE_BAY_WATER = CHESAPEAKE_BAY_WATER;",
  ].join("\n");
  const ctx = {};
  vm.runInNewContext(code, ctx);
  return ctx;
}

function fillPolygon(mask, w, h, points, toX, toY, value){
  const edges = [];
  for(let i = 0; i < points.length; i++){
    const a = points[i];
    const b = points[(i + 1) % points.length];
    let y1 = toY(a[0]);
    let y2 = toY(b[0]);
    let x1 = toX(a[1]);
    let x2 = toX(b[1]);
    if(y1 === y2) continue;
    if(y1 > y2){
      const ty = y1; y1 = y2; y2 = ty;
      const tx = x1; x1 = x2; x2 = tx;
    }
    edges.push({ y1, y2, x: x1, dx: (x2 - x1) / (y2 - y1) });
  }
  if(!edges.length) return;
  const yMin = Math.max(0, Math.floor(Math.min(...edges.map(e => e.y1))));
  const yMax = Math.min(h - 1, Math.ceil(Math.max(...edges.map(e => e.y2))));
  for(let y = yMin; y <= yMax; y++){
    const xs = [];
    for(const e of edges){
      if(y + 0.5 >= e.y1 && y + 0.5 < e.y2) xs.push(e.x + (y + 0.5 - e.y1) * e.dx);
    }
    xs.sort((p, q) => p - q);
    for(let i = 0; i + 1 < xs.length; i += 2){
      let x0 = Math.max(0, Math.ceil(xs[i]));
      let x1 = Math.min(w - 1, Math.floor(xs[i + 1]));
      const row = y * w;
      for(let x = x0; x <= x1; x++) mask[row + x] = value;
    }
  }
}

function mercY(lat, z){
  const n = 2 ** z;
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
}
function mercX(lng, z){
  return (lng + 180) / 360 * (2 ** z);
}

async function fetchBuf(url){
  const res = await fetch(url, { headers: { "User-Agent": "bwi-sst-composite" } });
  if(!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function probeDate(){
  const now = new Date();
  for(let back = 0; back <= 4; back++){
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - back);
    const date = d.toISOString().slice(0, 10);
    const url = `${GIBS}/${date}/GoogleMapsCompatible_Level7/6/25/18.png`;
    try{
      const res = await fetch(url, { method: "GET", headers: { "User-Agent": "bwi-sst-composite" } });
      if(res.ok && Number(res.headers.get("content-length") || 1) > 500){
        await res.arrayBuffer();
        return date;
      }
    }catch{ /* try the previous day */ }
  }
  throw new Error("No recent GIBS MUR composite");
}

async function loadColormap(){
  const text = (await fetchBuf(CMAP_URL)).toString("utf8");
  const exact = new Map();
  const rows = [];
  for(const line of text.split("\n")){
    const p = line.trim().split(/\s+/);
    if(p.length < 4) continue;
    const k = Number(p[0]);
    if(!Number.isFinite(k) || k < 200 || k > 400) continue;
    const r = Number(p[1]), g = Number(p[2]), b = Number(p[3]);
    const f = (k - 273.15) * 9 / 5 + 32;
    exact.set(`${r},${g},${b}`, f);
    rows.push({ r, g, b, f });
  }
  if(rows.length < 50) throw new Error("colormap too short");
  return { exact, rows };
}

function nearestTemp(map, r, g, b){
  const hit = map.exact.get(`${r},${g},${b}`);
  if(hit != null) return hit;
  let best = Infinity;
  let temp = null;
  for(const row of map.rows){
    const d = (row.r - r) ** 2 + (row.g - g) ** 2 + (row.b - b) ** 2;
    if(d < best){ best = d; temp = row.f; }
  }
  return best <= 36 ? temp : null;
}

async function mapPool(items, limit, fn){
  const out = new Array(items.length);
  let next = 0;
  async function worker(){
    while(next < items.length){
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function tileKeysFor(coast){
  const x0 = Math.floor(mercX(coast.w, Z));
  const x1 = Math.floor(mercX(coast.e, Z));
  const y0 = Math.floor(mercY(coast.n, Z));
  const y1 = Math.floor(mercY(coast.s, Z));
  const keys = [];
  for(let x = x0; x <= x1; x++){
    for(let y = y0; y <= y1; y++) keys.push(`${x}/${y}`);
  }
  return keys;
}

async function loadTiles(date, keys){
  const tiles = new Map();
  let done = 0;
  await mapPool(keys, 8, async (key) => {
    const url = `${GIBS}/${date}/GoogleMapsCompatible_Level7/${Z}/${key.split("/")[1]}/${key.split("/")[0]}.png`;
    try{
      const buf = await fetchBuf(url);
      tiles.set(key, decodePng(buf));
    }catch{
      tiles.set(key, null);
    }
    done++;
    if(done % 20 === 0 || done === keys.length) console.log(`  tiles ${done}/${keys.length}`);
  });
  return tiles;
}

function sampleTile(tiles, lat, lng){
  const x = mercX(lng, Z);
  const y = mercY(lat, Z);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tile = tiles.get(`${tx}/${ty}`);
  if(!tile) return null;
  const px = Math.min(255, Math.max(0, Math.floor((x - tx) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((y - ty) * 256)));
  const i = (py * 256 + px) * 4;
  if(tile.data[i + 3] < 16) return null;
  return [tile.data[i], tile.data[i + 1], tile.data[i + 2]];
}

function paintCoast(coast, tiles, cmap, land){
  const w = Math.round((coast.e - coast.w) / STEP);
  const h = Math.round((coast.n - coast.s) / STEP);
  const toX = lng => (lng - coast.w) / STEP;
  const toY = lat => (coast.n - lat) / STEP;
  const mask = new Uint8Array(w * h);
  for(const poly of land.LAND_POLYGONS) fillPolygon(mask, w, h, poly, toX, toY, 1);
  if(coast.w > -100){
    for(let row = 0; row < h; row++){
      const lat = coast.n - (row + 0.5) * STEP;
      if(lat < 33.8 || lat > 36.6) continue;
      const cut = land.barrierCoastLng(lat);
      const xCut = Math.floor(toX(cut));
      const rowBase = row * w;
      for(let x = 0; x < Math.min(w, xCut); x++) mask[rowBase + x] = 1;
    }
  }
  fillPolygon(mask, w, h, land.CHESAPEAKE_BAY_WATER, toX, toY, 0);
  const rgba = Buffer.alloc(w * h * 4);
  let water = 0;
  for(let row = 0; row < h; row++){
    const lat = coast.n - (row + 0.5) * STEP;
    for(let col = 0; col < w; col++){
      if(mask[row * w + col]) continue;
      const lng = coast.w + (col + 0.5) * STEP;
      const rgb = sampleTile(tiles, lat, lng);
      if(!rgb) continue;
      const temp = nearestTemp(cmap, rgb[0], rgb[1], rgb[2]);
      if(temp == null) continue;
      const c = sstRampRGBA(temp, coast.lo, coast.hi);
      const o = (row * w + col) * 4;
      const edge = Math.min(lat - coast.s, coast.n - lat, lng - coast.w, coast.e - lng);
      const fade = edge >= 0.5 ? 1 : Math.max(0, edge / 0.5);
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = Math.round(235 * fade);
      water++;
    }
  }
  return { png: encodePng(w, h, rgba), w, h, water };
}

function sampleTemp(tiles, cmap, lat, lng){
  const rgb = sampleTile(tiles, lat, lng);
  if(!rgb) return null;
  return { rgb, f: nearestTemp(cmap, rgb[0], rgb[1], rgb[2]) };
}

async function fetchServiceRoleKey(accessToken){
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if(!res.ok) throw new Error(`api-keys ${res.status}`);
  const keys = await res.json();
  const sr = keys.find(k => k.name === "service_role");
  if(!sr?.api_key?.startsWith("eyJ")) throw new Error("no JWT service_role");
  return sr.api_key;
}

async function uploadAll(env, files){
  const url = (env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`).replace(/\/$/, "");
  let key = env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key?.startsWith("eyJ")) key = await fetchServiceRoleKey(env.SUPABASE_ACCESS_TOKEN);
  for(const file of files){
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${PREFIX}/${file.name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": file.type,
        "cache-control": file.cache,
        "x-upsert": "true",
      },
      body: file.body,
    });
    if(!res.ok) throw new Error(`${file.name}: ${res.status} ${await res.text()}`);
    console.log("  uploaded", file.name, file.body.length);
  }
}

function coastEntry(id, coast){
  return {
    file: `${id}.png`,
    label: coast.label,
    lo: coast.lo,
    hi: coast.hi,
    s: coast.s, n: coast.n, w: coast.w, e: coast.e,
    coreLat: coast.coreLat, coreLng: coast.coreLng,
  };
}

async function main(){
  const only = coastFilter();
  console.log("probing GIBS date");
  const date = await probeDate();
  console.log("composite", date, only ? "only " + [...only].join(",") : "all coasts");
  const cmap = await loadColormap();
  const land = loadLandTools();
  const selected = Object.entries(COASTS).filter(([id]) => !only || only.has(id));
  const keys = [...new Set(selected.flatMap(([, coast]) => tileKeysFor(coast)))];
  console.log("tiles", keys.length);
  const tiles = await loadTiles(date, keys);
  const covers = (lat, lng) => selected.some(([, coast]) =>
    lat >= coast.s && lat <= coast.n && lng >= coast.w && lng <= coast.e);
  if(covers(35.54, -74.85)){
    const point = sampleTemp(tiles, cmap, 35.536, -74.845);
    const shelf = sampleTemp(tiles, cmap, 35.65, -75.15);
    const offshore = sampleTemp(tiles, cmap, 35.54, -74.55);
    console.log("check The Point", point && point.f?.toFixed(1), "shelf", shelf && shelf.f?.toFixed(1), "east", offshore && offshore.f?.toFixed(1));
  }
  const checks = [
    ["San Diego bight", 32.72, -117.55],
    ["Tanner Bank", 32.72, -119.12],
    ["Santa Barbara", 34.30, -119.85],
    ["Port San Luis", 35.10, -121.05],
    ["Morro Bay", 35.30, -121.20],
    ["Monterey", 36.60, -122.20],
  ];
  for(const [name, lat, lng] of checks){
    if(!covers(lat, lng)) continue;
    const hit = sampleTemp(tiles, cmap, lat, lng);
    console.log("  temp", name, hit && hit.f != null ? hit.f.toFixed(1) : "none");
  }
  mkdirSync(OUT, { recursive: true });
  let manifest;
  if(only){
    manifest = JSON.parse(readFileSync(join(root, "sst-composite.json"), "utf8"));
    for(const id of Object.keys(manifest.coasts || {})){
      if(!COASTS[id]) delete manifest.coasts[id];
    }
  }else{
    manifest = { coasts: {} };
  }
  manifest.version = 1;
  manifest.rev = MANIFEST_REV;
  manifest.observed = date;
  manifest.stepDeg = STEP;
  manifest.coasts = manifest.coasts || {};
  const uploads = [];
  for(const [id, coast] of selected){
    console.log("paint", id, coast.lo + "-" + coast.hi);
    const painted = paintCoast(coast, tiles, cmap, land);
    const name = `${id}.png`;
    writeFileSync(join(OUT, name), painted.png);
    console.log(" ", name, painted.w, "x", painted.h, "water", painted.water, "bytes", painted.png.length);
    manifest.coasts[id] = coastEntry(id, coast);
    uploads.push({ name, body: painted.png, type: "image/png", cache: "86400" });
  }
  if(!only){
    for(const id of Object.keys(manifest.coasts)){
      if(!COASTS[id]) delete manifest.coasts[id];
    }
  }
  const manifestBody = Buffer.from(JSON.stringify(manifest));
  writeFileSync(join(OUT, "manifest.json"), manifestBody);
  // The tile bucket accepts PNG only. The manifest ships with the app.
  writeFileSync(join(root, "sst-composite.json"), manifestBody);
  if(noUpload){
    console.log("skip upload");
    return;
  }
  console.log("upload");
  await uploadAll(loadEnv(), uploads);
  console.log("done", date);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
