/* Major fishing areas (CANYONS) — named pins and species ids. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const { CANYONS, SPECIES } = loadBw(["CANYONS", "SPECIES"], ["bw-data-canyons.js", "bw-data-species.js"]);

const byName = (name) => CANYONS.find((c) => c.name === name);
const speciesIds = new Set(SPECIES.map((s) => s.id));

console.log("Canyon catalog pins:");
{
  const alvin = byName("Alvin Canyon");
  check("Alvin Canyon is listed", !!alvin);
  check("Alvin Canyon lat/lng",
    alvin && Math.abs(alvin.lat - 40.02604) < 0.00005 && Math.abs(alvin.lng + 70.48691) < 0.00005);
  check("Alvin Canyon defaults to canyon type", !alvin.type || alvin.type === "canyon");

  const dip = byName("The Dip");
  check("The Dip is listed", !!dip);
  check("The Dip lat/lng",
    dip && Math.abs(dip.lat - 39.81434) < 0.00005 && Math.abs(dip.lng + 71.74896) < 0.00005);

  const badFish = [alvin, dip]
    .flatMap((c) => (c.fish || []).filter((id) => !speciesIds.has(id)));
  check(`Alvin and The Dip fish ids are known species (${badFish.join(", ") || "clean"})`, badFish.length === 0);
}

done();
