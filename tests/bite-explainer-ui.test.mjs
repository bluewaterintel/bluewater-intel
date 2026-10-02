/* Bite explainer must not expose blend weights or factor share percentages. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeChecker } from "./load-bw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(join(ROOT, "bw-core.js"), "utf8");
const { check, done } = makeChecker();

check("explainer does not render factor share percentages", !/\$\{share\}%/.test(core));
check("explainer does not describe blend weight shares",
  !/share of the blend/i.test(core) && !/percent beside each name/i.test(core));
check("explainer still describes favorability bar length", /peak season fills the bar/i.test(core));

done();
