/* Map layer defaults to 60 nm; Waypoints & Structure panel defaults to 120 nm. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(join(ROOT, "bw-core.js"), "utf8");
const ui = readFileSync(join(ROOT, "bw-waypoints-ui.js"), "utf8");

console.log("Waypoint default radius and export slider:");
check("map layer default radius is 60 nm",
  /let wpRadiusNm = 60/.test(core) && /WP_MAP_DEFAULT_RADIUS_NM = 60/.test(core));
check("Waypoints & Structure panel default remains 120 nm",
  /WP_DEFAULT_RADIUS_NM = 120/.test(core));
check("toggling waypoints on seeds the map default radius",
  /key==="waypoints"[\s\S]*layerVis\.waypoints[\s\S]*setWpRadius[\s\S]*WP_MAP_DEFAULT_RADIUS_NM/.test(core));
check("Import/Export slider tops out at 120 nm",
  /MCE_SLIDER_MAX_NM = 120/.test(core) && /max="120"/.test(ui) && /Max 120 nm/.test(ui));
check("Waypoints public tab has a distance-from-port dropdown",
  /wpOnPanelRadiusChange/.test(ui) && /Within \$\{nm\} nm/.test(ui));
check("opening Waypoints & Structure seeds 120 nm for Pro users",
  /openWaypoints[\s\S]*setWpRadius[\s\S]*WP_DEFAULT_RADIUS_NM/.test(ui));

done();
