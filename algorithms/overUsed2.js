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
        if (err) callback(err);
        else callback(null, host, instances, awake, sleep);
      });
    },
    function(host, instances, awake, sleep, callback) {
      findMigrate(host, instances, awake, sleep, function(err, result) {
        if (err) callback(ERROR.noHypervisorsFound);
        else callback(null, result);
      });
    },
    function(array, callback) {
      var arr = [];
      _.each(array, function(object) {
        if (object.hypervisor.state == 'down') {
          arr.push(object.hypervisor);
        }
      });
      if (!_.isEmpty(arr)) {
        var uniq = _.uniq(arr, true, function(hyp) {
          return hyp.id;
        });
        async.eachSeries(uniq, function(sleeper, cb) {
          hypervisors.awakeHypervisor(sleeper.name, function(err,
            result) {
            if (err) cb(err);
            else cb();
          })
        }, function(err) {
          if (err) callback(err);
          else {
            setTimeout(function() {
              callback(null, array);
            }, 60000)
          }
        });
      } else {
        callback(null, array);
      }

    },
    function(array, callback) {
      async.eachSeries(array, function(instance, cb) {
        var inst = instance.instance.id;
        var name = instance.hypervisor.name;
        compute.migrateServer(inst, name, function(er, res) {
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
          if (err) callback(err);
          else {
            if (result.cpuUsage < 60) {
              console.log('Hypervisor Under 60%');
              callback({
                status: 200,
                message: 'Hypervisor Under 60%'
              });
            } else {
              callback(null, result);
            }
          }
        });
      },
      load: ['hypervisor', function(callback, obj) {
        telemetry.getStatistics('hardware.cpu.load.1min', host, 1,
          function(err, statistics) {
            if (err) callback(err);
            else callback(null, statistics[0].avg);
          });
      }],
      instances: ['load', function(callback, obj) {
        hypervisors.getHypervisorInstancesCpu(host, function(err,
          result) {
          if (err) callback(err);
          else {
            if (obj.load >= (obj.hypervisor.vcpus + 1)) {
              _.each(result, function(instance) {
                instance.cpuUsage = 100;
              });
            }
            callback(null, result);
          }
        });
      }],
      cpuOnHost: ['instances', function(callback, obj) {
        var load = obj.load;
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
      else {
        if (result.load >= result.hypervisor.vcpus + 1) {
          var sum = 0;
          _.each(result.cpuOnHost, function(instance) {
            sum = sum + instance.cpuOnHost;
          });
          result.hypervisor.cpuUsage = sum;
        }
        callback(null, result.hypervisor, result.cpuOnHost, result.arayHypervisorsUp,
          result.arayHypervisorsDown);
      }
    });
}

function findMigrate(host, instances, awake, sleep, callback) {
  var array = [];
  var bool = false;
  async.until(
    function() {
      return bool;
    },
    function(callback) {
      async.waterfall([
        function(callback) {
          findOne(host, instances, awake, sleep, function(err, result) {
            if (_.isObject(result)) {
              array.push(result);
              bool = true;
              callback(null, true);
            } else {
              callback(null, false);
            }
          });
        },
        function(arg, callback) {
          if (!arg) {
            var s = sleep;
            var i = instances;
            var h = host;
            var a = awake;
            findLess(h, i, a, s, function(err, result) {
              if (err) return callback(err);
              else {
                async.parallel({
                  host1: function(callback) {
                    host.cpuUsage = host.cpuUsage - result.instance
                      .cpuOnHost;
                    callback(null, host);
                  },
                  instancesF: function(callback) {
                    instances = _.reject(instances, function(
                      instance) {
                      if (instance.id == result.instance.id) {
                        return instance;
                      }
                    });
                    callback(null, instances);
                  },
                  awaked: function(callback) {
                    var exist = _.findWhere(awake, {
                      id: result.hypervisor.id
                    });
                    if (_.isUndefined(exist)) awake.push(result
                      .hypervisor);
                    else {
                      awake = _.reject(awake, function(hyper) {
                        if (hyper.id == result.hypervisor.id) {
                          return hyper;
                        }
                      });
                      awake.push(result.hypervisor);
                      awake = _.sortBy(awake, 'cpuUsage');
                    }
                    callback(null, awake);
                  },
                  sleeping: function(callback) {
                    var exist = _.findWhere(awake, {
                      id: result.hypervisor.id
                    });
                    if (!_.isUndefined(exist)) {
                      sleep = _.reject(sleep, function(hyper) {
                        if (hyper.id == result.hypervisor.id) {
                          return hyper;
                        }
                      });
                    }
                    callback(null, sleep);
                  }
                }, function(error, resultat) {
                  host = resultat.host1;
                  instanes = resultat.instancesF;
                  awake = resultat.awaked;
                  sleep = resultat.sleeping;
                  array.push(result);
                  callback(null, true);
                });
              }
            });
          } else {
            callback(null, true);
          }
        }
      ], function(err, result) {
        if (err) callback(err);
        else callback(null, result);
      })

    },
    function(err) {
      if (err) return callback(err);
      else return callback(null, array);
    }
  );
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
                var hyperV = obj;
                hypervisors.getHypervisorCpuNewVM(hyperV, instance,
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
                if (!_.isEmpty(array)) {
                  var sort = _.sortBy(array, 'cpuUsage');
                  var first = _.first(array);
                  callback(null, first);
                } else {
                  callback(null, 1);
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
                if (!_.isEmpty(array)) {
                  var sort = _.sortBy(array, 'cpuUsage');
                  var first = _.first(array);
                  callback(null, first);
                } else {
                  callback(null, false);
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

function findLess(host, instances, awake, sleeping, callback) {
  var instan = instances;
  var awk = awake;
  var slp = sleeping;
  async.eachSeries(instan, function(instance, cb) {
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
            async.eachSeries(awk, function(obj, clbk) {
              var hyperV = obj;
              hypervisors.getHypervisorCpuNewVM(hyperV, instance,
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
                  callback(null, 1);
                }
              }
            });
          }],
        },
        function(err, result) {
          if (err) cb(true);
          else {
            if (_.isObject(result.awakeHyp)) cb(result.awakeHyp);
            else cb();
          }
        })
    },
    function(resultat) {
      if (_.isObject(resultat)) return callback(null, resultat);
      else if (_.isNull(resultat)) {
        async.eachSeries(instan, function(instance, cb) {
          var array = [];
          var sleepHyperv;
          async.eachSeries(slp, function(obj, clbk) {
            var sleepHyperv = obj;
            hypervisors.getHypervisorCpuNewVM(obj, instance,
              function(err, result) {
                if (err) clbk(err);
                if (parseFloat(result.f2.cpuUsage) < config.maxCPU) {
                  var push = {};
                  push.hypervisor = result.f2;
                  push.instance = instance;
                  array.push(push);
                }
                clbk();
              });
          }, function(err) {
            if (err) cb(err);
            else {
              if (!_.isEmpty(array)) {
                var sort = _.sortBy(array, function(num) {
                  return parseInt(num.cpuUsage);
                });
                var first = _.first(sort.reverse());
                cb(first);
              } else {
                cb(404);
              }
            }
          });
        }, function(res) {
          if (_.isObject(res)) return callback(null, res);
          else return callback(res);
        });
      } else return callback(404);
    });

}
