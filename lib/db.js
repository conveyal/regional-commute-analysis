var mongoose = require('mongoose');

module.exports.connect = function(url) {
  mongoose.connect(url, {
    server: {
      socketOptions: {
        keepAlive: 1
      }
    },
    replset: {
      socketOptions: {
        keepAlive: 1
      }
    }
  });

  return mongoose;
};