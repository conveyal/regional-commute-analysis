
# FIPS State Codes, DC: 11, MD: 24, VA: 51
FIPS = 11 24 51

# States
STATES = dc va md

# From https://www.census.gov/geo/maps-data/data/tiger-line.html
BLOCKS = $(foreach fip, $(FIPS), data/blocks/tl_2013_$(fip)_tabblock.shp)

# Bounds - need brackets for the argument parser
NW = [-77.6,39.2]
SE = [-76.6,38.2]

# From http://lehd.ces.census.gov/data/
LODES = $(foreach state, $(STATES), \
	data/lodes/$(state)_od_main_JT00_2011.csv \
	data/lodes/$(state)_od_aux_JT00_2011.csv)

# Modes
ACCESS_MODES = WALK,CAR,BICYCLE
EGRESS_MODES = WALK
DIRECT_MODES = BICYCLE,CAR,WALK
TRANSIT_MODES = BUS,TRAINISH

# MONGODB
MONGODB = mongodb://localhost/regional-commute-analysis

# OTP URL
OTP_URL = http://carfreeatoz-opentripplanner-1020724384.us-east-1.elb.amazonaws.com

# Minimum # of trips between OD pairs
TRIPS = 0

# Minimum distance
MIN_DISTANCE = 0

# Start / end times
START = 06:00
END = 09:00

# Transit options limit
LIMIT = 2

# Bounds
BOUNDS = data/arlington.geo.json

# Concurrency
CONCURRENCY = 10

# Black magic
null :=
space := $(null) #
comma := ,

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

data/od-pairs.csv: node_modules data/centroids.json $(LODES)
	@$(foreach file, $(LODES), ./bin/extract-ods $(file) data/od-pairs.csv \
		--centroids data/centroids.json \
		--bounds $(BOUNDS) \
		--minDistance $(MIN_DISTANCE) \
		--trips $(TRIPS);)
	@bin/od-analysis

access-mode-diff: node_modules data/od-pairs.csv
	@./bin/access-mode-diff data/od-pairs.csv data/access-mode-diff.json \
		--concurrency $(CONCURRENCY) \
		--host $(OTP_URL)/otp/routers/default \
		--mongodb $(MONGODB)

data/profiles.json: node_modules data/od-pairs.json
	@./bin/profile data/od-pairs.json data/profiles.json \
		--concurrency $(CONCURRENCY) \
		--host $(OTP_URL)/otp/routers/default \
		--modes $(MODES) \
		--start $(START) \
		--end $(END) \
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
	@mkdir data data/blocks data/centroids data/lodes || true
	@npm install component serve -g

node_modules:
	@npm install

push:
	@aws s3 sync client commute-analysis.conveyal.com \
		--acl public-read

.PHONY: clean clean-data install profiles push otp
