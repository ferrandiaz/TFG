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
            console.log(resposta);
            k++;
            console.log(k, migrateArray.length);
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
        console.log(err, result);
        res.status(200).send(result);
      });
    }
  });
}

exports.createServer = function(req, res) {
  alg.createVM(req.body, function(err, result) {
    if (err) res.status(500).send(err.message);
    else res.status(200).send(result.createServer);
  });
  /*

    var imagename = req.body.image;
    var flavorname = req.body.flavor;
    var name = req.body.name;
    var networks = req.body.networks;
    compute.getImages(function(err, images) {
      if (err) res.status(500).send(err);
      else {
        var image = _.findWhere(images, {
          name: imagename
        });
        if (!image) res.status(400).send('Image not Found');
        compute.getFlavors(function(err, flavors) {
          if (err) res.status(500).send(err);
          else {
            var flavor = _.findWhere(flavors, {
              name: flavorname
            });
            if (!flavor) res.status(400).send('Flavor not Found');
            hypervisors.hypervisorAviable(flavor, function(
              hypervisor) {
              if (String(hypervisor) == 'undefined') {
                hypervisors.findHypervisorAviableDown(flavor,
                  function(hypervisorNoAviable) {
                    if (String(hypervisorNoAviable) ==
                      'undefined') res.status(500).send(
                      'No hi ha recursos suficients');
                    else createServer(hypervisorNoAviable.name,
                      function(response) {
                        res.status(200).send(response)
                      });
                  });
              } else createServer(hypervisor.name, function(
                response) {
                res.status(200).send(response)
              });

              function createServer(hypervisorName, callback) {
                console.log(hypervisorName);
                setTimeout(function() {
                  compute.createServer({
                    name: name,
                    image: image,
                    flavor: flavor,
                    networks: networks,
                    hypervisor: "nova:" +
                      hypervisorName
                  }, handleServerResponse);
                  callback(200);
                }, 10000);
              }
            });
          }
        })
      }
    })*/

};


function handleServerResponse(err, server) {
  if (err) {
    console.dir(err);
    return;
  }
  console.log('SERVER : ' + server.name + ', waiting for active status');

  // Wait for status: RUNNING on our server, and then callback
  server.setWait({
    status: server.STATUS.running
  }, 5000, function(err) {
    if (err) {
      console.dir(err);
      return;
    }
    console.log('SERVER INFO');
    console.log(server.name);
    console.log(server.status);
    console.log(server.id);

    console.log('Make sure you DELETE server: ' + server.id +
      ' in order to not accrue billing charges');
  });
}
