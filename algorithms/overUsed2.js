var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var config = require('../config/config.js');
var listener = require('../listener/listener');
var ERROR = require('../errors/errors');
var compute = pkgcloud.compute.createClient(config.options);

exports.overUsed2 = function(host, callback) {
  async.waterfall([
    function(callback) {
      info(host, function(err, host, instances, awake, sleep) {
        console.log(err);
        console.log('*************HOST************************');
        console.log(host);
        console.log('++++++++++++++Instances++++++++++++++++++');
        console.log(instances);
        console.log('---------------------Awake------------------');
        console.log(awake);
        console.log('//////////////////SLEEP//////////////////////');
        console.log(sleep);
        if (err) callback(err);
        else callback(null, host, instances, awake, sleep);
      });
    },
    function(host, instances, awake, sleep, callback) {
      findMigrate(host, instances, awake, sleep, function(err, result) {
        if (err) callback(err);
        else callback(null, result);
      });
    },
    function(array, callback) {
      async.each(array, function(instance, cb) {
        var instance = instance.instance.id;
        var hypervisor = instance.hypervisor.name;
        compute.migrateServer(instance, hypervisor, function(er, res) {
          listener.listenerClose('migrationQueue', function(err,
            msg) {
            if (er) cb(er);
            else {
              if (msg ===
                'compute.instance.live_migration._post.end');
              cb();
            }
          });
        });
      }, function(err) {
        if (err) callback(err);
        else callback(null);
      });
    }
  ], function(err, result) {
    if (err) return callback(err);
    else return callback(null, 'OK');
  })
}

function info(host, callback) {
  async.auto({
      hypervisor: function(callback) {
        hypervisors.getHypervisor(host, function(err, result) {
          /*  if (err) callback(err);
            else {
              if (result.cpuUsage < 60) {
                console.log('Hypervisor Under 60%');
                callback({
                  status: 200,
                  message: 'Hypervisor Under 60%'
                });
              } else {*/
          callback(null, result);
          //  }
          //}
        });
      },
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
      arayHypervisorsUp: ['cpuOnHost', function(callback, args) {
        hypervisors.hypervisorsCpu(function(result) {
          var arr = _.reject(result, function(host) {
            if (host.name == args.hypervisor.name) return host;
          })
          callback(null, arr);
        });
      }],
      arayHypervisorsDown: ['arayHypervisorsUp', function(callback, args) {
        hypervisors.hypervisorsDown(function(err, result) {
          callback(null, result);
        });
      }],
    },
    function(err, result) {
      if (err) callback(err);
      else callback(null, result.hypervisor, result.cpuOnHost, result.arayHypervisorsUp,
        result.arayHypervisorsDown);
    });
}

function findMigrate(host, instances, awake, sleep, callback) {
  findOne(host, instances, awake, sleep, function(err, result) {
    console.log("RESULT");
    console.log(err, result);
  });
}

function findOne(host, instances, awake, sleep, callback) {
  async.eachSeries(instances, function(instance, cb) {
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
            });
          },
          awakeHyp: ['flavor', function(callback, arg) {
            var array = [];
            var resultCpu = host.cpuUsage - instance.cpuOnHost;
            if (resultCpu < config.maxCPU) {
              async.eachSeries(awake, function(obj, clbk) {
                hypervisors.getHypervisorCpuNewVM(obj, instance,
                  function(err, result) {
                    if (parseFloat(result.f2.cpuUsage) < config.maxCPU) {
                      var push = {};
                      push.hypervisor = result.f2;
                      push.instance = instance;
                      array.push(push);
                    }
                    clbk();
                  });
              }, function(err) {
                if (err) callback(err);
                else {
                  if (!_.isEmpty(array)) {
                    console.log(array[0]);
                    var sort = _.sortBy(array, 'cpuUsage');
                    var first = _.first(array);
                    callback(null, first);
                  } else {
                    callback(null, 1);
                  }
                }
              });
            } else callback(null, 0);
          }],
          sleepHyp: ['awakeHyp', function(callback, arg) {
            if (_.isObject(arg.awakeHyp)) callback(null, arg.awakeHyp);
            else if (arg.awakeHyp == 0) {
              callback(404);
            } else {
              var array = [];
              async.eachSeries(sleep, function(obj, clbk) {
                hypervisors.getHypervisorCpuNewVM(obj, instance,
                  function(err, result) {
                    if (parseFloat(result.f2.cpuUsage) < config.maxCPU) {
                      var push = {};
                      push.hypervisor = result.f2;
                      push.instance = instance;
                      array.push(push);
                    }
                    clbk();
                  });
              }, function(err) {
                if (err) callback(err);
                else {
                  if (!_.isEmpty(array)) {
                    var sort = _.sortBy(array, 'cpuUsage');
                    var first = _.first(array);
                    callback(null, first);
                  } else {
                    callback(null, false);
                  }
                }
              });
            }
          }]

        },
        function(err, result) {
          if (err) cb(true);
          else {
            if (_.isObject(result.sleepHyp)) cb(result.sleepHyp);
            else cb();
          }
        })
    },
    function(err) {
      if (_.isObject(err)) return callback(null, err);
      else if (!_.isObject(err)) return callback(err);
      else return callback(null, false);
    });

}

function findLess(host, instances, awake, sleep, callback) {

}
