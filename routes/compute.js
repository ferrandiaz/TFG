var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var client = require('../config/config.js');
var alg = require('../algorithms/algorithms');


var compute = pkgcloud.compute.createClient(client.options);


exports.getServers = function(req, res) {
  hypervisors.hypervisorsList(function(result) {
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

exports.testCpu = function(req, res) {
  hypervisors.testCpu(function(err, result) {
    console.log(err, result);
    res.status(200).send(result);
  })
}

exports.getServer = function(req, res) {
  async.waterfall([
    function(callback) {
      hypervisors.hypervisorsList(function(listHypervisors) {
        callback(null, listHypervisors);
      });
    },
    function(listHypervisors, callback) {
      var hyperisorEnabled = _.findWhere(listHypervisors, {
        name: req.params.hypervisor
      });
      if (hyperisorEnabled.state != 'up') callback(400);
      else callback(null, hyperisorEnabled);
    },
    function(hyperisorEnabled, callback) {
      hypervisors.getHypervisorInstances(req.params.hypervisor, function(
        hypervisor) {
        callback(null, hypervisor);
      });
    },
    function(hypervisor, callback) {
      if (!hypervisor.servers) {
        hypervisors.sleepHypervisor(hypervisor.hypervisor_hostname);
        callback(200, 'El hypervisor es posara a dormir');
      } else {
        callback(null, hypervisor);
      }
    },
    function(hypervisor, callback) {
      hypervisors.getInfoServers(hypervisor.servers, function(servers) {
        callback(null, servers, hypervisor);
      });
    },
    function(servers, hypervisor, callback) {
      hypervisors.findMigrateHypervisor(servers, hypervisor.hypervisor_hostname,
        function(migrateArray) {
          if (_.isEmpty(migrateArray)) callback(200,
            'No hi ha cap hypervisor disponible');
          else if (migrateArray.length != servers.length) callback(200,
            'Es queda tot igual');
          else callback(null, migrateArray, hypervisor)
        });
    },
    function(migrateArray, hypervisor, callback) {
      var k = 0;
      _.each(migrateArray, function(migrate) {
        compute.migrateServer(migrate.server, migrate.newHypervisorName,
          function(resposta) {
            k++;
            if (k == migrateArray.length) {
              hypervisors.sleepHypervisor(hypervisor.hypervisor_hostname);
              callback(null, 'VM migrades, Hypervisor Apagat');
            }
          });
      });
    }

  ], function(err, result) {
    if (err) res.status(err).send(result);
    else res.status(200).send(result);
  });
};

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
