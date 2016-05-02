exports.Client = require('./client').Client;
exports.Meter = require('./meter').Meter;
exports.Alarm = require('./alarm').Alarm;

exports.createClient = function(options) {
  return new exports.Client(options);
};
