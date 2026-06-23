#!/usr/bin/env node
/** Apply Milestone 2 client integration patches to index.html */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
const gatePath = join(root, 'auth-gate.html');
let html = readFileSync(htmlPath, 'utf8');
const gate = readFileSync(gatePath, 'utf8');

const replacements = [
  {
    name: 'head scripts',
    old: `<script src="bw-config.js"></script>
<script src="bw-data-source.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>`,
    new: `<script src="bw-config.js"></script>
<script src="bw-data-source.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="bw-auth.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>`,
  },
  {
    name: 'auth gate body',
    old: '<body>\n\n<!-- HEADER -->',
    new: `<body>\n${gate}\n\n<!-- HEADER -->`,
  },
  {
    name: 'init defer user load',
    old: `  catchLoad();
  drawCatchPins();
  drawClosures();
  // Load saved personal waypoints and draw any flagged "show on map" so they
  // persist across reloads alongside the dataset markers (not just while the
  // Waypoints panel is open).
  WP_state.userPoints = wpLoadUser();
  drawUserWaypoints();`,
    new: `  drawCatchPins();
  drawClosures();
  // User waypoints/catches hydrate from account on sign-in (bwOnSignedIn).
  drawUserWaypoints();`,
  },
  {
    name: 'bwOnSignedIn',
    old: `// ════════════════════════════════════════════════════════════════════════════
// NAV MENU
// ════════════════════════════════════════════════════════════════════════════
function toggleNav(){`,
    new: `window.bwOnSignedIn = async function (user) {
  try {
    WP_state.userPoints = await window.BW_AUTH.fetchWaypoints();
    if (typeof drawUserWaypoints === "function") drawUserWaypoints();

    const catches = await window.BW_AUTH.fetchCatches();
    USER_CATCHES.length = 0; catches.forEach((c) => USER_CATCHES.push(c));
    if (typeof catchRenderLog === "function") catchRenderLog();
    drawCatchPins();

    CM_state.log = await window.BW_AUTH.fetchLog("catch_meter");
    TB_state.favorites = await window.BW_AUTH.fetchLog("tide_favorites");
  } catch (e) {
    console.error("Account hydrate failed", e);
    WP_state.userPoints = wpLoadUser();
    catchLoad();
    if (typeof drawUserWaypoints === "function") drawUserWaypoints();
  }
};

// ════════════════════════════════════════════════════════════════════════════
// NAV MENU
// ════════════════════════════════════════════════════════════════════════════
function toggleNav(){`,
  },
  {
    name: 'catchAdd sync',
    old: `  USER_CATCHES.unshift(entry);  // newest first
  // If user opted to share, push to SOCIAL reports feed
  if(entry.shared) catchShareAsReport(entry);
  catchPersist();
  return entry.id;`,
    new: `  USER_CATCHES.unshift(entry);  // newest first
  // If user opted to share, push to SOCIAL reports feed
  if(entry.shared) catchShareAsReport(entry);
  catchPersist();
  if(window.BW_AUTH) window.BW_AUTH.saveCatch(entry).catch(e => console.error("catch sync", e));
  return entry.id;`,
  },
  {
    name: 'catchPersist',
    old: `function catchPersist(){
  try {
    localStorage.setItem("bwi.catches", JSON.stringify(USER_CATCHES));
  } catch(e){ /* storage unavailable — catches stay in memory for this session */ }
}`,
    new: `function catchPersist(){
  try { localStorage.setItem("bwi.catches", JSON.stringify(USER_CATCHES)); } catch(e){}
}`,
  },
  {
    name: 'catchDelete sync',
    old: `function catchDelete(id){
  const idx = USER_CATCHES.findIndex(c => c.id === id);
  if(idx < 0) return false;
  USER_CATCHES.splice(idx, 1);
  catchPersist();
  return true;
}`,
    new: `function catchDelete(id){
  const idx = USER_CATCHES.findIndex(c => c.id === id);
  if(idx < 0) return false;
  USER_CATCHES.splice(idx, 1);
  catchPersist();
  if(window.BW_AUTH) window.BW_AUTH.deleteCatch(id).catch(e => console.error("catch delete sync", e));
  return true;
}`,
  },
  {
    name: 'catchUpdate sync',
    old: `  USER_CATCHES[idx] = Object.assign({}, USER_CATCHES[idx], patch, {id: USER_CATCHES[idx].id});
  catchPersist();
  return true;`,
    new: `  USER_CATCHES[idx] = Object.assign({}, USER_CATCHES[idx], patch, {id: USER_CATCHES[idx].id});
  catchPersist();
  if(window.BW_AUTH) window.BW_AUTH.saveCatch(USER_CATCHES[idx]).catch(e => console.error("catch sync", e));
  return true;`,
  },
  {
    name: 'signIn stub',
    old: `function signIn(){
  alert("Sign in is coming soon — we're wiring up the account backend before launch.");
  // Future:
  //   const result = await api.signIn(email, password);
  //   USER_PREFS.account = result.user;
  //   renderAccountSection();
}
function signUp(){
  alert("Account creation is coming soon — we're wiring up the account backend before launch.");
}
function signOut(){
  if(typeof USER_PREFS !== 'undefined') USER_PREFS.account = null;
  // In production: clear auth token from localStorage, call API logout.
  renderAccountSection();
}`,
    new: `function signIn(){
  document.getElementById("bw-auth-gate").style.display = "flex";
}
function signUp(){
  document.getElementById("bw-auth-gate").style.display = "flex";
}
async function signOut(){
  await window.BW_AUTH.signOut();
  location.reload();
}`,
  },
  {
    name: 'cmSaveLog',
    old: `function cmSaveLog(){
  try {
    localStorage.setItem(CM_LOG_KEY, JSON.stringify(CM_state.log));
  } catch(e){
    alert("Storage full. Delete some old catches.");
  }
}`,
    new: `function cmSaveLog(){
  try { localStorage.setItem(CM_LOG_KEY, JSON.stringify(CM_state.log)); } catch(e){}
  if(window.BW_AUTH) window.BW_AUTH.saveLog("catch_meter", CM_state.log).catch(()=>{});
}`,
  },
  {
    name: 'tbSaveFavs',
    old: `function tbSaveFavs(){
  try { localStorage.setItem(TB_LOG_KEY, JSON.stringify(TB_state.favorites)); }
  catch(e){ alert("Storage full."); }
}`,
    new: `function tbSaveFavs(){
  try { localStorage.setItem(TB_LOG_KEY, JSON.stringify(TB_state.favorites)); } catch(e){}
  if(window.BW_AUTH) window.BW_AUTH.saveLog("tide_favorites", TB_state.favorites).catch(()=>{});
}`,
  },
  {
    name: 'wpSaveUser',
    old: `function wpSaveUser(){
  try { localStorage.setItem(WP_USER_KEY, JSON.stringify(WP_state.userPoints)); }
  catch(e){ alert("Storage full — try removing some waypoints or exporting first."); }
}`,
    new: `function wpSaveUser(){
  try { localStorage.setItem(WP_USER_KEY, JSON.stringify(WP_state.userPoints)); } catch(e){}
}`,
  },
  {
    name: 'openWaypoints',
    old: `function openWaypoints(){
  WP_state.userPoints = wpLoadUser();
  document.getElementById("wp-overlay").style.display = "block";`,
    new: `function openWaypoints(){
  if(!WP_state.userPoints.length) WP_state.userPoints = wpLoadUser();
  document.getElementById("wp-overlay").style.display = "block";`,
  },
  {
    name: 'wpInstallPack sync',
    old: `  wpSaveUser();
  drawUserWaypoints();
  return n;
}`,
    new: `  wpSaveUser();
  const added = WP_state.userPoints.slice(-n);
  if(window.BW_AUTH && added.length) window.BW_AUTH.saveWaypointsBulk(added).catch(e => console.error("waypoint sync", e));
  drawUserWaypoints();
  return n;
}`,
  },
  {
    name: 'wpRemovePack sync',
    old: `  WP_state.userPoints = WP_state.userPoints.filter(p => !(p.pack && p.pack.id === packId));
  // If the source filter was pointing at this pack, reset it.
  if(WP_state.sourceFilter === packId) WP_state.sourceFilter = "all";
  wpSaveUser();`,
    new: `  const toDelete = WP_state.userPoints.filter(p => p.pack && p.pack.id === packId).map(p => p.id);
  WP_state.userPoints = WP_state.userPoints.filter(p => !(p.pack && p.pack.id === packId));
  if(WP_state.sourceFilter === packId) WP_state.sourceFilter = "all";
  wpSaveUser();
  if(window.BW_AUTH) toDelete.forEach(id => window.BW_AUTH.deleteWaypoint(id).catch(e => console.error("waypoint delete", e)));`,
  },
  {
    name: 'wpCopyToMine sync',
    old: `  WP_state.userPoints.push(newPoint);
  wpSaveUser();
  drawUserWaypoints();
  alert(\`"\${p.name}" saved to your waypoints and shown on the map.\`);`,
    new: `  WP_state.userPoints.push(newPoint);
  wpSaveUser();
  if(window.BW_AUTH) window.BW_AUTH.saveWaypoint(newPoint).catch(e => console.error("waypoint sync", e));
  drawUserWaypoints();
  alert(\`"\${p.name}" saved to your waypoints and shown on the map.\`);`,
  },
  {
    name: 'wpSaveEditor sync',
    old: `  wpSaveUser();
  drawUserWaypoints();   // reflect add/edit on the map immediately
  wpCloseEditor();
  wpRender();
}`,
    new: `  wpSaveUser();
  if(window.BW_AUTH) window.BW_AUTH.saveWaypoint(updated).catch(e => console.error("waypoint sync", e));
  drawUserWaypoints();
  wpCloseEditor();
  wpRender();
}`,
  },
  {
    name: 'wpDeleteWaypoint sync',
    old: `  WP_state.userPoints = WP_state.userPoints.filter(x => x.id !== id);
  wpSaveUser();
  drawUserWaypoints();   // remove its marker from the map
  wpRender();
}`,
    new: `  WP_state.userPoints = WP_state.userPoints.filter(x => x.id !== id);
  wpSaveUser();
  if(window.BW_AUTH) window.BW_AUTH.deleteWaypoint(id).catch(e => console.error("waypoint delete", e));
  drawUserWaypoints();
  wpRender();
}`,
  },
  {
    name: 'wpClearAll sync',
    old: `  WP_state.userPoints = [];
  wpSaveUser();
  drawUserWaypoints();   // clear all personal markers from the map
  wpRender();
}`,
    new: `  const allIds = WP_state.userPoints.map(p => p.id);
  WP_state.userPoints = [];
  wpSaveUser();
  if(window.BW_AUTH) allIds.forEach(id => window.BW_AUTH.deleteWaypoint(id).catch(e => console.error("waypoint delete", e)));
  drawUserWaypoints();
  wpRender();
}`,
  },
  {
    name: 'gpx import sync',
    old: `      let added = 0, skipped = 0;
      const guessType = (name, desc) => {`,
    new: `      let added = 0, skipped = 0;
      const newOnes = [];
      const guessType = (name, desc) => {`,
  },
  {
    name: 'gpx push',
    old: `        WP_state.userPoints.push({
          id: "u-" + Date.now() + "-" + i + "-" + Math.random().toString(36).slice(2,7),
          name: name.trim(),
          type: "private",
          sourceType: guessType(name, desc),
          lat, lng,
          depth: ele ? Math.round(parseFloat(ele)) + "m" : null,
          region: null,
          desc: desc ? desc.trim() : null,
          addedAt: new Date().toISOString(),
          // Imported in bulk — left OFF the map by default so a big import
          // doesn't flood it. The user flips "Show on map" per waypoint.
          showOnMap: false,
        });
        added++;`,
    new: `        const wp = {
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
        added++;`,
  },
  {
    name: 'gpx bulk save',
    old: `      wpSaveUser();
      drawUserWaypoints();
      const status = document.getElementById("wp-import-status");`,
    new: `      wpSaveUser();
      if(window.BW_AUTH && newOnes.length) window.BW_AUTH.saveWaypointsBulk(newOnes).catch(e => console.error("waypoint sync", e));
      drawUserWaypoints();
      const status = document.getElementById("wp-import-status");`,
  },
  {
    name: 'privacy text',
    old: `      <h3 style="font-size:13px;color:#7dd3fc;letter-spacing:.12em;font-weight:700;text-transform:uppercase;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(107,191,234,.15)">Privacy &amp; Storage</h3>
      <p style="font-size:13px;color:#c8d8e8">All your personal waypoints are stored on your device using browser localStorage. Nothing is uploaded anywhere unless you choose to. This matters because:</p>
      <ul style="font-size:13px;color:#cfe5ff;padding-left:24px">
        <li>Captains' private numbers stay private — your honey holes are yours</li>
        <li>No account required, no sync, no cloud surveillance</li>
        <li>Works fully offline once the app is loaded</li>
        <li>You control your data — export at any time, delete at any time</li>
      </ul>`,
    new: `      <h3 style="font-size:13px;color:#7dd3fc;letter-spacing:.12em;font-weight:700;text-transform:uppercase;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(107,191,234,.15)">Privacy &amp; Storage</h3>
      <p style="font-size:13px;color:#c8d8e8"><b>Privacy &amp; Storage.</b> Your account holds your waypoints and catches and syncs them across your devices — sign in anywhere and your data is there. Your private numbers are visible only to you: every record is locked to your account by row-level security, so no other user can read it. You stay in control — export your full account data or delete your account at any time.</p>`,
  },
];

for (const r of replacements) {
  if (!html.includes(r.old)) {
    console.error(`PATCH FAILED (${r.name}): anchor not found`);
    process.exit(1);
  }
  html = html.replace(r.old, r.new);
  console.log(`Applied: ${r.name}`);
}

writeFileSync(htmlPath, html);
console.log('M2 patches applied.');
