"""
Shelf / canyon AOI boxes for the BlueTopo high-res build (z10–z13).

Each zone covers the fishing shelf, slope, and canyon heads where captains
actually run — not the full EEZ. Tiles deeper than MAX_DEPTH_FM are skipped
at render time so abyssal plain doesn't explode the tile count.
"""

M_PER_FATHOM = 1.8288
MAX_DEPTH_FM = 350          # skip tiles where shallowest water is deeper than this
BLUETOPO_ZMIN = 10
BLUETOPO_ZMAX = 13

# bbox = (west, south, east, north) in WGS84 degrees
ZONES = {
    "northeast": {
        "label": "Northeast — Georges / Hudson / Tail",
        "bbox": (-74.5, 38.0, -65.5, 42.5),
    },
    "midatlantic": {
        "label": "Mid-Atlantic — Baltimore / Norfolk / Block",
        "bbox": (-76.5, 36.5, -71.5, 39.5),
    },
    "hatteras": {
        "label": "Hatteras — Oregon Inlet / Norfolk Canyon / The Point",
        "bbox": (-77.8, 33.2, -73.2, 37.5),
    },
    "southatlantic": {
        "label": "South Atlantic — Cape Fear / Charleston / Winyah",
        "bbox": (-81.0, 30.0, -75.0, 35.5),
    },
    "florida_east": {
        "label": "Florida East — Canaveral / PB / Miami slope",
        "bbox": (-81.5, 26.0, -78.0, 31.0),
    },
    "keys": {
        "label": "Florida Keys / Dry Tortugas shelf",
        "bbox": (-82.5, 24.0, -80.0, 26.5),
    },
    "gulf_west": {
        "label": "Gulf West — Texas / Louisiana shelf",
        "bbox": (-98.0, 25.5, -88.0, 30.5),
    },
    "gulf_central": {
        "label": "Gulf Central — Mississippi Delta / Atwater Valley",
        "bbox": (-93.5, 26.5, -86.0, 30.5),
    },
    "gulf_east": {
        "label": "Gulf East — DeSoto / Panhandle / Apalachicola",
        "bbox": (-88.5, 27.5, -82.0, 31.0),
    },
}

ZONE_NAMES = list(ZONES.keys())


def bbox_string(bbox):
    """noaabathymetry geometry: xmin,ymin,xmax,ymax (lon/lat)."""
    w, s, e, n = bbox
    return f"{w},{s},{e},{n}"


def get_zone(name):
    if name not in ZONES:
        raise KeyError(f"unknown zone {name!r}; choose from {', '.join(ZONE_NAMES)}")
    return ZONES[name]
