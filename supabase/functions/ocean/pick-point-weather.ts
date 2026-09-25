/**
 * Choose wind, seas, and pressure for one map point.
 *
 * A buoy reading is used only when it is recent and close to the point.
 * Otherwise the value comes from the model at that lat/lng (GFS wind and
 * pressure, WaveWatch seas). That stops a dead offshore buoy, or a buoy
 * tens of miles away in different water, from painting calm seas on a
 * stormy spot.
 */

export type WxField = {
  value: number | null;
  dir?: number | null;
  periodS?: number | null;
  observedAtMs: number | null;
};

export const BUOY_OBS_MAX_AGE_MS = 6 * 3600 * 1000;
/** Significant wave height changes fast with depth and shelter. */
export const BUOY_WAVE_MAX_NM = 50;
/** Wind and the 24h pressure trend stay useful a bit farther away. */
export const BUOY_WIND_MAX_NM = 70;

export function fieldFresh(
  field: { value: number | null; observedAtMs: number | null } | null | undefined,
  nowMs: number,
  maxAgeMs = BUOY_OBS_MAX_AGE_MS,
): boolean {
  if (!field || field.value == null || field.observedAtMs == null) return false;
  const age = nowMs - field.observedAtMs;
  return age >= -15 * 60 * 1000 && age <= maxAgeMs;
}

export function pickPointWeather(args: {
  nowMs: number;
  buoyWind: WxField | null;
  buoyWindNm: number | null;
  buoyWaves: WxField | null;
  buoyWaveNm: number | null;
  buoyPressure: WxField | null;
  buoyPressureNm: number | null;
  buoyBarometer: WxField | null;
  modelWind: WxField;
  modelPressure: WxField;
  modelBarometer: WxField;
  marineWaves: WxField;
}) {
  const useWind = fieldFresh(args.buoyWind, args.nowMs)
    && args.buoyWind?.dir != null
    && args.buoyWindNm != null
    && args.buoyWindNm <= BUOY_WIND_MAX_NM;
  const useWaves = fieldFresh(args.buoyWaves, args.nowMs)
    && args.buoyWaveNm != null
    && args.buoyWaveNm <= BUOY_WAVE_MAX_NM;
  const usePressure = fieldFresh(args.buoyPressure, args.nowMs)
    && args.buoyPressureNm != null
    && args.buoyPressureNm <= BUOY_WIND_MAX_NM;
  const useBaro = fieldFresh(args.buoyBarometer, args.nowMs)
    && args.buoyPressureNm != null
    && args.buoyPressureNm <= BUOY_WIND_MAX_NM;
  return {
    wind: useWind ? args.buoyWind! : args.modelWind,
    waves: useWaves ? args.buoyWaves! : args.marineWaves,
    pressure: usePressure ? args.buoyPressure! : args.modelPressure,
    barometer: useBaro ? args.buoyBarometer! : args.modelBarometer,
    windFrom: useWind ? "buoy" as const : "model" as const,
    wavesFrom: useWaves ? "buoy" as const : "model" as const,
  };
}
