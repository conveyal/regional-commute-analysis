
# FIPS State Codes, DC: 11, MD: 24, VA: 51
FIPS = 11

# States
STATES = dc

# From https://www.census.gov/geo/maps-data/data/tiger-line.html
BLOCKS = $(foreach fip, $(FIPS), data/blocks/tl_2013_$(fip)_tabblock.shp)

# Bounds - need brackets for the argument parser
NW = [-77.3,39.1]
SE = [-76.75,38.75]

# From http://lehd.ces.census.gov/data/
LODES = $(foreach state, $(STATES), \
	data/lodes/$(state)_od_main_JT00_2011.csv \
	data/lodes/$(state)_od_aux_JT00_2011.csv)

# Modes
MODES = BICYCLE,BUS,CAR,TRAINISH,WALK

# OTP URL
OTP_URL = http://localhost:8080

# Minimum # of trips between OD pairs
TRIPS = 2

# Start / end times
START = 07:00
END = 09:00

# Transit options limit
LIMIT = 2

# Concurrency
CONCURRENCY = 2

# Black magic
null :=
space := $(null) #
comma := ,

all: build profiles

build: components index.js hexbin.js
	@component build

clean:
	rm -rf build components

clean-data:
	rm -rf data/blocks/* data/lodes/* data/centroids.json data/errors.json data/od-pairs.json data/profiles.json

components: node_modules component.json
	@component install

data/centroids.json: node_modules $(BLOCKS)
	@$(foreach file, $(BLOCKS), ./bin/shp2centroid $(file) data/centroids.json \
		--nw $(NW) \
		--se $(SE);)

data/od-pairs.json: node_modules data/centroids.json $(LODES)
	@$(foreach file, $(LODES), ./bin/extract-ods $(file) data/od-pairs.json \
		--centroids data/centroids.json \
		--destinations $(subst $(space),$(comma),$(FIPS)) \
		--trips $(TRIPS);)
	@bin/od-analysis

data/profiles.json: node_modules data/od-pairs.json
	@./bin/profile data/od-pairs.json data/profiles.json \
		--concurrency $(CONCURRENCY) \
		--host $(OTP_URL)/otp/routers/default \
		--modes $(MODES) \
		--start $(START) \
		--end $(END) \
		--limit $(LIMIT) \
		--factors factors.json \
		--errors data/errors.json

data/blocks/%.shp:
	@wget ftp://ftp2.census.gov/geo/tiger/TIGER2013/TABBLOCK/$(basename $(notdir $@)).zip
	@unzip -o $(basename $(notdir $@)).zip -d data/blocks
	@rm $(basename $(notdir $@)).zip

data/lodes/%.csv:
	@curl http://lehd.ces.census.gov/data/lodes/LODES7/$(word 1, $(subst _, ,$(notdir $@)))/od/$(notdir $@).gz \
		| gzip --decompress > $@

install: node_modules
	@mkdir data data/blocks data/centroids data/lodes
	@npm install component serve to-s3 -g

node_modules:
	@npm install

profiles: data/profiles.json

push:
	@to-s3 . commute-analysis.conveyal.com --ignore bin,components,.git,node_modules --acl public-read

.PHONY: clean clean-data install profiles push
