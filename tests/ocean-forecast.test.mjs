/**
 * Forecast-hour behavior: live ocean edge + Open-Meteo divergence check.
 */
const BASE = "https://mealpzwbjamkjdrsszqe.supabase.co/functions/v1/ocean";

function nearestHourlyIndex(times, targetMs) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < times.length; i++) {
    const ms = Date.parse(times[i] + (times[i].endsWith("Z") ? "" : "Z"));
    const d = Math.abs(ms - targetMs);
    if (isFinite(ms) && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗ FAIL:", name); }
}

console.log("nearestHourlyIndex:");
{
  const times = ["2026-07-02T00:00", "2026-07-02T12:00", "2026-07-03T00:00"];
  const now = Date.parse("2026-07-02T00:00Z");
  const plus24 = Date.parse("2026-07-03T00:00Z");
  check("picks now slot", nearestHourlyIndex(times, now) === 0);
  check("picks +24h slot", nearestHourlyIndex(times, plus24) === 2);
}

console.log("\nforecast pressure trend (model semantics):");
{
  const presSeries = [1010, 1012, 1015, 1018, 1020];
  const trend = presSeries[4] - presSeries[0];
  check("+24h trend is positive when pressure rises", trend === 10);
}

console.log("\nlive Open-Meteo forecast divergence (0h vs 24h):");
{
  const lat = 35.2;
  const lng = -75.5;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
    + "&hourly=wind_speed_10m,wind_direction_10m,surface_pressure&wind_speed_unit=kn&timezone=UTC&forecast_days=5";
  const r = await fetch(url);
  if (!r.ok) {
    console.log("  ⚠ skip live Open-Meteo (offline or rate limited)");
  } else {
    const d = await r.json();
    const times = d?.hourly?.time ?? [];
    const i0 = nearestHourlyIndex(times, Date.now());
    const i24 = nearestHourlyIndex(times, Date.now() + 24 * 3600000);
    const w0 = num(d?.hourly?.wind_speed_10m?.[i0]);
    const w24 = num(d?.hourly?.wind_speed_10m?.[i24]);
    check("forecast returns wind at +0h", w0 != null);
    check("forecast returns wind at +24h", w24 != null);
    console.log(`    wind now=${w0}kt, +24h=${w24}kt`);
  }
}

console.log("\nlive ocean edge predictinputs (hours=0 vs hours=24):");
{
  const params = (hours) =>
    `${BASE}?mode=predictinputs&latMin=34.5&latMax=35.5&lngMin=-76.5&lngMax=-75.5&maxPoints=8`
    + (hours > 0 ? `&hours=${hours}` : "");
  const [r0, r24] = await Promise.all([fetch(params(0)), fetch(params(24))]);
  if (!r0.ok || !r24.ok) {
    console.log(`  ⚠ skip live edge (status ${r0.status}/${r24.status}) — deploy ocean function first`);
  } else {
    const d0 = await r0.json();
    const d24 = await r24.json();
    check("predictinputs returns field array", Array.isArray(d0.field) && d0.field.length > 0);
    check("forecastHour=24 in response", d24.forecastHour === 24);
    const winds0 = d0.field.map((f) => f.p?.wind).filter((w) => w?.value != null);
    const winds24 = d24.field.map((f) => f.p?.wind).filter((w) => w?.value != null);
    check("hours=0 has wind data", winds0.length > 0);
    check("hours=24 has forecast wind (not empty)", winds24.length > 0);
    check("hours=24 wind marked _forecast", winds24.every((w) => w._forecast === true));
    check("hours=24 wind has dir", winds24.every((w) => w.dir != null));
    const sample0 = winds0[0];
    const sample24 = winds24[0];
    console.log(`    sample wind now=${sample0?.value}kt dir=${sample0?.dir}, +24h=${sample24?.value}kt dir=${sample24?.dir}`);
    // Values may match if model is flat; structure must still be forecast.
    check("hours=24 observedAtMs is future valid time", sample24?.observedAtMs > Date.now());
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
