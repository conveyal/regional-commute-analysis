
# From https://www.census.gov/geo/maps-data/data/tiger-line.html
BLOCKS = \
	data/blocks/tl_2013_11_tabblock.shp \
	data/blocks/tl_2013_24_tabblock.shp \
	data/blocks/tl_2013_51_tabblock.shp

CENTROIDS = $(wildcard data/centroids/*.csv)

# FIPS State Codes
DESTINATIONS = 11,51

# From http://lehd.ces.census.gov/data/
LODES = \
	data/lodes/dc_od_main_JT00_2011.csv \
	data/lodes/dc_od_aux_JT00_2011.csv \
	data/lodes/md_od_main_JT00_2011.csv \
	data/lodes/md_od_aux_JT00_2011.csv \
	data/lodes/va_od_main_JT00_2011.csv \
	data/lodes/va_od_aux_JT00_2011.csv

ODS = $(wildcard data/lodes/*.csv)

# Minimum # of trips between OD pairs
TRIPS = 10

build: components
	@component build

clean:
	rm -rf build components

components: node_modules
	@component install

data/centroids.json:
	@$(foreach file, $(CENTROIDS), ./bin/add-centroid $(file) data/centroids.json;)

# DC: 11, MD: 24, VA: 51
data/od-pairs.json: data/centroids.json
	@$(foreach file, $(ODS), ./bin/extract-ods $(file) data/od-pairs.json \
		--centroids data/centroids.json \
		--destinations $(DESTINATIONS) \
		--trips $(TRIPS);)

data/profiles.json: data/od-pairs.json
	@./bin/profile data/od-pairs.json data/profiles.json \
		--host http://localhost:8080/otp/routers/default \
		--modes BICYCLE,BUS,CAR,TRAINISH,WALK \
		--start 07:00 \
		--end 09:00 \
		--limit 2 \
		--factors factors.json \
		--errors data/errors.json

download-blocks: $(BLOCKS)
data/blocks/%.shp:
	@wget ftp://ftp2.census.gov/geo/tiger/TIGER2013/TABBLOCK/$(basename $(notdir $@)).zip
	@unzip $(basename $(notdir $@)).zip $(notdir $@) -d data/blocks
	@rm $(basename $(notdir $@)).zip

download-lodes: $(LODES)
data/lodes/%.csv:
	@curl http://lehd.ces.census.gov/data/lodes/LODES7/$(word 1, $(subst _, ,$(notdir $@)))/od/$(notdir $@).gz \
		| gzip --decompress > $@

install: node_modules
	@mkdir data data/blocks data/centroids data/lodes

node_modules:
	@npm install
	@npm install component serve -g

profiles: data/profiles.json

push:
	@to-s3 . commute-analysis.conveyal.com

.PHONY: clean download-blocks download-lodes install profiles push
