/* Pin the Front Convergence overlay to the live NOAA blended-SSH IDs. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ocean = readFileSync(join(ROOT, "supabase/functions/ocean/index.ts"), "utf8");
const client = readFileSync(join(ROOT, "bw-ocean.js"), "utf8");

console.log("Front convergence overlay still points at NOAA blended SSH:");
check("SSH dataset id is noaacwBLENDEDsshDaily",
  /ALTIMETRY_SSH_DATASET = "noaacwBLENDEDsshDaily"/.test(ocean));
check("currents sibling is noaacwBLENDEDNRTcurrentsDaily",
  /ALTIMETRY_CUR_DATASET = "noaacwBLENDEDNRTcurrentsDaily"/.test(ocean));
check("host is coastwatch.noaa.gov, not the retired pfeg nesdisSSH1day host",
  ocean.includes("https://coastwatch.noaa.gov/erddap/griddap")
  && ocean.includes("nesdisSSH1day (pfeg host) stopped updating"));
check("overlay client waits 55s like SST, not 20s",
  /fetchAltimetryGrid[\s\S]*fetchTimeout\(55000\)/.test(client)
  && !/fetchAltimetryGrid[\s\S]*fetchTimeout\(20000\)/.test(client));

done();
