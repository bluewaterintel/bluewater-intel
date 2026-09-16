/* Bite map methodology copy — structure sources disclosed to users. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const { biteMapMethodologyHtml } = loadBw(["biteMapMethodologyHtml"]);

const { check, done } = makeChecker();

console.log("\nBite map methodology blurb:");
{
  const html = biteMapMethodologyHtml();
  check("mentions Bite Score", /Bite Score/i.test(html));
  check("mentions structure / wrecks", /structure|wreck|reef|ledge/i.test(html));
  check("says heat is not every plotted wreck", /not.*every wreck|not all plotted|#1–#3|#1-#3/i.test(html));
  check("names charted waypoint database", /charted wreck|Waypoints layer/i.test(html));
  check("no free-tier bite map upsell", !/Upgrade to Pro|free tier/i.test(html));
}

done();
