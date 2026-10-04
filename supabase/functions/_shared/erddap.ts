// NOAA CoastWatch ERDDAP hosts mirror the same griddap dataset ids.
// PolarWatch (polarwatch.noaa.gov) was the default fallback when
// coastwatch.noaa.gov 403'd Deno's User-Agent. As of Oct 2026 PolarWatch's
// TLS cert can expire while coastwatch remains valid — fetchNoaa tries both.

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

function coastwatchMirror(url: string): string | null {
  if (!url.includes("://polarwatch.noaa.gov/erddap")) return null;
  return url.replace("://polarwatch.noaa.gov/erddap", "://coastwatch.noaa.gov/erddap");
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

  const cw = coastwatchMirror(url);
  if (cw) {
    const rCw = await attempt(cw);
    if (rCw && rCw.ok) return rCw;
    if (rCw) r = rCw;
  }

  const pw = polarwatchMirror(url);
  if (pw && (!r || r.status === 403)) {
    const rPw = await attempt(pw);
    if (rPw && rPw.ok) return rPw;
    if (rPw) r = rPw;
  }
  return r;
}
