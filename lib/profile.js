
var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var schema = new Schema({
  responseTime: Number,
  success: Boolean,
  from: {
    type: [Number],
    index: '2dsphere'
  },
  to: {
    type: [Number],
    index: '2dsphere'
  },
  trips: Number,
  results: Object
}, {
  autoIndex: false
});

var Profile = module.exports = mongoose.model('CommuteProfile', schema);
