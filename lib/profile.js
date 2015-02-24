
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
  createdAt: Date,
  updatedAt: Date,
  results: Object
}, {
  autoIndex: false
});

schema.pre('save', function(done) {
  if (this.isNew) this.createdAt = new Date();

  this.updatedAt = new Date();
  done();
});

var Profile = module.exports = mongoose.model('CommuteProfile', schema);
