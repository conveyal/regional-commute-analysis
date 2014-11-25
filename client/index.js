var dom = require('dom');
var haversine = require('haversine');
var ProfileScorer = require('otp-profile-score');
var Spinner = require('spin');
var toTitleCase = require('to-title-case');

// constants
var height = 150,
  width = 290,
  margin = {
    top: 0,
    right: 10,
    bottom: 20,
    left: 40
  };
var modes = ['car', 'bicycle', 'bus', 'subway', 'walk'];
var colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];

// globals
var blocks, currentDimension, data, dimensions = {},
  _id, json, map, options;
var allowedModes = modes.slice();

// Expose charts
var charts = window.charts = {};

// Calories scale
var calScale = d3.scale.sqrt()
  .domain([0, 60, 120])
  .range([0, 1, 0])
  .exponent(2);

// Scorer to be updated on the fly
var scorer = new ProfileScorer({
  factors: {
    bikeParking: 5,
    calories: 2,
    carParking: 8,
    co2: 0.5,
    cost: 1,
    transfer: 0
  },
  rates: {
    calsBiking: 10,
    calsWalking: 4.4,
    carParkingCost: 15,
    mileageRate: 0.56,
    mpg: 21.4
  },
  transform: function(o) {
    o.calories = calScale(o.calories);
    return o;
  }
});

// Show spinner cause loading takes awhile
var spinner = new Spinner().spin();
document.body.appendChild(spinner.el);

// Load json
d3.json('data/profiles.json', function(err, j) {
  if (err) return window.alert(err);
  json = j;

  // Show viz & stop spinner
  document.getElementById('viz').style.display = 'block';

  // After displaying, setup the map
  map = L.mapbox.map('map', 'conveyal.gepida3i', {
    touchZoom: false,
    scrollWheelZoom: false
  }).setView([38.8399874, -77.0911667], 11);

  // Generate Hexbins
  map.on('viewreset', function() {
    generateHexbins(map, dimensions);
  });

  // Crossfilterize
  processJson(json, map);

  // Set up factor inputs
  generateInputs(scorer, json, map);

  // Stop
  spinner.stop();
});

function processJson(json, map) {
  data = scoreOptions(json);

  // Dispose of all dimensions
  for (var d in dimensions) dimensions[d].dispose();

  // Remove all current data
  if (options) options.remove();

  // Create the crossfilter instance
  options = crossfilter(data);

  // Create the dimensions
  dimensions = getDimensions(options);
  currentDimension = dimensions.mode;

  charts.mode = dc.pieChart('#mode-pie-chart')
    .colors(colors)
    .colorAccessor(function(d, i) {
      return modes.indexOf(d.data.key);
    })
    .height(height)
    .dimension(dimensions.mode)
    .group(dimensions.mode.group());

  charts.score = dc.lineChart('#score-chart')
    .height(height)
    .width(width)
    .margins(margin)
    .elasticY(true)
    .round(Math.round)
    .x(d3.scale.linear().domain([0, 250]))
    .dimension(dimensions.score)
    .group(dimensions.score.group(function(d) {
      return d === Infinity ? 250 : Math.round(d / 2) * 2;
    }));

  charts.scoreByMode = dc.rowChart('#score-by-mode')
    .height(height)
    .width(width)
    .margins(margin)
    .elasticX(true)
    .colors(colors)
    .colorAccessor(function(d) {
      return modes.indexOf(d.key);
    })
    .dimension(dimensions.mode)
    .group(dimensions.mode.group().reduce(reduceAdd, reduceRemove,
      reduceInitial))
    .valueAccessor(function(d) {
      return d3.round((d.value.totalScore / d.value.count));
    });

  charts.efficiency = dc.barChart('#efficiency')
    .height(height)
    .width(width)
    .margins(margin)
    .elasticY(true)
    .round(Math.round)
    .x(d3.scale.linear().domain([0, 35]))
    .dimension(dimensions.efficiency)
    .group(dimensions.efficiency.group(function(d) {
      return Math.round(d);
    }));

  charts.count = dc.dataCount('#data-count')
    .dimension(options)
    .group(options.groupAll());

  dc.renderAll();

  charts.mode.on('filtered', function() {
    currentDimension = dimensions.mode;
  });
  charts.scoreByMode.on('filtered', function() {
    currentDimension = dimensions.mode;
  });
  charts.score.on('filtered', function() {
    currentDimension = dimensions.score;
  });
  charts.efficiency.on('filtered', function() {
    currentDimension = dimensions.efficiency;
  });

  // Attach to dc.js renderLet
  charts.mode.renderlet(function(c) {
    dc.events.trigger(function() {
      // Redraw the hexbins
      generateHexbins(map);
    });
  });
}

function getDimensions(o) {
  return {
    efficiency: o.dimension(function(d) {
      return d[2];
    }),
    mode: o.dimension(function(d) {
      return d[0];
    }),
    score: o.dimension(function(d) {
      return d[1];
    })
  };
}

function scoreOptions(d) {
  var data = [];
  var id = 0;
  for (var i = 0; i < d.length; i++) {
    var bestOption = null;
    var haversineDistance = haversine(
      d[i].journey[0][1], d[i].journey[0][0],
      d[i].journey[1][1], d[i].journey[1][0],
      true); // in miles

    for (var j = 0; j < d[i].options.length; j++) {
      var option = scorer.processOption(clone(d[i].options[j]));
      if (allowedModes.indexOf(option.mode) === -1) continue;

      option.journey = clone(d[i].journey);
      option.haversineDistance = haversineDistance;

      if (!bestOption || option.score <= bestOption.score) bestOption = option;
    }

    // Only add the best scoring option
    if (bestOption) {
      data.push([
        bestOption.mode,
        bestOption.score,
        bestOption.haversineDistance / (bestOption.time / 60),
        bestOption.journey
      ]);
    }
  }
  return data;
}

var _polys = [];

function generateHexbins(map) {
  _polys.forEach(map.removeLayer.bind(map));

  var bounds = map.getBounds();
  var $map = document.getElementById('map');
  var rmax = (bounds.getNorth() - bounds.getSouth()) / 50;

  // Allllll
  var data = currentDimension.top(Infinity);

  // Generate hexbins
  var originsAndDestinations = data.map(function(d) {
    var j = d[3][0];
    j.mode = d[0];
    j.origin = 1;
    return j;
  }).concat(data.map(function(d) {
    var j = d[3][1];
    j.mode = d[0];
    j.origin = -1;
    return j;
  }));

  var hexbins = hexbin(originsAndDestinations, {
    caccessor: function(b) {
      return modes.indexOf(b.mode);
    },
    cscale: function(bs) {
      setBinsMode(bs);
      return function(n) {
        return colors[n];
      };
    },
    height: $map.clientHeight,
    rmax: rmax,
    width: $map.clientWidth
  });

  _polys = hexbins.map(function(d) {
    return L.polygon(d.coords, {
      stroke: true,
      weight: 1,
      color: '#e5e5e5',
      fill: true,
      fillOpacity: 0.75,
      fillColor: d.color
    }).addTo(map);
  });
}

function reduceAdd(p, v) {
  p.totalScore += v[1];
  ++p.count;
  return p;
}

function reduceRemove(p, v) {
  p.totalScore -= v[1];
  --p.count;
  return p;
}

function reduceInitial() {
  return {
    totalScore: 0,
    count: 0
  };
}

function setBinsMode(bs) {
  for (var i = 0; i < bs.length; i++) {
    var b = bs[i];
    var modeCount = {
      car: 0,
      subway: 0,
      bus: 0,
      walk: 0,
      bicycle: 0
    };
    var maxMode = 'car';
    for (var j = 0; j < b.length; j++) {
      var mode = b[j].mode;
      modeCount[mode]++;
      if (modeCount[mode] >= modeCount[maxMode]) maxMode = mode;
    }

    b.mode = maxMode;
  }
}

function clone(obj) {
  if (obj === null || typeof(obj) != 'object')
    return obj;

  var temp = obj.constructor();
  for (var key in obj) temp[key] = clone(obj[key]);
  return temp;
}

function generateInputs(scorer) {
  for (var i in scorer.factors) generateInput('#factors', i, scorer.factors[i]);
  for (var j in scorer.rates) generateInput('#rates', j, scorer.rates[j]);

  dom('form').on('submit', function(e) {
    e.preventDefault();
    var changes = false;
    dom('form .btn-block').toggleClass('active');

    var newAllowedModes = [];
    dom('form input[type=checkbox]').each(function(button) {
      if (button.value()) {
        newAllowedModes.push(button.name());
        if (newAllowedModes.indexOf(button.name()) === -1) changes = true;
      }
    });
    if (allowedModes.length !== newAllowedModes.length) changes = true;

    dom('input').each(function(input, i) {
      var name = input.name();
      var newVal = parseFloat(input.value());
      if (scorer.factors[name] !== undefined) {
        if (scorer.factors[name] !== newVal) {
          scorer.factors[name] = newVal;
          changes = true;
        }
      } else {
        if (scorer.rates[name] !== newVal) {
          scorer.rates[name] = newVal;
          changes = true;
        }
      }
    });

    if (changes) {
      allowedModes = newAllowedModes;
      processJson(json, map);
    }

    dom('form .btn-block').toggleClass('active');
  });
}

function generateInput(id, name, value) {
  var group = dom('<div class="form-group col-sm-2"></div>')
    .appendTo(id);

  dom('<label for="' + name + '">' + toTitleCase(name) + '</label>')
    .appendTo(group);

  dom('<input class="form-control" type="text" name="' + name + '" value="' +
    value + '">')
    .appendTo(group);
}
