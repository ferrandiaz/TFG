_ = require('underscore');
var pkgcloud = require('pkgcloud');

var client = require('../config/config.js');

var telemetry = pkgcloud.telemetry.createClient(client.options);

exports.getMeters = function(callback) {
  telemetry.getMeters(function(err, meters) {
    if (err) callback(err);
    else {
      callback(null, meters);
    }
  });
}

exports.getStatistics = function(meter, resource, time, callback) {
  var params = {};
  params.meter = meter;
  params.resourceID = resource;
  params.time = time;
  telemetry.getStatistics(params, function(err, statistics) {
    callback(err, statistics);
  });
}

exports.getAlarms = function(callback) {
  telemetry.getAlarms(function(err, result) {
    if (err) return callback(err);
    else return callback(null, result);
  })
}
