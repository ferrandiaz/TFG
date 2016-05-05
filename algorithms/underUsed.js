var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var config = require('../config/config.js');
var listener = require('../listener/listener');
var ERROR = require('../errors/errors');
var compute = pkgcloud.compute.createClient(config.options);
exports.underUsed = function(host, callback) {
  async.auto({
    f1: function(callback) {
      under(host, function(err, hosts) {
        if (err) callback(err);
        else callback(null, hosts);
      });
    },
    f2: ['f1', function(callback, arg) {
      var hosts = arg.f1;
      async.each(hosts, function(hst, cb) {
        compute.migrateServer(hst.instance, hst.hypervisor,
          function(er, resultat) {
            listener.listenerClose('migrateQueue', function(err,
              msg) {
              if (er) cb(er);
              else {
                if (msg ===
                  'compute.instance.live_migration._post.end'
                ) {
                  cb();
                }
              }
            });
          });
      }, function(err) {
        if (err) callback(err);
        else callback(null, 'OK all instances migrated');
      });
    }]

  }, function(err, result) {
    if (err) return callback(err);
    else {
      hypervisors.sleepHypervisor(host, function(error) {
        if (error) return callback(error);
        else return callback(null, result);
      });
    }
  });
}

function under(host, callback) {
  console.log('UnderUsed');
  async.auto({
      hypervisor: function(callback) {
        hypervisors.getHypervisor(host, function(err, result) {
          if (err) callback(err);
          else callback(null, result);
        })
      },
      hostsCpu: ['hypervisor', function(callback, obj) {
        console.log('Entro');
        hypervisors.hypervisorsCpu(function(result) {
          console.log(result);
          if (_.isEmpty(result)) callback(ERROR.noHypervisorsFound);
          else {
            var arr = _.reject(result, function(hst) {
              if (hst.name === obj.hypervisor.name) {
                return hst;
              }
            });
            console.log(arr);
            if (_.isEmpty(arr)) callback(ERROR.noHypervisorsFound);
            else callback(null, arr);
          }
        });
      }],
      instances: ['hostsCpu', function(callback, obj) {
        hypervisors.getHypervisorInstancesCpu(host, function(err,
          result) {
          if (err) callback(err);
          else callback(null, result);
        });
      }],
      cpuOnHost: ['instances', function(callback, obj) {
        var array = obj.instances;
        var hypervisor = obj.hypervisor;
        async.each(array, function(instance) {
          var cpuOnHost = (instance.cpuUsage * instance.vcpus) /
            hypervisor.vcpus;
          instance.cpuOnHost = cpuOnHost;
        });
        var sorted = _.sortBy(array, 'cpuOnHost');
        callback(null, sorted);
      }],
      migrate: ['cpuOnHost', function(callback, obj) {
        var hosts = obj.hostsCpu;
        var instances = obj.instances;
        var arrayMigrate = [];
        async.each(instances, function(instance, cb) {
          migrateNewHost(hosts, instance, function(err, result) {
            if (err) cb(err);
            else {
              var json = {};
              json.hypervisor = result.name;
              json.instance = instance.id;
              arrayMigrate.push(json);
              var hosts = _.reject(hosts, function(hst) {
                if (hst.name === result.name) {
                  return hst;
                }
              });
              hosts.push(result);
              cb();
            }
          });
        }, function(err) {
          if (err) callback(err);
          else callback(null, arrayMigrate);
        });
      }]
    },
    function(err, result) {
      if (err) return callback(err);
      else return callback(null, result.migrate);
    });
}


function migrateNewHost(hosts, instance, callback) {
  async.auto({
      flavor: function(callback) {
        compute.getFlavors(function(err, result) {
          if (err) callback(err);
          else {
            var flavor = _.findWhere(result, {
              name: instance.flavorName
            });
            callback(null, flavor);
          }
        });
      },
      hostMigrate: ['flavor', function(callback, arg) {
        var flavor = arg.flavor;
        var viableHosts = [];
        async.each(hosts, function(hypervisor) {
          hypervisors.hypervisorParams(flavor, hypervisor, 'up',
            function(err, result) {
              if (!err && !_.isUndefined(result)) {
                viableHosts.push(hypervisor);
              }
            });
        });
        if (_.isEmpty(viableHosts)) callback(ERROR.noHypervisorsFound);
        else {
          var withVM = [];
          async.each(viableHosts, function(hypervisor, cb) {
            hypervisors.getHypervisorCpuNewVM(hypervisor, instance,
              function(err, result) {
                if (err) cb(err);
                else if (parseFloat(result.f2.cpuUsage) < config.maxCPU) {
                  withVM.push(result.f2);
                  cb();
                } else cb();
              });
          }, function(err) {
            console.log(withVM);
            if (err) callback(err);
            else if (_.isEmpty(withVM)) {
              console.log('Entro');
              callback(ERROR.noHypervisorsFound);
            } else {
              var sort = _.sortBy(withVM, 'cpuUsage');
              var first = _.first(sort);
              callback(null, first);
            }
          });
        }
      }]
    },
    function(err, result) {
      if (err) return callback(err);
      else return callback(null, result.hostMigrate);
    });
}
