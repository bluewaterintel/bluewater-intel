/* Bite map methodology copy — structure sources disclosed to users. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const { biteMapMethodologyHtml, predictChartedStructureAllowed } = loadBw([
  "biteMapMethodologyHtml", "predictChartedStructureAllowed",
]);

const { check, done } = makeChecker();

console.log("\nBite map methodology blurb:");
{
  const html = biteMapMethodologyHtml();
  check("mentions Bite Score", /Bite Score/i.test(html));
  check("mentions structure / wrecks", /structure|wreck|reef|ledge/i.test(html));
  check("says heat is not every plotted wreck", /not.*every wreck|not all plotted|#1–#3|#1-#3/i.test(html));
  check("charted line when premium allowed",
    predictChartedStructureAllowed()
      ? /charted wreck|waypoint/i.test(html)
      : /curated major|Upgrade to Pro/i.test(html));
}

done();
