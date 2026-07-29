# Bluewater chart basemap — one-command tasks
BUCKET ?= chart-tiles
PREFIX ?= chart/v1

.PHONY: setup serve render mbtiles upload upload-dryrun clean

setup:
	pip install -r requirements.txt

serve:
	@echo "open http://localhost:8000/leaflet-demo.html"
	python3 -m http.server 8000

# render pilot AOI (Cape Hatteras) if you need to regenerate tiles/
render:
	python3 fetch_bathymetry.py --w -77.5 --e -73.5 --s 33.5 --n 37.0 --out etopo_hatteras.nc
	python3 render_tiles.py --nc etopo_hatteras.nc --out tiles --zmin 5 --zmax 10

# full continental US, both coasts + Gulf: dark chart basemap (z5-9)
render-conus:
	python3 fetch_bathymetry.py --w -128 --e -65 --s 23 --n 49 --out etopo_conus.nc
	python3 render_tiles.py --nc etopo_conus.nc --out tiles_conus --zmin 5 --zmax 9

# full continental US: transparent depth-contour OVERLAY tiles (z5-9)
render-overlay:
	python3 render_tiles.py --nc etopo_conus.nc --out tiles_overlay --zmin 5 --zmax 9 --overlay

upload-conus:
	python3 upload_supabase.py --src tiles_conus --bucket $(BUCKET) --prefix chart/v1

upload-overlay:
	python3 upload_supabase.py --src tiles_overlay --bucket $(BUCKET) --prefix contours/v1

mbtiles:
	python3 make_mbtiles.py tiles bluewater-chart-pilot.mbtiles

upload-dryrun:
	python3 upload_supabase.py --src tiles --bucket $(BUCKET) --prefix $(PREFIX) --dry-run

upload:
	python3 upload_supabase.py --src tiles --bucket $(BUCKET) --prefix $(PREFIX)

clean:
	rm -rf __pycache__ *.pyc

# ---- BlueTopo high-res build (needs GDAL; see bluetopo/README_BLUETOPO.md) ----
.PHONY: bluetopo-env bluetopo-hatteras bluetopo-all
bluetopo-env:
	@echo "conda create -n bw -c conda-forge 'gdal>=3.4' numpy scipy matplotlib boto3 tqdm pillow -y"
	@echo "conda activate bw && pip install nbs-bluetopo"

bluetopo-hatteras:
	cd bluetopo && python3 fetch_bluetopo.py --zone hatteras
	cd bluetopo && python3 render_bluetopo.py --tif ../bluetopo_work/hatteras_3857.tif --out ../tiles_conus   --zmin 10 --zmax 13
	cd bluetopo && python3 render_bluetopo.py --tif ../bluetopo_work/hatteras_3857.tif --out ../tiles_overlay --overlay --zmin 10 --zmax 13

bluetopo-all:
	cd bluetopo && python3 fetch_bluetopo.py --all
	cd bluetopo && for z in northeast midatlantic hatteras southatlantic florida_east keys gulf_west gulf_central gulf_east; do \
	  python3 render_bluetopo.py --tif ../bluetopo_work/$$z\_3857.tif --out ../tiles_conus   --zmin 10 --zmax 13; \
	  python3 render_bluetopo.py --tif ../bluetopo_work/$$z\_3857.tif --out ../tiles_overlay --overlay --zmin 10 --zmax 13; \
	done
