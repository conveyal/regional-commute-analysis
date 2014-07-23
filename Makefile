
profiles: clean profiles.json

install:
	@npm install
	@npm install serve -g

blocks:
	@wget ftp://ftp2.census.gov/geo/tiger/TIGER2013/TABBLOCK/tl_2013_11_tabblock.zip --output-document=data/tl_2013_11_tabblock.zip
	@wget ftp://ftp2.census.gov/geo/tiger/TIGER2013/TABBLOCK/tl_2013_51_tabblock.zip --output-document=data/tl_2013_51_tabblock.zip
	@unzip data/tl_2013_11_tabblock.zip -d data/tl_2013_11_tabblock
	@unzip data/tl_2013_51_tabblock.zip -d data/tl_2013_51_tabblock

centroids.json:
	@./bin/add-centroid data/dc_metro_centroids.csv centroids.json --overwrite
	@./bin/add-centroid data/va_dc_metro_centroids.csv centroids.json

clean:
	rm -f errors.json centroids.json od-pairs.json profiles.json

od-pairs.json: centroids.json
	@./bin/extract-ods data/dc_od_aux_JT05_2011.csv od-pairs.json --centroids centroids.json --overwrite --destination 51 --trips 3
	@./bin/extract-ods data/va_od_aux_JT05_2011.csv od-pairs.json --centroids centroids.json --destination 11 --trips 1
	@./bin/extract-ods data/va_od_main_JT05_2011.csv od-pairs.json --centroids centroids.json --destination 51 --trips 3

profiles.json: od-pairs.json
	@./bin/profile od-pairs.json profiles.json \
		--host http://localhost:8080/otp/routers/default \
		--modes BICYCLE,BUS,CAR,TRAINISH,WALK \
		--start 07:00 \
		--end 09:00 \
		--limit 2 \
		--score \
		--factors factors.json \
		--errors errors.json

.PHONY: profiles clean
