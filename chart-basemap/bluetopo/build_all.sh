#!/usr/bin/env bash
# Build the full v2 contour-overlay tileset (z10-13) from BlueTopo, one zone at
# a time.
#
# Resumable by design: this run takes hours, almost all of it waiting on NOAA's
# S3 bucket, so each finished zone drops a stamp file and is skipped on restart.
# Each zone's scratch (6-8 GB of survey downloads plus a 5-6 GB warped raster)
# is deleted as soon as its tiles are written, keeping peak disk near 15 GB
# instead of the ~120 GB that fetching all nine up front would need.
#
# Usage:  ./build_all.sh          (from chart-basemap/bluetopo)

set -uo pipefail
cd "$(dirname "$0")"

WORK=../bluetopo_work
TILES=../tiles_overlay
STAMPS=$WORK/stamps
mkdir -p "$STAMPS"

# Two concurrent runs would render the same zone into the same tile directory,
# racing on individual PNGs. Refuse to start if one is already going.
LOCK=$WORK/build_all.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "another build_all.sh is running (lock: $LOCK)"
  echo "if that is stale, remove the directory and retry"
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# shellcheck disable=SC1091
source ../.venv-bw/bin/activate || { echo "missing ../.venv-bw"; exit 1; }
export AWS_NO_SIGN_REQUEST=YES
export MPLCONFIGDIR=/tmp/mpl

# hatteras and northeast lead: their downloads are already partly on disk.
ZONES="hatteras northeast midatlantic southatlantic florida_east keys
       gulf_west gulf_central gulf_east"

for z in $ZONES; do
  if [ -f "$STAMPS/$z.done" ]; then
    echo "=== $z: already built, skipping ==="
    continue
  fi

  echo "=== $z: fetch ==="
  if [ -f "$WORK/${z}_3857.tif" ]; then
    echo "reusing existing $WORK/${z}_3857.tif"
  elif ! python3 fetch_bluetopo.py --zone "$z"; then
    echo "!!! FETCH FAILED: $z — stopping"
    exit 1
  fi

  echo "=== $z: render z10-13 ==="
  if ! python3 render_bluetopo.py --tif "$WORK/${z}_3857.tif" \
        --out "$TILES" --overlay --zmin 10 --zmax 13; then
    echo "!!! RENDER FAILED: $z — stopping"
    exit 1
  fi

  touch "$STAMPS/$z.done"
  rm -rf "$WORK/${z}_fetch" "$WORK/${z}_3857.tif"
  echo "=== $z: complete, scratch reclaimed — tileset now $(du -sh "$TILES" | cut -f1) ==="
done

echo "=== ALL ZONES COMPLETE ==="
echo "tiles: $(find "$TILES" -name '*.png' | wc -l | tr -d ' ')"
echo "size:  $(du -sh "$TILES" | cut -f1)"
