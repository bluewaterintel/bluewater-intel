/* Surveyed depth grid sizing and elevation conversion. */
import {
  axisCount,
  bboxOverlapsCudem,
  chooseDemStep,
  demGridPoints,
  DEM_SAMPLE_CAP,
  elevationToDepthM,
} from "../supabase/functions/ocean/cudem-mosaic.ts";

function check(label, ok) {
  if (!ok) {
    console.error("FAIL", label);
    process.exitCode = 1;
  } else {
    console.log("ok", label);
  }
}

check("water elevation becomes depth metres", elevationToDepthM("-14.897484779") === 14.9);
check("land elevation is zero depth", elevationToDepthM(260.8) === 0);
check("sea level is zero depth", elevationToDepthM(0) === 0);
check("NoData is not a sounding", elevationToDepthM("NoData") === null);
check("blank is not a sounding", elevationToDepthM("") === null);

const clickStep = chooseDemStep(29.983, 30.783, -81.743, -80.943);
check("chart click uses a fine step", clickStep === 0.02);
const clickN = demGridPoints(29.983, 30.783, -81.743, -80.943, clickStep).length;
check("chart click stays within the sample cap", clickN > 0 && clickN <= DEM_SAMPLE_CAP);

// Jacksonville port box: 70 nm plus the 0.15° pad used by the bite map.
const cos = Math.cos(30.4 * Math.PI / 180);
const degLat = 70 / 60 + 0.15;
const degLng = 70 / (60 * cos) + 0.15;
const portStep = chooseDemStep(30.4 - degLat, 30.4 + degLat, -81.4 - degLng, -81.4 + degLng);
const portN = axisCount(30.4 - degLat, 30.4 + degLat, portStep)
  * axisCount(-81.4 - degLng, -81.4 + degLng, portStep);
check("port box is sampled, not skipped", portStep <= 0.08);
check("port box stays within the sample cap", portN > 0 && portN <= DEM_SAMPLE_CAP);

check("Gulf and Pacific are inside the mosaic", bboxOverlapsCudem(29.2, 30.4, -87.2, -85.8)
  && bboxOverlapsCudem(32.4, 33.0, -117.8, -117.1));
check("outside US coastal bounds is not sampled", bboxOverlapsCudem(10, 12, -40, -30) === false);

if (process.exitCode) process.exit(process.exitCode);
console.log("cudem mosaic checks passed");
