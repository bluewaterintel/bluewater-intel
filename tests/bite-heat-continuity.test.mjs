import { loadBw, makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const {
  habitatScoreScale, predictHeatCellVisible, isPredictWater, classifyWaterType,
} = loadBw([
  "habitatScoreScale", "predictHeatCellVisible", "isPredictWater", "classifyWaterType",
]);

console.log("\nBay-mouth water stays on the heat map, in green:");
{
  const bay = { lat: 36.95, lng: -76.05 };
  const mouth = { lat: 36.95, lng: -75.85 };
  check("lower Chesapeake cell is bay habitat", classifyWaterType(bay.lat, bay.lng) === "bay");
  check("redfish keep a full scale inside the bay", habitatScoreScale("redfish", bay.lat, bay.lng) === 1);
  check("the mouth just outside the bay box is still water", isPredictWater(mouth.lat, mouth.lng));
  check("redfish scale the mouth down into the green band",
    habitatScoreScale("redfish", mouth.lat, mouth.lng) === 0.2);
  check("the mouth is still painted", predictHeatCellVisible(mouth.lat, mouth.lng, "redfish"));
  check("land stays blank", !predictHeatCellVisible(36.85, -76.29, "redfish"));
}

done();
