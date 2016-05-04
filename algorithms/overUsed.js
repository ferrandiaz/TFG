var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var config = require('../config/config.js');
var listener = require('../listener/listener');
var ERROR = require('../errors/errors');
var compute = pkgcloud.compute.createClient(config.options);
var ext;
exports.overUsed = function(host, callback) {
  async.auto({
      hypervisor: async.apply(hypervisors.getHypervisor, host),
      instances: ['hypervisor', function(callback, obj) {
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
      toMigrate: ['cpuOnHost', function(callback, obj) {
        ext = obj;
        var instances = obj.cpuOnHost;
        var error;
        async.each(instances, function(instance, clbk) {
          toMigrate(obj.hypervisor, instance, function(err, result) {
            if (_.isUndefined(result)) {
              error = err;
              clbk(null);
            } else clbk(result);
          });
        }, function(res) {
          if (!_.isEmpty(res)) callback(null, res);
          else callback(error, obj);
        });
      }]
    },
    function(err, result) {
      if (err) {
        if (err.status == 400) {
          var instances = ext.cpuOnHost;
          var host = ext.hypervisor;
          migrateLessCPUVM(host, instances, function(error, rs) {
            console.log(error, rs);
            if (error) return callback(error);
            else return callback(null, rs.find);
          });
          //intentar mirgrar 1 de les vm del host prioritzant les que consumeixen menys cpu,
          // si no es pot migrar cap, mirar dels hypervisors dormits si es possible migrar una mirant que l'us de cpu del nou hypervisor sigui menor al cpuMAX
          // si no ERROR
        } else {
          //TRUE ERROR
        }
      } else {
        if (!_.isEmpty(result.toMigrate)) {
          callback(null, result.toMigrate);
          //MIGRATE VM
        } else {
          //Exec, function migrate little VM
        }
      }

    });
}

function toMigrate(hypervisor, instance, callback) {
  async.auto({
      f1: function(callback) {
        var result = hypervisor.cpuUsage - instance.cpuOnHost;
        if (result < config.maxCPU) callback(null, true);
        else callback({
          status: 400
        });
      },
      flavor: ['f1', function(callback, obj) {
        compute.getFlavors(function(err, result) {
          if (err) callback(err);
          else {
            flavor = _.findWhere(result, {
              name: instance.flavorName
            });
            callback(null, flavor);
          }
        })
      }],
      hypervisors: ['flavor', function(callback, obj) {
        hypervisors.hypervisorsAviableByCPU(obj.flavor, function(
          err, result) {
          if (_.isEmpty(result[0])) {
            callback({
              status: 400
            });
          } else callback(null, result);
        });
      }],
      end: ['hypervisors', function(callback, result) {
        async.each(result.hypervisors, function(host, cb) {
          hypervisors.getHypervisorCpuNewVM(host, instance, function(
            err, hyp) {
            if (parseFloat(hyp.f2.cpuUsage) < config.maxCPU) {
              cb(hyp.f2);
            } else cb(null, true);
          });
        }, function(rs, err) {
          if (rs) callback(null, rs);
          else callback({
            status: 400
          });
        });
      }]
    },
    function(err, result) {
      if (err) callback(err);
      else callback(null, result.end);
    });
}

migrateLessCPUVM = function(hypervisor, instances, callback) {
  async.each(instances, function(instance, cb) {
      async.auto({
        flavor: function(callback) {
          compute.getFlavors(function(err, result) {
            if (err) callback(err);
            else {
              flavor = _.findWhere(result, {
                name: instance.flavorName
              });
              callback(null, flavor);
            }
          })
        },
        hosts: ['flavor', function(callback, obj) {
          hypervisors.hypervisorsAviableByCPU(obj.flavor,
            function(err, result) {
              callback(null, result);
            })
        }],
        find: ['hosts', function(callback, obj) {
          var hosts = obj.hosts;
          var first = _.first(hosts);
          if (!_.isEmpty(first)) callback(null, hosts);
          else callback(ERROR.noHypervisorsFound);
        }],
        migrate: ['find', function(callback, obj) {
          var hosts = obj.find;
          async.each(hosts, function(host, clbk) {
            hypervisors.getHypervisorCpuNewVM(host, instance,
              function(err, result) {
                if (parseFloat(result.f2.cpuUsage) < config.maxCPU) {
                  migrate = result.f2;
                  clbk(result.f2);
                } else clbk();
              });

          }, function(rs) {
            if (!_.isUndefined(rs)) callback(null, rs);
            else callback(ERROR.noHypervisorsFound);
          })
        }]
      }, function(err, result) {
        if (err) cb();
        else cb(result);
      })
    },
    function(res) {
      if (!_.isEmpty(res)) callback(null, res);
      else callback(ERROR.noHypervisorsFound);
    });
}
