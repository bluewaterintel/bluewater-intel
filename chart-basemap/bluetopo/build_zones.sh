#!/usr/bin/env bash
# Fetch + render BlueTopo zones one at a time, freeing each zone's source data
# before the next. The raw survey tiles and the warped GeoTIFF run to ~10 GB per
# zone, so keeping all nine on disk is what forced the earlier build to discard
# the rasters — which then made the tiles unrepairable.
set -uo pipefail

cd "$(dirname "$0")"
PY=../.venv/bin/python3
export MPLCONFIGDIR=/tmp/mpl
export PYTHONPATH=/opt/homebrew/lib/python3.14/site-packages
export AWS_NO_SIGN_REQUEST=YES

WORK=../bluetopo_work
OUT=$WORK/bt_v2
JOBS=${JOBS:-10}

for zone in "$@"; do
  tif=$WORK/${zone}_3857.tif
  echo "=========== $zone ==========="
  date

  if [ ! -f "$tif" ]; then
    echo "--- fetch $zone ---"
    $PY fetch_bluetopo.py --zone "$zone" || { echo "FETCH FAILED: $zone"; continue; }
  else
    echo "--- reusing $tif ---"
  fi

  echo "--- render $zone ---"
  before=$(find $OUT -name '*.png' 2>/dev/null | wc -l)
  $PY render_bluetopo.py --tif "$tif" --out "$OUT" --overlay \
      --zmin 10 --zmax 13 --jobs "$JOBS" || { echo "RENDER FAILED: $zone"; continue; }
  after=$(find $OUT -name '*.png' 2>/dev/null | wc -l)

  # A zone that draws nothing means the source raster was empty, not that the
  # region has no bathymetry. Keep the raster so it can be diagnosed instead of
  # deleting the only evidence.
  if [ "$after" -le "$before" ]; then
    echo "RENDER EMPTY: $zone produced 0 tiles — keeping $tif for diagnosis"
    continue
  fi

  echo "--- cleanup $zone ---"
  rm -rf "$WORK/${zone}_fetch"
  rm -f "$tif"
  echo "$zone done: $(find $OUT -name '*.png' | wc -l) tiles in $OUT"
  df -h /Users/ronaldnovak | tail -1
done

echo "=========== all zones complete ==========="
date
