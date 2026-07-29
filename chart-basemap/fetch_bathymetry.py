#!/usr/bin/env python3
"""Fetch a bathymetry subset from NOAA ERDDAP as NetCDF.

Pilot source: ETOPO1 (1 arc-min) via CoastWatch ERDDAP -- good to ~z10.
Production upgrade: ETOPO 2022 (15 arc-sec) or NOAA BlueTopo for z11-z14;
same grid format, same renderer, just a different download.

Usage: python3 fetch_bathymetry.py --w -77.5 --e -73.5 --s 33.5 --n 37.0 --out aoi.nc
"""
import argparse, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--w", type=float, required=True)
ap.add_argument("--e", type=float, required=True)
ap.add_argument("--s", type=float, required=True)
ap.add_argument("--n", type=float, required=True)
ap.add_argument("--out", default="bathy.nc")
a = ap.parse_args()

url = ("https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.nc"
       f"?altitude%5B({a.s}):({a.n})%5D%5B({a.w}):({a.e})%5D")
print("fetching", url)
urllib.request.urlretrieve(url, a.out)
print("saved", a.out)
