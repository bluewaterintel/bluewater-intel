/* Seas and wind at a point must not come from a stale or distant buoy. */
import { pickPointWeather } from "../supabase/functions/ocean/pick-point-weather.ts";

const now = Date.parse("2026-09-25T14:20:00Z");
const fresh = now - 30 * 60 * 1000;
const july = Date.parse("2026-07-30T03:50:00Z");

function check(label, ok) {
  if (!ok) {
    console.error("FAIL", label);
    process.exitCode = 1;
  } else {
    console.log("ok", label);
  }
}

const deadHatteras = pickPointWeather({
  nowMs: now,
  buoyWind: { value: 5.8, dir: 310, observedAtMs: july },
  buoyWindNm: 139,
  buoyWaves: { value: 8.2, periodS: 8, observedAtMs: july },
  buoyWaveNm: 139,
  buoyPressure: { value: -5.1, observedAtMs: july },
  buoyPressureNm: 139,
  buoyBarometer: { value: 1008.8, observedAtMs: july },
  modelWind: { value: 29.3, dir: 20, observedAtMs: fresh },
  modelPressure: { value: -4.2, observedAtMs: fresh },
  modelBarometer: { value: 1012, observedAtMs: fresh },
  marineWaves: { value: 16.7, periodS: 12, observedAtMs: fresh },
});
check("stale distant buoy does not supply seas", deadHatteras.waves.value === 16.7 && deadHatteras.wavesFrom === "model");
check("stale distant buoy does not supply wind", deadHatteras.wind.value === 29.3 && deadHatteras.windFrom === "model");
check("stale pressure trend is replaced by the model", deadHatteras.pressure.value === -4.2);

const duckTooFar = pickPointWeather({
  nowMs: now,
  buoyWind: { value: null, dir: null, observedAtMs: null },
  buoyWindNm: null,
  buoyWaves: { value: 14.8, periodS: 14, observedAtMs: fresh },
  buoyWaveNm: 66,
  buoyPressure: { value: null, observedAtMs: null },
  buoyPressureNm: null,
  buoyBarometer: { value: null, observedAtMs: null },
  modelWind: { value: 29, dir: 10, observedAtMs: fresh },
  modelPressure: { value: -3, observedAtMs: fresh },
  modelBarometer: { value: 1012, observedAtMs: fresh },
  marineWaves: { value: 16.7, periodS: 12, observedAtMs: fresh },
});
check("a fresh buoy beyond 50 nm does not override seas at the pin", duckTooFar.waves.value === 16.7);

const diamond = pickPointWeather({
  nowMs: now,
  buoyWind: { value: 27.2, dir: 360, observedAtMs: fresh },
  buoyWindNm: 22,
  buoyWaves: { value: 16.1, periodS: 13, observedAtMs: fresh },
  buoyWaveNm: 33,
  buoyPressure: { value: -3.0, observedAtMs: fresh },
  buoyPressureNm: 22,
  buoyBarometer: { value: 1012.2, observedAtMs: fresh },
  modelWind: { value: 29, dir: 20, observedAtMs: fresh },
  modelPressure: { value: -4.2, observedAtMs: fresh },
  modelBarometer: { value: 1011, observedAtMs: fresh },
  marineWaves: { value: 16.7, periodS: 12, observedAtMs: fresh },
});
check("nearby fresh buoy wind is kept", diamond.wind.value === 27.2 && diamond.windFrom === "buoy");
check("nearby fresh buoy seas are kept", diamond.waves.value === 16.1 && diamond.wavesFrom === "buoy");

if (process.exitCode) process.exit(process.exitCode);
console.log("sea-state-source.test.mjs OK");
