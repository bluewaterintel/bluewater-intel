#!/usr/bin/env python3
"""Pack an XYZ tile directory into an MBTiles archive (for backup / offline rebuild)."""
import os, sqlite3, sys

src, dst = sys.argv[1], sys.argv[2]
if os.path.exists(dst): os.remove(dst)
db = sqlite3.connect(dst)
db.executescript("""
CREATE TABLE metadata (name TEXT, value TEXT);
CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
""")
meta = {
 "name": "Bluewater Intel Fishing Chart",
 "format": "png", "type": "baselayer", "version": "0.1.0",
 "description": "Proprietary Bluewater Intel bathymetric fishing chart (fathoms). Reference only - not for navigation.",
 "attribution": "&copy; Bluewater Intel &middot; Bathymetry: NOAA NCEI ETOPO / GEBCO",
 "minzoom": "5", "maxzoom": "10",
}
db.executemany("INSERT INTO metadata VALUES (?,?)", meta.items())
n = 0
for z in sorted(os.listdir(src)):
    zp = os.path.join(src, z)
    if not z.isdigit(): continue
    for x in os.listdir(zp):
        for f in os.listdir(os.path.join(zp, x)):
            y = int(f.split(".")[0])
            tms_y = (2 ** int(z) - 1) - y   # MBTiles uses TMS row order
            blob = open(os.path.join(zp, x, f), "rb").read()
            db.execute("INSERT INTO tiles VALUES (?,?,?,?)", (int(z), int(x), tms_y, sqlite3.Binary(blob)))
            n += 1
db.commit(); db.close()
print(f"packed {n} tiles -> {dst}")
