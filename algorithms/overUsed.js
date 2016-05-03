var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var config = require('../config/config.js');
var listener = require('../listener/listener');
var ERROR = require('../errors/errors');
var compute = pkgcloud.compute.createClient(config.options);

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
        var arr = _.reject(array, function(el) {
          return el.name === hypervisor.name;
        });
        if (_.isEmpty(arr)) callback({
          status: 400
        });
        else {
          var sorted = _.sortBy(arr, 'cpuOnHost');
          callback(null, sorted);
        }
      }],
      toMigrate: ['cpuOnHost', function(callback, obj) {
        var instances = obj.cpuOnHost;
        async.each(instances, function(instance, cb) {
          toMigrate(obj.hypervisor, instance, function(err, result) {
            if (!err) cb(result);
            else cb(null, err);
          });
        }, function(rs, err) {
          if (rs) callback(null, rs);
          else callback(err);
        });
      }]
    },
    function(err, result) {
      if (err) {
        if (err.status == 400) {
          //FIND HYPERVISOR sleep, awake hypervisor, repeat
        } else {
          //TRUE ERROR
        }
      } else {
        if (!_.isEmpty(result.toMigrate)) {
          //MIGRATE VM
        } else {
          //Exec, function migrate little VM
        }
      }
      callback(null, result.toMigrate);
    });
}

function toMigrate(hypervisor, instance, callback) {
  async.auto({
      f1: function(callback) {
        var result = hypervisor.cpuUsage - instance.cpuOnHost;
        if (result < config.maxCPU) callback(null, true);
        else callback(ERROR.noHypervisorsFound);
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
          var arr = _.reject(result, function(el) {
            return el.name === hypervisor.name;
          });
          if (_.isEmpty(result)) callback(ERROR.noHypervisorsFound);
          else callback(null, arr);
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
          else callback(ERROR.noHypervisorsFound);
        });
      }]
    },
    function(err, result) {
      if (err) callback(err);
      else callback(null, result.end);
    });
}
