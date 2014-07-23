
# Regional Commute Analysis

This is a research project repository that takes LODES census data, regional transportation feeds, and [OpenStreetMap](openstreetmap.org) street data to get profiles of commutes in a region using the [Open Trip Planner](opentripplanner.org) journey profiler. It also includes a visualization tool for analyzing the profiles.

## Requirements

* Node.js
* Running OpenTripPlanner instance with the datasets needed to analyze them.

## Installation

```bash
$ make install
```

## Running

See the processing examples in the Makefile. There are three main steps:

1. Generate wanted FIPS census blocks -> LL center point mapping files (`centroids.json`)
2. Generate O/D pairs from LODES data  and `centroids.json` specifiying minimum trips and allowable destination states (`od-pairs.json`)
3. Profile and score the entire list of O/D pairs

`npm start` to run the web server.
