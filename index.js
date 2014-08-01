var dom = require('dom');
var haversine = require('haversine');
var ProfileScorer = require('otp-profile-score');
var Spinner = require('spin');
var toTitleCase = require('to-title-case');

// constants
var height = 150, width = 310, margin = { top: 0, right: 10, bottom: 20, left: 40 };
var modes = [ 'car', 'bicycle', 'bus', 'subway', 'walk' ];
var modesByNumber = {
  car: 0,
  bicycle: 1,
  bus: 2,
  subway: 3,
  walk: 4
};

// globals
var blocks, data, dimensions = {}, _id, json, map, options;

// Expose charts
var charts = window.charts = {};

// Calories scale
var calScale = d3.scale.sqrt()
  .domain([0, 60, 120])
  .range([ 0, 1, 0 ])
  .exponent(2);

// Scorer to be updated on the fly
var scorer = new ProfileScorer({
  factors: {
    bikeParking: 1,
    calories: 1,
    carParking: 5,
    co2: 0.5,
    cost: 5,
    transfer: 5
  },
  rates: {
    calsBiking: 10,
    calsWalking: 4.4,
    carParkingCost: 10,
    mileageRate: 0.56,
    mpg: 21.4
  },
  transform: function(o) {
    o.calories = calScale(o.calories);
    return o;
  }
});

// Mode color scale
var modeColorScale = d3.scale.category10();

// Show spinner cause loading takes awhile
var spinner = new Spinner().spin();
document.body.appendChild(spinner.el);

// Load json
d3.json('./data/profiles.json', function(err, j) {
  if (err) return window.alert(err);
  json = j;

  // Show viz & stop spinner
  document.getElementById('viz').style.display = 'block';
  spinner.stop();

  // After displaying, setup the map
  map = L.mapbox.map('map', 'conveyal.gepida3i', {
    touchZoom: false,
    scrollWheelZoom: false
  }).setView([38.8399874, -77.0911667], 9);

  // Generate Hexbins
  map.on('viewreset', function() { generateHexbins(map, dimensions); });

  // Crossfilterize
  processJson(json, map);

  // Set up factor inputs
  generateInputs(scorer, json, map);
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
  _id = 0;
  dimensions = getDimensions(options);

  charts.mode = dc.pieChart('#mode-pie-chart')
    .colors(d3.scale.category10())
    .colorAccessor(function(d, i) { return modesByNumber[d.data.key]; })
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
      return d === Infinity
        ? 250
        : Math.round(d / 2) * 2;
    }));

  charts.scoreByMode = dc.rowChart('#score-by-mode')
    .height(height)
    .width(width)
    .margins(margin)
    .elasticX(true)
    .colors(d3.scale.category10())
    .colorAccessor(function(d) { return modesByNumber[d.key]; })
    .dimension(dimensions.mode)
    .group(dimensions.mode.group().reduce(reduceAdd, reduceRemove, reduceInitial))
    .valueAccessor(function(d) {
      return d3.round((d.value.totalScore / d.value.count));
    });

  charts.count = dc.dataCount('#data-count')
    .dimension(options)
    .group(options.groupAll());

  dc.renderAll();

  // Attach to dc.js renderLet
  charts.mode.renderlet(function(c) {
    dc.events.trigger(function() {
      // Redraw the hexbins
      generateHexbins(map, dimensions);
    });
  });
}

function getDimensions(o) {
  return {
    id: o.dimension(function(d) { return _id++; }),
    origin: o.dimension(function(d) { return d.journey[0][0]; }),
    mode: o.dimension(function(d) { return d.mode; }),
    score: o.dimension(function(d) { return d.score; })
  };
}

function scoreOptions(d) {
  var data = [];
  for (var i = 0; i < d.length; i++) {
    var bestScore = Infinity;
    var bestScoreIndex = 0;
    var bestOption = null;
    for (var j = 0; j < d[i].options.length; j++) {
      var option = scorer.processOption(d[i].options[j]);
      option.journey = clone(d[i].journey);
      option.journey[0].origin = 1;
      option.journey[0].mode = option.mode;
      option.journey[1].origin = -1;
      option.journey[1].mode = option.mode;

      if (option.totalDistance === 0) {
        option.totalDistance = haversine(
          option.journey[0][1], option.journey[0][0],
          option.journey[1][1], option.journey[1][0],
          true); // in miles
      }

      if (option.score <= bestScore) {
        bestOption = option;
        bestScore = option.score;
      }
    }

    // Only add the best scoring option
    if (bestOption) data.push(bestOption);
  }
  return data;
}

var _polys = [];
function generateHexbins(map, options) {
  _polys.forEach(map.removeLayer.bind(map));

  var bounds = map.getBounds();
  var $map = document.getElementById('map');
  var rmax = (bounds.getNorth() - bounds.getSouth()) / 50;

  // Allllll
  var data = dimensions.id.top(Infinity);

  // Generate hexbins
  var hexbins = hexbin(data.map(function(d) {
    return d.journey[0];
  }).concat(data.map(function(d) {
    return d.journey[1];
  })), {
    caccessor: function(b) {
      return modesByNumber[b.mode];
    },
    cscale: function(bs) {
      setBinsMode(bs);
      return modeColorScale;
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
  p.totalScore += v.score;
  ++p.count;
  return p;
}

function reduceRemove(p, v) {
  p.totalScore -= v.score;
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
    var modes = {
      car: 0,
      subway: 0,
      bus: 0,
      walk: 0,
      bicycle: 0
    };
    var maxMode = 'car';
    for (var j = 0; j < b.length; j++) {
      var mode = b[j].mode;
      modes[mode]++;
      if (modes[mode] >= modes[maxMode]) maxMode = mode;
    }
    b.mode = maxMode;
  }
}

function clone(obj) {
  if (obj == null || typeof(obj) != 'object')
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
    if (changes) processJson(json, map);
  });
}

function generateInput(id, name, value) {
  var group = dom('<div class="form-group col-sm-2"></div>')
    .appendTo(id);

  dom('<label for="' + name +'">' + toTitleCase(name) + '</label>')
    .appendTo(group);

  dom('<input class="form-control" type="text" name="'
    + name + '" value="' + value + '">')
    .appendTo(group);
}