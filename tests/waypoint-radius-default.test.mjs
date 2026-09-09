/* Default waypoint browse/export radius is 120 nm with a 120 nm export slider. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(join(ROOT, "bw-core.js"), "utf8");
const ui = readFileSync(join(ROOT, "bw-waypoints-ui.js"), "utf8");

console.log("Waypoint default radius and export slider:");
check("default map/panel radius is 120 nm",
  /let wpRadiusNm = 120/.test(core) && /WP_DEFAULT_RADIUS_NM = 120/.test(core));
check("Import/Export slider tops out at 120 nm",
  /MCE_SLIDER_MAX_NM = 120/.test(core) && /max="120"/.test(ui) && /Max 120 nm/.test(ui));
check("Waypoints public tab has a distance-from-port dropdown",
  /wpOnPanelRadiusChange/.test(ui) && /Within \$\{nm\} nm/.test(ui));
check("opening Waypoints & Structure seeds 120 nm for Pro users",
  /openWaypoints[\s\S]*setWpRadius[\s\S]*WP_DEFAULT_RADIUS_NM/.test(ui));

done();
