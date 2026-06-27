# Break detection + convergence — integration (you've already done M4)

This adds a "Break convergence" factor that rewards spots where an SST temperature
break and a chlorophyll color edge COINCIDE — the classic spot (like "The Point")
the old additive scoring under-rewarded because it scored the two edges
separately. The module is unit-tested (22 passing).

Five small edits to your `index.html`, located by anchor text. Then re-test.

============================================================================
## STEP 1 — Load the module
============================================================================
Add the script before your main app script (or paste its contents inline in a
`<script>` block before the prediction code):

```html
<script src="bw-breaks.js"></script>
```
(If you keep everything in one file, paste the full contents of `bw-breaks.js`
inside a `<script>…</script>` ahead of `scoreCell`.)

============================================================================
## STEP 2 — Add a chlorophyll-break + convergence read in scoreCell
============================================================================
In `scoreCell`, you already compute `const tBreak = thermalBreakReal(lat, lng);`.
Right AFTER that line, add:

```js
  // Chlorophyll color-edge gradient + convergence with the SST break. Real data
  // only (uses the same OCEAN_FIELD samples). 0 when the module/data isn't ready.
  let chlorBreak = 0, convergence = 0;
  if (typeof BW_BREAKS !== "undefined" && OCEAN_FIELD && OCEAN_FIELD.samples) {
    const radiusNm = (OCEAN_FIELD.spacingNm ? OCEAN_FIELD.spacingNm * 2.2 : 35);
    chlorBreak = BW_BREAKS.chlorBreak(OCEAN_FIELD.samples, lat, lng, radiusNm);
    convergence = BW_BREAKS.convergenceScore(tBreak, chlorBreak);
  }
```

============================================================================
## STEP 3 — Add the convergence weight to each species profile
============================================================================
Find `PREDICT_WEIGHTS` / the weight tables (anchor: `temperature:   0.26,` for the
offshore/pelagic profile). Add a `convergence` weight to each profile. Suggested
starting values — convergence matters MOST for offshore pelagics, little inshore:

```
  offshore/pelagic profile:  convergence: 0.12,
  structure/bottom profile:  convergence: 0.04,
  inshore profile:           convergence: 0.00,
```

To keep total influence sensible, take this weight from existing factors rather
than adding on top. Recommended for the offshore profile: drop `thermalBreak`
0.21 → 0.14 and `chlorophyll` 0.16 → 0.11, and put that 0.12 into `convergence`.
That way you're REALLOCATING toward the convergence (where both matter together)
rather than inflating the total. Tune to taste.

> If `predictWeightsFor()` returns a profile object, just ensure each returned
> profile has a `convergence` key (defaulting to 0 if absent):
> `const wConv = W.convergence || 0;`

============================================================================
## STEP 4 — Add convergence to the freshness combine factor list
============================================================================
In the `scoreFactors` array passed to `BW_FRESHNESS.combine`, add a convergence
entry. It depends on BOTH sst and chlor freshness; tie it to SST's observedAt
(the break already does) so stale data correctly de-weights it:

Anchor — the existing break line:
```js
    { key:"break",  variable:"sst",      baseWeight:W.thermalBreak,  score:breakScore,       observedAtMs:sstObj.observedAtMs },
```
Add right after it:
```js
    { key:"convergence", variable:"sst",  baseWeight:(W.convergence||0), score:convergence,  observedAtMs:sstObj.observedAtMs },
```

And in the non-freshness fallback `finalScore` expression (the `chlorScore *
W.chlorophyll + … + breakScore * W.thermalBreak +` sum), add:
```js
    + convergence * (W.convergence || 0)
```

============================================================================
## STEP 5 — Show it in the Contributing Factors list
============================================================================
In `allFactors` (anchor: the `{name:"Thermal break", …}` entry), add after it:

```js
    {name:"Break convergence", weight:(W.convergence||0), score:convergence,
     raw: convergence > 0 ? `${Math.round(convergence*100)}%` + (chlorBreak>0?` · ${chlorBreak.toFixed(2)} mg/m³/10nm`:"") : "—"},
```

This makes the factor visible: when a spot lights up because a temp break and a
color edge coincide, the user sees "Break convergence — 80%" explaining why.

============================================================================
## STEP 6 — (Optional) tighten the badge placement
============================================================================
You noted the top-3 badges (`hotspots.slice(0,3)`) can cluster. Independent of
this module, if you want them spread so they don't all sit on the same break,
add a minimum-spacing filter before slicing:

```js
function spacedTop(hotspots, n, minNm){
  const out = [];
  for (const c of hotspots){            // hotspots is already sorted desc by score
    if (out.every(o => nmBetween(o.lat,o.lng,c.lat,c.lng) >= minNm)) out.push(c);
    if (out.length >= n) break;
  }
  return out;
}
// then: spacedTop(hotspots, 3, 8).forEach((cell,i) => { …existing badge code… });
```
(8nm spacing is a reasonable start.) This is optional and orthogonal to
convergence, but together they'll put well-separated badges on the real
edge-convergence spots.

============================================================================
## STEP 7 — Verify
============================================================================
1. `node breaks.test.mjs` stays green (22 passing).
2. Integrity-check the HTML (script/tag/CSS balances unchanged).
3. On a real render near a known temp-break + color-edge (like The Point), the
   "Break convergence" factor should read a meaningful % and the badge should
   move toward that convergence. If SST/chlor are stale, the freshness model
   de-weights convergence automatically (it's tied to SST observedAt).
4. Sanity: a spot with only a temp break (no color edge), or only color, shows
   "Break convergence — —"/low, confirming it only rewards true coincidence.

## Why this addresses your "The Point" question
The old engine scored Thermal break and Chlorophyll edge as SEPARATE additive
factors, so a spot where both coincide got no extra credit for the coincidence —
it just summed two middling factors. Real fishing intuition treats the OVERLAP
of a temp break and a color edge as special. This module scores that overlap
explicitly (a product of the two edge strengths, zero unless BOTH are present),
so spots like The Point — where you can SEE the two edges meet on the charts —
now get the boost your eye expects.
