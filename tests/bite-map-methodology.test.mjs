/* Bite banner must not grow a methodology row — native iOS/Android share this grid. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeChecker } from "./load-bw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = makeChecker();

const index = readFileSync(join(ROOT, "index.html"), "utf8");
const core = readFileSync(join(ROOT, "bw-core.js"), "utf8");

console.log("\nBite score banner has no methodology row:");
{
  check("index.html has no bite-banner-methodology slot",
    !/bite-banner-methodology/.test(index));
  check("index.html does not say How the bite map works",
    !/How the bite map works/i.test(index));
  check("bw-core.js does not inject How the bite map works",
    !/How the bite map works/i.test(core));
  check("phone bite banner still places forecast on grid row 4",
    /#bite-banner #bite-banner-forecast\{grid-column:1 \/ -1;grid-row:4\}/.test(index));
  check("desktop forecast toggle is grid row 4, not shoved down by a methodology row",
    /#bite-banner \.bite-fc-toggle\{grid-column:1 \/ -1;grid-row:4\}/.test(index));
}

done();
