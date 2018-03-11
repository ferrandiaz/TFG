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
      f1: function(callback) {
        findHost(host, function(err, result) {
          if (err) {
            if (_.isArray(err)) {
              callback({
                status: 404,
                message: 'NO INSTANCES FOUND'
              });
            } else callback(err);
          } else callback(null, result);
        });
      },
      f2: ['f1', function(callback, obj) {
        var result = obj.f1;
        var instance = result.instance.id;
        var hypervisor = result.hypervisor.name;
        compute.migrateServer(instance, hypervisor, function(er, res) {
          listener.listenerClose('migrationQueue', function(err,
            msg) {
            if (er) callback(er);
            else {
              if (msg ===
                'compute.instance.live_migration._post.end');
              callback(null, msg);
            }
          });
        });
      }]
    },
    function(err, result) {
      if (err) return callback(err);
      else return callback(null, result);
    });
}

findHost = function(host, callback) {
  var ext;
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
        async.eachSeries(instances, function(instance, clbk) {
          toMigrate(obj.hypervisor, instance, function(err,
            result) {
            if (_.isUndefined(result)) {
              error = err;
              clbk();
            } else {
              return clbk(result);
            }
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
          var hyperV = ext.hypervisor;
          findOther(host, instances, hyperV, function(error, res) {
            if (error) return callback(error);
            else return callback(null, res);
          })
        } else {
          return callback(err)
        }
      } else {
        return callback(null, result.toMigrate);
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
          if (_.isEmpty(result)) {
            callback({
              status: 400
            });
          } else callback(null, result);
        });
      }],
      end: ['hypervisors', function(callback, result) {
        var arr = _.reject(result.hypervisors, function(host) {
          if (host.name == hypervisor.name) return host;
        })
        async.eachSeries(arr, function(host, cb) {
          hypervisors.getHypervisorCpuNewVM(host, instance,
            function(
              err, hyp) {
              if (parseFloat(hyp.f2.cpuUsage) < config.maxCPU) {
                var obj = {};
                obj.hypervisor = hyp.f2;
                obj.instance = instance;
                return cb(obj);
              } else {
                cb();
              }
            });
        }, function(rs) {
          if (rs) callback(null, rs);
          else {
            async.auto({
                hosts: function(callback) {
                  var flavor = result.flavor;
                  hypervisors.findHypervisors(flavor, 'down',
                    function(err, result) {
                      if (err) callback(err);
                      else callback(null, result);
                    });
                },
                migrate: ['hosts', function(callback, obj) {
                  var flavor = obj.flavor;
                  var hosts = obj.hosts;
                  var migrate = _.find(hosts, function(host) {
                    var consume = (instance.cpuUsage *
                        flavor.vcpus) /
                      host.vcpus;
                    if (consume < config.maxCPU) {
                      return host;
                    }
                  });
                  var rs = {};
                  rs.hypervisor = migrate;
                  rs.instance = instance;
                  if (!_.isUndefined(migrate)) callback(null,
                    rs);
                  else callback(ERROR.noHypervisorsFound);
                }]
              },
              function(err, result) {
                if (err) cb(err);
                else return cb(result.migrate);
              });
          }
        });
      }]
    },
    function(err, result) {
      if (err) callback(err);
      else callback(null, result.end);
    });
}

findOther = function(host, instances, hyperV, callback) {
  async.auto({
      f1: function(callback) {
        migrateLessCPUVM(hyperV, instances, function(error, rs) {
          if (error) return callback(null);
          else return callback(null, rs);
        });
      },
      f2: ['f1', function(callback, arg) {
        var obj = arg.f1;
        if (!_.isUndefined(obj)) {
          return callback(null, obj);
        } else {
          migrateToSleep(instances, function(er, res) {
            if (er) callback(er);
            else callback(null, res);
          });
        }
      }],
      f3: ['f2', function(callback, arg) {
        var obj = arg.f2;
        if (_.isUndefined(obj)) callback(ERROR.noHypervisorsFound);
        else {
          var instance = obj.instance.id;
          var hypervisor = obj.hypervisor.name;
          compute.migrateServer(instance, hypervisor,
            function(er, resultat) {
              listener.listenerClose('migrateQueue', function(err,
                msg) {
                if (er) callback(er);
                else {
                  if (msg ===
                    'compute.instance.live_migration._post.end'
                  ) {
                    callback(null, msg);
                  }
                }
              });
            });
        }
      }]
    },
    function(error, rs) {
      if (error) return callback(error);
      else {
        async.series({
          f1: function(callback) {
            setTimeout(function() {
              findHost(host, function(err, res) {
                if (err) callback(err);
                else return callback(null, res);
              });
            }, 120000);
          }
        }, function(er, res) {
          if (er) return callback(er);
          else return callback(null, res.f1);
        });
      }
    });
}


migrateLessCPUVM = function(hypervisor, instances, callback) {
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
        hosts: ['flavor', function(callback, obj) {
          hypervisors.hypervisorsAviableByCPU(obj.flavor,
            function(err, result) {
              var arr = [];
              var arr = _.reject(result, function(
                host) {
                if (host.name == hypervisor.name) return
                host;
              });
              if (_.isEmpty(arr)) callback(ERROR.noHypervisorsFound);
              else callback(null, arr);
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
          async.eachSeries(hosts, function(host, clbk) {
            hypervisors.getHypervisorCpuNewVM(host,
              instance,
              function(err, result) {
                if (parseFloat(result.f2.cpuUsage) <
                  config.maxCPU) {
                  migrate = result.f2;
                  var rs = {};
                  rs.hypervisor = result.f2;
                  rs.instance = instance;
                  return clbk(rs);
                }
                clbk();
              });

          }, function(rs) {
            if (!_.isUndefined(rs)) return callback(null,
              rs);
            else return callback(ERROR.noHypervisorsFound);
          })
        }]
      }, function(err, result) {
        if (err) cb();
        else return cb(result);
      })
    },
    function(res) {
      if (!_.isEmpty(res)) return callback(null, res.migrate);
      else return callback(ERROR.noHypervisorsFound);
    });
}

migrateToSleep = function(instances, callback) {
  async.eachSeries(instances, function(instance, cb) {
    async.auto({
      flavor: function(callback) {
        compute.getFlavor(instance.flavor, function(err, result) {
          if (err) callback(ERROR.flavorNotFound);
          else callback(null, flavor);
        });
      },
      hosts: ['flavor', function(callback, obj) {
        var flavor = obj.flavor;
        hypervisors.findHypervisors(flavor, 'down',
          function(err, result) {
            if (err) callback(err);
            else callback(null, result);
          });
      }],
      migrate: ['hosts', function(callback, obj) {
        var flavor = obj.flavor;
        var hosts = obj.hosts;
        var migrate = _.find(hosts, function(host) {
          var consume = (instance.cpuUsage * flavor.vcpus) /
            host.vcpus;
          if (consume < config.maxCPU) {
            return host;
          }
        });
        var rs = {};
        rs.hypervisor = migrate;
        rs.instance = instance;
        if (!_.isUndefined(migrate)) callback(null, rs);
        else callback(ERROR.noHypervisorsFound);
      }]
    }, function(err, result) {
      if (err) cb();
      else return cb(result.migrate);
    })
  }, function(res) {
    if (!_.isEmpty(res)) {
      hypervisors.awakeHypervisor(res.hypervisor.name, function(err) {
        console.log('Awake Hypervisor ' + res.hypervisor.name);
        setTimeout(function() {
          if (err) return callback(err);
          else return callback(null, res);
        }, 120000);
      });
    } else return callback(ERROR.noHypervisorsFound);
  });
}
