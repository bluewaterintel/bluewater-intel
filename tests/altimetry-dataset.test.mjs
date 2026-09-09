/* Pin the Front Convergence overlay to the live NOAA blended-SSH IDs. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ocean = readFileSync(join(ROOT, "supabase/functions/ocean/index.ts"), "utf8");
const shared = readFileSync(join(ROOT, "supabase/functions/_shared/erddap.ts"), "utf8");
const client = readFileSync(join(ROOT, "bw-ocean.js"), "utf8");
const core = readFileSync(join(ROOT, "bw-core.js"), "utf8");

console.log("Front convergence overlay still points at NOAA blended SSH:");
check("SSH dataset id is noaacwBLENDEDsshDaily",
  /ALTIMETRY_SSH_DATASET = "noaacwBLENDEDsshDaily"/.test(ocean));
check("currents sibling is noaacwBLENDEDNRTcurrentsDaily",
  /ALTIMETRY_CUR_DATASET = "noaacwBLENDEDNRTcurrentsDaily"/.test(ocean));
check("default host is PolarWatch, not coastwatch.noaa.gov (Deno UA 403)",
  ocean.includes("ERDDAP_POLARWATCH")
  && shared.includes("https://polarwatch.noaa.gov/erddap/griddap")
  && shared.includes("polarwatch.noaa.gov/erddap")
  && ocean.includes("nesdisSSH1day (pfeg host) stopped updating"));
check("403 from coastwatch.noaa.gov retries PolarWatch",
  shared.includes("coastwatch.noaa.gov/erddap")
  && /status === 403/.test(shared));
check("empty altimetry grid is 502 no-store, not a 6h cached 200",
  /altimetrygrid[\s\S]*status: 502[\s\S]*Cache-Control": "no-store"/.test(ocean));
check("overlay client waits 55s like SST, not 20s",
  /fetchAltimetryGrid[\s\S]*fetchTimeout\(55000\)/.test(client)
  && !/fetchAltimetryGrid[\s\S]*fetchTimeout\(20000\)/.test(client));
check("overlay client does not HTTP-cache empty altimetry responses",
  /fetchAltimetryGrid[\s\S]*cache: "no-store"/.test(client));
check("legend shows Loading… while Front Convergence is fetching",
  core.includes("FRONT CONVERGENCE (SSH)") && core.includes("Loading…"));

done();
