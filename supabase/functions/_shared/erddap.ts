// NOAA CoastWatch ERDDAP (coastwatch.noaa.gov) 403s the default Deno
// User-Agent that Supabase Edge sends — even when we set a custom one,
// some runtimes still identify as Deno/x. PolarWatch hosts the same
// griddap datasets and allows that UA. Prefer PolarWatch; if a caller
// still hits coastwatch.noaa.gov and gets 403, retry there.

export const ERDDAP_POLARWATCH = "https://polarwatch.noaa.gov/erddap/griddap";
export const ERDDAP_COASTWATCH = "https://coastwatch.noaa.gov/erddap/griddap";

export const ERDDAP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; BluewaterIntel/1.0; +https://bluewaterintel.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/csv, application/json;q=0.9, */*;q=0.8",
};

function polarwatchMirror(url: string): string | null {
  if (!url.includes("://coastwatch.noaa.gov/erddap")) return null;
  return url.replace("://coastwatch.noaa.gov/erddap", "://polarwatch.noaa.gov/erddap");
}

export async function fetchNoaa(
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  const attempt = async (u: string): Promise<Response | null> => {
    try {
      return await fetch(u, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: ERDDAP_HEADERS,
      });
    } catch {
      return null;
    }
  };
  let r = await attempt(url);
  if (r && r.ok) return r;
  const mirror = polarwatchMirror(url);
  if (mirror && (!r || r.status === 403)) {
    const r2 = await attempt(mirror);
    if (r2) return r2;
  }
  return r;
}
