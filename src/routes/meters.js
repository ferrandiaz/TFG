var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var client = require('../config/config.js');

var compute = pkgcloud.compute.createClient(client.options);

exports.getMeters = function(req, res) {
  telemetry.getMeters(function(err, meters) {
    if (err) res.status(err);
    else res.status(200).send(meters);
  })
};

exports.getStatistics = function(req, res) {
  var meter = req.params.meter;
  var resource = req.params.resource;
  var time = 1;
  telemetry.getStatistics(meter, resource, time, function(err, statistics) {
    res.status(200).send(statistics);
  });
}
