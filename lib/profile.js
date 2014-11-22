
var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var schema = new Schema({
  responseTime: Number,
  success: Boolean,
  from: Array,
  to: Array,
  trips: Number,
  results: Object
});

var Profile = module.exports = mongoose.model('Profile', schema);
