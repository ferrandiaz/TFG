var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var client = require('../config/config.js');
var alg = require('../algorithms/algorithms');


var compute = pkgcloud.compute.createClient(client.options);


exports.getServers = function(req, res) {
  hypervisors.hypervisorsCpu(function(result) {
    res.send(result);
  });
};

exports.sleepServer = function(req, res) {
  hypervisors.sleepHypervisor(req.params.hypervisor, function(err, result) {
    console.log(err, result);
    res.send(err);
  });
}

exports.getHypervisorInstances = function(req, res) {
  hypervisors.getHypervisorInstancesCpu(req.params.hypervisor, function(err,
    result) {
    if (err) res.status(500);
    else res.status(200).send(result);
  })
}

exports.overUsed = function(req, res) {
  alg.overUsed2(req.params.hypervisor, function(err, result) {
    if (err) res.status(err.status).send(err.message);
    else res.status(200).send(result);
  });
}
exports.underUsed = function(req, res) {
  alg.underUsed(req.params.hypervisor, function(err, result) {
    if (err) res.status(err.status).send(err.message);
    else res.status(200).send(result);
  });
}

exports.sorted = function(req, res) {
  var flavorname = req.params.flavor;
  compute.getFlavors(function(err, flavors) {
    if (err) res.status(500).send(err);
    else {
      var flavor = _.findWhere(flavors, {
        name: flavorname
      });
      if (!flavor) res.status(400).send('Flavor not Found');
      hypervisors.hypervisorsAviableByCPU(flavor, function(err, result) {
        if (err) res.status(err.status).send(err.message);
        res.status(200).send(result);
      });
    }
  });
}

exports.createServer = function(req, res) {
  alg.createVM(req.body, function(err, result) {
    if (err) res.status(err.status).send(err.message);
    else res.status(200).send(result.createServer);
  });
};
